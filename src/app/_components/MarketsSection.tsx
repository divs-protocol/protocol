"use client";

import { useMemo, useState } from "react";
import { Search, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { MARKETS, type Market, seededRandom, usd, compact } from "@/lib/markets";
import TokenPage from "./TokenPage";
import Footer from "./Footer";

/**
 * Markets - the index of every listed market.
 *
 * The browse layer: scan, sort, filter, then open one market to see its chart
 * and tape. Depth of book and order entry stay in the trading terminal.
 */

type SortKey = "price" | "change24h" | "volume24h" | "liquidity" | "fees24h";
type Filter = "all" | "stock" | "etf" | "new" | "gainers" | "losers";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "stock", label: "Stocks" },
  { id: "etf", label: "ETFs" },
  { id: "new", label: "New" },
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
];

/** Deterministic per-ticker sparkline, matching the token page's series. */
function sparkPath(ticker: string, up: boolean, w = 62, h = 20) {
  const rand = seededRandom(ticker);
  const n = 16;
  const vals: number[] = [];
  let v = 0.5;
  for (let i = 0; i < n; i++) {
    v += (rand() - (up ? 0.42 : 0.58)) * 0.16;
    vals.push(Math.min(1, Math.max(0, v)));
  }
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">{label}</div>
      <div className={`font-mono text-xl ${accent ? "text-[#10B981]" : "text-white"}`}>{value}</div>
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
  const [selected, setSelected] = useState<Market | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("volume24h");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDir(dir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setDir("desc");
    }
  };

  const rows = useMemo(() => {
    let out = MARKETS.filter((m) => {
      if (filter === "stock" || filter === "etf") return m.kind === filter;
      if (filter === "new") return m.listing === "curve";
      if (filter === "gainers") return m.change24h > 0;
      if (filter === "losers") return m.change24h < 0;
      return true;
    });

    const q = query.trim().toLowerCase();
    if (q) out = out.filter((m) => m.ticker.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));

    return [...out].sort((a, b) => (dir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
  }, [filter, query, sortKey, dir]);

  const totals = useMemo(
    () => ({
      volume: MARKETS.reduce((s, m) => s + m.volume24h, 0),
      fees: MARKETS.reduce((s, m) => s + m.fees24h, 0),
      liquidity: MARKETS.reduce((s, m) => s + m.liquidity, 0),
    }),
    [],
  );

  if (selected) return <TokenPage market={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-bold tracking-tight text-xl mb-1">Markets</h2>
        <p className="text-[11px] text-gray-500">
          Every listed market, and what each one pays stakers. Select one to open it.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Markets listed" value={String(MARKETS.length)} />
        <Stat label="24h volume" value={compact(totals.volume)} />
        <Stat label="24h fees to stakers" value={compact(totals.fees)} accent />
        <Stat label="Total liquidity" value={compact(totals.liquidity)} />
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
                <SortHeader label="24h" active={sortKey === "change24h"} dir={dir} onClick={() => toggleSort("change24h")} />
                <th className="px-3 py-2.5 text-right font-semibold text-gray-500">7d</th>
                <SortHeader label="Volume 24h" active={sortKey === "volume24h"} dir={dir} onClick={() => toggleSort("volume24h")} />
                <SortHeader label="Liquidity" active={sortKey === "liquidity"} dir={dir} onClick={() => toggleSort("liquidity")} />
                <SortHeader label="Fees 24h" active={sortKey === "fees24h"} dir={dir} onClick={() => toggleSort("fees24h")} />
                <th className="px-3 py-2.5 text-right font-semibold text-gray-500">Status</th>
                <th className="px-3 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => {
                const up = m.change24h >= 0;
                return (
                  <tr
                    key={m.ticker}
                    onClick={() => setSelected(m)}
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
                    <td className="px-3 py-3 text-right font-mono text-white">{usd(m.price)}</td>
                    <td className={`px-3 py-3 text-right font-mono ${up ? "text-[#10B981]" : "text-red-400"}`}>
                      {up ? "+" : ""}
                      {m.change24h.toFixed(2)}%
                    </td>
                    <td className="px-3 py-3">
                      <svg viewBox="0 0 62 20" className="w-[62px] h-5 ml-auto block" aria-hidden>
                        <path
                          d={sparkPath(m.ticker, up)}
                          fill="none"
                          stroke={up ? "#10B981" : "#F87171"}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-gray-300">{compact(m.volume24h)}</td>
                    <td className="px-3 py-3 text-right font-mono text-gray-300">{compact(m.liquidity)}</td>
                    <td className="px-3 py-3 text-right font-mono text-[#10B981]">{compact(m.fees24h)}</td>
                    <td className="px-3 py-3 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide ${
                          m.listing === "pool"
                            ? "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/25"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                        }`}
                      >
                        {m.listing === "pool" ? "Pool" : "Curve"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(m);
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
                    No markets match that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-gray-600">
        Showing {rows.length} of {MARKETS.length} markets. Fees 24h is the share of trading fees each
        market routed to stakers.
      </p>

      <Footer />
    </div>
  );
}
