/**
 * Market data for the Markets index and token pages.
 *
 * Prices, volume and transactions are placeholders. Everything derived is
 * generated from a seeded, per-ticker PRNG rather than Math.random, so the
 * server and the client produce identical markup - random values would cause a
 * hydration mismatch. Swapping in a live feed means replacing the generators
 * here, not touching either view.
 */

export type Listing = "pool" | "curve";
export type Kind = "stock" | "etf";

export type Market = {
  ticker: string;
  name: string;
  kind: Kind;
  price: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  fees24h: number;
  listing: Listing;
  holders: number;
};

export const MARKETS: Market[] = [
  { ticker: "NVDA", name: "NVIDIA Corp.", kind: "stock", price: 124.5, change24h: 4.25, volume24h: 64654880, liquidity: 12840000, fees24h: 19396, listing: "pool", holders: 8421 },
  { ticker: "AAPL", name: "Apple Inc.", kind: "stock", price: 221.1, change24h: -1.8, volume24h: 48210400, liquidity: 10420000, fees24h: 14463, listing: "pool", holders: 7233 },
  { ticker: "TSLA", name: "Tesla Inc.", kind: "stock", price: 214.3, change24h: 6.1, volume24h: 39877120, liquidity: 8110000, fees24h: 11963, listing: "pool", holders: 6890 },
  { ticker: "SPY", name: "SPDR S&P 500 ETF", kind: "etf", price: 757.55, change24h: 0.42, volume24h: 31204900, liquidity: 15960000, fees24h: 9361, listing: "pool", holders: 5102 },
  { ticker: "AMZN", name: "Amazon.com Inc.", kind: "stock", price: 186.4, change24h: 2.15, volume24h: 27655300, liquidity: 7240000, fees24h: 8296, listing: "pool", holders: 4780 },
  { ticker: "MSFT", name: "Microsoft Corp.", kind: "stock", price: 448.2, change24h: 0.85, volume24h: 24118700, liquidity: 9870000, fees24h: 7235, listing: "pool", holders: 4411 },
  { ticker: "QQQ", name: "Invesco QQQ Trust", kind: "etf", price: 486.12, change24h: 1.04, volume24h: 18902450, liquidity: 6650000, fees24h: 5670, listing: "pool", holders: 3320 },
  { ticker: "GOOGL", name: "Alphabet Inc.", kind: "stock", price: 178.35, change24h: -0.45, volume24h: 16440210, liquidity: 5980000, fees24h: 4932, listing: "pool", holders: 3104 },
  { ticker: "META", name: "Meta Platforms", kind: "stock", price: 612.8, change24h: 3.37, volume24h: 14203880, liquidity: 5120000, fees24h: 4261, listing: "pool", holders: 2877 },
  { ticker: "AMD", name: "Advanced Micro Devices", kind: "stock", price: 167.9, change24h: -2.64, volume24h: 9884300, liquidity: 3410000, fees24h: 2965, listing: "pool", holders: 2140 },
  { ticker: "PFE", name: "Pfizer Inc.", kind: "stock", price: 28.44, change24h: -0.92, volume24h: 3120480, liquidity: 1180000, fees24h: 936, listing: "curve", holders: 812 },
  { ticker: "KO", name: "Coca-Cola Co.", kind: "stock", price: 71.06, change24h: 0.18, volume24h: 1894220, liquidity: 742000, fees24h: 568, listing: "curve", holders: 604 },
];

export const findMarket = (ticker: string) => MARKETS.find((m) => m.ticker === ticker);

/* ---------- deterministic randomness ---------- */

export function seededRandom(seed: string) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/* ---------- formatting ---------- */

