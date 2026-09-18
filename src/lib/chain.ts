import { createPublicClient, http, parseAbiItem } from "viem";
import { robinhood } from "viem/chains";
import {
  ETH_USD_POOL,
  MARKETS,
  WETH,
  USDG,
  ethUsdFromSqrt,
  poolAbi,
  usdPerShare,
  quoteToUsd,
  type Market,
} from "./exchange";

/**
 * Server-side chain reads.
 *
 * The market index needs every `Swap` across seventeen pools, which is several
 * megabytes of logs - too much to send to a browser, and wasteful to send once
 * per visitor. The server reads them, reduces them to seventeen rows of
 * numbers, and caches the result; the page fetches a few kilobytes.
 *
 * Running here also means no CORS (the public endpoint sends its allow-origin
 * header twice) and no proxy hop.
 */

const RPC_URL =
  process.env.ROBINHOOD_RPC_URL ??
  process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ??
  robinhood.rpcUrls.default.http[0];

export const client = createPublicClient({
  chain: robinhood,
  transport: http(RPC_URL, { batch: true, timeout: 30_000 }),
});

export const SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
);

const erc20BalanceOf = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export type SwapLog = Awaited<ReturnType<typeof client.getLogs<typeof SWAP_EVENT>>>[number];

/**
 * `eth_getLogs` over a range, halved as far as it takes to fit.
 *
 * The node rejects a query matching more than 10,000 events outright rather
 * than truncating, so a busy range has to be split. Splitting only on that
 * error keeps a quiet range at one request.
 */
export async function getSwapLogs(
  addresses: `0x${string}`[],
  fromBlock: bigint,
  toBlock: bigint,
  depth = 0,
): Promise<SwapLog[]> {
  try {
    return await client.getLogs({ address: addresses, event: SWAP_EVENT, fromBlock, toBlock });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/exceeds limit|more than 10000/i.test(message) || depth > 7 || toBlock - fromBlock < 2n) {
      throw error;
    }
    const mid = fromBlock + (toBlock - fromBlock) / 2n;
    const [a, b] = await Promise.all([
      getSwapLogs(addresses, fromBlock, mid, depth + 1),
      getSwapLogs(addresses, mid + 1n, toBlock, depth + 1),
    ]);
    return [...a, ...b];
  }
}

/** Price, in-range liquidity and both pool balances, in one multicall. */
export async function readPoolStates() {
  const results = await client.multicall({
    contracts: [
      ...MARKETS.map((m) => ({ address: m.pool, abi: poolAbi, functionName: "slot0" }) as const),
      ...MARKETS.map((m) => ({ address: m.pool, abi: poolAbi, functionName: "liquidity" }) as const),
      // The quote side differs per market, so this reads whichever asset the
      // pool is actually paired against rather than always WETH.
      ...MARKETS.map(
        (m) =>
          ({
            address: m.quote === "USDG" ? USDG : WETH,
            abi: erc20BalanceOf,
            functionName: "balanceOf",
            args: [m.pool],
          }) as const,
      ),
      ...MARKETS.map(
        (m) =>
          ({
            address: m.token,
            abi: erc20BalanceOf,
            functionName: "balanceOf",
            args: [m.pool],
          }) as const,
      ),
      { address: ETH_USD_POOL, abi: poolAbi, functionName: "slot0" } as const,
    ],
    allowFailure: true,
  });

  const n = MARKETS.length;
  const states = new Map<
    string,
    { sqrtPriceX96: bigint; liquidity: bigint; quote: bigint; token: bigint }
  >();

  MARKETS.forEach((m, i) => {
    const slot0 = results[i]?.result as readonly [bigint, ...unknown[]] | undefined;
    if (!slot0) return;
    states.set(m.ticker, {
      sqrtPriceX96: slot0[0],
      liquidity: (results[n + i]?.result as bigint) ?? 0n,
      quote: (results[2 * n + i]?.result as bigint) ?? 0n,
      token: (results[3 * n + i]?.result as bigint) ?? 0n,
    });
  });

  const ethSlot0 = results[4 * n]?.result as readonly [bigint, ...unknown[]] | undefined;
  return { states, ethUsd: ethSlot0 ? ethUsdFromSqrt(ethSlot0[0]) : 0 };
}

/** ETH/USD alone - one call, for routes that need the price and nothing else. */
export async function readEthUsd(): Promise<number> {
  const slot0 = (await client.readContract({
    address: ETH_USD_POOL,
    abi: poolAbi,
    functionName: "slot0",
  })) as readonly [bigint, ...unknown[]];
  return ethUsdFromSqrt(slot0[0]);
}

