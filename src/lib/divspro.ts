"use client";

import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { robinhood } from "wagmi/chains";
import type { HistorySpan, LiveMarket, Trade, Candle } from "@/lib/live";

/**
 * $DIVSPRO - live on a Pons bonding-curve vault, not a pool DivsRouter can
 * trade. The router only speaks WETH/USDG-quoted V2/V3/V4 pools; this vault
 * is none of those, and its buy/sell functions are unverified, so trading
 * routes to Pons directly instead. This file is read-only: it prices the
 * curve off its own `getReserves()`, which was confirmed by direct probe
 * against the live vault, not assumed from the "V2" branding.
 */

export const DIVSPRO_TOKEN = "0x9338F804c444D38857c0299dF218227B05f68420" as const;
export const DIVSPRO_VAULT = "0x7f2F4c35EDf9A2849d8A58F44df5b878ad6b9b5B" as const;

export const DIVSPRO_TRADE_URL =
  "https://www.ponsfamily.com/launchpad/0x9338F804c444D38857c0299dF218227B05f68420";

const vaultAbi = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserveEth", type: "uint256" },
      { name: "reserveToken", type: "uint256" },
    ],
  },
] as const;

export function useDivsProPrice(ethUsd: number) {
  const { data, isLoading } = useReadContract({
    address: DIVSPRO_VAULT,
    abi: vaultAbi,
    functionName: "getReserves",
    chainId: robinhood.id,
    query: { refetchInterval: 15_000 },
  });

  if (!data) return { priceEth: 0, priceUsd: 0, reserveEth: 0, loading: isLoading };

  const [reserveEth, reserveToken] = data;
  // BigInt division scaled to 1e18 first, so the ratio survives reserveToken
  // being in the hundreds of millions - a plain Number() cast on that would
  // already have shed the precision this divides on.
  const priceEth = reserveToken > 0n ? Number((reserveEth * 10n ** 18n) / reserveToken) / 1e18 : 0;

  return {
    priceEth,
    priceUsd: priceEth * ethUsd,
    reserveEth: Number(reserveEth) / 1e18,
    loading: isLoading,
  };
}

/* ---------------- history: candles + tape, from /api/divspro ---------------- */

type DivsProDetail = {
  candles: Candle[];
  trades: Trade[];
  window: string;
  quotedOnly?: boolean;
  widened?: boolean;
  txns: number;
  buys: number;
  sells: number;
  buyVolume: number;
  sellVolume: number;
  feesUsd: number;
};

const EMPTY_DETAIL: DivsProDetail = {
  candles: [],
  trades: [],
  window: "",
  txns: 0,
  buys: 0,
  sells: 0,
  buyVolume: 0,
  sellVolume: 0,
  feesUsd: 0,
};

/**
 * Same shape and polling pattern as `useMarketHistory` in live.ts, pointed at
 * the vault's own route instead of a Uniswap pool's. `span` undefined means
 * "not the active market" - same convention as `useMarketHistory`'s ticker -
 * so TokenPage can call this unconditionally without it fetching for every
 * other market's page.
 */
export function useDivsProHistory(span: HistorySpan | undefined) {
  const [detail, setDetail] = useState<DivsProDetail>(EMPTY_DETAIL);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!span) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/divspro?span=${span}`);
        const body = await response.json();
        if (cancelled) return;
        setDetail(response.ok ? (body as DivsProDetail) : EMPTY_DETAIL);
      } catch {
        if (!cancelled) setDetail(EMPTY_DETAIL);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [span]);

  return { ...detail, loading };
}

/**
 * A `LiveMarket`-shaped view of DIVSPRO, for the one place (`TokenPage`) that
 * asks for one. `venue` and `pool` are placeholders TokenPage never branches
 * on - real values don't exist because this isn't a Uniswap pool.
 */
export function buildDivsProMarket(priceUsd: number, change: number, tvl: number): LiveMarket {
  return {
    ticker: "DIVSPRO",
    name: "DIVS Protocol",
    kind: "stock",
    token: DIVSPRO_TOKEN,
    venue: "v2",
    pool: DIVSPRO_VAULT,
    feeBps: 0,
    quote: "WETH",
    quoteIsToken0: false,
    price: priceUsd,
    change,
    volume: 0,
    volumeEarly: 0,
    volumeLate: 0,
    fees: 0,
    tvl,
    txns: 0,
    buys: 0,
    sells: 0,
    // TokenPage draws its chart from useDivsProHistory's own candles, not
    // this field, and never touches sqrtPriceX96/liquidity - both belong to
    // Trade's order book, which DIVSPRO doesn't get.
    series: [],
    sqrtPriceX96: 0n,
    liquidity: 0n,
  };
}
