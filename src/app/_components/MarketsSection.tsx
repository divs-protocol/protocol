"use client";

import { useMemo, useState } from "react";
import { Search, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";

/**
 * Markets - the index of every listed market.
 *
 * This is the browse layer: scan, sort, filter, then jump into the terminal for
 * one instrument. Depth of book and order entry stay in the trading view.
 *
 * Prices, volume and liquidity are placeholders until a feed exists. They are
 * kept in one MARKETS array with a single shaped type so swapping in live data
 * is a change to the data source, not to the table.
 */

type Listing = "pool" | "curve";
type Kind = "stock" | "etf";

type Market = {
  ticker: string;
  name: string;
  kind: Kind;
  price: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  fees24h: number;
  listing: Listing;
};

const MARKETS: Market[] = [
  { ticker: "NVDA", name: "NVIDIA Corp.", kind: "stock", price: 124.5, change24h: 4.25, volume24h: 64654880, liquidity: 12840000, fees24h: 19396, listing: "pool" },
  { ticker: "AAPL", name: "Apple Inc.", kind: "stock", price: 221.1, change24h: -1.8, volume24h: 48210400, liquidity: 10420000, fees24h: 14463, listing: "pool" },
  { ticker: "TSLA", name: "Tesla Inc.", kind: "stock", price: 214.3, change24h: 6.1, volume24h: 39877120, liquidity: 8110000, fees24h: 11963, listing: "pool" },
  { ticker: "SPY", name: "SPDR S&P 500 ETF", kind: "etf", price: 757.55, change24h: 0.42, volume24h: 31204900, liquidity: 15960000, fees24h: 9361, listing: "pool" },
  { ticker: "AMZN", name: "Amazon.com Inc.", kind: "stock", price: 186.4, change24h: 2.15, volume24h: 27655300, liquidity: 7240000, fees24h: 8296, listing: "pool" },
  { ticker: "MSFT", name: "Microsoft Corp.", kind: "stock", price: 448.2, change24h: 0.85, volume24h: 24118700, liquidity: 9870000, fees24h: 7235, listing: "pool" },
  { ticker: "QQQ", name: "Invesco QQQ Trust", kind: "etf", price: 486.12, change24h: 1.04, volume24h: 18902450, liquidity: 6650000, fees24h: 5670, listing: "pool" },
  { ticker: "GOOGL", name: "Alphabet Inc.", kind: "stock", price: 178.35, change24h: -0.45, volume24h: 16440210, liquidity: 5980000, fees24h: 4932, listing: "pool" },
  { ticker: "META", name: "Meta Platforms", kind: "stock", price: 612.8, change24h: 3.37, volume24h: 14203880, liquidity: 5120000, fees24h: 4261, listing: "pool" },
  { ticker: "AMD", name: "Advanced Micro Devices", kind: "stock", price: 167.9, change24h: -2.64, volume24h: 9884300, liquidity: 3410000, fees24h: 2965, listing: "pool" },
  { ticker: "PFE", name: "Pfizer Inc.", kind: "stock", price: 28.44, change24h: -0.92, volume24h: 3120480, liquidity: 1180000, fees24h: 936, listing: "curve" },
  { ticker: "KO", name: "Coca-Cola Co.", kind: "stock", price: 71.06, change24h: 0.18, volume24h: 1894220, liquidity: 742000, fees24h: 568, listing: "curve" },
];

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

const usd = (n: number, d = 2) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;

const compact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

/** Deterministic per-ticker series, so server and client render the same path. */
function sparkPath(ticker: string, up: boolean, w = 62, h = 20) {
  let seed = 0;
  for (let i = 0; i < ticker.length; i++) seed = (seed * 31 + ticker.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
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
  align = "right",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-3 py-2.5 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition hover:text-white ${
          active ? "text-white" : "text-gray-500"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-bold tracking-tight text-xl mb-1">Markets</h2>
        <p className="text-[11px] text-gray-500">
          Every listed market, and what each one pays stakers.
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
                  <tr key={m.ticker} className="border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition">
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
                      <button className="bg-[#232730] hover:bg-[#10B981] hover:text-black text-white text-[10px] font-semibold px-3 py-1.5 rounded-lg transition">
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
    </div>
  );
}
