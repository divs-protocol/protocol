/**
 * Every section that has a URL.
 *
 * "home" is the trading view and lives at `/` rather than `/home`, so it is not
 * in this list - the root route renders it directly.
 */
export const SECTIONS = [
  "protocol",
  "markets",
  "trade",
  "analytics",
  "exchange",
  "stake",
  "portfolio",
  "activity",
  "account",
  "settings",
  "docs",
] as const;

export type Section = (typeof SECTIONS)[number] | "home";

export const pathFor = (section: string) => (section === "home" ? "/" : `/${section}`);
