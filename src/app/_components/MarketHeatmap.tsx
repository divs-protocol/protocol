"use client";

import { useMemo, useState } from "react";
import { MARKETS } from "@/lib/exchange";
import { sectorOf, ACTIVE_SECTORS, type Sector } from "@/lib/sectors";
import { num, usd, type LiveMarket } from "@/lib/live";

/**
 * Breadth and a bubble map of every listed market.
 *
 * Both read the snapshot the rest of the app already polls, so neither adds a
 * chain call. Bubbles are laid out by a deterministic pack rather than a
 * physics simulation: the same data has to produce the same picture on the
 * server and the client, and a jittered layout would hydrate differently.
 */

const registry = new Map(MARKETS.map((m) => [m.ticker, m]));

/**
 * Green through red, by how far the market has moved.
 *
 * A market that did not trade in the window is grey, not faint green. Most
 * markets are quiet over fifteen minutes, and colouring them as advancing made
 * the map read as uniformly green while saying something untrue.
 */
function tone(change: number, traded = true) {
  if (!traded) {
    return { fill: "rgba(120,130,145,0.14)", stroke: "rgba(120,130,145,0.32)", text: "#9AA3AF" };
  }
  const magnitude = Math.min(Math.abs(change) / 3, 1);
  const alpha = 0.22 + magnitude * 0.6;
  return change >= 0
    ? { fill: `rgba(16,185,129,${alpha})`, stroke: "rgba(16,185,129,0.6)", text: "#D1FAE5" }
    : { fill: `rgba(244,63,94,${alpha})`, stroke: "rgba(244,63,94,0.6)", text: "#FFE4E6" };
}

type Bubble = { m: LiveMarket; r: number; x: number; y: number; change: number };

/**
 * Places circles largest-first, scanning a coarse grid for the first spot that
 * clears everything already down. Not an optimal pack, but stable and cheap,
 * and with a hundred markets the gaps read as deliberate spacing.
 */
function pack(items: { m: LiveMarket; r: number }[], width: number, height: number): Bubble[] | null {
  const out: Bubble[] = [];
  const step = 10;

  for (const item of items) {
    let best: { x: number; y: number; d: number } | null = null;

    for (let y = item.r; y <= height - item.r; y += step) {
      for (let x = item.r; x <= width - item.r; x += step) {
        let clear = true;
        for (const placed of out) {
          const dx = placed.x - x;
          const dy = placed.y - y;
          if (dx * dx + dy * dy < (placed.r + item.r + 3) ** 2) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        // Prefer the centre, so the biggest markets sit where the eye lands.
        const d = (x - width / 2) ** 2 + (y - height / 2) ** 2;
        if (!best || d < best.d) best = { x, y, d };
      }
    }

    if (!best) return null;
    out.push({ m: item.m, r: item.r, x: best.x, y: best.y, change: item.m.change });
  }
  return out;
}

/**
 * Packs everything, shrinking until it fits.
 *
 * A single pass drops whatever it cannot place, and dropping is the one thing
 * this chart must never do - thirty-seven markets disappeared from a
 * ninety-eight market map that way, silently. Failing to place one bubble now
 * shrinks them all and starts over.
 */
function packAll(items: { m: LiveMarket; r: number }[], width: number, height: number): Bubble[] {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const scale = 0.93 ** attempt;
    const placed = pack(
      items.map((i) => ({ ...i, r: Math.max(13, i.r * scale) })),
      width,
      height,
    );
    if (placed) return placed;
  }
  // Last resort: uniform small circles, which always fit.
  return pack(items.map((i) => ({ ...i, r: 13 })), width, height) ?? [];
}

