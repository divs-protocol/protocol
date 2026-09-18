"use client";

import { useMemo, useRef, useState } from "react";
import { Activity, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { MARKETS } from "@/lib/exchange";
import { FILERS } from "@/lib/ciks";
import { focusMarket } from "@/lib/marketFocus";
import { compact, num, usd, type LiveMarket } from "@/lib/live";
import PageHero, { Eyebrow, HeroCard, HeroStat } from "./PageHero";

/**
 * The top of Analytics: what this page covers, and the tape as it stands.
 *
 * The right column is the session in numbers, which is the question this page
 * exists to answer. It replaces the row of tiles that used to sit underneath,
 * rather than repeating it.
 *
 * The three figures on the left are counted from the registry and the filer map
 * rather than written down, so a scan that adds markets moves them and they
 * cannot drift into being a claim the page no longer supports.
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

function Reading({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className={`font-mono text-[15px] ${accent ? "text-[#10B981]" : "text-white"}`}>
        {value}
      </div>
      {sub && <div className="text-[9px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

/** The session as it stands: breadth, then the flow that produced it. */
function TapeCard({
  markets,
  volume,
  fees,
  tvl,
  txns,
  feeRate,
  win,
  loading,
}: {
  markets: LiveMarket[];
  volume: number;
  fees: number;
  tvl: number;
  txns: number;
  feeRate: number;
  win: string;
  loading: boolean;
}) {
  const breadth = useMemo(() => {
    let up = 0;
    let down = 0;
    let quiet = 0;
    for (const m of markets) {
      if (!m.txns) quiet += 1;
      else if (m.change > 0.001) up += 1;
      else if (m.change < -0.001) down += 1;
      else quiet += 1;
    }
    return { up, down, quiet, total: up + down + quiet || 1 };
  }, [markets]);

  const dash = loading ? "···" : undefined;

  return (
    <HeroCard
      title="The tape right now"
      icon={<Activity size={13} className="text-[#10B981]" />}
      right={<span className="font-mono text-[10px] text-gray-500">last {win}</span>}
    >
      <div className="flex h-1.5 rounded-full overflow-hidden bg-[#0E1013] mb-2.5">
        <span
          className="bg-[#10B981]"
          style={{ width: `${(breadth.up / breadth.total) * 100}%` }}
        />
        <span
          className="bg-[#2C313B]"
          style={{ width: `${(breadth.quiet / breadth.total) * 100}%` }}
        />
        <span
          className="bg-[#F43F5E]"
          style={{ width: `${(breadth.down / breadth.total) * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between font-mono text-[10px] mb-4">
        <span className="text-[#10B981]">{breadth.up} advancing</span>
        <span className="text-gray-500">{breadth.quiet} untraded</span>
        <span className="text-[#F43F5E]">{breadth.down} declining</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 pt-3.5 border-t border-[#232730]">
        <Reading label="Volume" value={dash ?? compact(volume)} />
        <Reading label="Trades" value={dash ?? num(txns)} />
        <Reading
          label="Pool fees"
          value={dash ?? compact(fees)}
          sub={dash ? undefined : `${feeRate.toFixed(3)}% of volume`}
          accent
        />
        <Reading label="Pool liquidity" value={dash ?? compact(tvl)} />
      </div>
    </HeroCard>
  );
}

export default function AnalyticsHero({
  markets,
  volume,
  fees,
  tvl,
  txns,
  feeRate,
  win,
  loading,
}: {
  markets: LiveMarket[];
  volume: number;
  fees: number;
  tvl: number;
  txns: number;
  feeRate: number;
  win: string;
  loading: boolean;
}) {
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
    <PageHero
      glow="80% 8%"
      left={
        <div>
          <Eyebrow>Robinhood Chain · 4663</Eyebrow>

          <h1 className="text-white font-bold tracking-tight text-3xl md:text-5xl leading-[1.06] mb-5">
            The Robinhood Chain
            <br className="hidden md:inline" />
            equities market, explained.
          </h1>

          <p className="text-sm md:text-[15px] leading-relaxed text-gray-400 max-w-lg mb-8">
            Live prices, pool depth and insider filings across every tokenized equity and fund with
            a market on chain. Read from the pools themselves, not from a vendor feed.
          </p>

          <div className="relative max-w-md mb-8">
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
              // A click on a result fires after the blur, so the close waits
              // long enough for the selection to land.
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
                    <span className="text-[11px] text-gray-400 truncate flex-1 min-w-0">
                      {m.name}
                    </span>
                    <span className="font-mono text-[11px] text-gray-300 shrink-0">
                      {m.price ? usd(m.price) : "—"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <HeroStat value="1" label="Chain covered in depth" />
            <HeroStat value={String(MARKET_COUNT)} label="Markets in the live heatmap" />
            <HeroStat value={String(FILER_COUNT)} label="Companies with insider filings" />
          </div>
        </div>
      }
      right={
        <TapeCard
          markets={markets}
          volume={volume}
          fees={fees}
          tvl={tvl}
          txns={txns}
          feeRate={feeRate}
          win={win}
          loading={loading}
        />
      }
    />
  );
}
