import { MARKETS, usdPerShare, quoteToUsd } from "./exchange";
import { byPool, client, getSwapLogs, readPoolStates, spanLabel, summarise } from "./chain";

/**
 * The market index snapshot.
 *
 * Separate from the route that serves it so the server can build one at
 * startup: the work is a few seconds of chain, and with stale-while-revalidate
 * whoever triggers the first build is the only one who waits for it.
 */

/** All 17 pools at once; sized so the query stays under the 10,000-log cap. */
/**
 * Ninety-eight pools is roughly three times the pool count this window was
 * tuned for, and a cold response was running to nearly nine seconds - close
 * enough to a serverless timeout to fail in production rather than degrade.
 * A shorter window costs some of the reported span, not any market.
 */
const INDEX_BLOCKS = 9_000n;
export const TTL_MS = 15_000;

export type MarketRow = {
  ticker: string;
  name: string;
  kind: "stock" | "etf";
  token: string;
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

  const [{ states, ethUsd }, logs, headBlock, fromBlock] = await Promise.all([
    readPoolStates(),
    getSwapLogs(MARKETS.map((m) => m.pool), from, head),
    client.getBlock({ blockNumber: head }),
    client.getBlock({ blockNumber: from }),
  ]);

  const grouped = byPool(logs);

  const markets: MarketRow[] = MARKETS.map((m) => {
    const state = states.get(m.ticker);
    const flow = summarise(m, grouped.get(m.pool.toLowerCase()) ?? [], ethUsd, { from, to: head });
    const price = state ? usdPerShare(m, state.sqrtPriceX96, ethUsd) : 0;
    const tvl = state
      ? quoteToUsd(m, state.quote, ethUsd) + (Number(state.token) / 1e18) * price
      : 0;

    return {
      ticker: m.ticker,
      name: m.name,
      kind: m.kind,
      token: m.token,
      pool: m.pool,
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

