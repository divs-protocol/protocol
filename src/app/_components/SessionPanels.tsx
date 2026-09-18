"use client";

import { useMemo } from "react";
import { compact, num, usd, type LiveMarket } from "@/lib/live";

/**
 * The written session, and what is driving it.
 *
 * These sit above the heatmap because a chart answers "where" and not "what
 * happened". A reader who has just arrived wants the sentence first: how much
 * traded, whether the tape is broad or narrow, and which two or three markets
 * account for the move.
 *
 * Everything here is derived from the same snapshot the rest of the page polls.
 * No figure is stated that the chain did not produce.
 */

/**
 * Contribution to the liquidity-weighted average move.
 *
 * A market's price change matters in proportion to the capital behind it: a
 * thin pool moving four percent says less about the listed set than a deep one
 * moving a tenth. This is the same reasoning a cap-weighted index uses, with
 * pool liquidity standing in for market capitalisation.
 */
function contributions(markets: LiveMarket[]) {
  const traded = markets.filter((m) => m.txns > 0);
  const base = traded.reduce((s, m) => s + m.tvl, 0) || 1;

  return traded
    .map((m) => ({ m, points: (m.change * m.tvl) / base }))
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
}

function breadthOf(markets: LiveMarket[]) {
  let up = 0;
  let down = 0;
  let quiet = 0;
  for (const m of markets) {
    // Untraded and unchanged are different things, and over a short window most
    // markets are the former.
    if (!m.txns) quiet += 1;
    else if (m.change > 0.001) up += 1;
    else if (m.change < -0.001) down += 1;
    else quiet += 1;
  }
  return { up, down, quiet };
}

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const tone = (n: number) => (n > 0 ? "text-[#10B981]" : n < 0 ? "text-[#F43F5E]" : "text-gray-400");

/**
 * The session in prose.
 *
 * Written from the numbers rather than around them, so a window in which
 * nothing traded says exactly that instead of reading as a broken panel.
 */
export function SessionSummary({
  markets,
  volume,
  fees,
  tvl,
  txns,
  win,
  loading,
}: {
  markets: LiveMarket[];
  volume: number;
  fees: number;
  tvl: number;
  txns: number;
  win: string;
  loading: boolean;
}) {
  const text = useMemo(() => {
    if (!markets.length) return null;

    const traded = markets.filter((m) => m.txns > 0);
    if (!traded.length) {
      return `No trades have gone through in the last ${win}. All ${markets.length} markets are quoted and quiet; pool liquidity stands at ${compact(tvl)}.`;
    }

    const { up, down, quiet } = breadthOf(markets);
    const byVolume = traded.slice().sort((a, b) => b.volume - a.volume);
    const byChange = traded.slice().sort((a, b) => b.change - a.change);
    const best = byChange[0];
    const worst = byChange[byChange.length - 1];
    const leader = byVolume[0];

    const direction = up > down ? "positive" : down > up ? "negative" : "even";

    const parts = [
      `${compact(volume)} has traded across ${traded.length} of ${markets.length} markets in the last ${win}, over ${num(txns)} swaps, paying ${compact(fees)} to liquidity providers.`,
      `Breadth is ${direction}: ${up} advancing, ${down} declining, ${quiet} untraded.`,
    ];

    // Naming a leader and a laggard is only meaningful when they moved.
    if (best && best.change > 0.001) {
      parts.push(
        `${best.ticker} leads gainers (${pct(best.change)} to ${usd(best.price)})${
          worst && worst.change < -0.001 ? `; ${worst.ticker} paces losers (${pct(worst.change)})` : ""
        }.`,
      );
    } else if (worst && worst.change < -0.001) {
      parts.push(`${worst.ticker} paces losers (${pct(worst.change)}).`);
    }

    if (leader) {
      parts.push(
        `${leader.ticker} leads by volume (${compact(leader.volume)}). Pool liquidity stands at ${compact(tvl)} across ${markets.length} pools.`,
      );
    }

    return parts.join(" ");
  }, [markets, volume, fees, tvl, txns, win]);

  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-wide text-[#10B981] font-semibold mb-2">
        Session summary
      </div>
      <p className="text-[12px] leading-relaxed text-gray-300 max-w-[110ch]">
        {/* `markets` is already ninety-eight rows of zeros before the snapshot
            lands, so its length says nothing about whether there is data. Left
            on the length check this read "no trades have gone through", which
            is a claim rather than a spinner. */}
        {loading ? "Reading the pools…" : text}
      </p>
    </div>
  );
}

/**
 * Which markets account for the move.
 *
 * The listed set is dominated by a handful of deep pools, so the average can
 * point one way while most markets go the other. Naming the contributors is the
 * difference between reporting a number and explaining it.
 */
