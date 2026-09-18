import { MARKETS, type Market } from "./exchange";

/**
 * Sector for each listed market.
 *
 * Nothing on-chain says what business a token represents, so this is the one
 * piece of the app that is editorial rather than derived. It is kept apart from
 * the registry for that reason: `scan-markets` rewrites MARKETS wholesale, and
 * a hand-made classification living inside it would be destroyed on every scan.
 *
 * A ticker missing from here falls back to "Other" rather than disappearing.
 */
export const SECTORS = [
  "Semiconductors",
  "Software",
  "Internet",
  "Hardware",
  "Crypto & Fintech",
  "Energy",
  "Aerospace & Defense",
  "Healthcare",
  "Consumer",
  "Industrials",
  "Quantum & AI",
  "ETF",
  "Other",
] as const;

export type Sector = (typeof SECTORS)[number];

const BY_TICKER: Record<string, Sector> = {
  // Semiconductors
  NVDA: "Semiconductors", AMD: "Semiconductors", INTC: "Semiconductors", MU: "Semiconductors",
  TSM: "Semiconductors", AVGO: "Semiconductors", MRVL: "Semiconductors", ASML: "Semiconductors",
  SKYHY: "Semiconductors", SNDK: "Semiconductors", ON: "Semiconductors", UMC: "Semiconductors",
  AMAT: "Semiconductors", MPWR: "Semiconductors", AAOI: "Semiconductors", POET: "Semiconductors",

  // Software
  MSFT: "Software", ADBE: "Software", NOW: "Software", SNOW: "Software", DDOG: "Software",
  FTNT: "Software", PATH: "Software", TTWO: "Software", RBLX: "Software", FIG: "Software",
  NET: "Software", IBM: "Software",

  // Internet
  GOOGL: "Internet", META: "Internet", AMZN: "Internet", NFLX: "Internet", RDDT: "Internet",
  SNAP: "Internet", BABA: "Internet", SHOP: "Internet", DJT: "Internet",

  // Hardware
  AAPL: "Hardware", DELL: "Hardware", HPE: "Hardware", ANET: "Hardware", VRT: "Hardware",
  CLS: "Hardware", PENG: "Hardware", BB: "Hardware",

  // Crypto & Fintech
  COIN: "Crypto & Fintech", MSTR: "Crypto & Fintech", CRCL: "Crypto & Fintech",
  GLXY: "Crypto & Fintech", WULF: "Crypto & Fintech", BULL: "Crypto & Fintech",
  SOFI: "Crypto & Fintech", NU: "Crypto & Fintech",

  // Energy
  XOM: "Energy", CEG: "Energy", RUN: "Energy", BE: "Energy",

  // Aerospace & Defense
  SPCX: "Aerospace & Defense", RKLB: "Aerospace & Defense", LMT: "Aerospace & Defense",
  BA: "Aerospace & Defense", HWM: "Aerospace & Defense", FLY: "Aerospace & Defense",
  RCAT: "Aerospace & Defense",

  // Healthcare
  LLY: "Healthcare", JNJ: "Healthcare", PFE: "Healthcare", MRNA: "Healthcare",
  HIMS: "Healthcare", CLOV: "Healthcare",

  // Consumer
  TSLA: "Consumer", COST: "Consumer", LULU: "Consumer", GME: "Consumer", AMC: "Consumer",
  RIVN: "Consumer", F: "Consumer", CCL: "Consumer",

  // Industrials
  UPS: "Industrials", PWR: "Industrials", FIX: "Industrials", USAR: "Industrials",
  WYFI: "Industrials",

  // Quantum & AI
  PLTR: "Quantum & AI", IONQ: "Quantum & AI", QUBT: "Quantum & AI",
};

export function sectorOf(m: Market): Sector {
  if (m.kind === "etf") return "ETF";
  return BY_TICKER[m.ticker] ?? "Other";
}

/** Sectors that actually have a listed market, in registry order. */
export const ACTIVE_SECTORS: Sector[] = SECTORS.filter((s) =>
  MARKETS.some((m) => sectorOf(m) === s),
);
