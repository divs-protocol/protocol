"use client";

import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { MARKETS } from "@/lib/exchange";
import { FILERS } from "@/lib/ciks";
import { focusMarket } from "@/lib/marketFocus";
import { usd, type LiveMarket } from "@/lib/live";

/**
 * The top of Analytics: what this page covers, and a way into it.
 *
 * The three figures are counted from the registry rather than written down, so
 * a scan that adds markets moves them and they cannot drift into being a claim
 * the application no longer supports.
 */

const MARKET_COUNT = MARKETS.length;
const FILER_COUNT = Object.keys(FILERS).length;

/** Matches on ticker first, then name, so typing "NV" puts NVDA above Nuvei. */
function search(markets: LiveMarket[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const starts: LiveMarket[] = [];
  const contains: LiveMarket[] = [];

  for (const m of markets) {
    const ticker = m.ticker.toLowerCase();
    if (ticker.startsWith(q)) starts.push(m);
    else if (ticker.includes(q) || m.name.toLowerCase().includes(q)) contains.push(m);
  }

  return [...starts, ...contains].slice(0, 6);
}

/**
 * One figure in the strip that closes the hero.
 *
 * The strip runs the full width of the page rather than sitting under the text
 * column, so the hero has a base that lines up with the panels below it instead
 * of trailing off into empty space on the right.
 */
function Figure({ value, label, first }: { value: string; label: string; first?: boolean }) {
  return (
    <div
      className={
        first
          ? "py-5 sm:py-7"
          : "py-5 sm:py-7 sm:border-l sm:border-[#232730] sm:pl-8 lg:pl-10"
      }
    >
      <div className="text-white font-bold tracking-tight text-3xl sm:text-4xl tabular-nums">
        {value}
      </div>
      <div className="text-[11px] text-gray-500 leading-snug mt-1.5 max-w-[26ch]">{label}</div>
    </div>
  );
}

export default function AnalyticsHero({ markets }: { markets: LiveMarket[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const results = useMemo(() => search(markets, query), [markets, query]);

  const go = (ticker: string) => {
    setOpen(false);
    setQuery("");
    // Markets keeps the open ticker in state rather than in the URL, so the
    // choice is handed over and picked up when that section mounts.
    focusMarket(ticker);
    router.push("/markets");
  };

  return (
    <section className="pt-8 pb-2 sm:pt-14 sm:pb-4">
      <h1 className="text-white font-bold tracking-tight text-[2.25rem] sm:text-5xl lg:text-6xl leading-[1.06] max-w-[21ch]">
        The Robinhood Chain equities market, explained.
      </h1>

      <p className="text-[14px] sm:text-[16px] text-gray-400 leading-relaxed mt-5 sm:mt-6 max-w-[56ch]">
        Live prices, pool depth and insider filings across every tokenized equity and fund with a
        market on chain. Read from the pools themselves, not from a vendor feed.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mt-7 sm:mt-9 max-w-[44rem]">
        <div className="relative flex-1 min-w-0">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            // A click on a result fires after the blur, so the close waits long
            // enough for the selection to land.
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) go(results[0].ticker);
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search stocks by name or ticker…"
            className="w-full bg-[#14161B] border border-[#232730] rounded-xl pl-10 pr-4 py-3 text-[13px] text-white placeholder:text-gray-500 outline-none focus:border-[#10B981]/50 transition"
          />

          {open && results.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1.5 bg-[#14161B] border border-[#232730] rounded-xl overflow-hidden shadow-xl shadow-black/40">
              {results.map((m) => (
                <button
                  key={m.ticker}
                  // Selection happens on mousedown, which fires before the
                  // input's blur. On click it is a race against the close.
                  // Preventing the default also stops the blur entirely.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    clearTimeout(blurTimer.current);
                    go(m.ticker);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#1B1E24] transition text-left border-b border-[#1F2228] last:border-0"
                >
                  <span className="font-mono text-[11px] font-semibold text-white w-14 shrink-0">
                    {m.ticker}
                  </span>
                  <span className="text-[11px] text-gray-400 truncate flex-1 min-w-0">{m.name}</span>
                  <span className="font-mono text-[11px] text-gray-300 shrink-0">
                    {m.price ? usd(m.price) : "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* One chain, so this states which rather than offering a choice that
            does not exist. */}
        <div className="flex items-center gap-2 px-4 py-3 bg-[#14161B] border border-[#232730] rounded-xl shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
          <span className="text-[12px] text-[#10B981] font-semibold whitespace-nowrap">
            Robinhood Chain
          </span>
          <span className="font-mono text-[11px] text-gray-500">4663</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 mt-10 sm:mt-14 border-t border-[#232730]">
        <Figure first value="1" label="Chain covered in depth, Robinhood Chain" />
        <Figure value={String(MARKET_COUNT)} label="Markets tracked in the live heatmap" />
        <Figure value={String(FILER_COUNT)} label="Companies with insider filings on file" />
      </div>
    </section>
  );
}
