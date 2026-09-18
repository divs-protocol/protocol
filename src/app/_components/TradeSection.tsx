"use client";

import { useMemo, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { Search } from "lucide-react";
import { useAccount } from "wagmi";
import {
  HISTORY_SPANS,
  type DepthLevel,
  type HistorySpan,
  type LiveMarket,
  ago,
  num,
  usd,
  useDepth,
  useLiveMarkets,
  useMarketHistory,
} from "@/lib/live";
import { wethPerShare } from "@/lib/exchange";
import {
  DEFAULT_FEE_BPS,
  ROUTER_ADDRESS,
  SLIPPAGE_OPTIONS,
  useRouterTrade,
} from "@/lib/divsRouter";
import { useConnectWallet } from "./wallet";
import ConnectPrompt from "./ConnectPrompt";
import Footer from "./Footer";


/**
 * Trade - the order-entry terminal.
 *
 * Distinct from a token page: that answers "what is this market doing", this
 * answers "how do I get filled". Market list, chart, depth of book, order
 * entry, and the fills belonging to the connected wallet.
 *
 * Depth is computed from the pool's liquidity rather than quoted by anyone -
 * there is no resting order to show, but the quantity that moves the price a
 * given distance is exact, and that is what a book communicates.
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
  markets,
  active,
  onSelect,
}: {
  markets: LiveMarket[];
  active: LiveMarket | undefined;
  onSelect: (m: LiveMarket) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t
      ? markets.filter(
          (m) => m.ticker.toLowerCase().includes(t) || m.name.toLowerCase().includes(t),
        )
      : markets;
  }, [markets, q]);

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
          const up = m.change >= 0;
          const isActive = m.ticker === active?.ticker;
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
                  {m.change.toFixed(2)}%
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

/* Rows are not clickable: with no limit orders there is no field for a
   clicked price to fill in. */
function OrderBookPanel({ market, ethUsd }: { market: LiveMarket; ethUsd: number }) {
  const book = useDepth(market, ethUsd);
  const maxCum = Math.max(book.bids.at(-1)?.cum ?? 0, book.asks.at(-1)?.cum ?? 0) || 1;

  const Row = ({ level, side }: { level: DepthLevel; side: "bid" | "ask" }) => (
    <button
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
      title="Depth"
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

/*
 * Every trade is a swap against a pool, so there is no book to rest a limit on
 * and no keeper to trigger a stop. The ticket offers the two things the venue
 * can actually do, at the price the pool is quoting.
 */
function OrderEntry({ market }: { market: LiveMarket }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("10");
  const [slippage, setSlippage] = useState(0.5);
  const trade = useRouterTrade();
  const openWallet = useConnectWallet();
  const { isConnected } = useAccount();

  const qty = Number(amount) || 0;
  const total = qty * market.price;
  const isBuy = side === "buy";

  const wethPrice = wethPerShare(market, market.sqrtPriceX96);
  const feeCost = total * (DEFAULT_FEE_BPS / 10_000);
  const grossOut = isBuy ? qty : qty * wethPrice;
  const minOut = grossOut * (1 - DEFAULT_FEE_BPS / 10_000) * (1 - slippage / 100);

  const submit = () => {
    if (qty <= 0 || !wethPrice) return;
    if (isBuy) trade.buy(market, qty * wethPrice, minOut);
    else trade.sell(market, qty, minOut);
  };

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
          <span className="text-[9px] uppercase tracking-wide text-gray-500">Max slippage</span>
          {SLIPPAGE_OPTIONS.map((v) => (
            <button
              key={v}
              onClick={() => setSlippage(v)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition ${
                slippage === v ? "bg-[#232730] text-white" : "text-gray-500 hover:text-white"
              }`}
            >
              {v}%
            </button>
          ))}
        </div>


        <div>
          <label className="block text-[9px] uppercase tracking-wide text-gray-500 mb-1">
            Market price
          </label>
          <div className="flex items-center bg-[#14161B] border border-[#232730] rounded-lg px-2.5 py-2">
            <span className="font-mono text-[12px] text-gray-300 w-full">
              {market.price.toFixed(2)}
            </span>
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
            <span className="font-mono text-[#10B981]">
              {usd(feeCost)} · {(DEFAULT_FEE_BPS / 100).toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Minimum received</span>
            <span className="font-mono text-gray-300">
              {isBuy ? `${num(minOut, 4)} ${market.ticker}` : `${num(minOut, 6)} WETH`}
            </span>
          </div>
        </div>

        <button
          onClick={() => (isConnected ? submit() : openWallet())}
          disabled={isConnected && (trade.busy || !ROUTER_ADDRESS || qty <= 0)}
          className={`w-full py-2.5 rounded-xl text-[11px] font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
            isBuy ? "bg-[#10B981] hover:bg-[#0EA372] text-black" : "bg-red-500 hover:bg-red-600 text-white"
          }`}
        >
          {!isConnected
            ? "Connect wallet"
            : (trade.label ?? `${isBuy ? "Buy" : "Sell"} ${market.ticker}`)}
        </button>

        {trade.error && <p className="text-[10px] text-red-400 text-center">{trade.error}</p>}
        {trade.status === "done" && (
          <p className="text-[10px] text-[#10B981] text-center">
            Filled. The fee is on its way to stakers.
          </p>
        )}
      </div>
    </Panel>
  );
}

/* ---------- section ---------- */

export default function TradeSection() {
  const { markets, ethUsd } = useLiveMarkets();
  const { address, isConnected } = useAccount();
  const [ticker, setTicker] = useState(markets[0]?.ticker ?? "AAPL");
  const [tf, setTf] = useState<HistorySpan>("1h");
  const [tab, setTab] = useState<"mine" | "trades">("trades");

  const market = markets.find((m) => m.ticker === ticker) ?? markets[0];
  const { candles, trades } = useMarketHistory(market?.ticker, tf);

  const series = useMemo(
    () =>
      candles.map((c) => ({
        t: new Date(c.t * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        price: c.price,
      })),
    [candles],
  );

  const fills = useMemo(() => trades.slice(0, 14), [trades]);

  /*
   * There are no resting orders on an AMM, so this tab shows the connected
   * wallet's own fills - the swaps whose shares were delivered to it.
   */
  const mine = useMemo(
    () =>
      address
        ? trades.filter((t) => t.account.toLowerCase() === address.toLowerCase())
        : [],
    [trades, address],
  );

  const selectMarket = (m: LiveMarket) => {
    setTicker(m.ticker);
  };

  const up = (market?.change ?? 0) >= 0;
  const stroke = up ? "#10B981" : "#F87171";

  return (
    <div className="space-y-4">
      {/* What the book on this page is, given there is no resting order book
          on chain to show. */}
      <section className="pt-8 pb-2 sm:pt-12 sm:pb-4">
        <h1 className="text-white font-bold tracking-tight text-[2rem] sm:text-[2.75rem] lg:text-5xl leading-[1.08] max-w-[20ch]">
          Depth of book, from the pool itself.
        </h1>

        <p className="text-[14px] sm:text-[15px] text-gray-400 leading-relaxed mt-5 max-w-[58ch]">
          Nothing rests on an order book here. Each level is derived from the pool&apos;s own
          liquidity: the size that moves the price a given distance, which is what a book tells you
          anyway. Quotes use the pool&apos;s marginal price, so the minimum you submit is what
          protects you from the rest.
        </p>

        <p className="text-[12px] text-gray-500 mt-3 max-w-[58ch]">
          Every fill pays a protocol fee on the quote side of the trade, and that fee is
          distributed to staked $DIVS.
          {!ROUTER_ADDRESS &&
            " The router is not deployed yet, so prices and quotes are live but the order cannot be submitted."}
        </p>
      </section>

      <div className="grid lg:grid-cols-[210px_1fr_290px] gap-3 items-start">
        <MarketList markets={markets} active={market} onSelect={selectMarket} />

        <Panel
          title={`${market.ticker} · ${usd(market.price)}`}
          className="lg:h-[560px]"
          right={
            <div className="flex items-center gap-1">
              <span className={`font-mono text-[10px] mr-2 ${up ? "text-[#10B981]" : "text-red-400"}`}>
                {up ? "+" : ""}
                {market.change.toFixed(2)}%
              </span>
              {HISTORY_SPANS.map(({ label: t }) => (
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

        <OrderEntry market={market} />
      </div>

      <div className="grid lg:grid-cols-[1fr_290px] gap-3 items-start">
        {/* working orders / recent fills */}
        <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl overflow-hidden">
          <div className="flex items-center gap-1 px-3.5 py-2.5 border-b border-[#232730]">
            {(
              [
                ["mine", "Your fills"],
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
            {tab === "mine" ? (
              !isConnected ? (
                <div className="p-6">
                  <ConnectPrompt what="Your fills" />
                </div>
              ) : mine.length === 0 ? (
                <div className="px-3 py-10 text-center text-[11px] text-gray-500">
                  No fills for this wallet in {market?.ticker} over the last {tf}.
                </div>
              ) : (
                <table className="w-full text-[11px] min-w-[420px]">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-wide text-gray-500 border-b border-[#232730]">
                      <th className="px-3 py-2 text-left font-semibold">Side</th>
                      <th className="px-3 py-2 text-right font-semibold">Price</th>
                      <th className="px-3 py-2 text-right font-semibold">Amount</th>
                      <th className="px-3 py-2 text-right font-semibold">Value</th>
                      <th className="px-3 py-2 text-right font-semibold">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((t, i) => (
                      <tr
                        key={`${t.hash}-${i}`}
                        className="border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition"
                      >
                        <td
                          className={`px-3 py-2 font-semibold uppercase text-[10px] ${
                            t.side === "buy" ? "text-[#10B981]" : "text-red-400"
                          }`}
                        >
                          {t.side}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-300">{usd(t.price)}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-300">{num(t.shares, 4)}</td>
                        <td className="px-3 py-2 text-right font-mono text-white">{usd(t.value)}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-600">{ago(t.secondsAgo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
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
                  {fills.map((f, i) => (
                    <tr
                      key={`${f.hash}-${i}`}
                      className="border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition"
                    >
                      <td className={`px-3 py-2 font-semibold uppercase text-[10px] ${f.side === "buy" ? "text-[#10B981]" : "text-red-400"}`}>
                        {f.side}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">{usd(f.price)}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">{num(f.shares, 4)}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600">{ago(f.secondsAgo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <OrderBookPanel market={market} ethUsd={ethUsd} />
      </div>

      <Footer />
    </div>
  );
}
