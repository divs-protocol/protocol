"use client";

import { useState } from "react";

/**
 * A market's real company logo, on its own - no colored/bordered chip behind
 * it. An earlier version wrapped every logo in the same tinted badge used for
 * the ticker-letter fallback, which washed brand-colored marks out against
 * each other; real logos should just sit on the dark background like they do
 * everywhere else on the web. Sized entirely by the `className` passed in
 * (e.g. "w-9 h-9 rounded-xl"), since there's no parent container doing that
 * job anymore.
 *
 * $DIVSPRO isn't a public company, so it gets our own mark (/logo.png, same
 * as the nav) instead of the ticker-keyed lookup used for everything else.
 * A ticker with no logo (real or 404, from financialmodelingprep's
 * ticker-keyed image service - covers small caps like INOD, not just mega
 * caps) falls back to a small lettered chip: the one spot a background box
 * still earns its keep, since bare text with no shape is hard to read.
 */
export default function TickerLogo({ ticker, className = "" }: { ticker: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (ticker === "DIVSPRO") {
    return <img src="/logo.png" alt="" className={`object-contain ${className}`} />;
  }

  if (failed) {
    return (
      <span
        className={`bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] flex items-center justify-center text-[9px] font-bold ${className}`}
      >
        {ticker.slice(0, 2)}
      </span>
    );
  }

  return (
    <img
      src={`https://images.financialmodelingprep.com/symbol/${ticker}.png`}
      alt=""
      onError={() => setFailed(true)}
      className={`object-contain ${className}`}
    />
  );
}
