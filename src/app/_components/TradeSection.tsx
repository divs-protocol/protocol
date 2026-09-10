"use client";

import { useMemo, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { Search } from "lucide-react";
import {
  MARKETS,
  type Market,
  type Timeframe,
  type OrderType,
  type BookLevel,
  TIMEFRAMES,
  priceSeries,
  orderBook,
  openOrders,
  transactions,
  usd,
  num,
  ago,
} from "@/lib/markets";
import Footer from "./Footer";

/**
 * Trade - the order-entry terminal.
 *
 * Distinct from a token page: that answers "what is this market doing", this
 * answers "how do I get filled". Market list, chart, depth of book, order entry
 * with limit/market/stop, and your working orders.
 */

function Panel({
  title,
  children,
  right,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-[#1B1E24] border border-[#232730] rounded-2xl flex flex-col ${className}`}>
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#232730] flex-shrink-0">
        <span className="text-[11px] font-semibold text-white">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

/* ---------- market selector ---------- */

function MarketList({
  active,
  onSelect,
}: {
  active: Market;
  onSelect: (m: Market) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? MARKETS.filter((m) => m.ticker.toLowerCase().includes(t) || m.name.toLowerCase().includes(t)) : MARKETS;
  }, [q]);

  return (
    <Panel title="Markets" className="lg:h-[560px]">
      <div className="p-2.5 border-b border-[#232730]">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="w-full bg-[#14161B] border border-[#232730] rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-white placeholder:text-gray-500 outline-none focus:border-[#10B981]/40"
          />
        </div>
      </div>
      <div className="overflow-y-auto scrollbar-none flex-1 min-h-0">
        {list.map((m) => {
          const up = m.change24h >= 0;
          const isActive = m.ticker === active.ticker;
          return (
            <button
              key={m.ticker}
              onClick={() => onSelect(m)}
              className={`w-full flex items-center justify-between px-3 py-2.5 border-b border-[#1F2228] last:border-0 transition text-left ${
                isActive ? "bg-[#10B981]/10" : "hover:bg-[#14161B]"
              }`}
            >
              <div className="min-w-0">
                <div className={`text-[11px] font-semibold ${isActive ? "text-[#10B981]" : "text-white"}`}>
                  {m.ticker}
                </div>
                <div className="text-[9px] text-gray-500 truncate">{m.name}</div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <div className="font-mono text-[10px] text-gray-300">{usd(m.price)}</div>
                <div className={`font-mono text-[9px] ${up ? "text-[#10B981]" : "text-red-400"}`}>
                  {up ? "+" : ""}
                  {m.change24h.toFixed(2)}%
                </div>
              </div>
            </button>
          );
        })}
        {list.length === 0 && <div className="px-3 py-8 text-center text-[10px] text-gray-500">No match.</div>}
      </div>
    </Panel>
  );
}

/* ---------- depth of book ---------- */

function OrderBookPanel({ market, onPrice }: { market: Market; onPrice: (p: number) => void }) {
  const book = useMemo(() => orderBook(market), [market]);
  const maxCum = Math.max(book.bids[book.bids.length - 1].cum, book.asks[book.asks.length - 1].cum);

  const Row = ({ level, side }: { level: BookLevel; side: "bid" | "ask" }) => (
    <button
      onClick={() => onPrice(level.price)}
      className="relative w-full grid grid-cols-3 gap-2 px-3 py-[3px] text-[10px] font-mono hover:bg-[#14161B] transition"
    >
      <span
        className={`absolute inset-y-0 right-0 ${side === "bid" ? "bg-[#10B981]/10" : "bg-red-500/10"}`}
        style={{ width: `${(level.cum / maxCum) * 100}%` }}
        aria-hidden
      />
      <span className={`relative text-left ${side === "bid" ? "text-[#10B981]" : "text-red-400"}`}>
        {level.price.toFixed(book.decimals)}
      </span>
      <span className="relative text-right text-gray-300">{num(level.size, 2)}</span>
      <span className="relative text-right text-gray-600">{num(level.cum, 0)}</span>
    </button>
  );

  return (
    <Panel
      title="Order book"
      right={
        <span className="font-mono text-[10px] text-gray-500">
          spread {book.spread.toFixed(book.decimals)} · {book.spreadPct.toFixed(3)}%
        </span>
      }
    >
      <div className="grid grid-cols-3 gap-2 px-3 py-1.5 text-[9px] uppercase tracking-wide text-gray-500 border-b border-[#232730]">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      <div className="flex flex-col-reverse">
        {book.asks.map((l, i) => (
          <Row key={`a${i}`} level={l} side="ask" />
        ))}
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-y border-[#232730] bg-[#14161B]">
        <span className="font-mono text-sm text-white">{usd(book.mid)}</span>
        <span className="text-[9px] uppercase tracking-wide text-gray-500">mid</span>
      </div>

      <div>
        {book.bids.map((l, i) => (
          <Row key={`b${i}`} level={l} side="bid" />
        ))}
      </div>
    </Panel>
  );
}

/* ---------- order entry ---------- */

function OrderEntry({ market, price, setPrice }: { market: Market; price: string; setPrice: (v: string) => void }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<OrderType>("limit");
  const [amount, setAmount] = useState("10");
  const [stop, setStop] = useState("");

  const qty = Number(amount) || 0;
  const px = type === "market" ? market.price : Number(price) || 0;
  const total = qty * px;
  const isBuy = side === "buy";

  return (
    <Panel title="Order entry">
      <div className="p-3.5 space-y-3">
        <div className="grid grid-cols-2 gap-1.5 bg-[#14161B] border border-[#232730] rounded-xl p-1">
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

        <div className="flex items-center gap-1">
          {(["limit", "market", "stop"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold capitalize transition ${
                type === t ? "bg-[#232730] text-white" : "text-gray-500 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {type === "stop" && (
          <div>
            <label className="block text-[9px] uppercase tracking-wide text-gray-500 mb-1">Stop price</label>
            <div className="flex items-center bg-[#14161B] border border-[#232730] rounded-lg px-2.5 py-2">
              <input
                value={stop}
                onChange={(e) => setStop(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder={market.price.toFixed(2)}
                inputMode="decimal"
                className="bg-transparent text-white font-mono text-[12px] w-full outline-none placeholder:text-gray-600"
              />
              <span className="text-[9px] text-gray-500">USD</span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-[9px] uppercase tracking-wide text-gray-500 mb-1">
            {type === "market" ? "Price" : "Limit price"}
          </label>
          <div className="flex items-center bg-[#14161B] border border-[#232730] rounded-lg px-2.5 py-2">
            {type === "market" ? (
              <span className="font-mono text-[12px] text-gray-500 w-full">Best available</span>
            ) : (
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                className="bg-transparent text-white font-mono text-[12px] w-full outline-none"
              />
            )}
            <span className="text-[9px] text-gray-500">USD</span>
          </div>
        </div>

        <div>
          <label className="block text-[9px] uppercase tracking-wide text-gray-500 mb-1">Amount</label>
          <div className="flex items-center bg-[#14161B] border border-[#232730] rounded-lg px-2.5 py-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="bg-transparent text-white font-mono text-[12px] w-full outline-none"
            />
            <span className="text-[9px] text-gray-500">{market.ticker}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {["25%", "50%", "75%", "Max"].map((v, i) => (
            <button
              key={v}
              onClick={() => setAmount(String([25, 50, 75, 100][i]))}
              className="bg-[#14161B] border border-[#232730] text-gray-400 hover:text-white text-[9px] font-semibold py-1.5 rounded-lg transition"
            >
              {v}
            </button>
          ))}
        </div>

        <div className="space-y-1.5 text-[10px] pt-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Total</span>
            <span className="font-mono text-white">{usd(total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Fee to stakers</span>
            <span className="font-mono text-[#10B981]">{usd(total * 0.003)}</span>
          </div>
        </div>

        <button
          className={`w-full py-2.5 rounded-xl text-[11px] font-bold transition ${
            isBuy ? "bg-[#10B981] hover:bg-[#0EA372] text-black" : "bg-red-500 hover:bg-red-600 text-white"
          }`}
        >
          {isBuy ? "Buy" : "Sell"} {market.ticker}
        </button>
      </div>
    </Panel>
  );
}

/* ---------- section ---------- */

export default function TradeSection() {
  const [market, setMarket] = useState<Market>(MARKETS[0]);
  const [tf, setTf] = useState<Timeframe>("24H");
  const [price, setPrice] = useState(MARKETS[0].price.toFixed(2));
  const [tab, setTab] = useState<"orders" | "trades">("orders");

  const series = useMemo(() => priceSeries(market, tf), [market, tf]);
  const orders = useMemo(() => openOrders(market), [market]);
  const fills = useMemo(() => transactions(market, 14), [market]);

  const selectMarket = (m: Market) => {
    setMarket(m);
    setPrice(m.price.toFixed(2));
  };

  const up = market.change24h >= 0;
  const stroke = up ? "#10B981" : "#F87171";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-bold tracking-tight text-xl mb-1">Trade</h2>
        <p className="text-[11px] text-gray-500">
          Depth of book and order entry. Every fill pays a fee to stakers.
        </p>
      </div>

      <div className="grid lg:grid-cols-[210px_1fr_290px] gap-3 items-start">
        <MarketList active={market} onSelect={selectMarket} />

        <Panel
          title={`${market.ticker} · ${usd(market.price)}`}
          className="lg:h-[560px]"
          right={
            <div className="flex items-center gap-1">
              <span className={`font-mono text-[10px] mr-2 ${up ? "text-[#10B981]" : "text-red-400"}`}>
                {up ? "+" : ""}
                {market.change24h.toFixed(2)}%
              </span>
              {TIMEFRAMES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={`px-2 py-0.5 rounded text-[9px] font-semibold transition ${
                    tf === t ? "bg-[#10B981] text-black" : "text-gray-500 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          }
        >
          <div className="flex-1 min-h-0 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="tradeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.26} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" tick={{ fill: "#5A6068", fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis
                  domain={["dataMin", "dataMax"]}
                  tick={{ fill: "#5A6068", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                  tickFormatter={(v: number) => usd(v)}
                />
                <Tooltip
                  contentStyle={{ background: "#14161B", border: "1px solid #232730", borderRadius: 10, fontSize: 11 }}
                  labelStyle={{ color: "#9A9FA8" }}
                  formatter={(v) => [usd(Number(v)), "Price"] as [string, string]}
                />
                <Area type="monotone" dataKey="price" stroke={stroke} strokeWidth={1.6} fill="url(#tradeFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <OrderEntry market={market} price={price} setPrice={setPrice} />
      </div>

      <div className="grid lg:grid-cols-[1fr_290px] gap-3 items-start">
        {/* working orders / recent fills */}
        <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl overflow-hidden">
          <div className="flex items-center gap-1 px-3.5 py-2.5 border-b border-[#232730]">
            {(
              [
                ["orders", "Your orders"],
                ["trades", "Recent trades"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition ${
                  tab === id ? "bg-[#232730] text-white" : "text-gray-500 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            {tab === "orders" ? (
              <table className="w-full text-[11px] min-w-[620px]">
                <thead>
                  <tr className="text-[9px] uppercase tracking-wide text-gray-500 border-b border-[#232730]">
                    <th className="px-3 py-2 text-left font-semibold">Side</th>
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    <th className="px-3 py-2 text-right font-semibold">Price</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                    <th className="px-3 py-2 text-right font-semibold">Filled</th>
                    <th className="px-3 py-2 text-right font-semibold">Status</th>
                    <th className="px-3 py-2 text-right font-semibold">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition">
                      <td className={`px-3 py-2 font-semibold uppercase text-[10px] ${o.side === "buy" ? "text-[#10B981]" : "text-red-400"}`}>
                        {o.side}
                      </td>
                      <td className="px-3 py-2 capitalize text-gray-400">{o.type}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">{usd(o.price)}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">{num(o.amount, 2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">
                        {((o.filled / o.amount) * 100).toFixed(0)}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`text-[9px] font-semibold uppercase tracking-wide ${
                            o.status === "filled"
                              ? "text-[#10B981]"
                              : o.status === "partial"
                                ? "text-amber-400"
                                : "text-gray-400"
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600">{ago(o.secondsAgo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-[11px] min-w-[420px]">
                <thead>
                  <tr className="text-[9px] uppercase tracking-wide text-gray-500 border-b border-[#232730]">
                    <th className="px-3 py-2 text-left font-semibold">Side</th>
                    <th className="px-3 py-2 text-right font-semibold">Price</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                    <th className="px-3 py-2 text-right font-semibold">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {fills.map((f) => (
                    <tr key={f.id} className="border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition">
                      <td className={`px-3 py-2 font-semibold uppercase text-[10px] ${f.side === "buy" ? "text-[#10B981]" : "text-red-400"}`}>
                        {f.side}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">{usd(f.price)}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">{num(f.amount, 2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600">{ago(f.secondsAgo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <OrderBookPanel market={market} onPrice={(p) => setPrice(p.toFixed(2))} />
      </div>

      <Footer />
    </div>
  );
}
