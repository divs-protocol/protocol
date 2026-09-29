"use client";

import { useState } from "react";

/**
 * A market's real company logo, keyed by ticker rather than a hand-built
 * domain map - the markets list runs to 191 tickers, most of which nobody
 * mapped a domain for by hand. financialmodelingprep's symbol image is one of
 * the few public logo services indexed by ticker instead of domain, and
 * covers small caps (e.g. INOD) as well as mega caps, confirmed by direct
 * request before wiring this in. A ticker it doesn't have 404s cleanly, so
 * this falls back to the ticker's first two letters - what every market
 * showed before this.
 *
 * $DIVSPRO isn't a public company, so it was never going to be in that
 * service - it gets our own mark instead, the same /logo.png used in the nav.
 *
 * Meant to sit inside an existing sized, rounded badge; fills it with
 * `w-full h-full`, so the parent needs `overflow-hidden` to keep the image
 * inside its corners.
 */
export default function TickerLogo({ ticker }: { ticker: string }) {
  const [failed, setFailed] = useState(false);

  if (ticker === "DIVSPRO") {
    return <img src="/logo.png" alt="" className="w-full h-full object-contain p-1" />;
  }

  if (failed) return <>{ticker.slice(0, 2)}</>;

  return (
    <img
      src={`https://images.financialmodelingprep.com/symbol/${ticker}.png`}
      alt=""
      onError={() => setFailed(true)}
      className="w-full h-full object-contain"
    />
  );
}
