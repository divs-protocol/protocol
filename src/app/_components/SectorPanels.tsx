"use client";

import { useMemo } from "react";
import { MARKETS } from "@/lib/exchange";
import { sectorOf, type Sector } from "@/lib/sectors";
import { compact, num, usd, type LiveMarket } from "@/lib/live";

/**
 * Most active, sector heatmap and sector rotation.
 *
 * All three read the snapshot the app already polls. Sector membership comes
 * from the registry rather than the row, so a market the scan added but the
 * sector map has not yet classified lands in "Other" instead of vanishing.
 */

const registry = new Map(MARKETS.map((m) => [m.ticker, m]));
const sectorFor = (ticker: string) => {
  const m = registry.get(ticker);
  return m ? sectorOf(m) : "Other";
};

type SectorStat = {
  sector: Sector;
  tvl: number;
  volume: number;
  early: number;
  late: number;
  txns: number;
  /** Liquidity-weighted, so a thin market cannot swing the tile. */
  change: number;
  markets: number;
  traded: number;
};

function aggregate(markets: LiveMarket[]): SectorStat[] {
  const bucket = new Map<Sector, SectorStat>();

  for (const m of markets) {
    const sector = sectorFor(m.ticker) as Sector;
    const s =
      bucket.get(sector) ??
      { sector, tvl: 0, volume: 0, early: 0, late: 0, txns: 0, change: 0, markets: 0, traded: 0 };

    s.tvl += m.tvl;
    s.volume += m.volume;
    s.early += m.volumeEarly ?? 0;
    s.late += m.volumeLate ?? 0;
    s.txns += m.txns;
    s.markets += 1;
    // Only a market that traded has a change worth weighting.
    if (m.txns > 0) {
      s.change += m.change * m.tvl;
      s.traded += m.tvl;
    }
    bucket.set(sector, s);
  }

  return [...bucket.values()]
    .map((s) => ({ ...s, change: s.traded ? s.change / s.traded : 0 }))
    .sort((a, b) => b.tvl - a.tvl);
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
      <h3 className="text-white font-bold text-[13px]">{title}</h3>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5 mb-3">{sub}</p>}
      {children}
    </div>
  );
}

/* ---------------- most active ---------------- */

function MostActive({ markets, win }: { markets: LiveMarket[]; win: string }) {
  const rows = useMemo(
    () => markets.filter((m) => m.txns > 0).sort((a, b) => b.txns - a.txns).slice(0, 8),
    [markets],
  );
  const top = rows[0]?.txns ?? 1;

  return (
    <Panel title="Most active" sub={`Trades in the last ${win}`}>
      {rows.length === 0 ? (
        <p className="text-[11px] text-gray-600 py-6 text-center">No trades in this window.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((m) => (
            <div key={m.ticker} className="flex items-center gap-3">
              <span className="text-[11px] font-bold text-white w-14 flex-shrink-0">{m.ticker}</span>
              <span className="flex-1 h-1.5 rounded-full bg-[#0E1013] overflow-hidden">
                <span
                  className="block h-full rounded-full bg-[#10B981]"
                  style={{ width: `${(m.txns / top) * 100}%`, opacity: 0.45 + (m.txns / top) * 0.55 }}
                />
              </span>
              <span className="text-[11px] font-mono text-gray-300 w-12 text-right">{num(m.txns)}</span>
              <span className="text-[10px] font-mono text-gray-500 w-16 text-right">
                {compact(m.volume)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ---------------- sector heatmap ---------------- */

function SectorHeatmap({ stats }: { stats: SectorStat[] }) {
  const total = stats.reduce((s, x) => s + x.tvl, 0) || 1;

  return (
    <Panel title="Sector heatmap" sub="Tile size is pool liquidity · colour is liquidity-weighted change">
      <div className="flex flex-wrap gap-1.5">
        {stats.map((s) => {
          const share = s.tvl / total;
          const magnitude = Math.min(Math.abs(s.change) / 1.5, 1);
          const quiet = s.traded === 0;
          const background = quiet
            ? "rgba(120,130,145,0.12)"
            : s.change >= 0
              ? `rgba(16,185,129,${0.16 + magnitude * 0.55})`
              : `rgba(244,63,94,${0.16 + magnitude * 0.55})`;

          return (
            <div
              key={s.sector}
              // Width tracks liquidity share but is floored, so a small sector
              // stays readable instead of collapsing to a sliver.
              style={{ background, flexBasis: `${Math.max(share * 100, 15)}%` }}
              className="flex-grow rounded-xl border border-white/5 px-3 py-3 min-w-[128px]"
            >
              <div className="text-[11px] font-semibold text-white leading-tight">{s.sector}</div>
              <div className="text-[15px] font-mono mt-1.5 text-white">
                {quiet ? "—" : `${s.change >= 0 ? "+" : ""}${s.change.toFixed(2)}%`}
              </div>
              <div className="text-[9px] text-gray-400 mt-0.5">
                {compact(s.tvl)} · {s.markets} market{s.markets === 1 ? "" : "s"}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ---------------- sector rotation ---------------- */

function SectorRotation({ stats, win }: { stats: SectorStat[]; win: string }) {
  const rotation = useMemo(() => {
    const earlyTotal = stats.reduce((s, x) => s + x.early, 0);
    const lateTotal = stats.reduce((s, x) => s + x.late, 0);
    if (!earlyTotal || !lateTotal) return [];

    return stats
      .map((s) => ({
        sector: s.sector,
        from: (s.early / earlyTotal) * 100,
        to: (s.late / lateTotal) * 100,
        shift: (s.late / lateTotal) * 100 - (s.early / earlyTotal) * 100,
      }))
      .filter((s) => Math.abs(s.shift) > 0.5)
      .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift))
      .slice(0, 6);
  }, [stats]);

  return (
    <Panel
      title="Sector rotation"
      sub={`Share of volume, first half of the ${win} against the second`}
    >
      {rotation.length === 0 ? (
        <p className="text-[11px] text-gray-600 py-6 text-center">
          Not enough volume in this window to show a shift.
        </p>
      ) : (
        <div className="space-y-2.5">
          {rotation.map((r) => (
            <div key={r.sector} className="flex items-center gap-3">
              <span className="text-[11px] text-gray-300 w-36 flex-shrink-0 truncate">{r.sector}</span>
              <span className="font-mono text-[10px] text-gray-500 w-12 text-right">
                {r.from.toFixed(1)}%
              </span>
              <span className="text-gray-700 text-[10px]">→</span>
              <span className="font-mono text-[10px] text-gray-300 w-12">{r.to.toFixed(1)}%</span>
              <span
                className={`flex-1 text-right font-mono text-[11px] font-semibold ${
                  r.shift >= 0 ? "text-[#10B981]" : "text-red-400"
                }`}
              >
                {r.shift >= 0 ? "+" : ""}
                {r.shift.toFixed(1)} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ---------------- section ---------------- */

export default function SectorPanels({
  markets,
  win,
}: {
  markets: LiveMarket[];
  win: string;
}) {
  const stats = useMemo(() => aggregate(markets), [markets]);
  if (!markets.length) return null;

  return (
    <>
      <SectorHeatmap stats={stats} />
      <div className="grid lg:grid-cols-2 gap-3">
        <MostActive markets={markets} win={win} />
        <SectorRotation stats={stats} win={win} />
      </div>
    </>
  );
}

export { usd };
