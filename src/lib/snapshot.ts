import { MARKETS, wethPerShare } from "./exchange";
import { byPool, client, getSwapLogs, readPoolStates, spanLabel, summarise } from "./chain";

/**
 * The market index snapshot.
 *
 * Separate from the route that serves it so the server can build one at
 * startup: the work is a few seconds of chain, and with stale-while-revalidate
 * whoever triggers the first build is the only one who waits for it.
 */

/** All 17 pools at once; sized so the query stays under the 10,000-log cap. */
const INDEX_BLOCKS = 20_000n;
export const TTL_MS = 15_000;

export type MarketRow = {
  ticker: string;
  name: string;
  kind: "stock" | "etf";
  token: string;
  pool: string;
  feeBps: number;
  wethIsToken0: boolean;
  price: number;
  change: number;
  volume: number;
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
    const flow = summarise(m, grouped.get(m.pool.toLowerCase()) ?? []);
    const price = state ? wethPerShare(m, state.sqrtPriceX96) * ethUsd : 0;
    const tvl = state
      ? (Number(state.weth) / 1e18) * ethUsd + (Number(state.token) / 1e18) * price
      : 0;

    return {
      ticker: m.ticker,
      name: m.name,
      kind: m.kind,
      token: m.token,
      pool: m.pool,
      feeBps: m.feeBps,
      wethIsToken0: m.wethIsToken0,
      price,
      change: flow.change,
      volume: flow.wethVolume * ethUsd,
      fees: flow.wethFees * ethUsd,
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

