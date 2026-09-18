import { NextResponse } from "next/server";
import { findMarket, usdPerShare, quoteToUsd } from "@/lib/exchange";
import { cached, client, getSwapLogs, readEthUsd, spanLabel, type SwapLog } from "@/lib/chain";

/**
 * One market's history and tape.
 *
 * A single pool supports a much longer range than all seventeen together, so a
 * token page can look further back than the index does. The response carries a
 * bucketed price series and a capped tape rather than the raw logs, which for
 * the busier pools run to megabytes.
 */

export const dynamic = "force-dynamic";

/** Selectable spans, in blocks. Labels are checked against real timestamps. */
const SPANS: Record<string, bigint> = {
  "30m": 18_000n,
  "1h": 35_000n,
  "3h": 106_000n,
  "12h": 425_000n,
};

const CANDLES = 80;
const MAX_TRADES = 150;
const TTL_MS = 15_000;

export type Trade = {
  side: "buy" | "sell";
  price: number;
  shares: number;
  value: number;
  account: string;
  hash: string;
  secondsAgo: number;
};

export type MarketDetail = {
  ticker: string;
  candles: { t: number; price: number }[];
  trades: Trade[];
  window: string;
  txns: number;
  buys: number;
  sells: number;
  buyVolume: number;
  sellVolume: number;
};

async function load(ticker: string, span: string): Promise<MarketDetail> {
  const m = findMarket(ticker);
  if (!m) throw new Error(`Unknown market ${ticker}`);

  const blocks = SPANS[span] ?? SPANS["1h"];
  const head = await client.getBlockNumber();
  const from = head > blocks ? head - blocks : 0n;

  // Only the ETH price is needed here; reading all seventeen pools again just
  // to get it doubled the cost of opening a market.
  const [ethUsd, logs, headBlock, fromBlock] = await Promise.all([
    cached("ethUsd", 15_000, readEthUsd),
    getSwapLogs([m.pool], from, head),
    client.getBlock({ blockNumber: head }),
    client.getBlock({ blockNumber: from }),
  ]);

  const seconds = Number(headBlock.timestamp - fromBlock.timestamp);
  const perBlock = seconds / Math.max(1, Number(head - from));

  const sorted = logs
    .slice()
    .sort((a: SwapLog, b: SwapLog) =>
      a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? -1 : 1,
    );

  let buys = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  const trades: Trade[] = [];

  // Bucket by block range and keep each bucket's last price, which is what a
  // candle close is.
  const width = (head - from) / BigInt(CANDLES) || 1n;
  const closes = new Map<number, { t: number; price: number }>();

  for (const log of sorted) {
    const quoteDelta = log.args.amount0 === undefined ? 0n : m.quoteIsToken0 ? log.args.amount0 : log.args.amount1!;
    const shareDelta = m.quoteIsToken0 ? log.args.amount1! : log.args.amount0!;
    const price = usdPerShare(m, log.args.sqrtPriceX96 ?? 0n, ethUsd);
    const value = quoteToUsd(m, quoteDelta, ethUsd);
    const isBuy = quoteDelta > 0n;

    if (isBuy) {
      buys += 1;
      buyVolume += value;
    } else {
      sellVolume += value;
    }

    closes.set(Number((log.blockNumber - from) / width), {
      t: Number(headBlock.timestamp) - Number(head - log.blockNumber) * perBlock,
      price,
    });

    trades.push({
      side: isBuy ? "buy" : "sell",
      price,
      shares: Math.abs(Number(shareDelta)) / 1e18,
      value,
      account: log.args.recipient ?? "0x",
      hash: log.transactionHash,
      secondsAgo: Number(head - log.blockNumber) * perBlock,
    });
  }

  return {
    ticker: m.ticker,
    candles: [...closes.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c),
    // Newest first, capped - a tape nobody scrolls past 150 rows of.
    trades: trades.reverse().slice(0, MAX_TRADES),
    window: spanLabel(seconds),
    txns: sorted.length,
    buys,
    sells: sorted.length - buys,
    buyVolume,
    sellVolume,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const span = new URL(request.url).searchParams.get("span") ?? "1h";

  try {
    const detail = await cached(`market:${ticker}:${span}`, TTL_MS, () => load(ticker, span));
    return NextResponse.json(detail, {
      headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read the chain" },
      { status: 502 },
    );
  }
}