export const usd = (n: number, d = 2) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export const compact = (n: number) => {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export const num = (n: number, d = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

export const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

export function ago(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/* ---------- generated series ---------- */

export type Timeframe = "1H" | "24H" | "7D" | "1M" | "ALL";

export const TIMEFRAMES: Timeframe[] = ["1H", "24H", "7D", "1M", "ALL"];

const POINTS: Record<Timeframe, number> = { "1H": 30, "24H": 48, "7D": 56, "1M": 60, ALL: 72 };

export type Candle = { t: string; price: number };

/**
 * Price walk that starts at the period's opening price and lands exactly on the
 * live price. The walk is detrended and then scaled to a fixed fraction of the
 * price, so the series always stays within a sane band - an undetrended walk
 * compounds and can wander orders of magnitude off the axis.
 */
export function priceSeries(m: Market, tf: Timeframe): Candle[] {
  const rand = seededRandom(`${m.ticker}:${tf}`);
  const n = POINTS[tf];

  // How far the line is allowed to wander from the straight open->close path.
  const amplitude: Record<Timeframe, number> = {
    "1H": 0.003,
    "24H": 0.012,
    "7D": 0.04,
    "1M": 0.075,
    ALL: 0.16,
  };

  // Raw walk.
  const walk: number[] = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    v += rand() - 0.5;
    walk.push(v);
  }

  // Detrend: force both ends to zero so the walk only adds shape, never drift.
  const first = walk[0];
  const last = walk[n - 1];
  const detrended = walk.map((w, i) => w - (first + ((last - first) * i) / (n - 1)));
  const maxAbs = Math.max(...detrended.map(Math.abs)) || 1;

  // The period opens where the 24h move implies, and closes at the live price.
  const span = tf === "1H" ? 0.2 : tf === "24H" ? 1 : tf === "7D" ? 2.4 : tf === "1M" ? 4 : 8;
  const open = m.price / (1 + (m.change24h / 100) * span);
  const noise = m.price * amplitude[tf];

  return Array.from({ length: n }, (_, i) => {
    const base = open + ((m.price - open) * i) / (n - 1);
    const price = base + (detrended[i] / maxAbs) * noise;
    return { t: labelFor(tf, i, n), price: Math.max(price, 0.01) };
  });
}

function labelFor(tf: Timeframe, i: number, n: number) {
  const back = n - 1 - i;
  if (tf === "1H") return `${back * 2}m`;
  if (tf === "24H") return `${Math.round((back * 24) / (n - 1))}h`;
  if (tf === "7D") return `${Math.round((back * 7) / (n - 1))}d`;
  if (tf === "1M") return `${Math.round((back * 30) / (n - 1))}d`;
  return `${Math.round((back * 12) / (n - 1))}mo`;
}

/* ---------- generated transactions ---------- */

export type Txn = {
  id: string;
  side: "buy" | "sell";
  price: number;
  amount: number;
  value: number;
  trader: string;
  secondsAgo: number;
};

export function transactions(m: Market, count = 40): Txn[] {
  const rand = seededRandom(`${m.ticker}:txns`);
  const hex = "0123456789abcdef";
  const out: Txn[] = [];
  let t = 0;

  // Skew the buy/sell mix toward the direction the market actually moved.
  const buyBias = 0.5 + Math.max(-0.22, Math.min(0.22, m.change24h / 40));

  for (let i = 0; i < count; i++) {
    const side = rand() < buyBias ? "buy" : "sell";
    const price = m.price * (1 + (rand() - 0.5) * 0.014);
    const amount = Math.round((rand() ** 2.2 * 900 + 4) * 100) / 100;
    let addr = "0x";
    for (let j = 0; j < 40; j++) addr += hex[Math.floor(rand() * 16)];
    t += Math.floor(rand() * 190) + 6;

    out.push({
      id: `${m.ticker}-${i}`,
      side,
      price,
      amount,
      value: price * amount,
      trader: addr,
      secondsAgo: t,
    });
  }
  return out;
}

export function flowSummary(txns: Txn[]) {
  const buys = txns.filter((t) => t.side === "buy");
  const sells = txns.filter((t) => t.side === "sell");
  const buyVol = buys.reduce((s, t) => s + t.value, 0);
  const sellVol = sells.reduce((s, t) => s + t.value, 0);
  return {
    buys: buys.length,
    sells: sells.length,
    buyVol,
    sellVol,
    buyShare: buyVol + sellVol === 0 ? 0.5 : buyVol / (buyVol + sellVol),
  };
}
