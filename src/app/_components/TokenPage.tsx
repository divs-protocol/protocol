"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Copy, Check } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import {
  type Market,
  type Timeframe,
  TIMEFRAMES,
  priceSeries,
  transactions,
  flowSummary,
  usd,
  compact,
  num,
  shortAddr,
  ago,
} from "@/lib/markets";
import Footer from "./Footer";

/** One market in depth: chart, order flow, and the tape. */

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-xl px-3.5 py-2.5">
      <div className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className={`font-mono text-sm ${accent ? "text-[#10B981]" : "text-white"}`}>{value}</div>
    </div>
  );
}

function TradePanel({ market }: { market: Market }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("1");

  const qty = Number(amount) || 0;
  const total = qty * market.price;
  const isBuy = side === "buy";

  return (
    <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-4">
      <div className="grid grid-cols-2 gap-1.5 bg-[#14161B] border border-[#232730] rounded-xl p-1 mb-4">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide transition ${
              side === s
                ? s === "buy"
                  ? "bg-[#10B981] text-black"
                  : "bg-red-500 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <label className="block text-[10px] text-gray-500 mb-1.5">Amount ({market.ticker})</label>
      <div className="flex items-center bg-[#14161B] border border-[#232730] rounded-xl px-3 py-2.5 mb-2.5">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          className="bg-transparent text-white font-mono text-lg w-full outline-none"
        />
        <span className="text-[11px] text-gray-500 font-semibold flex-shrink-0">{market.ticker}</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-4">
        {["1", "10", "50", "100"].map((v) => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            className="bg-[#14161B] border border-[#232730] text-gray-400 hover:text-white text-[10px] font-semibold py-1.5 rounded-lg transition"
          >
            {v}
          </button>
        ))}
      </div>

      <div className="space-y-2 mb-4 text-[11px]">
        <div className="flex justify-between">
          <span className="text-gray-500">Price</span>
          <span className="font-mono text-white">{usd(market.price)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Total</span>
          <span className="font-mono text-white">{usd(total)}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-[#232730]">
          <span className="text-gray-500">Fee to stakers</span>
          <span className="font-mono text-[#10B981]">{usd(total * 0.003)}</span>
        </div>
      </div>

      <button
        className={`w-full py-3 rounded-xl text-xs font-bold transition ${
          isBuy ? "bg-[#10B981] hover:bg-[#0EA372] text-black" : "bg-red-500 hover:bg-red-600 text-white"
        }`}
      >
        {isBuy ? "Buy" : "Sell"} {market.ticker}
      </button>
    </div>
  );
}

export default function TokenPage({ market, onBack }: { market: Market; onBack: () => void }) {
  const [tf, setTf] = useState<Timeframe>("24H");
  const [tab, setTab] = useState<"all" | "buys" | "sells">("all");
  const [copied, setCopied] = useState(false);

  const series = useMemo(() => priceSeries(market, tf), [market, tf]);
  const txns = useMemo(() => transactions(market), [market]);
  const flow = useMemo(() => flowSummary(txns), [txns]);

  const visible = useMemo(
    () => (tab === "all" ? txns : txns.filter((t) => (tab === "buys" ? t.side === "buy" : t.side === "sell"))),
    [txns, tab],
  );

  const up = market.change24h >= 0;
  const stroke = up ? "#10B981" : "#F87171";
  const address = `0x${market.ticker.toLowerCase().padEnd(6, "0")}9a4c1f${market.ticker.length}b7e2d8c05a3f6119e4`.slice(0, 42);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white transition"
      >
        <ArrowLeft size={13} />
        All markets
      </button>

      {/* identity + headline numbers */}
      <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] flex items-center justify-center text-xs font-bold flex-shrink-0">
              {market.ticker.slice(0, 2)}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-white font-bold text-lg tracking-tight">{market.ticker}</h2>
                <span
                  className={`px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide ${
                    market.listing === "pool"
                      ? "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/25"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                  }`}
                >
                  {market.listing === "pool" ? "Pool" : "Curve"}
                </span>
              </div>
              <div className="text-[11px] text-gray-500">{market.name}</div>
            </div>
          </div>

          <div className="text-right">
            <div className="font-mono text-2xl text-white leading-none">{usd(market.price)}</div>
            <div className={`font-mono text-xs mt-1.5 ${up ? "text-[#10B981]" : "text-red-400"}`}>
              {up ? "+" : ""}
              {market.change24h.toFixed(2)}% 24h
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#232730]">
          <span className="text-[10px] text-gray-500 flex-shrink-0">Contract</span>
          <code className="font-mono text-[10px] text-gray-400 truncate">{address}</code>
          <button
            onClick={copy}
            className="ml-auto flex items-center gap-1 bg-[#14161B] border border-[#232730] text-gray-400 hover:text-white text-[10px] px-2 py-1 rounded-md transition flex-shrink-0"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button className="flex items-center gap-1 bg-[#14161B] border border-[#232730] text-gray-400 hover:text-white text-[10px] px-2 py-1 rounded-md transition flex-shrink-0">
            <ExternalLink size={10} />
            Explorer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="24h volume" value={compact(market.volume24h)} />
        <Stat label="Liquidity" value={compact(market.liquidity)} />
        <Stat label="24h fees to stakers" value={compact(market.fees24h)} accent />
        <Stat label="Holders" value={num(market.holders)} />
        <Stat label="Trades 24h" value={num(flow.buys + flow.sells)} />
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
        {/* chart */}
        <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-white">Price</span>
            <div className="flex items-center gap-1">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition ${
                    tf === t ? "bg-[#10B981] text-black" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[260px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="t"
                  tick={{ fill: "#5A6068", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  domain={["dataMin", "dataMax"]}
                  tick={{ fill: "#5A6068", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v: number) => usd(v, 2)}
                />
                <Tooltip
                  contentStyle={{
                    background: "#14161B",
                    border: "1px solid #232730",
                    borderRadius: 10,
                    fontSize: 11,
                  }}
                  labelStyle={{ color: "#9A9FA8" }}
                  formatter={(v) => [usd(Number(v)), "Price"] as [string, string]}
                />
                <Area type="monotone" dataKey="price" stroke={stroke} strokeWidth={1.6} fill="url(#tokenFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <TradePanel market={market} />
      </div>

      {/* order flow */}
      <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold text-white">Buy / sell pressure (24h)</span>
          <span className="font-mono text-[11px] text-gray-400">
            <span className="text-[#10B981]">{flow.buys} buys</span>
            {" · "}
            <span className="text-red-400">{flow.sells} sells</span>
          </span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-[#14161B]">
          <div className="bg-[#10B981]" style={{ width: `${flow.buyShare * 100}%` }} />
          <div className="bg-red-500 flex-1" />
        </div>
        <div className="flex justify-between mt-2 text-[10px]">
          <span className="text-[#10B981] font-mono">{compact(flow.buyVol)} bought</span>
          <span className="text-red-400 font-mono">{compact(flow.sellVol)} sold</span>
        </div>
      </div>

      {/* the tape */}
      <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl overflow-hidden">
        <div className="flex items-center gap-1 p-3 border-b border-[#232730]">
          <span className="text-[11px] font-semibold text-white mr-2">Transactions</span>
          {(["all", "buys", "sells"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold capitalize transition ${
                tab === t ? "bg-[#232730] text-white" : "text-gray-500 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-gray-600 font-mono">{visible.length} shown</span>
        </div>

        <div className="overflow-x-auto max-h-[420px] overflow-y-auto scrollbar-none">
          <table className="w-full text-[11px] min-w-[640px]">
            <thead className="sticky top-0 bg-[#14161B]">
              <tr className="text-[10px] uppercase tracking-wide text-gray-500 border-b border-[#232730]">
                <th className="px-3 py-2 text-left font-semibold">Type</th>
                <th className="px-3 py-2 text-right font-semibold">Price</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                <th className="px-3 py-2 text-right font-semibold">Value</th>
                <th className="px-3 py-2 text-right font-semibold">Trader</th>
                <th className="px-3 py-2 text-right font-semibold">Age</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition">
                  <td className="px-3 py-2">
                    <span
                      className={`font-semibold uppercase text-[10px] ${
                        t.side === "buy" ? "text-[#10B981]" : "text-red-400"
                      }`}
                    >
                      {t.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-gray-300">{usd(t.price)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-300">{num(t.amount, 2)}</td>
                  <td className="px-3 py-2 text-right font-mono text-white">{usd(t.value)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-500">{shortAddr(t.trader)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600">{ago(t.secondsAgo)}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-gray-500">
                    No {tab} in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Footer />
    </div>
  );
}
