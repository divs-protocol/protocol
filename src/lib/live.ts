"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { InsiderFeed, TickerInsiders } from "./insider";
import { MARKETS, quoteDecimals, usdPerShare, type Market } from "./exchange";

/**
 * Live market data, read from the pools on Robinhood Chain.
 *
 * Every number the app displays comes from here: prices from each pool's
 * `slot0`, depth from its `liquidity`, and volume, direction and history from
 * its `Swap` logs. Nothing is generated.
 *
 * Two limits shape the design. The RPC refuses any `eth_getLogs` matching more
 * than 10,000 events, and a block is 0.1016s, so a calendar day is roughly
 * 850,000 blocks - far more history than a browser can pull. Ranges are
 * therefore split until each query fits, windows are sized to what one or two
 * queries can cover, and every window is labelled with the span it actually
 * measured rather than being called a day.
 */

/** Measured from block timestamps on chain, not assumed. */
export const BLOCK_SECONDS = 0.1016;

/**
 * Selectable history spans for a single market, in blocks.
 *
 * Labels are the span each range actually covers at the measured block time,
 * so a chart is never titled with a period it does not contain. The longer
 * ranges exceed the log cap on a busy pool and are paged.
 */
export const HISTORY_SPANS = [
  { label: "30m", blocks: 18_000n },
  { label: "1h", blocks: 35_000n },
  { label: "3h", blocks: 106_000n },
  { label: "12h", blocks: 425_000n },
] as const;

export type HistorySpan = (typeof HISTORY_SPANS)[number]["label"];

/* ---------------- formatting ---------------- */

export const usd = (n: number, d = 2) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
};