export function WhatsMoving({
  markets,
  win,
  loading,
}: {
  markets: LiveMarket[];
  win: string;
  loading: boolean;
}) {
  const { top, breadth, average, withoutTopTwo } = useMemo(() => {
    const ranked = contributions(markets);
    const total = ranked.reduce((s, r) => s + r.points, 0);
    const topTwo = ranked.slice(0, 2).reduce((s, r) => s + r.points, 0);

    return {
      top: ranked.slice(0, 5),
      breadth: breadthOf(markets),
      average: total,
      withoutTopTwo: total - topTwo,
    };
  }, [markets]);

  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
      <h3 className="text-white font-bold text-[13px]">What is actually moving it</h3>
      <p className="text-[10px] text-gray-500 mt-0.5">
        Weighted by pool liquidity, so a handful of deep markets can carry the average while most go
        the other way
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-3 pb-2 border-b border-[#232730]">
        <span className="text-[10px] text-gray-500 whitespace-nowrap">Market breadth, last {win}</span>
        <span className="font-mono text-[11px] whitespace-nowrap">
          <span className="text-[#F43F5E]">{breadth.down} declining</span>
          <span className="text-gray-600"> · </span>
          <span className="text-[#10B981]">{breadth.up} advancing</span>
        </span>
      </div>

      <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-3 mb-1">
        Top contributors
      </div>

      {top.length === 0 ? (
        <p className="text-[11px] text-gray-500 py-4">
          {loading ? "Reading the pools…" : "Nothing has traded in this window."}
        </p>
      ) : (
        <>
          {top.map(({ m, points }) => (
            <div
              key={m.ticker}
              className="flex items-center gap-3 py-2 border-b border-[#1F2228] last:border-0"
            >
              <span className="w-16 shrink-0">
                <span className="block font-mono text-[11px] font-semibold text-white">
                  {m.ticker}
                </span>
                <span className={`block font-mono text-[10px] ${tone(m.change)}`}>
                  {pct(m.change)}
                </span>
              </span>
              <span className="min-w-0 flex-1 text-[10px] text-gray-500 truncate">{m.name}</span>
              <span className={`font-mono text-[11px] shrink-0 ${tone(points)}`}>
                {points >= 0 ? "+" : ""}
                {points.toFixed(3)} pts
              </span>
            </div>
          ))}

          <p className="text-[11px] leading-relaxed text-gray-400 mt-3 max-w-[100ch]">
            {/* The counterfactual is the point of the panel: it says whether the
                headline number describes the listed set or two pools in it. */}
            The liquidity-weighted average is {pct(average)} over the last {win}. Strip out{" "}
            {top
              .slice(0, 2)
              .map((t) => t.m.ticker)
              .join(" and ")}{" "}
            and it is {pct(withoutTopTwo)}.{" "}
            {breadth.quiet > 0 &&
              `With ${breadth.quiet} markets untraded, most of the listed set is not moving either way yet.`}
          </p>
        </>
      )}
    </div>
  );
}

function TrendColumn({
  title,
  rows,
  metric,
}: {
  title: string;
  rows: LiveMarket[];
  metric: (m: LiveMarket) => { value: string; tone: string };
}) {
  return (
    <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#232730]">
        <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
          {title}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-[11px] text-gray-500">Nothing yet</div>
      ) : (
        rows.map((m) => {
          const { value, tone: t } = metric(m);
          return (
            <div
              key={m.ticker}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1F2228] last:border-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[11px] font-semibold text-white">
                  {m.ticker}
                </span>
                <span className="block text-[10px] text-gray-500 truncate">{m.name}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block font-mono text-[11px] text-gray-200">{usd(m.price)}</span>
                <span className={`block font-mono text-[10px] ${t}`}>{value}</span>
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

/** Top gainers, top losers and the markets carrying the volume. */
export function Trending({ markets, win }: { markets: LiveMarket[]; win: string }) {
  const { gainers, losers, active } = useMemo(() => {
    // Only a market that traded has a change worth ranking; an untraded one
    // reads as 0.00% and would crowd out the real movers.
    const traded = markets.filter((m) => m.txns > 0);
    const byChange = traded.slice().sort((a, b) => b.change - a.change);

    return {
      gainers: byChange.filter((m) => m.change > 0).slice(0, 5),
      losers: byChange
        .filter((m) => m.change < 0)
        .slice(-5)
        .reverse(),
      active: traded
        .slice()
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5),
    };
  }, [markets]);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-white font-bold text-[13px]">Trending</h3>
        <span className="font-mono text-[10px] text-gray-500">last {win}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <TrendColumn
          title="Top gainers"
          rows={gainers}
          metric={(m) => ({ value: pct(m.change), tone: "text-[#10B981]" })}
        />
        <TrendColumn
          title="Top losers"
          rows={losers}
          metric={(m) => ({ value: pct(m.change), tone: "text-[#F43F5E]" })}
        />
        <TrendColumn
          title="Most active"
          rows={active}
          metric={(m) => ({ value: compact(m.volume), tone: "text-gray-400" })}
        />
      </div>
    </div>
  );
}
