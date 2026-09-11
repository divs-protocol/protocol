"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { 
  BarChart2, Layers, Wallet, ClipboardList, User, 
  Headphones, Settings, BookOpen, 
  Search, Bell, ArrowUpRight, ArrowDownRight, ChevronDown
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import DocsSection from "./DocsSection";
import LandingSection from "./LandingSection";
import MarketsSection from "./MarketsSection";
import { compact, num, usd, useDepth, useLiveMarkets, useMarketHistory } from "@/lib/live";
import { tickerColor } from "./ExchangeSection";
import TradeSection from "./TradeSection";
import AnalyticsSection from "./AnalyticsSection";
import ExchangeSection from "./ExchangeSection";
import StakeSection from "./StakeSection";
import { PortfolioView, ActivityView, AccountView, SettingsView } from "./SidebarViews";
import SupportWidget from "./SupportWidget";
import Footer from "./Footer";
import { NavContext } from "./nav";

/**
 * The sidebar is the account side of the app; the header row above it is the
 * product. Nothing appears in both - "Swap" used to sit here pointing at the
 * exchange route, which lit two nav items up for one page.
 */
const NAV_ITEMS = [
  { id: "home", icon: BarChart2, label: "Pools" },
  { id: "stake", icon: Layers, label: "Stakes" },
  { id: "portfolio", icon: Wallet, label: "Portfolio" },
  { id: "activity", icon: ClipboardList, label: "Activity" },
  { id: "account", icon: User, label: "Account" },
];

