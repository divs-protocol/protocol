/**
 * Shapes and vocabulary for insider dealings, shared by both sides.
 *
 * `edgar.ts` does the fetching and can only run on the server. This file holds
 * what the browser also needs, so a component can type a row and label it
 * without pulling the SEC client into the bundle.
 */

/**
 * What the insider actually did.
 *
 * Only a purchase or a sale is a decision. A grant, an option exercise or a
 * withholding is the compensation plan running on its schedule, and mixing the
 * two is how an insider screen ends up showing noise: an executive whose shares
 * vest every quarter would otherwise read as selling constantly.
 */
export type DealKind = "buy" | "sell" | "award" | "exercise" | "tax" | "gift" | "other";

export type InsiderDeal = {
  ticker: string;
  issuer: string;
  insider: string;
  /** "Director", "CEO", "10% owner" - possibly several at once. */
  role: string;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  /** When the trade happened, which is not when it was filed. */
  date: string;
  filed: string;
  /** The SEC's own transaction code, kept so a row can be traced back. */
  code: string;
  kind: DealKind;
  shares: number;
  /** Zero on a grant, which has no price rather than a price of nothing. */
  price: number;
  value: number;
  sharesAfter: number;
  url: string;
};

export type InsiderFeed = {
  deals: InsiderDeal[];
  /** Filings read, so a thin week is visibly thin rather than looking broken. */
  filings: number;
  window: string;
};

export type TickerInsiders = {
  ticker: string;
  issuer: string | null;
  deals: InsiderDeal[];
  /** Set when the absence of rows is structural rather than a quiet quarter. */
  unavailable?: string;
};

/** A purchase or a sale is a choice. Everything else is machinery. */
export const isDiscretionary = (d: InsiderDeal) => d.kind === "buy" || d.kind === "sell";

export const KIND_LABEL: Record<DealKind, string> = {
  buy: "Bought",
  sell: "Sold",
  award: "Granted",
  exercise: "Exercised",
  tax: "Withheld",
  gift: "Gifted",
  other: "Other",
};

/**
 * Longhand for the SEC's transaction codes, for the row's tooltip.
 *
 * A code is the only part of a Form 4 that is genuinely opaque, and "F" meaning
 * shares handed back to cover a tax bill is not the same story as a sale.
 */
export const CODE_MEANING: Record<string, string> = {
  P: "Open-market purchase",
  S: "Open-market sale",
  A: "Grant or award from the issuer",
  M: "Exercise or conversion of a derivative",
  F: "Shares surrendered to cover tax or the exercise price",
  G: "Gift",
  C: "Conversion of a derivative",
  X: "Exercise of an in-the-money derivative",
  D: "Disposition back to the issuer",
  V: "Reported early, before settlement",
  J: "Other acquisition or disposal",
};

/** Green for shares acquired, red for shares leaving. Grey for the machinery. */
export const kindTone = (kind: DealKind) => {
  if (kind === "buy") return "text-[#10B981]";
  if (kind === "sell") return "text-[#F43F5E]";
  return "text-gray-400";
};

/**
 * Net discretionary flow for a set of deals, in dollars.
 *
 * Purchases minus sales, ignoring everything the insider did not choose. The
 * count is returned alongside because one large sale and forty small purchases
 * are a different picture from the total on its own.
 */
export function netFlow(deals: InsiderDeal[]) {
  let bought = 0;
  let sold = 0;
  let buys = 0;
  let sells = 0;

  for (const d of deals) {
    if (d.kind === "buy") {
      bought += d.value;
      buys += 1;
    } else if (d.kind === "sell") {
      sold += d.value;
      sells += 1;
    }
  }

  return { bought, sold, net: bought - sold, buys, sells };
}