export const num = (n: number, d = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

export const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

export function ago(seconds: number) {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** Describes a span in the unit that suits it, so no window is mislabelled. */
export function spanLabel(seconds: number) {
  if (!seconds || seconds < 0) return "";
  if (seconds < 5400) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

/* ---------------- server-computed snapshots ---------------- */

export type LiveMarket = Market & {
  /** USD, from the pool's marginal price and the WETH/USDG reference. */
  price: number;
  /** Percent, first to last trade in the window. */
  change: number;
  /** USD traded in the window. */
  volume: number;
  /** Volume either side of the window midpoint, for sector rotation. */
  volumeEarly: number;
  volumeLate: number;
  /** USD of fees that volume generated, at the pool's own fee tier. */
  fees: number;
  /** USD held by the pool contract, both sides. */
  tvl: number;
  txns: number;
  buys: number;
  sells: number;
  /** Price path through the window, oldest first. */
  series: number[];
  sqrtPriceX96: bigint;
  liquidity: bigint;
};

type MarketsSnapshot = {
  markets: (Omit<LiveMarket, "sqrtPriceX96" | "liquidity"> & {
    sqrtPriceX96: string;
    liquidity: string;
  })[];
  ethUsd: number;
  window: string;
};

/**
 * Every market with its live numbers, and the span those numbers cover.
 *
 * The work happens in `/api/markets`: reading seventeen pools' swap logs in the
 * browser meant several megabytes per visitor, which the fetch layer refuses
 * outright. The server reduces them to a few kilobytes and caches the result,
 * so this is a small poll.
 *
 * `window` is the measured span of the data, so a caller labels a column with
 * the truth rather than assuming a day.
 */
export function useLiveMarkets(refreshMs = 15_000) {
  const [snapshot, setSnapshot] = useState<MarketsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      try {
        const response = await fetch("/api/markets");
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(body?.error ?? "Failed to read the chain");
        setSnapshot(body as MarketsSnapshot);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to read the chain");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    read();
    const id = setInterval(read, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshMs]);

  const markets = useMemo<LiveMarket[]>(() => {
    if (!snapshot) {
      // Identity before numbers: the table renders its rows immediately and
      // fills them in, rather than appearing all at once.
      return MARKETS.map((m) => ({
        ...m,
        price: 0,
        change: 0,
        volume: 0,
        volumeEarly: 0,
        volumeLate: 0,
        fees: 0,
        tvl: 0,
        txns: 0,
        buys: 0,
        sells: 0,
        series: [],
        sqrtPriceX96: 0n,
        liquidity: 0n,
      }));
    }

    return snapshot.markets.map((row) => ({
      ...row,
      token: row.token as `0x${string}`,
      pool: row.pool as `0x${string}`,
      sqrtPriceX96: BigInt(row.sqrtPriceX96),
      liquidity: BigInt(row.liquidity),
    }));
  }, [snapshot]);

  return {
    markets,
    ethUsd: snapshot?.ethUsd ?? 0,
    window: snapshot?.window ?? "",
    loading,
    error,
  };
}

/* ---------------- one market, in depth ---------------- */

export type Trade = {
  side: "buy" | "sell";
  price: number;
  shares: number;
  value: number;
  account: string;
  hash: string;
  secondsAgo: number;
};

export type Candle = { t: number; price: number };

type MarketDetail = {
  candles: Candle[];
  trades: Trade[];
  window: string;
  txns: number;
  buys: number;
  sells: number;
  buyVolume: number;
  sellVolume: number;
};

const EMPTY_DETAIL: MarketDetail = {
  candles: [],
  trades: [],
  window: "",
  txns: 0,
  buys: 0,
  sells: 0,
  buyVolume: 0,
  sellVolume: 0,
};

/** History and trade flow for a single market, over a selectable span. */
export function useMarketHistory(ticker: string | undefined, span: HistorySpan = "1h") {
  const [detail, setDetail] = useState<MarketDetail>(EMPTY_DETAIL);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/markets/${ticker}?span=${span}`);
        const body = await response.json();
        if (cancelled) return;
        setDetail(response.ok ? (body as MarketDetail) : EMPTY_DETAIL);
      } catch {
        if (!cancelled) setDetail(EMPTY_DETAIL);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticker, span]);

  return { ...detail, loading };
}

/* ---------------- depth ---------------- */

export type DepthLevel = { price: number; size: number; value: number; cum: number };
export type Book = {
  bids: DepthLevel[];
  asks: DepthLevel[];
  mid: number;
  spread: number;
  spreadPct: number;
  decimals: number;
};

const EMPTY_BOOK: Book = { bids: [], asks: [], mid: 0, spread: 0, spreadPct: 0, decimals: 2 };

/**
 * Depth from the pool's own curve.
 *
 * A concentrated-liquidity pool keeps no order book, but it answers the same
 * question exactly: within the active range, the quantity needed to move the
 * price follows from L and the square-root price.
 *
 *   Δshares = L · (1/√Pa − 1/√Pb)      Δweth = L · (√Pb − √Pa)
 *
 * Levels step by the pool's own fee, starting half a fee from mid, so the
 * innermost spread is the real cost of a round trip rather than a chosen
 * number. Liquidity outside the current tick range differs, so this describes
 * the book near spot - the part that prices an ordinary trade.
 */
export function poolDepth(
  m: Market,
  sqrtPriceX96: bigint,
  liquidity: bigint,
  ethUsd: number,
  levels = 11,
): Book {
  const spot = usdPerShare(m, sqrtPriceX96, ethUsd);
  if (!sqrtPriceX96 || !liquidity || !spot) return EMPTY_BOOK;

  const L = Number(liquidity);
  const sqrtP = Number(sqrtPriceX96) / 2 ** 96;
  // feeBps is in hundredths of a basis point, as Uniswap stores it.
  const feeBpsReal = m.feeBps / 100;

  const build = (sign: 1 | -1) => {
    const out: DepthLevel[] = [];
    let cum = 0;

    for (let i = 0; i < levels; i += 1) {
      const offsetBps = feeBpsReal / 2 + i * feeBpsReal;
      const move = 1 + (sign * offsetBps) / 10_000;
      const price = spot * move;

      // slot0 prices token1 in token0, so a rise in the share price is a fall
      // in the pool price when the quote asset is token0.
      const ratio = m.quoteIsToken0 ? 1 / move : move;
      const sqrtTarget = sqrtP * Math.sqrt(ratio);
      const lo = Math.min(sqrtP, sqrtTarget);
      const hi = Math.max(sqrtP, sqrtTarget);
      if (!lo || !hi || !Number.isFinite(lo) || !Number.isFinite(hi)) continue;

      // Liquidity is expressed in the geometric mean of both sides, so the
      // quote leg carries that asset's decimals while the share leg is always 18.
      const quoteScale = 10 ** ((quoteDecimals(m) + 18) / 2);
      const dQuote = (L * (hi - lo)) / quoteScale;
      const dShares = (L * (1 / lo - 1 / hi)) / quoteScale;
      const shares = m.quoteIsToken0 ? dShares : dQuote;
      if (!Number.isFinite(shares) || shares <= 0) continue;

      const size = shares - cum;
      cum = shares;
      out.push({ price, size, value: size * price, cum: shares });
    }
    return out;
  };

  const bids = build(-1);
  const asks = build(1);
  if (!bids.length || !asks.length) return EMPTY_BOOK;

  const spread = asks[0].price - bids[0].price;
  return {
    bids,
    asks,
    mid: spot,
    spread,
    spreadPct: spot ? (spread / spot) * 100 : 0,
    decimals: spot >= 100 ? 2 : spot >= 1 ? 3 : 4,
  };
}

/** Depth for one market, from the pool state carried in the snapshot. */
export function useDepth(m: LiveMarket | undefined, ethUsd: number, levels = 11): Book {
  return useMemo(() => {
    if (!m || !m.sqrtPriceX96) return EMPTY_BOOK;
    return poolDepth(m, m.sqrtPriceX96, m.liquidity, ethUsd, levels);
  }, [m, ethUsd, levels]);
}

/* ---------------- protocol aggregates ---------------- */

export type FeeBucket = { t: number; fees: number; volume: number };

/**
 * Exchange-wide totals, summed from the same snapshot the index uses.
 *
 * `byFees` is where fee revenue came from over the window, which is the
 * question the analytics page exists to answer.
 */
export function useProtocolStats() {
  const { markets, window, loading } = useLiveMarkets();

  return useMemo(() => {
    const volume = markets.reduce((s, m) => s + m.volume, 0);
    const fees = markets.reduce((s, m) => s + m.fees, 0);

    return {
      markets,
      volume,
      fees,
      tvl: markets.reduce((s, m) => s + m.tvl, 0),
      txns: markets.reduce((s, m) => s + m.txns, 0),
      buys: markets.reduce((s, m) => s + m.buys, 0),
      sells: markets.reduce((s, m) => s + m.sells, 0),
      active: markets.filter((m) => m.txns > 0).length,
      byFees: markets
        .slice()
        .sort((a, b) => b.fees - a.fees)
        .map((m) => ({
          ticker: m.ticker,
          name: m.name,
          fees: m.fees,
          volume: m.volume,
          share: fees ? m.fees / fees : 0,
        })),
      window,
      loading,
    };
  }, [markets, window, loading]);
}

/* ---------------- staking ---------------- */

export type StakingSnapshot = {
  deployed: boolean;
  address: string | null;
  totalStakedDivs: number;
  totalWeight: number;
  emissionsFunded: number;
  emissionsAccrued: number;
  emissionRate: number;
  periodFinish: number;
  accWethPerWeight: number;
  unallocatedFees: number;
};

/**
 * Protocol staking totals.
 *
 * `deployed` is the answer to `eth_getCode` at the configured address, not a
 * flag someone set: until DivsStaking is on chain there is nothing to report,
 * and the panels that consume this render empty instead of guessing.
 */
export function useStaking(refreshMs = 15_000) {
  const [snapshot, setSnapshot] = useState<StakingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      try {
        const response = await fetch("/api/staking");
        const body = await response.json();
        if (!cancelled && response.ok) setSnapshot(body as StakingSnapshot);
      } catch {
        /* leave the last good snapshot in place */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    read();
    const id = setInterval(read, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshMs]);

  return { staking: snapshot, loading };
}

/** Ticks a counter so "12m ago" ages without recomputing during render. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      setNow(Date.now());
    }
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Insider and director dealings across every listed stock.
 *
 * Form 4 is due within two business days of a trade, so this moves a handful of
 * times a day at most. It is fetched once rather than polled; the route caches
 * for an hour behind it, and a poll would only ask the same question again.
 */
export function useInsiderFeed() {
  const [feed, setFeed] = useState<InsiderFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/insider");
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(body?.error ?? "Failed to read EDGAR");
        setFeed(body as InsiderFeed);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to read EDGAR");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { feed, loading, error };
}

/**
 * One company's dealings, for its market page.
 *
 * The route answers for a ticker it has no filer for rather than failing, so
 * there is no unknown-ticker branch to handle here.
 */
export function useTickerInsiders(ticker: string) {
  const [data, setData] = useState<TickerInsiders | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/insider/${ticker}`);
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(body?.error ?? "Failed to read EDGAR");
        setData(body as TickerInsiders);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to read EDGAR");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return { data, loading, error };
}
