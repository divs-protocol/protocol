"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, usePublicClient, useReadContracts } from "wagmi";
import { robinhood } from "wagmi/chains";
import { parseAbiItem } from "viem";
import {
  ArrowRight,
  Plus,
  Minus,
  Flame,
  TrendingUp,
  Layers,
  BarChart3,
  BookOpen,
  Wallet,
  Droplets,
  LineChart,
  Coins,
} from "lucide-react";
import { MARKETS, ETH_USD_POOL, poolAbi, wethPerShare, ethUsdFromSqrt } from "@/lib/exchange";
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

const SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
);

/** Content measure. Full-bleed rows leave a huge gap between name and price. */
function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`max-w-5xl mx-auto w-full ${className}`}>{children}</div>;
}

const usd = (n: number, d = 2) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;

/* ---------------- live prices, shared by every panel ---------------- */

function usePrices() {
  const contracts = useMemo(
    () => [
      ...MARKETS.map(
        (m) => ({ address: m.pool, abi: poolAbi, functionName: "slot0", chainId: robinhood.id }) as const,
      ),
      { address: ETH_USD_POOL, abi: poolAbi, functionName: "slot0", chainId: robinhood.id } as const,
    ],
    [],
  );

  const { data, isLoading } = useReadContracts({ contracts, query: { refetchInterval: 15_000 } });

  const ethRaw = data?.[MARKETS.length]?.result as readonly unknown[] | undefined;
  const ethUsd = ethRaw ? ethUsdFromSqrt(ethRaw[0] as bigint) : 0;

  const priced = MARKETS.map((m, i) => {
    const slot0 = data?.[i]?.result as readonly unknown[] | undefined;
    const weth = slot0 ? wethPerShare(m, slot0[0] as bigint) : 0;
    return { market: m, weth, usd: weth * ethUsd };
  });

  return { priced, ethUsd, isLoading };
}

