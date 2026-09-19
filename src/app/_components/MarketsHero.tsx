"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import { compact, usd, type LiveMarket } from "@/lib/live";
import PageHero, { Eyebrow, HeroCard, HeroStat } from "./PageHero";

/**
 * The top of Markets: where the numbers in the table come from, and where the
 * capital sits.
 *
 * The right column ranks by liquidity rather than by volume or price. This page
 * is a directory, and the first question a directory should answer is which of
 * its entries can absorb a trade. The table below sorts by volume, so the two
 * are not the same list.
 */

function Deepest({
  markets,
  loading,
  onSelect,
}: {
  markets: LiveMarket[];
  loading: boolean;
  onSelect: (ticker: string) => void;
}) {
  const rows = useMemo(
    () =>
      markets
        .slice()
        .sort((a, b) => b.tvl - a.tvl)
        .slice(0, 6),
    [markets],
  );

  const max = rows[0]?.tvl || 1;

  return (
    <HeroCard
      title="Deepest books"
      icon={<Layers size={13} className="text-[#10B981]" />}
      right={<span className="font-mono text-[10px] text-gray-500">by pool liquidity</span>}
    >
      {loading && !rows.length ? (
        <div className="py-10 text-center text-[11px] text-gray-600">Reading the pools…</div>
      ) : (
        rows.map((m) => (
          <button
            key={m.ticker}
            onClick={() => onSelect(m.ticker)}
            className="w-full text-left py-2 border-b border-[#1F2228] last:border-0 group"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[11px] font-semibold text-white group-hover:text-[#10B981] transition">
                {m.ticker}
              </span>
              <span className="font-mono text-[11px] text-gray-300">{compact(m.tvl)}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex-1 h-1 rounded-full bg-[#0E1013] overflow-hidden">
                <span
                  className="block h-full rounded-full bg-[#10B981]/70"
                  style={{ width: `${(m.tvl / max) * 100}%` }}
                />
              </span>
              <span className="font-mono text-[10px] text-gray-500 w-16 text-right shrink-0">
                {m.price ? usd(m.price) : "—"}
              </span>
            </div>
          </button>
        ))
      )}
    </HeroCard>
  );
}

export default function MarketsHero({
  markets,
  volume,
  fees,
  tvl,
  win,
  loading,
  onSelect,
}: {
  markets: LiveMarket[];
  volume: number;
  fees: number;
  tvl: number;
  win: string;
  loading: boolean;
  onSelect: (ticker: string) => void;
}) {
  const dash = loading ? "···" : undefined;

  return (
    <PageHero
      glow="20% 12%"
      left={
        <div>
          <Eyebrow>{markets.length} listed · one pool each</Eyebrow>

          <h1 className="text-white font-bold tracking-tight text-3xl md:text-5xl leading-[1.06] mb-5">
            Every stock you can
            {" "}
            <br className="hidden md:inline" />
            trade here.
          </h1>

          <p className="text-sm md:text-[15px] leading-relaxed text-gray-400 max-w-lg mb-4">
            {markets.length} tokenized equities and funds on Robinhood Chain. Live price, depth,
            volume and trade count on every one of them.
          </p>

          <p className="text-[12px] text-gray-500 max-w-lg mb-8">
            Open any market for its chart, its tape and the insider filings for the company behind
            it.
          </p>

          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <HeroStat value={String(markets.length)} label="Markets listed" />
            <HeroStat value={dash ?? compact(volume)} label={`Volume, last ${win}`} />
            <HeroStat value={dash ?? compact(fees)} label={`Pool fees, last ${win}`} />
            <HeroStat value={dash ?? compact(tvl)} label="Pool liquidity" />
          </div>
        </div>
      }
      right={<Deepest markets={markets} loading={loading} onSelect={onSelect} />}
    />
  );
}