export default function AppShell({ section }: { section: string }) {
  const router = useRouter();
  const activeSection = section;

  /**
   * Sections are real routes, so selecting one is a navigation rather than a
   * state change - the URL is shareable and the back button works.
   */
  const setActiveSection = (next: string) => router.push(next === "home" ? "/" : `/${next}`);

  const [supportOpen, setSupportOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const injectedConnector = connectors[0];
  const { disconnect } = useDisconnect();
  /*
   * The dashboard reads the same snapshot every other section does. It used to
   * be six hardcoded tickers, a chart whose axis ran to 60,000 for a $124
   * stock, and eight identical order-book rows.
   */
  const { markets, ethUsd, window: win, loading: marketsLoading } = useLiveMarkets();
  const [ticker, setTicker] = useState("NVDA");
  const [orderType, setOrderType] = useState("limit");
  const [limitPrice, setLimitPrice] = useState("");
  const [orderAmount, setOrderAmount] = useState("1");

  const selected = markets.find((m) => m.ticker === ticker) ?? markets[0];
  const book = useDepth(selected, ethUsd, 8);
  const { candles, trades } = useMarketHistory(selected?.ticker, "1h");

  // The strip leads with whatever is actually trading.
  const strip = useMemo(
    () => markets.slice().sort((a, b) => b.volume - a.volume).slice(0, 6),
    [markets],
  );

  const chart = useMemo(
    () =>
      candles.map((c) => ({
        t: new Date(c.t * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        price: c.price,
      })),
    [candles],
  );

  const largest = useMemo(
    () => trades.slice().sort((a, b) => b.value - a.value).slice(0, 8),
    [trades],
  );

  /*
   * Before the snapshot lands there is no price, and rendering that as $0.00
   * reads as a broken number rather than a pending one.
   */
  const px = (v: number | undefined) => (marketsLoading ? "···" : usd(v ?? 0));
  const pct = (v: number | undefined) =>
    marketsLoading ? "···" : `${(v ?? 0) >= 0 ? "+" : ""}${(v ?? 0).toFixed(2)}%`;

  const orderTotal =
    (Number(orderAmount) || 0) *
    (orderType === "market" ? (selected?.price ?? 0) : Number(limitPrice) || selected?.price || 0);

  return (
    <NavContext.Provider value={setActiveSection}>
    <div className="h-screen w-screen bg-[#0B0C0E] text-[#9A9FA8] font-sans p-3 flex items-center justify-center overflow-hidden text-xs select-none">
      
      {/* INNER DASHBOARD WRAPPER CONTAINER */}
      <div className="w-full h-full bg-[#14161B] border border-[#1F2228] rounded-2xl flex overflow-hidden shadow-2xl">

        {/* EXPANDABLE LEFT SIDEBAR */}
        <aside className="group w-16 hover:w-48 bg-[#111317] border-r border-[#1F2228] flex flex-col items-start justify-between py-4 px-3 flex-shrink-0 transition-all duration-300 ease-in-out z-20">
          <div className="flex flex-col items-start space-y-2 w-full">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center space-x-3 p-2.5 rounded-xl transition ${
                    isActive 
                      ? "bg-[#10B981] text-black font-bold shadow-md" 
                      : "text-gray-400 hover:bg-[#1F2228] hover:text-white"
                  }`}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs tracking-wide uppercase font-semibold whitespace-nowrap overflow-hidden">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bottom Icons */}
          <div className="flex flex-col items-start space-y-2 w-full pt-4 border-t border-[#1F2228]">
            <button
              onClick={() => setSupportOpen(true)}
              className={`w-full flex items-center space-x-3 p-2.5 rounded-xl transition ${
                supportOpen
                  ? "bg-[#10B981] text-black font-bold shadow-md"
                  : "hover:bg-[#1F2228] text-gray-400 hover:text-white"
              }`}
            >
              <Headphones size={18} className="flex-shrink-0" />
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs font-medium whitespace-nowrap overflow-hidden">Support</span>
            </button>
            <button
              onClick={() => setActiveSection("settings")}
              className={`w-full flex items-center space-x-3 p-2.5 rounded-xl transition ${
                activeSection === "settings"
                  ? "bg-[#10B981] text-black font-bold shadow-md"
                  : "hover:bg-[#1F2228] text-gray-400 hover:text-white"
              }`}
            >
              <Settings size={18} className="flex-shrink-0" />
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs font-medium whitespace-nowrap overflow-hidden">Settings</span>
            </button>
            <button
              onClick={() => setActiveSection("docs")}
              className={`w-full flex items-center space-x-3 p-2.5 rounded-xl transition ${
                activeSection === "docs"
                  ? "bg-[#10B981] text-black font-bold shadow-md"
                  : "hover:bg-[#1F2228] text-gray-400 hover:text-white"
              }`}
            >
              <BookOpen size={18} className="flex-shrink-0" />
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs font-medium whitespace-nowrap overflow-hidden">Docs</span>
            </button>
          </div>
        </aside>

        {/* RIGHT CONTENT CONTAINER */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* TOP HEADER */}
          <header className="h-14 border-b border-[#1F2228] px-5 flex items-center justify-between gap-6 bg-[#14161B] flex-shrink-0">
            {/* Branding Logo */}
            <div className="flex items-center space-x-2.5 flex-shrink-0">
              <Image
                src="/logo.png"
                alt=""
                width={28}
                height={30}
                priority
                className="h-[26px] w-auto"
              />
              <span className="text-base font-extrabold tracking-tight text-white">DIVS</span>
            </div>

            {/* Header Navigation / Category Headings */}
            <div className="hidden md:flex items-center space-x-6 text-xs font-semibold">
              <button
                onClick={() => setActiveSection("protocol")}
                className={`transition ${
                  activeSection === "protocol" ? "text-[#10B981]" : "text-white hover:text-[#10B981]"
                }`}
              >
                Protocol
              </button>
              <button
                onClick={() => setActiveSection("markets")}
                className={`transition ${
                  activeSection === "markets" ? "text-[#10B981]" : "text-gray-400 hover:text-white"
                }`}
              >
                Markets
              </button>
              <button
                onClick={() => setActiveSection("trade")}
                className={`transition ${
                  activeSection === "trade" ? "text-[#10B981]" : "text-gray-400 hover:text-white"
                }`}
              >
                Trade
              </button>
              <button
                onClick={() => setActiveSection("analytics")}
                className={`transition ${
                  activeSection === "analytics" ? "text-[#10B981]" : "text-gray-400 hover:text-white"
                }`}
              >
                Analytics
              </button>
              <button
                onClick={() => setActiveSection("exchange")}
                className={`transition ${
                  activeSection === "exchange" ? "text-[#10B981]" : "text-gray-400 hover:text-white"
                }`}
              >
                Exchange
              </button>
            </div>

            {/* Header Search Input Bar */}
            <div className="relative w-72 min-w-0 shrink">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="text" 
                placeholder="Search tokens, yield vaults..." 
                className="w-full bg-[#1B1E24] border border-[#232730] rounded-xl pl-8 pr-4 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#10B981]"
              />
            </div>

            {/* Top Right User Controls */}
            <div className="flex items-center space-x-3">
              <button className="p-2 bg-[#1B1E24] border border-[#232730] rounded-xl text-gray-400 hover:text-white">
                <Bell size={15} />
              </button>
              
              {isConnected ? (
                <button 
                  onClick={() => disconnect()}
                  className="px-3 py-1.5 bg-[#1B1E24] border border-[#10B981] text-[#10B981] rounded-xl font-mono text-xs hover:bg-red-500/10 hover:border-red-500 hover:text-red-400 transition"
                >
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </button>
              ) : (
                <button 
                  onClick={() => injectedConnector && connect({ connector: injectedConnector })}
                  disabled={!injectedConnector}
                  title={injectedConnector ? undefined : "No browser wallet detected"}
                  className="px-4 py-1.5 bg-[#10B981] text-black font-bold rounded-xl hover:bg-[#0EA5E9] transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {injectedConnector ? "Connect Wallet" : "No Wallet Found"}
                </button>
              )}

              {/* User Profile Pill */}
              <div className="flex items-center space-x-2 bg-[#1B1E24] border border-[#232730] px-2.5 py-1 rounded-xl">
                <div className="w-5 h-5 rounded-full bg-[#10B981] text-black font-extrabold flex items-center justify-center text-[9px]">
                  DV
                </div>
                <span className="text-white font-medium text-xs">DIVS Trader</span>
                <ChevronDown size={13} className="text-gray-400" />
              </div>
            </div>
          </header>

          {/* DASHBOARD CONTENT BODY */}
          {/*
            The dot grid from the protocol page, carried across every section so
            the app and the landing read as one surface. `local` attachment ties
            it to the content rather than the viewport, so it scrolls with the
            page instead of sitting still behind it.
          */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-none bg-[#0B0C0E]"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.085) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              backgroundAttachment: "local",
            }}
          >

            {/* 1. POOLS VIEW */}
            {activeSection === "home" && (
              <>

                <div className="flex space-x-2.5 overflow-x-auto pb-1 scrollbar-none">
                  {strip.map((m) => {
                    const up = m.change >= 0;
                    const c = tickerColor(m.ticker);
                    return (
                      <div
                        key={m.ticker}
                        onClick={() => setTicker(m.ticker)}
                        className={`flex items-center space-x-3 bg-[#1B1E24] border px-3 py-2 rounded-xl min-w-[170px] cursor-pointer transition ${
                          ticker === m.ticker ? "border-[#10B981] bg-[#1F232C]" : "border-[#232730] hover:border-gray-700"
                        }`}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.fg }}
                        >
                          {m.ticker.slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center">
                            <span className="text-white font-bold text-xs">{m.ticker}</span>
                            <span className="text-gray-300 text-[11px] font-medium">{px(m.price)}</span>
                          </div>
                          <div className="flex justify-between items-center mt-0.5">
                            <span className="text-[9px] text-gray-500 truncate">{m.name}</span>
                            <span className={`text-[9px] font-semibold flex items-center ${up ? "text-[#10B981]" : "text-red-400"}`}>
                              {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                              {marketsLoading ? "···" : `${m.change.toFixed(2)}%`}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-8 bg-[#1B1E24] border border-[#232730] rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold"
                          style={{
                            background: tickerColor(selected?.ticker ?? "").bg,
                            border: `1px solid ${tickerColor(selected?.ticker ?? "").border}`,
                            color: tickerColor(selected?.ticker ?? "").fg,
                          }}
                        >
                          {(selected?.ticker ?? "").slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h2 className="text-white font-bold text-sm">{selected?.name}</h2>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                (selected?.change ?? 0) >= 0
                                  ? "bg-[#10B981]/20 text-[#10B981]"
                                  : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {pct(selected?.change)}
                            </span>
                          </div>
                          <span className="text-lg font-extrabold text-white">{px(selected?.price)}</span>
                        </div>
                      </div>

                      <div className="flex space-x-4 text-right">
                        <div>
                          <div className="text-[9px] text-gray-500">{win} trades</div>
                          <div className="text-white font-semibold text-xs">{marketsLoading ? "···" : num(selected?.txns ?? 0)}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-gray-500">{win} volume</div>
                          <div className="text-white font-semibold text-xs">{marketsLoading ? "···" : compact(selected?.volume ?? 0)}</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-gray-500">Liquidity</div>
                          <div className="text-white font-semibold text-xs">{marketsLoading ? "···" : compact(selected?.tvl ?? 0)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="h-56 mt-3 w-full">
                      {chart.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chart}>
                            <defs>
                              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.35}/>
                                <stop offset="95%" stopColor="#10B981" stopOpacity={0.0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="t" stroke="#3A3F4D" tickLine={false} axisLine={false} minTickGap={40} tick={{ fontSize: 10 }} />
                            <YAxis
                              stroke="#3A3F4D"
                              tickLine={false}
                              axisLine={false}
                              orientation="right"
                              domain={["dataMin", "dataMax"]}
                              tick={{ fontSize: 10 }}
                              tickFormatter={(v: number) => usd(v, 2)}
                            />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#14161B", borderColor: "#232730", color: "#fff" }}
                              formatter={(v) => [usd(Number(v)), "Price"] as [string, string]}
                            />
                            <Area type="monotone" dataKey="price" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-[11px] text-gray-600">
                          Reading swaps…
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="col-span-4 bg-[#1B1E24] border border-[#232730] rounded-2xl p-4 flex flex-col justify-between">
                    <div>
                      <h3 className="text-white font-bold mb-2.5">Create Order</h3>
                      <div className="grid grid-cols-3 gap-1 bg-[#14161B] p-1 rounded-xl mb-3">
                        <button onClick={() => setOrderType("limit")} className={`py-1 rounded-lg text-[10px] font-bold transition ${orderType === "limit" ? "bg-[#10B981] text-black" : "text-gray-400 hover:text-white"}`}>Price Limit</button>
                        <button onClick={() => setOrderType("market")} className={`py-1 rounded-lg text-[10px] font-bold transition ${orderType === "market" ? "bg-[#10B981] text-black" : "text-gray-400 hover:text-white"}`}>Market Price</button>
                        <button onClick={() => setOrderType("stop")} className={`py-1 rounded-lg text-[10px] font-bold transition ${orderType === "stop" ? "bg-[#10B981] text-black" : "text-gray-400 hover:text-white"}`}>Stop Limit</button>
                      </div>

                      <div className="flex items-center justify-between bg-[#14161B] border border-[#232730] p-2 rounded-xl mb-3">
                        <div className="flex items-center space-x-2">
                          <span
                            className="w-5 h-5 rounded text-[8px] font-bold flex items-center justify-center"
                            style={{
                              background: tickerColor(selected?.ticker ?? "").bg,
                              color: tickerColor(selected?.ticker ?? "").fg,
                            }}
                          >
                            {(selected?.ticker ?? "").slice(0, 2)}
                          </span>
                          <span className="text-white font-bold">{selected?.ticker}</span>
                        </div>
                        <span className="text-[10px] text-gray-400">
                          1 {selected?.ticker} = {px(selected?.price)}
                        </span>
                      </div>

                      <div className="mb-2.5">
                        <label className="text-[9px] text-gray-500 block mb-1">
                          {orderType === "market" ? "Market price" : "Price Limit"}
                        </label>
                        <div className="relative">
                          <input
                            value={orderType === "market" ? (selected?.price ?? 0).toFixed(2) : limitPrice}
                            onChange={(e) => setLimitPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                            readOnly={orderType === "market"}
                            inputMode="decimal"
                            className="w-full bg-[#14161B] border border-[#232730] rounded-xl px-3 py-1.5 text-white font-mono focus:outline-none focus:border-[#10B981] read-only:text-gray-400"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#10B981] font-bold">$</span>
                        </div>
                      </div>

                      <div className="mb-3">
                        <label className="text-[9px] text-gray-500 block mb-1">Amount</label>
                        <div className="relative">
                          <input
                            value={orderAmount}
                            onChange={(e) => setOrderAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                            inputMode="decimal"
                            className="w-full bg-[#14161B] border border-[#232730] rounded-xl px-3 py-1.5 text-white font-mono focus:outline-none focus:border-[#10B981]"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">{selected?.ticker}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-400 text-xs">Total:</span>
                        <span className="text-[#10B981] font-extrabold text-sm">{px(orderTotal)}</span>
                      </div>
                      <button
                        onClick={() =>
                          !isConnected && injectedConnector && connect({ connector: injectedConnector })
                        }
                        disabled={isConnected}
                        className="w-full bg-[#10B981] hover:bg-[#0EA372] disabled:opacity-40 disabled:cursor-not-allowed text-black font-extrabold py-2 rounded-xl transition"
                      >
                        {isConnected ? "Place Order" : "Connect Wallet"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6 bg-[#1B1E24] border border-[#232730] rounded-2xl p-3.5">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-white font-bold">Depth</h3>
                      <span className="font-mono text-[9px] text-gray-500">
                        spread {book.spread.toFixed(book.decimals)} · {book.spreadPct.toFixed(3)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-6 text-[9px] text-gray-500 mb-2 border-b border-[#232730] pb-1">
                      <span>Bid</span>
                      <span>Size ({selected?.ticker})</span>
                      <span>Sum ({selected?.ticker})</span>
                      <span>Size ({selected?.ticker})</span>
                      <span>Sum ({selected?.ticker})</span>
                      <span className="text-right">Ask</span>
                    </div>
                    <div className="space-y-1 font-mono text-[10px]">
                      {book.bids.map((bid, i) => {
                        const ask = book.asks[i];
                        return (
                          <div key={`d${i}`} className="grid grid-cols-6 items-center">
                            <span className="text-[#10B981] font-semibold">{bid.price.toFixed(book.decimals)}</span>
                            <span className="text-gray-300">{num(bid.size, 2)}</span>
                            <span className="text-gray-500">{num(bid.cum, 2)}</span>
                            <span className="text-gray-300">{ask ? num(ask.size, 2) : "—"}</span>
                            <span className="text-gray-500">{ask ? num(ask.cum, 2) : "—"}</span>
                            <span className="text-red-400 font-semibold text-right">
                              {ask ? ask.price.toFixed(book.decimals) : "—"}
                            </span>
                          </div>
                        );
                      })}
                      {book.bids.length === 0 && (
                        <div className="py-6 text-center text-gray-600">Reading the pool…</div>
                      )}
                    </div>
                  </div>

                  <div className="col-span-3 bg-[#1B1E24] border border-[#232730] rounded-2xl p-3.5">
                    <h3 className="text-white font-bold mb-2">Recent Trades</h3>
                    <div className="flex justify-between text-[9px] text-gray-500 mb-2 border-b border-[#232730] pb-1">
                      <span>Price</span>
                      <span>Amount</span>
                    </div>
                    <div className="space-y-1.5 font-mono text-[10px]">
                      {trades.slice(0, 9).map((t, i) => (
                        <div key={`${t.hash}-${i}`} className="flex justify-between items-center">
                          <span className={`font-semibold ${t.side === "buy" ? "text-[#10B981]" : "text-red-400"}`}>
                            {usd(t.price)}
                          </span>
                          <span className="text-gray-300">
                            {num(t.shares, 3)} <span className="text-gray-600">({selected?.ticker})</span>
                          </span>
                        </div>
                      ))}
                      {trades.length === 0 && (
                        <div className="py-6 text-center text-gray-600">Reading swaps…</div>
                      )}
                    </div>
                  </div>

                  <div className="col-span-3 bg-[#1B1E24] border border-[#232730] rounded-2xl p-3.5">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-white font-bold">Largest Trades</h3>
                      <button
                        onClick={() => setActiveSection("markets")}
                        className="text-[9px] text-[#10B981] hover:underline font-semibold"
                      >
                        View all
                      </button>
                    </div>
                    <div className="space-y-1.5 font-mono text-[10px]">
                      {largest.map((t, i) => (
                        <div
                          key={`${t.hash}-l${i}`}
                          className="flex justify-between items-center bg-[#14161B] px-2 py-1 rounded-lg border border-[#232730]"
                        >
                          <span className={`font-bold ${t.side === "buy" ? "text-[#10B981]" : "text-red-400"}`}>
                            {usd(t.price)}
                          </span>
                          <span className="text-gray-300 text-[9px]">{num(t.shares, 2)}</span>
                          <span className="text-gray-400 text-[9px]">{usd(t.value)}</span>
                        </div>
                      ))}
                      {largest.length === 0 && (
                        <div className="py-6 text-center text-gray-600">Reading swaps…</div>
                      )}
                    </div>
                  </div>
                </div>

                <Footer />
              </>
            )}

            {/* 2. STAKES VIEW */}
            {activeSection === "stake" && <StakeSection />}

            {/* 3. POSITIONS VIEW */}
            {activeSection === "portfolio" && <PortfolioView />}

            {activeSection === "activity" && <ActivityView />}

            {activeSection === "account" && <AccountView />}

            {activeSection === "settings" && <SettingsView />}

            {activeSection === "protocol" && <LandingSection />}

            {activeSection === "markets" && <MarketsSection />}

            {activeSection === "trade" && <TradeSection />}

            {activeSection === "analytics" && <AnalyticsSection />}

            {activeSection === "exchange" && <ExchangeSection onNavigate={setActiveSection} />}

            {activeSection === "docs" && <DocsSection />}

            {!["protocol", "markets", "trade", "analytics", "exchange", "home", "stake", "portfolio", "activity", "account", "settings", "docs"].includes(activeSection) && (
              <div className="h-full flex flex-col items-center justify-center bg-[#1B1E24] border border-[#232730] rounded-2xl p-8 text-center min-h-[400px]">
                <div className="w-12 h-12 bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] rounded-2xl flex items-center justify-center mb-3">
                  {NAV_ITEMS.find((n) => n.id === activeSection)?.icon && (
                    (() => {
                      const Icon = NAV_ITEMS.find((n) => n.id === activeSection)!.icon;
                      return <Icon size={24} />;
                    })()
                  )}
                </div>
                <h2 className="text-white font-bold text-base capitalize">{activeSection} Section</h2>
                <p className="text-gray-500 text-xs mt-1 max-w-sm">
                  Active view for {activeSection}. Ready for full layout implementation.
                </p>
              </div>
            )}

          </div>
        </div>

      </div>

    </div>
      <SupportWidget
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        onNavigate={setActiveSection}
      />
    </NavContext.Provider>
  );
}