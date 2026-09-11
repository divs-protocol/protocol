import { NextResponse } from "next/server";
import { MARKETS, wethPerShare } from "@/lib/exchange";
import { byPool, cached, client, getSwapLogs, readPoolStates, spanLabel, summarise } from "@/lib/chain";

/**
 * The market index, computed on the server.
 *
 * One read of every pool plus one pass over their swaps, reduced to seventeen
 * rows. Cached briefly so a page refresh - or a second visitor - does not
 * repeat several megabytes of log fetching.
 */

export const dynamic = "force-dynamic";

/** All 17 pools at once; sized so the query stays under the 10,000-log cap. */
const INDEX_BLOCKS = 20_000n;
const TTL_MS = 15_000;

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

async function load(): Promise<MarketsSnapshot> {
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

export async function GET() {
  try {
    const snapshot = await cached("markets", TTL_MS, load);
    return NextResponse.json(snapshot, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read the chain" },
      { status: 502 },
    );
  }
}
