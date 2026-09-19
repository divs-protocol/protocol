"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useConnectWallet } from "./wallet";
import {
  ArrowRight,
  Plus,
  Minus,
  Flame,
  TrendingUp,
  Layers,
  Droplets,
  Coins,
} from "lucide-react";
import { MARKETS } from "@/lib/exchange";
import { useLiveMarkets, type LiveMarket } from "@/lib/live";
import ExchangeTerminal from "./ExchangeTerminal";
import Footer from "./Footer";

/**
 * Exchange - the exchange front page.
 *
 * Modelled on how a centralised exchange presents itself: a hero with live
 * movers, a hot list you can trade straight from, what your assets can earn,
 * the product grid, and a Q&A.
 *
 * Prices are read from the stock-token pools on Robinhood Chain, so the movers
 * and hot lists are live rather than illustrative. Selecting any market opens
 * the trading terminal.
 */

/** Content measure. Full-bleed rows leave a huge gap between name and price. */
function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`max-w-5xl mx-auto w-full ${className}`}>{children}</div>;
}

const usd = (n: number, d = 2) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;

/* ---------------- live prices, shared by every panel ---------------- */

/**
 * Prices and window stats, both from the shared `/api/markets` snapshot.
 *
 * These used to read the chain here: one multicall for prices and one getLogs
 * across all seventeen pools for change and volume. The log query asked for
 * 40,000 blocks, which matches well over the node's 10,000-log limit, so it
 * threw on every load and a bare catch turned that into an empty stats map -
 * the reason every market showed +0.00%. The snapshot pages its queries and is
 * computed once on the server.
 */
type Priced = { market: LiveMarket; weth: number; usd: number };

function usePrices() {
  const { markets, ethUsd, loading } = useLiveMarkets();

  const priced = useMemo(
    (): Priced[] => markets.map((m) => ({ market: m, weth: ethUsd ? m.price / ethUsd : 0, usd: m.price })),
    [markets, ethUsd],
  );

  const stats = useMemo(() => {
    const out: Record<string, { change: number; volume: number }> = {};
    for (const m of markets) {
      if (m.txns > 0) out[m.ticker] = { change: m.change, volume: m.volume };
    }
    return out;
  }, [markets]);

  return { priced, ethUsd, isLoading: loading, stats };
}

/**
 * A stable colour per ticker. A wall of identical green badges reads as a
 * placeholder; distinct colours let the eye find a row.
 */
