import { NextResponse } from "next/server";
import { cached, client, readEthUsd } from "@/lib/chain";
import type { Trade, Candle } from "@/lib/live";

/**
 * $DIVSPRO's own history, read from its Pons bonding-curve vault rather than
 * a Uniswap pool - see src/lib/divspro.ts for why the router can't trade it.
 *
 * The vault's source is unverified, so both event signatures below were
 * identified by direct probe against the live contract, not a published
 * ABI: decode a real buy and a real sell, and see what comes out clean.
 * `getAllSwaps` in chain.ts cannot be reused - that reads a `Swap` event
 * this vault does not emit. This is deliberately its own route rather than
 * folded into `[ticker]`, so a wrong guess here cannot affect the 191
 * markets that route already serves correctly.
 *
 * Buys and sells are two separate event types, not one event whose
 * direction has to be inferred - an earlier version of this route assumed
 * the latter and cross-referenced the token's Transfer log per trade to
 * tell them apart. That broke on the very first trade in this token's
 * history: it shares a transaction with the initial mint (address(0) ->
 * vault, the full supply), which also touches the vault and matched first,
 * mislabeling a real buy as a sell. Reading the event type directly instead
 * removes both the bug and the per-trade receipt fetch that caused it.
 */

export const dynamic = "force-dynamic";

const VAULT = "0x7f2F4c35EDf9A2849d8A58F44df5b878ad6b9b5B" as const;

/** Confirmed by decoding a real buy: word0 = ETH in, word1 = tokens out. */
const BUY_SIG = "0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455";
/** Confirmed by decoding a real sell: word0 = tokens in, word1 = ETH out - swapped from buy. */
const SELL_SIG = "0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df";

const SPANS: Record<string, bigint> = {
  "30m": 18_000n,
  "1h": 35_000n,
  "3h": 106_000n,
  "12h": 425_000n,
};
const LADDER = [18_000n, 35_000n, 106_000n, 425_000n, 2_000_000n];
const MIN_TRADES = 3;
const CANDLES = 80;
const MAX_TRADES = 150;
const TTL_MS = 15_000;

type RawLog = {
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber: string;
};

/**
 * Two single-topic requests, not one OR query. This RPC caps a query whose
 * topic0 is an array (an OR match) at 100,000 blocks regardless of the span
 * asked for - confirmed by testing the same range both ways, where the plain
 * single-value form had no such limit. `LADDER` reaches 2,000,000 blocks, so
 * the OR form would silently throw well before the widest rung.
 */
async function rpcLogs(fromBlock: bigint, toBlock: bigint): Promise<RawLog[]> {
  const range = { fromBlock: `0x${fromBlock.toString(16)}`, toBlock: `0x${toBlock.toString(16)}` };
  const [buys, sells] = await Promise.all([
    client.request({
      method: "eth_getLogs" as never,
      params: [{ address: VAULT, ...range, topics: [BUY_SIG] }] as never,
    }) as Promise<RawLog[]>,
    client.request({
      method: "eth_getLogs" as never,
      params: [{ address: VAULT, ...range, topics: [SELL_SIG] }] as never,
    }) as Promise<RawLog[]>,
  ]);
  return [...buys, ...sells];
}

function decodeWord(data: string, i: number): bigint {
  const hex = data.slice(2 + i * 64, 2 + (i + 1) * 64);
  return BigInt(`0x${hex || "0"}`);
}

async function load(span: string) {
  const head = await client.getBlockNumber();

  const requested = SPANS[span] ?? SPANS["1h"];
  const asked = Math.max(0, LADDER.indexOf(requested));
  let rung = asked;
  let from = 0n;
  let logs: RawLog[] = [];

  for (;;) {
    const blocks = LADDER[rung];
    from = head > blocks ? head - blocks : 0n;
    logs = await rpcLogs(from, head);
    if (logs.length >= MIN_TRADES || rung >= LADDER.length - 1 || from === 0n) break;
    rung += 1;
  }

  const [ethUsd, headBlock, fromBlock] = await Promise.all([
    cached("ethUsd", 15_000, readEthUsd),
    client.getBlock({ blockNumber: head }),
    client.getBlock({ blockNumber: from }),
  ]);

  const seconds = Number(headBlock.timestamp - fromBlock.timestamp);
  const perBlock = seconds / Math.max(1, Number(head - from));

  const sorted = logs
    .slice()
    .sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)))
    .slice(-MAX_TRADES);

  const width = (head - from) / BigInt(CANDLES) || 1n;
  const closes = new Map<number, Candle>();
  const trades: Trade[] = [];
  let buys = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  let feesUsd = 0;

  for (const l of sorted) {
    const isBuy = l.topics[0] === BUY_SIG;
    const trader = `0x${l.topics[1].slice(26)}`;
    const ethAmount = decodeWord(l.data, isBuy ? 0 : 1);
    const tokenAmount = decodeWord(l.data, isBuy ? 1 : 0);
    // Words 2 and 3 held a consistent ~1%/3.5% split of the ETH leg on both
    // a decoded buy and a decoded sell - read as fee legs, not certain
    // beyond that, since there is no published ABI to check it against.
    const fee1 = decodeWord(l.data, 2);
    const fee2 = decodeWord(l.data, 3);
    if (tokenAmount === 0n) continue;

    const priceEth = Number((ethAmount * 10n ** 18n) / tokenAmount) / 1e18;
    const priceUsd = priceEth * ethUsd;
    const shares = Number(tokenAmount) / 1e18;
    const value = (Number(ethAmount) / 1e18) * ethUsd;
    const blockNumber = BigInt(l.blockNumber);

    if (isBuy) {
      buys += 1;
      buyVolume += value;
    } else {
      sellVolume += value;
    }
    feesUsd += (Number(fee1 + fee2) / 1e18) * ethUsd;

    closes.set(Number((blockNumber - from) / width), {
      t: Number(headBlock.timestamp) - Number(head - blockNumber) * perBlock,
      price: priceUsd,
    });

    trades.push({
      side: isBuy ? "buy" : "sell",
      price: priceUsd,
      shares,
      value,
      account: trader,
      hash: l.transactionHash,
      secondsAgo: Number(head - blockNumber) * perBlock,
    });
  }

  const candles = [...closes.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
  let quotedOnly = false;

  if (candles.length < 2 && trades.length > 0) {
    // One trade is a real price, just not a history - repeat it flat rather
    // than draw nothing.
    quotedOnly = true;
    const p = trades[trades.length - 1].price;
    const end = Number(headBlock.timestamp);
    candles.length = 0;
    candles.push({ t: end - seconds, price: p }, { t: end, price: p });
  }

  return {
    ticker: "DIVSPRO",
    candles,
    quotedOnly,
    widened: rung > asked,
    trades: trades.reverse().slice(0, MAX_TRADES),
    window: seconds >= 3600 ? `${Math.round(seconds / 3600)}h` : `${Math.round(seconds / 60)}m`,
    txns: trades.length,
    buys,
    sells: trades.length - buys,
    buyVolume,
    sellVolume,
    feesUsd,
  };
}

export async function GET(request: Request) {
  const span = new URL(request.url).searchParams.get("span") ?? "1h";
  try {
    const detail = await cached(`divspro:${span}`, TTL_MS, () => load(span));
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
