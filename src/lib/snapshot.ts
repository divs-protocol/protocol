import { MARKETS, usdPerShare, quoteToUsd } from "./exchange";
import { byMarketKey, client, getAllSwaps, marketKey, readPoolStates, spanLabel, summarise } from "./chain";

/**
 * The market index snapshot.
 *
 * Separate from the route that serves it so the server can build one at
 * startup: the work is a few seconds of chain, and with stale-while-revalidate
 * whoever triggers the first build is the only one who waits for it.
 */

/**
 * Every market at once, V3 and V4 together; sized so the query stays under
 * the 10,000-log cap and a cold response stays well short of a serverless
 * timeout. This has already been widened once, from a window tuned for
 * ninety-eight V3 pools to one bearing 191 markets across two venues - if it
 * needs to shrink again as the registry grows, that costs some of the
 * reported span, not any market, so it is the first lever to reach for.
 */
const INDEX_BLOCKS = 9_000n;
export const TTL_MS = 15_000;

export type MarketRow = {
  ticker: string;
  name: string;
  kind: "stock" | "etf";
  token: string;
  venue: "v3" | "v2" | "v4";
  /** The venue-appropriate identifier: a deployed pool/pair address for V3 and V2, a `PoolId` for V4, which has no deployed contract of its own to link to. */
  pool: string;
  feeBps: number;
  quote: "WETH" | "USDG";
  quoteIsToken0: boolean;
  price: number;
  change: number;
  volume: number;
  /** Volume either side of the window midpoint, for rotation. */
  volumeEarly: number;
  volumeLate: number;
  fees: number;
  tvl: number;
  txns: number;
  buys: number;
  sells: number;
  series: number[];
  /** Kept as strings so depth can be computed client-side without precision loss. */
  sqrtPriceX96: string;
  liquidity: string;
};

export type MarketsSnapshot = {
  markets: MarketRow[];
  ethUsd: number;
  window: string;
  blocks: number;
  at: number;
};

export async function loadMarketsSnapshot(): Promise<MarketsSnapshot> {
  const head = await client.getBlockNumber();
  const from = head > INDEX_BLOCKS ? head - INDEX_BLOCKS : 0n;

  const [{ states, ethUsd }, swaps, headBlock, fromBlock] = await Promise.all([
    readPoolStates(),
    getAllSwaps(MARKETS, from, head),
    client.getBlock({ blockNumber: head }),
    client.getBlock({ blockNumber: from }),
  ]);

  const grouped = byMarketKey(swaps);

  const markets: MarketRow[] = MARKETS.map((m) => {
    const state = states.get(m.ticker);
    const flow = summarise(m, grouped.get(marketKey(m)) ?? [], ethUsd, { from, to: head });
    const price = state ? usdPerShare(m, state.sqrtPriceX96, ethUsd) : 0;
    const tvl = state
      ? quoteToUsd(m, state.quote, ethUsd) + (Number(state.token) / 1e18) * price
      : 0;

    return {
      ticker: m.ticker,
      name: m.name,
      kind: m.kind,
      token: m.token,
      venue: m.venue,
      pool: marketKey(m),
      feeBps: m.feeBps,
      quote: m.quote,
      quoteIsToken0: m.quoteIsToken0,
      price,
      change: flow.change,
      volume: flow.usdVolume,
      volumeEarly: flow.usdVolumeEarly,
      volumeLate: flow.usdVolumeLate,
      fees: flow.usdFees,
      tvl,
      txns: flow.txns,
      buys: flow.buys,
      sells: flow.sells,
      series: flow.series.map((p) => p * ethUsd),
      sqrtPriceX96: (state?.sqrtPriceX96 ?? 0n).toString(),
      liquidity: (state?.liquidity ?? 0n).toString(),
    };
  });

  return {
    markets,
    ethUsd,
    window: spanLabel(Number(headBlock.timestamp - fromBlock.timestamp)),
    blocks: Number(head - from),
    at: Date.now(),
  };
}

