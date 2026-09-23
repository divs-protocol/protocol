import { NextResponse } from "next/server";
import {
  findMarket,
  poolAbi,
  v4ManagerAbi,
  v4StateSlot,
  v4SlotHex,
  v4PoolId,
  v4DecodeSqrtPriceX96,
  V4_POOL_MANAGER,
  usdPerShare,
  quoteToUsd,
} from "@/lib/exchange";
import { cached, client, getAllSwaps, readEthUsd, spanLabel, type NormalizedSwap } from "@/lib/chain";

/**
 * One market's history and tape.
 *
 * A single market supports a much longer range than the whole index together,
 * so a token page can look further back than the index does. The response
 * carries a bucketed price series and a capped tape rather than the raw logs,
 * which for the busier markets run to megabytes.
 */

export const dynamic = "force-dynamic";

/** Selectable spans, in blocks. Labels are checked against real timestamps. */
const SPANS: Record<string, bigint> = {
  "30m": 18_000n,
  "1h": 35_000n,
  "3h": 106_000n,
  "12h": 425_000n,
};

/**
 * The lookback widens when a market is too quiet to fill the window asked for.
 *
 * Blocks are a tenth of a second, so an hour is a narrow slice of history and
 * most of the listed set does not trade in one. HIMS had no swaps at all in
 * three hours and fifty in twelve; charted over the requested hour it drew
 * nothing, which reads as a broken market rather than a quiet one.
 *
 * The response reports the span it actually measured, so the axis never claims
 * a range it did not read.
 */
const LADDER = [18_000n, 35_000n, 106_000n, 425_000n, 1_300_000n];

/** Below this a line is not a chart, so the search widens instead. */
const MIN_SWAPS = 8;

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
  quotedOnly?: boolean;
  widened?: boolean;
  txns: number;
  buys: number;
  sells: number;
  buyVolume: number;
  sellVolume: number;
};

/** The market's current price straight from the chain, for a market too quiet to have a history to chart. */
async function readCurrentSqrtPriceX96(m: NonNullable<ReturnType<typeof findMarket>>): Promise<bigint> {
  if (m.venue === "v4") {
    const word = (await client.readContract({
      address: V4_POOL_MANAGER,
      abi: v4ManagerAbi,
      functionName: "extsload",
      args: [v4SlotHex(v4StateSlot(v4PoolId(m)))],
    })) as `0x${string}`;
    return v4DecodeSqrtPriceX96(word);
  }
  const slot0 = (await client.readContract({
    address: m.pool,
    abi: poolAbi,
    functionName: "slot0",
  })) as readonly [bigint, ...unknown[]];
  return slot0[0];
}

async function load(ticker: string, span: string): Promise<MarketDetail> {
  const m = findMarket(ticker);
  if (!m) throw new Error(`Unknown market ${ticker}`);

  const head = await client.getBlockNumber();

  // Widen until there is enough to draw, starting at the span asked for. A
  // quiet market otherwise returns one point or none, and a chart of one point
  // is a blank panel.
  const requested = SPANS[span] ?? SPANS["1h"];
  const asked = Math.max(0, LADDER.indexOf(requested));
  let rung = asked;
  let from = 0n;
  let swaps: NormalizedSwap[] = [];

  for (;;) {
    const blocks = LADDER[rung];
    from = head > blocks ? head - blocks : 0n;
    swaps = await getAllSwaps([m], from, head);
    if (swaps.length >= MIN_SWAPS || rung >= LADDER.length - 1 || from === 0n) break;
    rung += 1;
  }

  // Only the ETH price is needed here; reading the whole index again just to
  // get it doubled the cost of opening a market.
  const [ethUsd, headBlock, fromBlock] = await Promise.all([
    cached("ethUsd", 15_000, readEthUsd),
    client.getBlock({ blockNumber: head }),
    client.getBlock({ blockNumber: from }),
  ]);

  const seconds = Number(headBlock.timestamp - fromBlock.timestamp);
  const perBlock = seconds / Math.max(1, Number(head - from));

  const sorted = swaps
    .slice()
    .sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? -1 : 1));

  let buys = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  const trades: Trade[] = [];

  // Bucket by block range and keep each bucket's last price, which is what a
  // candle close is.
  const width = (head - from) / BigInt(CANDLES) || 1n;
  const closes = new Map<number, { t: number; price: number }>();

  for (const s of sorted) {
    const quoteDelta = m.quoteIsToken0 ? s.amount0 : s.amount1;
    const shareDelta = m.quoteIsToken0 ? s.amount1 : s.amount0;
    const price = usdPerShare(m, s.sqrtPriceX96, ethUsd);
    const value = quoteToUsd(m, quoteDelta, ethUsd);
    const isBuy = quoteDelta > 0n;

    if (isBuy) {
      buys += 1;
      buyVolume += value;
    } else {
      sellVolume += value;
    }

    closes.set(Number((s.blockNumber - from) / width), {
      t: Number(headBlock.timestamp) - Number(head - s.blockNumber) * perBlock,
      price,
    });

    trades.push({
      side: isBuy ? "buy" : "sell",
      price,
      shares: Math.abs(Number(shareDelta)) / 1e18,
      value,
      // The recipient for a V3 or V2 trade, the sender for a V4 one - see
      // `normalizeV4` in chain.ts, which is the one venue without a
      // recipient field on its own Swap event.
      account: s.account,
      hash: s.transactionHash,
      secondsAgo: Number(head - s.blockNumber) * perBlock,
    });
  }

  const candles = [...closes.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);

  /*
   * A market that has never traded inside the widest window still has a price:
   * the pool's current tick. Drawing it flat says "quoted, not yet traded",
   * which is the truth. An empty panel says the market is broken, which is not.
   */
  // Set when the line drawn is the quote rather than a history, which is not
  // the same as "no swaps": a single swap also leaves too little to plot.
  let quotedOnly = false;

  if (candles.length < 2) {
    quotedOnly = true;
    const sqrtPriceX96 = await readCurrentSqrtPriceX96(m);

    const price = usdPerShare(m, sqrtPriceX96, ethUsd);
    const end = Number(headBlock.timestamp);
    candles.length = 0;
    candles.push({ t: end - seconds, price }, { t: end, price });
  }

  return {
    ticker: m.ticker,
    candles,
    /** True when the line is the current quote rather than a traded history. */
    quotedOnly,
    /** True when the lookback had to reach past the span that was asked for. */
    widened: rung > asked,
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