/** Recent price path for the featured market, for the hero sparkline. */
function useFeaturedSeries(poolAddress: `0x${string}`, wethIsToken0: boolean, ethUsd: number) {
  const client = usePublicClient({ chainId: robinhood.id });
  const [points, setPoints] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!client || !ethUsd) return;

    (async () => {
      try {
        const head = await client.getBlockNumber();
        const logs = await client.getLogs({
          address: poolAddress,
          event: SWAP_EVENT,
          fromBlock: head > 120_000n ? head - 120_000n : 0n,
          toBlock: head,
        });
        const px = logs.map((l) => {
          const sqrt = l.args.sqrtPriceX96 as bigint;
          const p = wethPerShare({ wethIsToken0 } as never, sqrt);
          return p * ethUsd;
        });
        if (!cancelled) setPoints(px.slice(-60));
      } catch {
        if (!cancelled) setPoints([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, poolAddress, wethIsToken0, ethUsd]);

  return points;
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
  ethUsd,
  onTrade,
}: {
  priced: ReturnType<typeof usePrices>["priced"];
  ethUsd: number;
  onTrade: (t: string) => void;
}) {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const injected = connectors[0];

  const featured = priced.find((p) => p.market.ticker === "AAPL") ?? priced[0];
  const series = useFeaturedSeries(featured.market.pool, featured.market.wethIsToken0, ethUsd);
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
                onClick={() => injected && connect({ connector: injected })}
                disabled={!injected}
                className="bg-[#10B981] hover:bg-[#0EA372] disabled:opacity-40 text-black font-bold text-[13px] px-6 py-3.5 rounded-xl transition"
              >
                {injected ? "Connect wallet" : "No wallet found"}
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

function HotList({
  priced,
  onTrade,
}: {
  priced: ReturnType<typeof usePrices>["priced"];
  onTrade: (t: string) => void;
}) {
  const [tab, setTab] = useState<"stocks" | "etfs" | "all">("stocks");

  const rows = useMemo(() => {
    const base =
      tab === "all" ? priced : priced.filter((p) => p.market.kind === (tab === "etfs" ? "etf" : "stock"));
    return [...base].sort((a, b) => b.usd - a.usd).slice(0, 8);
  }, [priced, tab]);

  return (
    <section className="px-1 py-12 md:py-16">
      <Container>
      <h2 className="text-white font-bold tracking-tight text-2xl md:text-4xl leading-tight mb-8">
        More markets,
        <br />
        more opportunity.
      </h2>

      <div className="flex items-center gap-5 border-b border-[#232730] mb-4">
        {(
          [
            ["stocks", "Hot Stocks"],
            ["etfs", "ETFs & Commodities"],
            ["all", "All Markets"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`pb-2.5 text-[12px] font-semibold transition border-b-2 -mb-px ${
              tab === id ? "text-white border-[#10B981]" : "text-gray-500 border-transparent hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {rows.map((p) => (
          <div
            key={p.market.ticker}
            className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_140px_96px_104px] items-center gap-4 px-3 py-3.5 rounded-xl hover:bg-[#14161B] transition"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-full bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                {p.market.ticker.slice(0, 2)}
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-white">{p.market.ticker}</div>
                <div className="text-[10px] text-gray-500 truncate">{p.market.name}</div>
              </div>
            </div>
            <div className="font-mono text-[13px] text-white text-right">
              {p.usd ? usd(p.usd) : "-"}
            </div>
            <div className="font-mono text-[11px] text-gray-500 hidden sm:block text-right">
              {(p.market.feeBps / 10000).toFixed(2)}% fee
            </div>
            <button
              onClick={() => onTrade(p.market.ticker)}
              className="bg-[#10B981]/10 hover:bg-[#10B981] hover:text-black border border-[#10B981]/30 text-[#10B981] text-[11px] font-bold py-2 rounded-lg transition w-full"
            >
              Trade
            </button>
          </div>
        ))}
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
              onClick={() => onNavigate("stakes")}
              className="mt-6 inline-flex items-center gap-2 bg-[#10B981] hover:bg-[#0EA372] text-black text-[12px] font-bold px-5 py-2.5 rounded-xl transition"
            >
              Stake now <ArrowRight size={13} />
            </button>
          </div>
        </div>

        <div className="grid grid-rows-2 gap-4">
          {[
            ["$DIVS single-sided", "Share of every trading fee", "WETH", Layers, "stakes"],
            ["DIVS/WETH LP", "Higher pool weight, plus pair fees", "WETH", Droplets, "stakes"],
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
  const items: [string, string, typeof Layers, () => void][] = [
    ["Spot", "Swap tokenized equities against WETH, straight from your wallet.", LineChart, () => onTrade(MARKETS[0].ticker)],
    ["Stake", "Lock $DIVS or LP and collect a share of every fee the platform charges.", Coins, () => onNavigate("stakes")],
    ["Markets", "Every listed market, sortable by price, volume and fees paid to stakers.", BarChart3, () => onNavigate("markets")],
    ["Analytics", "Where fees come from, where they go, and how stake is distributed.", TrendingUp, () => onNavigate("analytics")],
    ["Portfolio", "Your positions, weight and claimable rewards in one place.", Wallet, () => onNavigate("positions")],
    ["Docs", "The accounting rules, contract reference and risks, from the source.", BookOpen, () => onNavigate("docs")],
  ];

  return (
    <section className="px-1 py-12 md:py-16">
      <Container>
      <h2 className="text-white font-bold tracking-tight text-2xl md:text-4xl text-center mb-10">
        Discover more products
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(([title, body, Icon, go]) => (
          <button
            key={title}
            onClick={go}
            className="bg-[#14161B] border border-[#232730] hover:border-[#10B981]/30 rounded-2xl p-6 text-left transition group"
          >
            <span className="w-10 h-10 rounded-xl bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] flex items-center justify-center mb-4">
              <Icon size={17} />
            </span>
            <h3 className="text-white font-bold text-lg mb-2 tracking-tight">{title}</h3>
            <p className="text-[12px] leading-relaxed text-gray-400 mb-4">{body}</p>
            <ArrowRight size={15} className="text-gray-600 group-hover:text-[#10B981] transition" />
          </button>
        ))}
      </div>
      </Container>
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
      "These prices come from on-chain pool liquidity, not from a listing venue. They track the underlying closely when liquidity is deep and can drift when it is thin.",
    ],
    [
      "What is the multiplier on my share count?",
      "Stock tokens follow ERC-8056: dividends and splits are applied through a display multiplier rather than by moving tokens. Your share count is the raw balance scaled by it.",
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
  const { priced, ethUsd } = usePrices();

  if (terminal) return <ExchangeTerminal initialTicker={terminal} onBack={() => setTerminal(null)} />;

  return (
    <div className="space-y-2">
      <Hero priced={priced} ethUsd={ethUsd} onTrade={setTerminal} />
      <HotList priced={priced} onTrade={setTerminal} />
      <EarnSection onNavigate={onNavigate} />
      <Products onNavigate={onNavigate} onTrade={setTerminal} />
      <QA />
      <Footer />
    </div>
  );
}