export function tickerColor(ticker: string) {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = (h * 31 + ticker.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return { fg: `hsl(${hue} 70% 62%)`, bg: `hsl(${hue} 70% 62% / 0.12)`, border: `hsl(${hue} 70% 62% / 0.3)` };
}

/** Seconds to a short window label, so a figure is never labelled 24h unless it is. */
export function windowLabel(seconds: number) {
  if (seconds >= 82_800) return "24h";
  if (seconds >= 3_600) return `${Math.round(seconds / 3600)}h`;
  return `${Math.max(1, Math.round(seconds / 60))}m`;
}

function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return <div className="h-16" />;
  const w = 280;
  const h = 64;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={up ? "#10B981" : "#F87171"} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- sections ---------------- */

function Hero({
  priced,
  onTrade,
}: {
  priced: ReturnType<typeof usePrices>["priced"];
  onTrade: (t: string) => void;
}) {
  const { isConnected } = useAccount();
  const openWallet = useConnectWallet();

  const featured = priced.find((p) => p.market.ticker === "AAPL") ?? priced[0];
  const series = featured.market.series;
  const up = series.length > 1 ? series[series.length - 1] >= series[0] : true;
  const changePct =
    series.length > 1 ? ((series[series.length - 1] - series[0]) / series[0]) * 100 : 0;

  const tradfi = priced.filter((p) => p.market.kind === "etf").slice(0, 3);
  const hot = [...priced].sort((a, b) => b.usd - a.usd).slice(0, 5);

  return (
    <section className="relative overflow-hidden rounded-2xl bg-[#0F1115] border border-[#1F2228] px-6 md:px-10 py-12 md:py-16">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{ background: "radial-gradient(60% 50% at 78% 10%, rgba(16,185,129,0.10), transparent 70%)" }}
      />
      <Container><div className="relative grid lg:grid-cols-[1fr_460px] gap-10 items-center">
        <div>
          <h1 className="text-white font-bold tracking-tight text-3xl md:text-5xl leading-[1.08] mb-5">
            Your stock market,
            <br />
            simplified.
          </h1>
          <p className="text-sm md:text-[15px] leading-relaxed text-gray-400 max-w-lg mb-8">
            Trade tokenized equities around the clock on Robinhood Chain. Every fill pays a fee, and
            every fee goes to the people staking $DIVS.
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-8">
            {isConnected ? (
              <button
                onClick={() => onTrade(featured.market.ticker)}
                className="bg-[#10B981] hover:bg-[#0EA372] text-black font-bold text-[13px] px-6 py-3.5 rounded-xl transition"
              >
                Start trading
              </button>
            ) : (
              <button
                onClick={openWallet}
                className="bg-[#10B981] hover:bg-[#0EA372] text-black font-bold text-[13px] px-6 py-3.5 rounded-xl transition"
              >
                Connect wallet
              </button>
            )}
            <button
              onClick={() => onTrade(featured.market.ticker)}
              className="bg-[#1B1E24] hover:bg-[#232730] border border-[#232730] text-white font-semibold text-[13px] px-6 py-3.5 rounded-xl transition"
            >
              Open the terminal
            </button>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-4">
            {[
              [String(MARKETS.length), "Markets live"],
              ["24 / 7", "Trading hours"],
              ["0", "Brokers involved"],
            ].map(([v, l]) => (
              <div key={l}>
                <div className="font-mono text-xl text-white">{v}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Flame size={13} className="text-[#10B981]" />
                <span className="text-[11px] font-semibold text-white">Trending</span>
              </div>
              <div className="text-[11px] text-gray-400 mb-1">{featured.market.ticker}</div>
              <div className="font-mono text-2xl text-white leading-none mb-1">
                {featured.usd ? usd(featured.usd) : "-"}
              </div>
              <div className={`font-mono text-[11px] ${up ? "text-[#10B981]" : "text-red-400"}`}>
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
              </div>
              <Sparkline points={series} up={up} />
              <div className="flex justify-between text-[9px] text-gray-600 font-mono">
                <span>recent swaps</span>
                <span>now</span>
              </div>
            </div>

            <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <TrendingUp size={13} className="text-[#10B981]" />
                <span className="text-[11px] font-semibold text-white">Index & commodity</span>
              </div>
              <div className="space-y-3">
                {tradfi.map((p) => (
                  <button
                    key={p.market.ticker}
                    onClick={() => onTrade(p.market.ticker)}
                    className="w-full flex items-center justify-between text-left group"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-white group-hover:text-[#10B981] transition">
                        {p.market.ticker}
                      </div>
                      <div className="text-[9px] text-gray-500 truncate">{p.market.name}</div>
                    </div>
                    <div className="font-mono text-[11px] text-gray-200 flex-shrink-0 ml-2">
                      {p.usd ? usd(p.usd) : "-"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-white">Most valuable</span>
              <button
                onClick={() => onTrade(hot[0].market.ticker)}
                className="text-[10px] text-[#10B981] hover:underline font-semibold"
              >
                View all
              </button>
            </div>
            <div className="space-y-2.5">
              {hot.map((p) => (
                <button
                  key={p.market.ticker}
                  onClick={() => onTrade(p.market.ticker)}
                  className="w-full flex items-center justify-between text-left group"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] flex items-center justify-center text-[8px] font-bold flex-shrink-0">
                      {p.market.ticker.slice(0, 2)}
                    </span>
                    <span className="text-[11px] font-semibold text-white group-hover:text-[#10B981] transition truncate">
                      {p.market.ticker}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-gray-200 flex-shrink-0 ml-2">
                    {p.usd ? usd(p.usd) : "-"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div></Container>
    </section>
  );
}

function MarketRow({
  p,
  stat,
  onTrade,
}: {
  p: { market: (typeof MARKETS)[number]; usd: number };
  stat?: { change: number; volume: number };
  onTrade: (t: string) => void;
}) {
  const c = tickerColor(p.market.ticker);
  const up = (stat?.change ?? 0) >= 0;

  return (
    <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_112px_84px_84px] items-center gap-3 px-2 py-3.5 rounded-xl hover:bg-[#14161B] transition">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 border"
          style={{ background: c.bg, color: c.fg, borderColor: c.border }}
        >
          {p.market.ticker.slice(0, 2)}
        </span>
        <span className="min-w-0 flex items-baseline gap-2">
          <span className="text-[14px] font-semibold text-white truncate">{p.market.name}</span>
          <span className="text-[11px] text-gray-500 font-mono flex-shrink-0">{p.market.ticker}</span>
        </span>
      </div>

      <div className="font-mono text-[14px] text-white text-right">{p.usd ? usd(p.usd) : "-"}</div>

      <div
        className={`font-mono text-[12px] text-right hidden sm:block ${
          stat === undefined ? "text-gray-600" : up ? "text-[#10B981]" : "text-red-400"
        }`}
      >
        {stat === undefined ? "-" : `${up ? "+" : ""}${stat.change.toFixed(2)}%`}
      </div>

      <button
        onClick={() => onTrade(p.market.ticker)}
        className="bg-[#10B981]/10 hover:bg-[#10B981] hover:text-black border border-[#10B981]/30 text-[#10B981] text-[11px] font-bold py-2 rounded-lg transition w-full"
      >
        Trade
      </button>
    </div>
  );
}

function MarketColumn({
  tabs,
  rowsFor,
  stats,
  onTrade,
}: {
  tabs: [string, string][];
  rowsFor: (tab: string) => { market: (typeof MARKETS)[number]; usd: number }[];
  stats: Record<string, { change: number; volume: number }>;
  onTrade: (t: string) => void;
}) {
  const [tab, setTab] = useState(tabs[0][0]);
  const rows = rowsFor(tab);

  return (
    <div>
      <div className="flex items-center gap-5 border-b border-[#232730] mb-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`pb-2.5 text-[14px] font-semibold transition border-b-2 -mb-px ${
              tab === id ? "text-white border-[#10B981]" : "text-gray-500 border-transparent hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div>
        {rows.map((p) => (
          <MarketRow key={p.market.ticker} p={p} stat={stats[p.market.ticker]} onTrade={onTrade} />
        ))}
        {rows.length === 0 && (
          <div className="px-2 py-10 text-center text-[11px] text-gray-500">Nothing here right now.</div>
        )}
      </div>
    </div>
  );
}

function HotList({
  priced,
  stats,
  windowLabel: win,
  onTrade,
}: {
  priced: ReturnType<typeof usePrices>["priced"];
  stats: Record<string, { change: number; volume: number }>;
  windowLabel: string;
  onTrade: (t: string) => void;
}) {
  const byChange = (dir: 1 | -1) =>
    [...priced]
      .filter((p) => stats[p.market.ticker] !== undefined)
      .sort((a, b) => dir * ((stats[b.market.ticker]?.change ?? 0) - (stats[a.market.ticker]?.change ?? 0)));

  const byVolume = [...priced].sort(
    (a, b) => (stats[b.market.ticker]?.volume ?? 0) - (stats[a.market.ticker]?.volume ?? 0),
  );

  return (
    <section className="px-1 py-12 md:py-16">
      <Container>
        <h2 className="text-white font-bold tracking-tight text-2xl md:text-4xl leading-tight mb-8">
          More markets,
          <br />
          more opportunity.
        </h2>
        {win && (
          <p className="text-[11px] text-gray-500 -mt-5 mb-7">
            Change shown over the last {win}, from on-chain swaps.
          </p>
        )}

        <div className="grid lg:grid-cols-2 gap-x-10 gap-y-8">
          <MarketColumn
            tabs={[
              ["hot", "Hot Stocks"],
              ["gainers", "Gainers"],
              ["losers", "Losers"],
            ]}
            rowsFor={(tab) => {
              const stocks = priced.filter((p) => p.market.kind === "stock");
              if (tab === "gainers") return byChange(1).filter((p) => p.market.kind === "stock").slice(0, 7);
              if (tab === "losers") return byChange(-1).filter((p) => p.market.kind === "stock").slice(0, 7);
              return byVolume.filter((p) => p.market.kind === "stock").slice(0, 7).length
                ? byVolume.filter((p) => p.market.kind === "stock").slice(0, 7)
                : stocks.slice(0, 7);
            }}
            stats={stats}
            onTrade={onTrade}
          />

          <MarketColumn
            tabs={[
              ["etf", "ETFs & Commodities"],
              ["all", "All Markets"],
            ]}
            rowsFor={(tab) =>
              tab === "etf"
                ? priced.filter((p) => p.market.kind === "etf").slice(0, 7)
                : byVolume.slice(0, 7)
            }
            stats={stats}
            onTrade={onTrade}
          />
        </div>
      </Container>
    </section>
  );
}

function EarnSection({ onNavigate }: { onNavigate: (s: string) => void }) {
  return (
    <section className="px-1 py-12 md:py-16">
      <Container>
      <h2 className="text-white font-bold tracking-tight text-2xl md:text-4xl text-center mb-10">
        Make your stocks work <span className="text-[#10B981]">for you</span>
      </h2>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="relative overflow-hidden bg-[#14161B] border border-[#232730] rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[280px]">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{ background: "radial-gradient(70% 60% at 50% 100%, rgba(16,185,129,0.10), transparent 70%)" }}
          />
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] flex items-center justify-center mx-auto mb-4">
              <Coins size={20} />
            </div>
            <div className="text-[11px] text-gray-400 mb-2">Lock $DIVS for up to a year</div>
            <div className="text-gray-400 text-sm mb-1">Up to</div>
            <div className="font-bold text-4xl md:text-5xl text-[#10B981] mb-4">4.00x</div>
            <div className="text-[11px] text-gray-500">weight on the same stake</div>
            <button
              onClick={() => onNavigate("stake")}
              className="mt-6 inline-flex items-center gap-2 bg-[#10B981] hover:bg-[#0EA372] text-black text-[12px] font-bold px-5 py-2.5 rounded-xl transition"
            >
              Stake now <ArrowRight size={13} />
            </button>
          </div>
        </div>

        <div className="grid grid-rows-2 gap-4">
          {[
            ["$DIVS single-sided", "Share of every trading fee", "WETH", Layers, "stake"],
            ["DIVS/WETH LP", "Higher pool weight, plus pair fees", "WETH", Droplets, "stake"],
          ].map(([title, sub, unit, Icon, target]) => {
            const I = Icon as typeof Layers;
            return (
              <button
                key={title as string}
                onClick={() => onNavigate(target as string)}
                className="bg-[#14161B] border border-[#232730] hover:border-[#10B981]/30 rounded-2xl p-6 flex items-center justify-between gap-4 transition text-left group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="w-11 h-11 rounded-2xl bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] flex items-center justify-center flex-shrink-0">
                    <I size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-white font-semibold text-base mb-0.5">{title as string}</div>
                    <div className="text-[11px] text-gray-500">{sub as string}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-mono text-lg text-[#10B981]">{unit as string}</span>
                  <ArrowRight size={16} className="text-gray-600 group-hover:text-[#10B981] transition" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
      </Container>
    </section>
  );
}

function Products({ onNavigate, onTrade }: { onNavigate: (s: string) => void; onTrade: (t: string) => void }) {
  const items: [string, string, () => void][] = [
    ["Spot", "Swap tokenized equities against WETH, straight from your wallet. No account, no custody.", () => onTrade(MARKETS[0].ticker)],
    ["Stake", "Lock $DIVS or the LP and collect a share of every fee the platform charges.", () => onNavigate("stake")],
    ["Markets", "Every listed market, sortable by price, volume and the fees it pays stakers.", () => onNavigate("markets")],
    ["Analytics", "Where fees come from, where they go, and how stake is distributed across locks.", () => onNavigate("analytics")],
    ["Portfolio", "Your holdings priced live, your staking weight, and what is claimable right now.", () => onNavigate("portfolio")],
    ["Activity", "Every fill from your wallet, with the price, size and fee on each one.", () => onNavigate("activity")],
    ["Docs", "The accounting rules, the contract reference and the risks, in full.", () => onNavigate("docs")],
    ["Account", "Wallet, network and balance, with the explorer a click away.", () => onNavigate("account")],
  ];

  /*
   * This row runs wider than the rest of the page on purpose. Eight tiles
   * inside the 1024px column come out barely wider than their own text; the
   * grid is meant to read as a directory spanning the page.
   */
  return (
    <section className="py-16 md:py-24">
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-12">
        <h2 className="text-white font-bold tracking-tight text-3xl md:text-[40px] text-center mb-12">
          Discover more products
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {items.map(([title, body, go]) => (
            <button
              key={title}
              onClick={go}
              className="bg-[#14161B] border border-[#232730] hover:border-[#10B981]/40 rounded-2xl p-7 text-left transition group flex flex-col min-h-[260px]"
            >
              <h3 className="text-white font-bold text-[22px] mb-3.5 tracking-tight">{title}</h3>
              <p className="text-[14px] leading-[1.7] text-gray-400">{body}</p>
              <ArrowRight
                size={18}
                className="text-gray-600 group-hover:text-[#10B981] group-hover:translate-x-0.5 transition mt-auto pt-8"
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function QA() {
  const [open, setOpen] = useState<number | null>(0);
  const items: [string, string][] = [
    [
      "What am I actually trading?",
      "Robinhood Stock Tokens issued on Robinhood Chain - tokenized exposure to equities and ETFs. DIVS does not issue them; it provides the venue and routes the trading fees to stakers.",
    ],
    [
      "How does DIVS make money?",
      "A fee on every swap. It is the protocol's only revenue, and it is not retained - it is routed on-chain to whoever is staking $DIVS at the time.",
    ],
    [
      "Do I need to stake to trade?",
      "No. Trading needs nothing but a wallet. Staking is the other side of the same system: traders pay the fees, stakers receive them.",
    ],
    [
      "Why do prices differ from my broker?",
      "Each price is set by the pool that stock trades in. It tracks the real stock closely when the pool is deep, and can drift when it is thin.",
    ],
    [
      "What is the multiplier on my share count?",
      "Dividends and splits are applied by a multiplier on your balance, so your share count updates without any tokens moving in or out of your wallet.",
    ],
    [
      "Can trading be halted?",
      "The issuer can pause its own tokens. If that happens, swaps against that market fail until it is unpaused. Every market's pause flag is read live.",
    ],
  ];

  return (
    <section className="px-1 py-12 md:py-16">
      <h2 className="text-white font-bold tracking-tight text-2xl md:text-4xl text-center mb-10">
        Question &amp; answer
      </h2>
      <div className="max-w-3xl mx-auto">
        {items.map(([q, a], i) => (
          <div key={q} className="border-b border-[#232730]">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between gap-4 py-5 text-left group"
            >
              <span className="text-white font-semibold text-[15px] group-hover:text-[#10B981] transition">
                {q}
              </span>
              <span className="text-gray-500 flex-shrink-0">
                {open === i ? <Minus size={16} /> : <Plus size={16} />}
              </span>
            </button>
            {open === i && <p className="text-[13px] leading-relaxed text-gray-400 pb-5 pr-8">{a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- section root ---------------- */

export default function ExchangeSection({ onNavigate }: { onNavigate: (s: string) => void }) {
  const [terminal, setTerminal] = useState<string | null>(null);
  const { priced, stats } = usePrices();
  const { window: statsWindow } = useLiveMarkets();

  if (terminal) return <ExchangeTerminal initialTicker={terminal} onBack={() => setTerminal(null)} />;

  return (
    <div className="space-y-2">
      <Hero priced={priced} onTrade={setTerminal} />
      <HotList priced={priced} stats={stats} windowLabel={statsWindow} onTrade={setTerminal} />
      <EarnSection onNavigate={onNavigate} />
      <Products onNavigate={onNavigate} onTrade={setTerminal} />
      <QA />
      <Footer />
    </div>
  );
}