export default function MarketHeatmap({
  markets,
  loading,
}: {
  markets: LiveMarket[];
  loading: boolean;
}) {
  const [sector, setSector] = useState<Sector | "All">("All");

  const shown = useMemo(
    () =>
      markets.filter((m) => {
        const entry = registry.get(m.ticker);
        return sector === "All" || (entry && sectorOf(entry) === sector);
      }),
    [markets, sector],
  );

  const breadth = useMemo(() => {
    let up = 0;
    let down = 0;
    let quiet = 0;
    for (const m of markets) {
      // Untraded and unchanged are different things, and over a short window
      // most markets are the former.
      if (!m.txns) quiet += 1;
      else if (m.change > 0.001) up += 1;
      else if (m.change < -0.001) down += 1;
      else quiet += 1;
    }
    return { up, down, quiet };
  }, [markets]);

  const WIDTH = 960;
  const HEIGHT = 620;

  const bubbles = useMemo(() => {
    if (!shown.length) return [];
    /*
     * Size by liquidity, on a log scale.
     *
     * Liquidity spans three orders of magnitude - a six-million-dollar pool
     * against a twenty-thousand-dollar one - so a linear or square-root scale
     * pins almost every market to the minimum radius and leaves eighty of them
     * as identical unlabelled blobs. Log ranking keeps the biggest markets
     * dominant while giving the rest enough room to carry their ticker.
     */
    const tvls = shown.map((m) => Math.max(m.tvl, 1));
    const hi = Math.log(Math.max(...tvls));
    const lo = Math.log(Math.min(...tvls));
    const span = hi - lo || 1;
    const items = shown
      .slice()
      .sort((a, b) => b.tvl - a.tvl)
      .map((m) => ({
        m,
        r: 19 + ((Math.log(Math.max(m.tvl, 1)) - lo) / span) ** 1.6 * 46,
      }));
    return packAll(items, WIDTH, HEIGHT);
  }, [shown]);

  const total = breadth.up + breadth.down + breadth.quiet || 1;

  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-white font-bold text-[13px]">Market heatmap</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Bubble size is pool liquidity · colour is price change
          </p>
        </div>

        <div className="text-right">
          <div className="text-[10px] text-gray-500 mb-1">Market breadth</div>
          <div className="font-mono text-[11px]">
            <span className="text-[#10B981]">{breadth.up} advancing</span>
            <span className="text-gray-600"> · </span>
            <span className="text-red-400">{breadth.down} declining</span>
            {breadth.quiet > 0 && (
              <>
                <span className="text-gray-600"> · </span>
                <span className="text-gray-500">{breadth.quiet} untraded</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex h-1 rounded-full overflow-hidden mb-4 bg-[#0E1013]">
        <span className="bg-[#10B981]" style={{ width: `${(breadth.up / total) * 100}%` }} />
        <span className="bg-[#2C313B]" style={{ width: `${(breadth.quiet / total) * 100}%` }} />
        <span className="bg-red-500" style={{ width: `${(breadth.down / total) * 100}%` }} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-4 pb-1">
        {(["All", ...ACTIVE_SECTORS] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSector(s)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap transition ${
              sector === s ? "bg-[#10B981] text-black" : "bg-[#1B1E24] text-gray-400 hover:text-white"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto scrollbar-none">
        {loading && !bubbles.length ? (
          <div className="h-[620px] flex items-center justify-center text-[11px] text-gray-600">
            Reading the pools…
          </div>
        ) : (
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[720px]" role="img"
               aria-label={`${bubbles.length} markets by liquidity and price change`}>
            {bubbles.map((b) => {
              const t = tone(b.change, b.m.txns > 0);
              // Every bubble carries its ticker; only the larger ones have
              // room for a second line underneath it.
              const showDetail = b.r >= 26;
              return (
                <g key={b.m.ticker}>
                  <circle cx={b.x} cy={b.y} r={b.r} fill={t.fill} stroke={t.stroke} strokeWidth={1} />
                  <text
                    x={b.x}
                    y={showDetail ? b.y - 1 : b.y + 3}
                    textAnchor="middle"
                    fill={t.text}
                    fontSize={Math.min(Math.max(b.r / 2.8, 9), 15)}
                    fontWeight={700}
                  >
                    {b.m.ticker}
                  </text>
                  {showDetail && (
                    <text
                      x={b.x}
                      y={b.y + Math.min(b.r / 2.2, 14)}
                      textAnchor="middle"
                      fill={t.text}
                      fontSize={Math.min(b.r / 3.4, 11)}
                      fontFamily="ui-monospace, monospace"
                      opacity={0.85}
                    >
                      {/* A market with no trades has no change to report, so it
                          shows its price rather than a 0.00% that looks like a
                          measurement. */}
                      {b.m.txns
                        ? `${b.change >= 0 ? "+" : ""}${b.change.toFixed(2)}%`
                        : usd(b.m.price)}
                    </text>
                  )}
                  <title>
                    {`${b.m.ticker} · ${usd(b.m.price)} · ${b.change >= 0 ? "+" : ""}${b.change.toFixed(2)}% · liquidity ${usd(b.m.tvl, 0)} · ${num(b.m.txns)} trades`}
                  </title>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 text-[10px] text-gray-600">
        <span>{shown.length} markets</span>
        <span className="flex items-center gap-1.5">
          Declining
          <span className="flex gap-0.5">
            {[-3, -1.5, -0.5, 0.5, 1.5, 3].map((c) => (
              <span key={c} className="w-3.5 h-2 rounded-sm" style={{ background: tone(c).fill }} />
            ))}
            <span className="w-3.5 h-2 rounded-sm ml-1.5" style={{ background: tone(0, false).fill }} />
          </span>
          Advancing
          <span className="text-gray-700 ml-0.5">· untraded</span>
        </span>
      </div>
    </div>
  );
}
