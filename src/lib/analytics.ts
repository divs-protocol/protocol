/**
 * Protocol-level aggregates for the Analytics section.
 *
 * Derived from the same MARKETS placeholder set the rest of the app uses, with
 * a seeded PRNG for history so server and client agree. The shapes mirror what
 * an indexer over FeeNotified / Staked / EmissionNotified would return, so
 * wiring real data means replacing these functions.
 */

import { MARKETS, seededRandom } from "./markets";

export const FEE_WINDOWS = ["7D", "30D", "90D"] as const;
export type FeeWindow = (typeof FEE_WINDOWS)[number];

const DAYS: Record<FeeWindow, number> = { "7D": 7, "30D": 30, "90D": 90 };

export const totalFees24h = MARKETS.reduce((s, m) => s + m.fees24h, 0);
export const totalVolume24h = MARKETS.reduce((s, m) => s + m.volume24h, 0);
export const totalLiquidity = MARKETS.reduce((s, m) => s + m.liquidity, 0);

export type FeeDay = { d: string; fees: number; emissions: number };

/**
 * Daily fee revenue, ending at today's actual figure. Emissions are shown
 * alongside because the two are not the same thing: fees are revenue the
 * protocol earned, emissions are budget it spent to attract stake.
 */
export function feeHistory(win: FeeWindow): FeeDay[] {
  const rand = seededRandom(`fees:${win}`);
  const n = DAYS[win];

  // Fees trend up over the window, with a weekly rhythm and noise.
  const out: FeeDay[] = [];
  for (let i = 0; i < n; i++) {
    const progress = i / (n - 1);
    const trend = 0.45 + progress * 0.55;
    const weekly = 1 + Math.sin((i / 7) * Math.PI * 2) * 0.16;
    const noise = 0.82 + rand() * 0.36;
    const fees = totalFees24h * trend * weekly * noise;

    // Emission spend tapers as real revenue grows.
    const emissions = totalFees24h * (0.9 - progress * 0.45) * (0.9 + rand() * 0.2);

    out.push({
      d: i === n - 1 ? "today" : `${n - 1 - i}d`,
      fees: Math.round(fees),
      emissions: Math.round(emissions),
    });
  }
  // Anchor the final day to the real 24h figure.
  out[out.length - 1].fees = Math.round(totalFees24h);
  return out;
}

export const cumulativeFees = (days: FeeDay[]) => days.reduce((s, d) => s + d.fees, 0);
export const cumulativeEmissions = (days: FeeDay[]) => days.reduce((s, d) => s + d.emissions, 0);

/* ---------- staking ---------- */

export type LockBucket = { label: string; weeks: number; staked: number; multiplier: number };

/** How stake is distributed across lock lengths, and the weight each carries. */
export const LOCK_BUCKETS: LockBucket[] = [
  { label: "Flexible", weeks: 0, staked: 4_120_000, multiplier: 1.0 },
  { label: "13 weeks", weeks: 13, staked: 2_480_000, multiplier: 1.75 },
  { label: "26 weeks", weeks: 26, staked: 1_940_000, multiplier: 2.5 },
  { label: "39 weeks", weeks: 39, staked: 1_150_000, multiplier: 3.25 },
  { label: "52 weeks", weeks: 52, staked: 2_310_000, multiplier: 4.0 },
];

export const totalStaked = LOCK_BUCKETS.reduce((s, b) => s + b.staked, 0);
export const totalWeight = LOCK_BUCKETS.reduce((s, b) => s + b.staked * b.multiplier, 0);
/** Stake-weighted average lock, in weeks. */
export const avgLockWeeks =
  LOCK_BUCKETS.reduce((s, b) => s + b.weeks * b.staked, 0) / totalStaked;

export const POOL_SPLIT = [
  { label: "DIVS single-sided", staked: 7_640_000, multiplier: 1, color: "#10B981" },
  { label: "DIVS/WETH LP", staked: 4_360_000, multiplier: 2, color: "#3B82F6" },
];

export const STAKERS = 3_284;

/* ---------- emissions ---------- */

export const EMISSIONS = {
  ratePerDay: 42_000,
  daysRemaining: 18,
  funded: 3_600_000,
  distributed: 2_844_000,
};

/* ---------- fee sources ---------- */

export const topMarketsByFees = MARKETS.slice()
  .sort((a, b) => b.fees24h - a.fees24h)
  .slice(0, 8)
  .map((m) => ({
    ticker: m.ticker,
    name: m.name,
    fees24h: m.fees24h,
    volume24h: m.volume24h,
    share: m.fees24h / totalFees24h,
  }));
