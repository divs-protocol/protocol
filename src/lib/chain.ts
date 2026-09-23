import { createPublicClient, http, parseAbiItem } from "viem";
import { robinhood } from "viem/chains";
import {
  ETH_USD_POOL,
  MARKETS,
  WETH,
  USDG,
  V4_POOL_MANAGER,
  ethUsdFromSqrt,
  poolAbi,
  v4ManagerAbi,
  v4StateSlot,
  v4SlotHex,
  v4PoolId,
  v4DecodeSqrtPriceX96,
  v4DecodeLiquidity,
  v4VirtualReserves,
  marketKey,
  usdPerShare,
  quoteToUsd,
  type Market,
  type MarketCommon,
  type V3Market,
  type V4Market,
} from "./exchange";

export { marketKey };

/**
 * Server-side chain reads.
 *
 * The market index needs every `Swap` across every pool plus one pass over
 * their history, which is several megabytes of logs - too much to send to a
 * browser, and wasteful to send once per visitor. The server reads them,
 * reduces them to one row of numbers per market, and caches the result; the
 * page fetches a few kilobytes.
 *
 * Running here also means no CORS (the public endpoint sends its allow-origin
 * header twice) and no proxy hop.
 *
 * V3 and V4 markets are read differently underneath - a deployed pool per
 * market versus one shared singleton keyed by `PoolId` - but every function
 * below hides that split behind the same output shape, keyed by ticker, so
 * `snapshot.ts` and the per-market route do not need to know which venue a
 * market is in.
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

/** The V4 singleton's Swap event - no `recipient`, only `sender`, and the pool is `id`, not the log's own address. */
const V4_SWAP_EVENT = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
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
type V4SwapLog = Awaited<ReturnType<typeof client.getLogs<typeof V4_SWAP_EVENT>>>[number];

/**
 * A swap, whichever venue it came from. `key` is what groups swaps by
 * market - a pool address for V3, a `PoolId` for V4, both lowercased so a
 * checksum mismatch can never split one market's history into two buckets.
 * `account` is the recipient for V3 and the sender for V4; V4's event has no
 * recipient field, only who initiated the swap.
 */
export type NormalizedSwap = {
  key: string;
  blockNumber: bigint;
  transactionHash: string;
  logIndex: number;
  account: string;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
};

function normalizeV3(logs: SwapLog[]): NormalizedSwap[] {
  return logs.map((l) => ({
    key: l.address.toLowerCase(),
    blockNumber: l.blockNumber,
    transactionHash: l.transactionHash,
    logIndex: l.logIndex,
    account: l.args.recipient ?? "0x",
    amount0: l.args.amount0 ?? 0n,
    amount1: l.args.amount1 ?? 0n,
    sqrtPriceX96: l.args.sqrtPriceX96 ?? 0n,
  }));
}

function normalizeV4(logs: V4SwapLog[]): NormalizedSwap[] {
  return logs.map((l) => ({
    key: (l.args.id ?? "0x").toLowerCase(),
    blockNumber: l.blockNumber,
    transactionHash: l.transactionHash,
    logIndex: l.logIndex,
    account: l.args.sender ?? "0x",
    amount0: BigInt(l.args.amount0 ?? 0n),
    amount1: BigInt(l.args.amount1 ?? 0n),
    sqrtPriceX96: l.args.sqrtPriceX96 ?? 0n,
  }));
}

/**
 * `eth_getLogs` over a range, halved as far as it takes to fit.
 *
 * The node rejects a query matching more than 10,000 events outright rather
 * than truncating, so a busy range has to be split. Splitting only on that
 * error keeps a quiet range at one request.
 */
async function getLogsSplitting<T>(
  fetch: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
  fromBlock: bigint,
  toBlock: bigint,
  depth = 0,
): Promise<T[]> {
  try {
    return await fetch(fromBlock, toBlock);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/exceeds limit|more than 10000/i.test(message) || depth > 7 || toBlock - fromBlock < 2n) {
      throw error;
    }
    const mid = fromBlock + (toBlock - fromBlock) / 2n;
    const [a, b] = await Promise.all([
      getLogsSplitting(fetch, fromBlock, mid, depth + 1),
      getLogsSplitting(fetch, mid + 1n, toBlock, depth + 1),
    ]);
    return [...a, ...b];
  }
}

