"use client";

import { useMemo, useState } from "react";
import { Search, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { compact, num, usd, useLiveMarkets } from "@/lib/live";
import TokenPage from "./TokenPage";
import Footer from "./Footer";

/**
 * Markets - the index of every listed market.
 *
 * Every column is read from the pools: price from `slot0`, change, volume and
 * trade count from `Swap` logs, liquidity from what the pool contract holds.
 * The window those flow columns cover is measured from block timestamps and
 * shown in the header, because at 0.1s blocks the range a browser can read is
 * well short of a day.
 */

type SortKey = "price" | "change" | "volume" | "tvl" | "fees" | "txns";
type Filter = "all" | "stock" | "etf" | "gainers" | "losers";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "stock", label: "Stocks" },
  { id: "etf", label: "ETFs" },
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
];

/** Sparkline over the market's real price path through the window. */
function sparkPath(series: number[], w = 62, h = 20) {
  if (series.length < 2) return "";
  // More points than pixels is wasted work; take an even sample.
  const n = Math.min(series.length, 24);
  const step = (series.length - 1) / (n - 1);
  const vals = Array.from({ length: n }, (_, i) => series[Math.round(i * step)]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  return vals
    .map((val, i) => {
      const x = (i / (n - 1)) * w;
      const y = h - ((val - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function Stat({
  label,
  value,
  accent,
  loading,
}: {
  label: string;
  value: string;
  accent?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">{label}</div>
      <div className={`font-mono text-xl ${accent ? "text-[#10B981]" : "text-white"}`}>
        {loading ? <span className="text-gray-600">···</span> : value}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2.5 font-semibold text-right">
      <button
        onClick={onClick}
        className={`inline-flex flex-row-reverse items-center gap-1 transition hover:text-white ${
          active ? "text-white" : "text-gray-500"
        }`}
      >
        {label}
        {active ? (
          dir === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />
        ) : (
          <ChevronsUpDown size={11} className="opacity-40" />
        )}
      </button>
    </th>
  );
}

export default function MarketsSection() {
  const { markets, window, loading } = useLiveMarkets();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDir(dir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setDir("desc");
    }
  };

  const rows = useMemo(() => {
    let out = markets.filter((m) => {
      if (filter === "stock" || filter === "etf") return m.kind === filter;
      if (filter === "gainers") return m.change > 0;
      if (filter === "losers") return m.change < 0;
      return true;
    });

    const q = query.trim().toLowerCase();
    if (q)
      out = out.filter(
        (m) => m.ticker.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
      );

    return [...out].sort((a, b) => (dir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
  }, [markets, filter, query, sortKey, dir]);

  const totals = useMemo(
    () => ({
      volume: markets.reduce((s, m) => s + m.volume, 0),
      fees: markets.reduce((s, m) => s + m.fees, 0),
      tvl: markets.reduce((s, m) => s + m.tvl, 0),
    }),
    [markets],
  );

  const openMarket = selected ? markets.find((m) => m.ticker === selected) : undefined;
  if (openMarket) return <TokenPage market={openMarket} onBack={() => setSelected(null)} />;

  const win = window || "…";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-bold tracking-tight text-xl mb-1">Markets</h2>
        <p className="text-[11px] text-gray-500">
          Every listed market, read live from its pool. Select one to open it.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Markets listed" value={String(markets.length)} />
        <Stat label={`Volume ${win}`} value={compact(totals.volume)} loading={loading} />
        <Stat label={`Pool fees ${win}`} value={compact(totals.fees)} accent loading={loading} />
        <Stat label="Pool liquidity" value={compact(totals.tvl)} loading={loading} />
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
                filter === f.id
                  ? "bg-[#10B981] text-black"
                  : "bg-[#1B1E24] border border-[#232730] text-gray-400 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative md:ml-auto md:w-64">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search markets..."
            className="w-full bg-[#1B1E24] border border-[#232730] rounded-lg pl-8 pr-3 py-2 text-[11px] text-white placeholder:text-gray-500 outline-none focus:border-[#10B981]/40"
          />
        </div>
      </div>

      <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[900px]">
            <thead>
              <tr className="bg-[#14161B] border-b border-[#232730] text-[10px] uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-10">#</th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-500">Market</th>
                <SortHeader label="Price" active={sortKey === "price"} dir={dir} onClick={() => toggleSort("price")} />
                <SortHeader label={win} active={sortKey === "change"} dir={dir} onClick={() => toggleSort("change")} />
                <th className="px-3 py-2.5 text-right font-semibold text-gray-500">Trend</th>
                <SortHeader label={`Volume ${win}`} active={sortKey === "volume"} dir={dir} onClick={() => toggleSort("volume")} />
                <SortHeader label="Liquidity" active={sortKey === "tvl"} dir={dir} onClick={() => toggleSort("tvl")} />
                <SortHeader label={`Pool fees ${win}`} active={sortKey === "fees"} dir={dir} onClick={() => toggleSort("fees")} />
                <SortHeader label="Trades" active={sortKey === "txns"} dir={dir} onClick={() => toggleSort("txns")} />
                <th className="px-3 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => {
                const up = m.change >= 0;
                const path = sparkPath(m.series);
                return (
                  <tr
                    key={m.ticker}
                    onClick={() => setSelected(m.ticker)}
                    className="border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition cursor-pointer"
                  >
                    <td className="px-3 py-3 text-gray-600 font-mono">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                          {m.ticker.slice(0, 2)}
                        </span>
                        <div className="min-w-0">
                          <div className="text-white font-semibold">{m.ticker}</div>
                          <div className="text-[10px] text-gray-500 truncate">{m.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-white">
                      {m.price ? usd(m.price) : <span className="text-gray-600">···</span>}
                    </td>
                    <td className={`px-3 py-3 text-right font-mono ${up ? "text-[#10B981]" : "text-red-400"}`}>
                      {m.txns ? `${up ? "+" : ""}${m.change.toFixed(2)}%` : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {path ? (
                        <svg viewBox="0 0 62 20" className="w-[62px] h-5 ml-auto block" aria-hidden>
                          <path
                            d={path}
                            fill="none"
                            stroke={up ? "#10B981" : "#F87171"}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <div className="text-right text-gray-700">—</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-gray-300">{compact(m.volume)}</td>
                    <td className="px-3 py-3 text-right font-mono text-gray-300">{compact(m.tvl)}</td>
                    <td className="px-3 py-3 text-right font-mono text-[#10B981]">{compact(m.fees)}</td>
                    <td className="px-3 py-3 text-right font-mono text-gray-400">{num(m.txns)}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(m.ticker);
                        }}
                        className="bg-[#232730] hover:bg-[#10B981] hover:text-black text-white text-[10px] font-semibold px-3 py-1.5 rounded-lg transition"
                      >
                        Trade
                      </button>
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-gray-500">
                    {loading ? "Reading the pools…" : "No markets match that search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-gray-600">
        Showing {rows.length} of {markets.length} markets. Flow columns cover the last {win} of
        chain, measured from block timestamps. Pool fees are each market&apos;s volume at its own
        fee tier, paid to that pool&apos;s liquidity providers. The DIVS protocol fee is separate and
        goes to stakers.
      </p>

      <Footer />
    </div>
  );
}