/**
 * Reduce a pool's swaps to the numbers a row needs.
 *
 * The WETH leg is the trade's value and its sign is the direction: positive
 * means WETH went into the pool, so the trader bought shares.
 */
export function summarise(
  m: Market,
  logs: SwapLog[],
  ethUsd: number,
  window: { from: bigint; to: bigint },
  points = 24,
) {
  const sorted = logs
    .slice()
    .sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? -1 : 1));

  let buys = 0;
  let usdVolume = 0;
  // Volume either side of the window's midpoint. Splitting on the block range
  // rather than on the log count keeps every market on the same clock, which is
  // what makes sector shares comparable.
  const midpoint = window.from + (window.to - window.from) / 2n;
  let usdVolumeEarly = 0;
  let usdVolumeLate = 0;
  const prices: number[] = [];

  for (const log of sorted) {
    // The quote side is whichever token the market is priced against, and its
    // decimals differ between the two - so the conversion has to go through the
    // market rather than assume 1e18.
    const quoteDelta = (m.quoteIsToken0 ? log.args.amount0 : log.args.amount1) ?? 0n;
    const value = quoteToUsd(m, quoteDelta, ethUsd);
    usdVolume += value;
    if (log.blockNumber < midpoint) usdVolumeEarly += value;
    else usdVolumeLate += value;
    // Quote flowing into the pool is someone buying the share.
    if (quoteDelta > 0n) buys += 1;
    prices.push(usdPerShare(m, log.args.sqrtPriceX96 ?? 0n, ethUsd));
  }

  // A row's sparkline needs a couple of dozen points, not thousands.
  const series: number[] = [];
  if (prices.length) {
    const step = (prices.length - 1) / Math.max(1, Math.min(points, prices.length) - 1);
    for (let i = 0; i < Math.min(points, prices.length); i += 1) {
      series.push(prices[Math.round(i * step)]);
    }
  }

  const open = prices[0] ?? 0;
  const close = prices[prices.length - 1] ?? 0;

  return {
    change: open ? ((close - open) / open) * 100 : 0,
    usdVolume,
    usdVolumeEarly,
    usdVolumeLate,
    // feeBps is in hundredths of a basis point, as Uniswap stores it.
    usdFees: (usdVolume * m.feeBps) / 1_000_000,
    txns: sorted.length,
    buys,
    sells: sorted.length - buys,
    series,
  };
}

/** Groups logs by the pool that emitted them. */
export function byPool(logs: SwapLog[]) {
  const out = new Map<string, SwapLog[]>();
  for (const log of logs) {
    const key = log.address.toLowerCase();
    const bucket = out.get(key);
    if (bucket) bucket.push(log);
    else out.set(key, [log]);
  }
  return out;
}

/** Describes a span in the unit that suits it, so no window is mislabelled. */
export function spanLabel(seconds: number) {
  if (!seconds || seconds < 0) return "";
  if (seconds < 5400) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

/* ---------------- a small cache, so one read serves every visitor ---------------- */

type Entry<T> = { at: number; value?: T; inflight?: Promise<T> };
const cache = new Map<string, Entry<unknown>>();

/**
 * Cache with stale-while-revalidate.
 *
 * A full index read is several seconds of chain, so expiring the entry and
 * making the next caller wait for a fresh one means somebody pays that cost
 * every fifteen seconds. Once there is a value, callers get it immediately and
 * the refresh happens behind them; only the very first caller waits, and
 * concurrent first callers share that one load rather than each starting their
 * own.
 */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const entry = (cache.get(key) as Entry<T> | undefined) ?? { at: 0 };
  cache.set(key, entry as Entry<unknown>);

  const stale = Date.now() - entry.at >= ttlMs;

  const refresh = () => {
    const inflight = load()
      .then((value) => {
        entry.value = value;
        entry.at = Date.now();
        entry.inflight = undefined;
        return value;
      })
      .catch((error) => {
        // A failed refresh leaves the last good value in place and lets the
        // next request try again, rather than poisoning the entry.
        entry.inflight = undefined;
        throw error;
      });
    entry.inflight = inflight;
    return inflight;
  };

  if (entry.value !== undefined) {
    if (stale && !entry.inflight) {
      // Nobody is waiting on this one, so its rejection must not go unhandled.
      refresh().catch(() => {});
    }
    return Promise.resolve(entry.value);
  }

  return entry.inflight ?? refresh();
}