/** V3 swap logs across one or more pool addresses. */
export async function getSwapLogs(
  addresses: `0x${string}`[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<SwapLog[]> {
  if (addresses.length === 0) return [];
  return getLogsSplitting(
    (from, to) => client.getLogs({ address: addresses, event: SWAP_EVENT, fromBlock: from, toBlock: to }),
    fromBlock,
    toBlock,
  );
}

/**
 * V4 swap logs across one or more pools, in one request regardless of how
 * many - every V4 pool's swaps come from the same `PoolManager` address, so
 * this filters by `id` instead of by address, which is what `V3Market`'s
 * per-pool `getSwapLogs` has no equivalent of.
 */
export async function getV4SwapLogs(
  poolIds: `0x${string}`[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<V4SwapLog[]> {
  if (poolIds.length === 0) return [];
  return getLogsSplitting(
    (from, to) =>
      client.getLogs({
        address: V4_POOL_MANAGER,
        event: V4_SWAP_EVENT,
        args: { id: poolIds },
        fromBlock: from,
        toBlock: to,
      }),
    fromBlock,
    toBlock,
  );
}

/** Every market's swaps over a window, normalized to one shape regardless of venue. */
export async function getAllSwaps(
  markets: Market[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<NormalizedSwap[]> {
  const v3 = markets.filter((m): m is V3Market => m.venue === "v3");
  const v4 = markets.filter((m): m is V4Market => m.venue === "v4");

  const [v3Logs, v4Logs] = await Promise.all([
    getSwapLogs(v3.map((m) => m.pool), fromBlock, toBlock),
    getV4SwapLogs(v4.map((m) => v4PoolId(m)), fromBlock, toBlock),
  ]);

  return [...normalizeV3(v3Logs), ...normalizeV4(v4Logs)];
}

/** Price, in-range liquidity and both sides' reserves, in one multicall - real balances for V3, virtual reserves at the current tick for V4 (see `v4VirtualReserves`). */
export async function readPoolStates() {
  const v3 = MARKETS.filter((m): m is V3Market => m.venue === "v3");
  const v4 = MARKETS.filter((m): m is V4Market => m.venue === "v4");

  const v4Ids = v4.map((m) => v4PoolId(m));
  const v4Slot0Hex = v4Ids.map((id) => v4SlotHex(v4StateSlot(id)));
  const v4LiquidityHex = v4Ids.map((id) => v4SlotHex(v4StateSlot(id) + 3n));

  const results = await client.multicall({
    contracts: [
      ...v3.map((m) => ({ address: m.pool, abi: poolAbi, functionName: "slot0" }) as const),
      ...v3.map((m) => ({ address: m.pool, abi: poolAbi, functionName: "liquidity" }) as const),
      // The quote side differs per market, so this reads whichever asset the
      // pool is actually paired against rather than always WETH.
      ...v3.map(
        (m) =>
          ({
            address: m.quote === "USDG" ? USDG : WETH,
            abi: erc20BalanceOf,
            functionName: "balanceOf",
            args: [m.pool],
          }) as const,
      ),
      ...v3.map(
        (m) =>
          ({
            address: m.token,
            abi: erc20BalanceOf,
            functionName: "balanceOf",
            args: [m.pool],
          }) as const,
      ),
      ...v4Slot0Hex.map(
        (slot) => ({ address: V4_POOL_MANAGER, abi: v4ManagerAbi, functionName: "extsload", args: [slot] }) as const,
      ),
      ...v4LiquidityHex.map(
        (slot) => ({ address: V4_POOL_MANAGER, abi: v4ManagerAbi, functionName: "extsload", args: [slot] }) as const,
      ),
      { address: ETH_USD_POOL, abi: poolAbi, functionName: "slot0" } as const,
    ],
    allowFailure: true,
  });

  const n3 = v3.length;
  const n4 = v4.length;
  const states = new Map<
    string,
    { sqrtPriceX96: bigint; liquidity: bigint; quote: bigint; token: bigint }
  >();

  v3.forEach((m, i) => {
    const slot0 = results[i]?.result as readonly [bigint, ...unknown[]] | undefined;
    if (!slot0) return;
    states.set(m.ticker, {
      sqrtPriceX96: slot0[0],
      liquidity: (results[n3 + i]?.result as bigint) ?? 0n,
      quote: (results[2 * n3 + i]?.result as bigint) ?? 0n,
      token: (results[3 * n3 + i]?.result as bigint) ?? 0n,
    });
  });

  const v4Base = 4 * n3;
  v4.forEach((m, i) => {
    const word0 = results[v4Base + i]?.result as `0x${string}` | undefined;
    if (!word0) return;
    const sqrtPriceX96 = v4DecodeSqrtPriceX96(word0);
    if (sqrtPriceX96 === 0n) return; // uninitialized - the pool key was wrong, or it truly has no pool yet
    const liquidityWord = results[v4Base + n4 + i]?.result as `0x${string}` | undefined;
    const liquidity = liquidityWord ? v4DecodeLiquidity(liquidityWord) : 0n;
    const { reserve0, reserve1 } = v4VirtualReserves(liquidity, sqrtPriceX96);
    states.set(m.ticker, {
      sqrtPriceX96,
      liquidity,
      quote: m.quoteIsToken0 ? reserve0 : reserve1,
      token: m.quoteIsToken0 ? reserve1 : reserve0,
    });
  });

  const ethSlot0 = results[4 * n3 + 2 * n4]?.result as readonly [bigint, ...unknown[]] | undefined;
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
 * Reduce a market's swaps to the numbers a row needs.
 *
 * The quote leg is the trade's value and its sign is the direction: positive
 * means the quote asset went into the pool, so the trader bought shares.
 */
export function summarise(
  m: MarketCommon,
  swaps: NormalizedSwap[],
  ethUsd: number,
  window: { from: bigint; to: bigint },
  points = 24,
) {
  const sorted = swaps
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

  for (const s of sorted) {
    // The quote side is whichever token the market is priced against, and its
    // decimals differ between the two - so the conversion has to go through the
    // market rather than assume 1e18.
    const quoteDelta = m.quoteIsToken0 ? s.amount0 : s.amount1;
    const value = quoteToUsd(m, quoteDelta, ethUsd);
    usdVolume += value;
    if (s.blockNumber < midpoint) usdVolumeEarly += value;
    else usdVolumeLate += value;
    // Quote flowing into the pool is someone buying the share.
    if (quoteDelta > 0n) buys += 1;
    prices.push(usdPerShare(m, s.sqrtPriceX96, ethUsd));
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

/** Groups normalized swaps by the market key that produced them (see `marketKey`). */
export function byMarketKey(swaps: NormalizedSwap[]) {
  const out = new Map<string, NormalizedSwap[]>();
  for (const s of swaps) {
    const bucket = out.get(s.key);
    if (bucket) bucket.push(s);
    else out.set(s.key, [s]);
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
