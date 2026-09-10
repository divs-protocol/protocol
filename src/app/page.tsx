"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { 
  BarChart2, Layers, Wallet, ClipboardList, Mail, User, 
  Zap, Briefcase, ShoppingBag, Headphones, Settings, BookOpen, 
  Search, Bell, ArrowUpRight, ArrowDownRight, ChevronDown
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import DocsSection from "./_components/DocsSection";
import LandingSection from "./_components/LandingSection";

const STOCKS = [
  { 
    ticker: "NVDA", 
    name: "NVIDIA Corp.", 
    price: "$124.50", 
    change: "+4.25%", 
    isUp: true,
    svg: (
      <svg className="w-5 h-5 text-[#10B981]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    )
  },
  { 
    ticker: "AAPL", 
    name: "Apple Inc.", 
    price: "$221.10", 
    change: "-1.80%", 
    isUp: false,
    svg: (
      <svg className="w-5 h-5 text-[#10B981]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.01c.67-.82 1.12-1.96.99-3.11-.97.04-2.15.65-2.85 1.47-.63.73-1.18 1.89-1.03 3.02 1.09.08 2.22-.56 2.89-1.38z"/>
      </svg>
    )
  },
  { 
    ticker: "TSLA", 
    name: "Tesla Inc.", 
    price: "$214.30", 
    change: "+6.10%", 
    isUp: true,
    svg: (
      <svg className="w-5 h-5 text-[#10B981]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4.5L7 3v2l5 1.5L17 5V3l-5 1.5zM12 2L2 6v12l10 4 10-4V6L12 2z"/>
      </svg>
    )
  },
  { 
    ticker: "AMZN", 
    name: "Amazon.com", 
    price: "$186.40", 
    change: "+2.15%", 
    isUp: true,
    svg: (
      <svg className="w-5 h-5 text-[#10B981]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 13h18v-2H3v2zm0-7h18V4H3v2zm0 12h18v-2H3v2z"/>
      </svg>
    )
  },
  { 
    ticker: "MSFT", 
    name: "Microsoft", 
    price: "$448.20", 
    change: "+0.85%", 
    isUp: true,
    svg: (
      <svg className="w-5 h-5 text-[#10B981]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2 2h9.5v9.5H2V2zm10.5 0H22v9.5h-9.5V2zM2 12.5h9.5V22H2v-9.5zm10.5 0H22V22h-9.5v-9.5z"/>
      </svg>
    )
  },
  { 
    ticker: "GOOGL", 
    name: "Alphabet Inc.", 
    price: "$178.35", 
    change: "-0.45%", 
    isUp: false,
    svg: (
      <svg className="w-5 h-5 text-[#10B981]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z"/>
      </svg>
    )
  }
];

const CHART_DATA = [
  { day: "Mon", price: 32000 },
  { day: "Tue", price: 34000 },
  { day: "Wed", price: 31000 },
  { day: "Thu", price: 36000 },
  { day: "Fri", price: 42000 },
  { day: "Sat", price: 40000 },
  { day: "Sun", price: 48000 },
  { day: "Mon", price: 45000 },
  { day: "Tue", price: 54000 },
  { day: "Wed", price: 50000 },
  { day: "Thu", price: 58000 },
];

const STAKES_DATA = [
  { pool: "WETH / DELTA", tvl: "3.2471 WETH", rate: "0.00%", fees: "0 WETH", trend: "flat" },
  { pool: "WETH / INJOH", tvl: "1.4283 WETH", rate: "0.00%", fees: "0 WETH", trend: "flat" },
  { pool: "WETH / NVDA", tvl: "0.6818 WETH", rate: "0.00%", fees: "0 WETH", trend: "flat" },
  { pool: "WETH / ROBINCAT", tvl: "0.5131 WETH", rate: "935.66%", fees: "0.0071 WETH", trend: "up" },
  { pool: "WETH / PONS", tvl: "0.0011 WETH", rate: "0.00%", fees: "0 WETH", trend: "flat" },
  { pool: "WETH / STONKBROKER", tvl: "0.0004 WETH", rate: "0.00%", fees: "0 WETH", trend: "flat" },
];

const POSITIONS_DATA = [
  { id: "#4812", pool: "WETH / NVDA", value: "$4,250.00", share: "1.2%", reward: "0.042 WETH", status: "Active" },
  { id: "#3901", pool: "WETH / DELTA", value: "$12,800.50", share: "3.8%", reward: "0.185 WETH", status: "Active" },
  { id: "#2109", pool: "WETH / TSLA", value: "$1,120.00", share: "0.4%", reward: "0.009 WETH", status: "Paused" },
];

const ORDER_BOOK = Array.from({ length: 8 }, (_, i) => ({
  id: `ob-${i}`,
  buyPrice: "124.50",
  buySize: "16.00",
  buySum: "110.06M",
  sellSize: "16.00",
  sellSum: "110.06M",
  sellPrice: "124.50",
}));

const CREATE_ORDERS = Array.from({ length: 8 }, (_, i) => ({
  id: `co-${i}`,
  price: "124.50",
  amount: "0.012 (NVDA)",
}));

const MY_ORDERS = Array.from({ length: 8 }, (_, i) => ({
  id: `mo-${i}`,
  price: "$124.50",
  amount: "0.268 NVDA",
  total: "$124.50",
}));

const NAV_ITEMS = [
  { id: "pools", icon: BarChart2, label: "Pools" },
  { id: "stakes", icon: Layers, label: "Stakes" },
  { id: "positions", icon: Wallet, label: "Positions" },
  { id: "orders", icon: ClipboardList, label: "Orders" },
  { id: "messages", icon: Mail, label: "Messages" },
  { id: "account", icon: User, label: "Account" },
  { id: "swap", icon: Zap, label: "Swap" },
  { id: "vaults", icon: Briefcase, label: "Vaults" },
  { id: "store", icon: ShoppingBag, label: "Store" },
];

export default function Home() {
  const [activeSection, setActiveSection] = useState("pools");
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const injectedConnector = connectors[0];
  const { disconnect } = useDisconnect();
  const [selectedStock, setSelectedStock] = useState(STOCKS[0]);
  const [orderType, setOrderType] = useState("limit");

  return (
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
            <button className="w-full flex items-center space-x-3 p-2.5 rounded-xl hover:bg-[#1F2228] text-gray-400 hover:text-white transition">
              <Headphones size={18} className="flex-shrink-0" />
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs font-medium whitespace-nowrap overflow-hidden">Support</span>
            </button>
            <button className="w-full flex items-center space-x-3 p-2.5 rounded-xl hover:bg-[#1F2228] text-gray-400 hover:text-white transition">
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
          <header className="h-14 border-b border-[#1F2228] px-5 flex items-center justify-between bg-[#14161B] flex-shrink-0">
            {/* Branding Logo */}
            <div className="flex items-center space-x-2.5">
              {/* Logo mark slots in here */}
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
              <button className="text-gray-400 hover:text-white transition">Markets</button>
              <button className="text-gray-400 hover:text-white transition">Trade</button>
              <button className="text-gray-400 hover:text-white transition">Analytics</button>
            </div>

            {/* Header Search Input Bar */}
            <div className="relative w-72">
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
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-none">

            {/* 1. POOLS VIEW */}
            {activeSection === "pools" && (
              <>
                <div className="flex space-x-2.5 overflow-x-auto pb-1 scrollbar-none">
                  {STOCKS.map((stock) => (
                    <div 
                      key={stock.ticker}
                      onClick={() => setSelectedStock(stock)}
                      className={`flex items-center space-x-3 bg-[#1B1E24] border px-3 py-2 rounded-xl min-w-[170px] cursor-pointer transition ${
                        selectedStock.ticker === stock.ticker ? "border-[#10B981] bg-[#1F232C]" : "border-[#232730] hover:border-gray-700"
                      }`}
                    >
                      <div className="w-8 h-8 bg-[#14161B] border border-[#232730] rounded-lg flex items-center justify-center">
                        {stock.svg}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <span className="text-white font-bold text-xs">{stock.ticker}</span>
                          <span className="text-gray-300 text-[11px] font-medium">{stock.price}</span>
                        </div>
                        <div className="flex justify-between items-center mt-0.5">
                          <span className="text-[9px] text-gray-500 truncate">{stock.name}</span>
                          <span className={`text-[9px] font-semibold flex items-center ${stock.isUp ? "text-[#10B981]" : "text-red-400"}`}>
                            {stock.isUp ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                            {stock.change}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-8 bg-[#1B1E24] border border-[#232730] rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 bg-[#14161B] border border-[#232730] rounded-xl flex items-center justify-center">
                          {selectedStock.svg}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h2 className="text-white font-bold text-sm">{selectedStock.name}</h2>
                            <span className="px-1.5 py-0.5 bg-[#10B981]/20 text-[#10B981] rounded text-[9px] font-bold">{selectedStock.change}</span>
                          </div>
                          <span className="text-lg font-extrabold text-white">{selectedStock.price}</span>
                        </div>
                      </div>

                      <div className="flex space-x-4 text-right">
                        <div>
                          <div className="text-[9px] text-gray-500">24H Movement</div>
                          <div className="text-white font-semibold text-xs">+$64,654.88</div>
                        </div>
                        <div>
                          <div className="text-[9px] text-gray-500">24H Volume</div>
                          <div className="text-white font-semibold text-xs">$64,654.88</div>
                        </div>
                      </div>
                    </div>

                    <div className="h-56 mt-3 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={CHART_DATA}>
                          <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10B981" stopOpacity={0.35}/>
                              <stop offset="95%" stopColor="#10B981" stopOpacity={0.0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="day" stroke="#3A3F4D" tickLine={false} axisLine={false} />
                          <YAxis stroke="#3A3F4D" tickLine={false} axisLine={false} orientation="right" />
                          <Tooltip contentStyle={{ backgroundColor: "#14161B", borderColor: "#232730", color: "#fff" }} />
                          <Area type="monotone" dataKey="price" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                        </AreaChart>
                      </ResponsiveContainer>
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
                          <div className="w-5 h-5">{selectedStock.svg}</div>
                          <span className="text-white font-bold">{selectedStock.ticker}</span>
                        </div>
                        <span className="text-[10px] text-gray-400">1 {selectedStock.ticker} = {selectedStock.price}</span>
                      </div>

                      <div className="mb-2.5">
                        <label className="text-[9px] text-gray-500 block mb-1">Price Limit</label>
                        <div className="relative">
                          <input type="text" defaultValue="65,173" className="w-full bg-[#14161B] border border-[#232730] rounded-xl px-3 py-1.5 text-white font-mono focus:outline-none focus:border-[#10B981]" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#10B981] font-bold">$</span>
                        </div>
                      </div>

                      <div className="mb-3">
                        <label className="text-[9px] text-gray-500 block mb-1">Amount</label>
                        <div className="relative">
                          <input type="text" defaultValue="1" className="w-full bg-[#14161B] border border-[#232730] rounded-xl px-3 py-1.5 text-white font-mono focus:outline-none focus:border-[#10B981]" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">{selectedStock.ticker}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-400 text-xs">Total:</span>
                        <span className="text-[#10B981] font-extrabold text-sm">$65,173</span>
                      </div>
                      <button className="w-full bg-[#10B981] hover:bg-[#0EA5E9] text-black font-extrabold py-2 rounded-xl transition">
                        Place Order
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6 bg-[#1B1E24] border border-[#232730] rounded-2xl p-3.5">
                    <h3 className="text-white font-bold mb-2">Order Book</h3>
                    <div className="grid grid-cols-6 text-[9px] text-gray-500 mb-2 border-b border-[#232730] pb-1">
                      <span>Price (USDT)</span>
                      <span>Size ({selectedStock.ticker})</span>
                      <span>Sum ({selectedStock.ticker})</span>
                      <span>Size ({selectedStock.ticker})</span>
                      <span>Sum ({selectedStock.ticker})</span>
                      <span className="text-right">Price (USDT)</span>
                    </div>
                    <div className="space-y-1 font-mono text-[10px]">
                      {ORDER_BOOK.map((item) => (
                        <div key={item.id} className="grid grid-cols-6 items-center">
                          <span className="text-[#10B981] font-semibold">${item.buyPrice}</span>
                          <span className="text-gray-300">{item.buySize}</span>
                          <span className="text-gray-500">{item.buySum}</span>
                          <span className="text-gray-300">{item.sellSize}</span>
                          <span className="text-gray-500">{item.sellSum}</span>
                          <span className="text-red-400 font-semibold text-right">${item.sellPrice}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="col-span-3 bg-[#1B1E24] border border-[#232730] rounded-2xl p-3.5">
                    <h3 className="text-white font-bold mb-2">Create Order</h3>
                    <div className="flex justify-between text-[9px] text-gray-500 mb-2 border-b border-[#232730] pb-1">
                      <span>Price</span>
                      <span>Amount</span>
                    </div>
                    <div className="space-y-1.5 font-mono text-[10px]">
                      {CREATE_ORDERS.map((item) => (
                        <div key={item.id} className="flex justify-between items-center">
                          <span className="text-[#10B981] font-semibold">${item.price}</span>
                          <span className="text-gray-300">{item.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="col-span-3 bg-[#1B1E24] border border-[#232730] rounded-2xl p-3.5">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-white font-bold">My Order</h3>
                      <button className="text-[9px] text-[#10B981] hover:underline font-semibold">View all</button>
                    </div>
                    <div className="space-y-1.5 font-mono text-[10px]">
                      {MY_ORDERS.map((item) => (
                        <div key={item.id} className="flex justify-between items-center bg-[#14161B] px-2 py-1 rounded-lg border border-[#232730]">
                          <span className="text-[#10B981] font-bold">{item.price}</span>
                          <span className="text-gray-300 text-[9px]">{item.amount}</span>
                          <span className="text-gray-400 text-[9px]">{item.total}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* 2. STAKES VIEW */}
            {activeSection === "stakes" && (
              <div className="space-y-4">
                <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-5">
                  <h1 className="text-white font-bold text-base mb-1">Stakes</h1>
                  <p className="text-gray-400 text-xs mb-4">Put your tokens into a stake and a share of those fees is yours. Deposit coins and DIVS builds the staked pool position for you.</p>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-[#14161B] border border-[#232730] p-4 rounded-xl">
                      <div className="text-[10px] text-gray-500 uppercase font-semibold">Total Staked</div>
                      <div className="text-white font-mono text-xl font-bold mt-1">5.87 WETH</div>
                    </div>
                    <div className="bg-[#14161B] border border-[#232730] p-4 rounded-xl">
                      <div className="text-[10px] text-gray-500 uppercase font-semibold">Stakes</div>
                      <div className="text-white font-mono text-xl font-bold mt-1">13</div>
                    </div>
                  </div>

                  <div className="flex space-x-2 mb-4">
                    <button className="px-3 py-1 bg-[#10B981] text-black font-bold rounded-lg text-xs">ALL</button>
                    <button className="px-3 py-1 bg-[#14161B] text-gray-400 hover:text-white rounded-lg text-xs border border-[#232730]">HIGHEST FEES</button>
                    <button className="px-3 py-1 bg-[#14161B] text-gray-400 hover:text-white rounded-lg text-xs border border-[#232730]">NEWEST</button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono">
                      <thead>
                        <tr className="border-b border-[#232730] text-gray-500 text-[10px] uppercase">
                          <th className="pb-2">Pool</th>
                          <th className="pb-2">TVL</th>
                          <th className="pb-2">7D Rate</th>
                          <th className="pb-2">24H Fees</th>
                          <th className="pb-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#232730]">
                        {STAKES_DATA.map((item, idx) => (
                          <tr key={idx} className="hover:bg-[#14161B] transition">
                            <td className="py-3 text-white font-bold">{item.pool}</td>
                            <td className="py-3 text-gray-300">{item.tvl}</td>
                            <td className="py-3 text-[#10B981]">{item.rate}</td>
                            <td className="py-3 text-gray-300">{item.fees}</td>
                            <td className="py-3 text-right">
                              <button className="px-3 py-1 bg-[#10B981] text-black font-bold rounded-lg text-xs hover:bg-[#0EA5E9] transition">
                                Stake
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 3. POSITIONS VIEW */}
            {activeSection === "positions" && (
              <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-5 space-y-4">
                <h1 className="text-white font-bold text-base mb-1">Your Positions</h1>
                <p className="text-gray-400 text-xs mb-4">Manage active liquidity positions and claimed rewards across active pools.</p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono">
                    <thead>
                      <tr className="border-b border-[#232730] text-gray-500 text-[10px] uppercase">
                        <th className="pb-2">Position ID</th>
                        <th className="pb-2">Pool</th>
                        <th className="pb-2">Total Value</th>
                        <th className="pb-2">Pool Share</th>
                        <th className="pb-2">Unclaimed Rewards</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#232730]">
                      {POSITIONS_DATA.map((pos, idx) => (
                        <tr key={idx} className="hover:bg-[#14161B] transition">
                          <td className="py-3 text-[#10B981] font-bold">{pos.id}</td>
                          <td className="py-3 text-white font-bold">{pos.pool}</td>
                          <td className="py-3 text-gray-300">{pos.value}</td>
                          <td className="py-3 text-gray-300">{pos.share}</td>
                          <td className="py-3 text-[#10B981]">{pos.reward}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${pos.status === "Active" ? "bg-[#10B981]/20 text-[#10B981]" : "bg-yellow-500/20 text-yellow-400"}`}>
                              {pos.status}
                            </span>
                          </td>
                          <td className="py-3 text-right space-x-2">
                            <button className="px-3 py-1 bg-[#10B981] text-black font-bold rounded-lg text-xs hover:bg-[#0EA5E9] transition">
                              Claim
                            </button>
                            <button className="px-3 py-1 bg-[#14161B] border border-[#232730] text-gray-300 hover:text-white font-bold rounded-lg text-xs transition">
                              Withdraw
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* OTHER SECTION PLACEHOLDERS */}
            {activeSection === "vaults" && (
              <div className="space-y-3">
                <div>
                  <h2 className="text-white font-bold text-base">Staking</h2>
                  <p className="text-gray-500 text-[10px] mt-0.5">
                    Stake DIVS or DIVS/WETH LP to earn a share of protocol trading fees.
                  </p>
                </div>
                <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-8 text-center">
                  <p className="text-gray-400 text-xs">
                    Staking is not yet live. The contract is written and tested; it goes live once
                    DIVS is deployed and the launchpad begins routing fees.
                  </p>
                </div>
              </div>
            )}

            {activeSection === "protocol" && <LandingSection />}

            {activeSection === "docs" && <DocsSection />}

            {!["protocol", "pools", "stakes", "positions", "vaults", "docs"].includes(activeSection) && (
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
  );
}