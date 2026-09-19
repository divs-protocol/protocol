"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Copy, Check } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import {
  HISTORY_SPANS,
  type HistorySpan,
  type LiveMarket,
  ago,
  compact,
  num,
  shortAddr,
  usd,
  useMarketHistory,
} from "@/lib/live";
import Footer from "./Footer";
import { TickerInsiderPanel } from "./InsiderPanel";

/**
 * One market in depth: chart, order flow and the tape.
 *
 * The tape is the pool's own `Swap` log, decoded. Side comes from the sign of
 * the WETH leg, size from the share leg, and the trader is the swap recipient -
 * for a router trade that is the wallet the shares were delivered to.
 */

const EXPLORER = "https://robinhoodchain.blockscout.com";

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-xl px-3.5 py-2.5">
      <div className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className={`font-mono text-sm ${accent ? "text-[#10B981]" : "text-white"}`}>{value}</div>
    </div>
  );
}

function TradePanel({ market }: { market: LiveMarket }) {
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
          <span className="text-gray-500">Pool fee ({(market.feeBps / 10_000).toFixed(2)}%)</span>
          <span className="font-mono text-[#10B981]">{usd((total * market.feeBps) / 1_000_000)}</span>
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

export default function TokenPage({
  market,
  onBack,
}: {
  market: LiveMarket;
  onBack: () => void;
}) {
  const [span, setSpan] = useState<HistorySpan>("1h");
  const [tab, setTab] = useState<"all" | "buys" | "sells">("all");
  const [copied, setCopied] = useState(false);

  const {
    trades,
    candles,
    window: win,
    quotedOnly,
    widened,
    buys,
    sells,
    buyVolume,
    sellVolume,
    loading,
  } = useMarketHistory(market.ticker, span);

  const visible = useMemo(
    () =>
      tab === "all"
        ? trades
        : trades.filter((t) => (tab === "buys" ? t.side === "buy" : t.side === "sell")),
    [trades, tab],
  );

  // Counts and volumes cover the whole window; the tape below is capped, so
  // these cannot be recomputed from the rows on screen.
  const flow = useMemo(
    () => ({
      buys,
      sells,
      buyVol: buyVolume,
      sellVol: sellVolume,
      buyShare: buyVolume + sellVolume ? buyVolume / (buyVolume + sellVolume) : 0.5,
    }),
    [buys, sells, buyVolume, sellVolume],
  );

  const chart = useMemo(
    () =>
      candles.map((c) => ({
        t: new Date(c.t * 1000).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }),
        price: c.price,
      })),
    [candles],
  );

  const up = market.change >= 0;
  const stroke = up ? "#10B981" : "#F87171";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(market.token);
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
                <span className="px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/25">
                  {(market.feeBps / 10_000).toFixed(2)}% pool
                </span>
              </div>
              <div className="text-[11px] text-gray-500">{market.name}</div>
            </div>
          </div>

          <div className="text-right">
            <div className="font-mono text-2xl text-white leading-none">{usd(market.price)}</div>
            <div className={`font-mono text-xs mt-1.5 ${up ? "text-[#10B981]" : "text-red-400"}`}>
              {up ? "+" : ""}
              {market.change.toFixed(2)}% {win || "…"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#232730]">
          <span className="text-[10px] text-gray-500 flex-shrink-0">Token</span>
          <code className="font-mono text-[10px] text-gray-400 truncate">{market.token}</code>
          <button
            onClick={copy}
            className="ml-auto flex items-center gap-1 bg-[#14161B] border border-[#232730] text-gray-400 hover:text-white text-[10px] px-2 py-1 rounded-md transition flex-shrink-0"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={`${EXPLORER}/address/${market.token}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 bg-[#14161B] border border-[#232730] text-gray-400 hover:text-white text-[10px] px-2 py-1 rounded-md transition flex-shrink-0"
          >
            <ExternalLink size={10} />
            Explorer
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label={`Volume ${win || "…"}`} value={compact(market.volume)} />
        <Stat label="Pool liquidity" value={compact(market.tvl)} />
        <Stat label={`Fees ${win || "…"}`} value={compact(market.fees)} accent />
        <Stat label="Trades" value={num(buys + sells)} />
        <Stat label="Fee tier" value={`${(market.feeBps / 10_000).toFixed(2)}%`} />
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
        {/* chart */}
        <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="text-[11px] font-semibold text-white">Price</span>
              {/* A quiet market widens its own lookback, so the label states the
                  range actually read rather than the one selected. */}
              <span className="font-mono text-[9px] text-gray-600 truncate">
                {quotedOnly ? "quoted, no trades in range" : widened ? `showing ${win}` : null}
              </span>
            </span>
            <div className="flex items-center gap-1">
              {HISTORY_SPANS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setSpan(s.label)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition ${
                    span === s.label ? "bg-[#10B981] text-black" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[260px] -ml-2">
            {chart.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke={stroke}
                    strokeWidth={1.6}
                    fill="url(#tokenFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-[11px] text-gray-600">
                {loading ? "Reading swaps…" : `No trades in the last ${span}.`}
              </div>
            )}
          </div>
        </div>

        <TradePanel market={market} />
      </div>

      {/* order flow */}
      <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold text-white">
            Buy / sell pressure {win ? `(${win})` : ""}
          </span>
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
              {visible.map((t, i) => (
                <tr
                  key={`${t.hash}-${i}`}
                  className="border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition"
                >
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
                  <td className="px-3 py-2 text-right font-mono text-gray-300">{num(t.shares, 4)}</td>
                  <td className="px-3 py-2 text-right font-mono text-white">{usd(t.value)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-500">
                    <a
                      href={`${EXPLORER}/tx/${t.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-[#10B981] transition"
                    >
                      {shortAddr(t.account)}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600">{ago(t.secondsAgo)}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-gray-500">
                    {loading ? "Reading swaps…" : `No ${tab} in the last ${span}.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* what the people who run the company are doing with their own shares */}
      <TickerInsiderPanel ticker={market.ticker} />

      <Footer />
    </div>
  );
}
