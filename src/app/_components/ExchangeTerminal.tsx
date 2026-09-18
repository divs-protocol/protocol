"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseAbiItem } from "viem";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { robinhood } from "wagmi/chains";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { ArrowDownUp, ArrowLeft, Search, Loader2 } from "lucide-react";
import { MARKETS, type Market, ETH_USD_POOL, poolAbi, usdPerShare, wethPerShare, quoteDecimals, quoteToUsd, ethUsdFromSqrt } from "@/lib/exchange";
import { stockTokenAbi, toDisplayShares } from "@/lib/stockTokens";
import {
  DEFAULT_FEE_BPS,
  ROUTER_ADDRESS,
  SLIPPAGE_OPTIONS,
  useRouterTrade,
} from "@/lib/divsRouter";
import { useConnectWallet } from "./wallet";
import Footer from "./Footer";

/**
 * Exchange - a trading terminal over the live stock-token pools on Robinhood
 * Chain.
 *
 * Nothing on this screen is generated. Prices come from each pool's `slot0`,
 * USD from the WETH/USDG pool, and the chart and tape are decoded `Swap`
 * events. Period figures are computed from those events over a window measured
 * from real block timestamps, and labelled by that measurement - blocks here
 * are ~0.1s, so a lookback that looks large in blocks is only hours.
 */

const SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
);

const LOOKBACK_BLOCKS = 120_000n;

type Trade = {
  key: string;
  side: "buy" | "sell";
  price: number;
  shares: number;
  quote: number;
  value: number;
  block: number;
  secondsAgo: number;
};

const usd = (n: number, d = 2) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const num = (n: number, d = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const ago = (s: number) =>
  s < 60
    ? `${Math.max(0, Math.round(s))}s`
    : s < 3600
      ? `${Math.floor(s / 60)}m`
      : s < 86400
        ? `${Math.floor(s / 3600)}h`
        : `${Math.floor(s / 86400)}d`;

function usePrices() {
  const contracts = useMemo(
    () => [
      ...MARKETS.flatMap((m) => [
        { address: m.pool, abi: poolAbi, functionName: "slot0", chainId: robinhood.id } as const,
        { address: m.pool, abi: poolAbi, functionName: "liquidity", chainId: robinhood.id } as const,
      ]),
      { address: ETH_USD_POOL, abi: poolAbi, functionName: "slot0", chainId: robinhood.id } as const,
    ],
    [],
  );

  const { data, isLoading } = useReadContracts({ contracts, query: { refetchInterval: 12_000 } });

  const ethRaw = data?.[MARKETS.length * 2]?.result as readonly unknown[] | undefined;
  const ethUsd = ethRaw ? ethUsdFromSqrt(ethRaw[0] as bigint) : 0;

  const priced = MARKETS.map((m, i) => {
    const slot0 = data?.[i * 2]?.result as readonly unknown[] | undefined;
    const liquidity = data?.[i * 2 + 1]?.result as bigint | undefined;
    const usd = slot0 ? usdPerShare(m, slot0[0] as bigint, ethUsd) : 0;
    // wethPerShare returns 0 for a USDG market, which is what disables trading on it.
    const weth = wethPerShare(m, (slot0?.[0] as bigint) ?? 0n);
    return { market: m, weth, usd, liquidity };
  });

  return { priced, ethUsd, isLoading };
}

function useSwaps(market: Market, ethUsd: number) {
  const client = usePublicClient({ chainId: robinhood.id });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [windowSeconds, setWindowSeconds] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!client || !ethUsd) return;

    (async () => {
      setLoading(true);
      try {
        const head = await client.getBlockNumber();
        const from = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;

        const [logs, headBlock, fromBlock] = await Promise.all([
          client.getLogs({ address: market.pool, event: SWAP_EVENT, fromBlock: from, toBlock: head }),
          client.getBlock({ blockNumber: head }),
          client.getBlock({ blockNumber: from }),
        ]);

        // Measure the window rather than assuming a block time. Blocks here are
        // ~0.1s, so this range is hours, not a day - the label follows it.
        const spanSeconds = Number(headBlock.timestamp - fromBlock.timestamp);
        const perBlock = spanSeconds / Number(head - from);
        if (!cancelled) setWindowSeconds(spanSeconds);

        const out: Trade[] = logs.map((l, i) => {
          const a = l.args;
          const price = usdPerShare(market, a.sqrtPriceX96 as bigint, ethUsd);
          const amt0 = a.amount0 as bigint;
          const amt1 = a.amount1 as bigint;
          const quoteAmt = market.quoteIsToken0 ? amt0 : amt1;
          const shareAmt = market.quoteIsToken0 ? amt1 : amt0;
          const abs = (v: bigint) => (v < 0n ? -v : v);
          return {
            key: `${l.blockNumber}-${l.logIndex}-${i}`,
            // Quote leaving the pool means shares were sold into it.
            side: quoteAmt < 0n ? "sell" : "buy",
            price,
            shares: Number(formatUnits(abs(shareAmt), 18)),
            quote: Number(formatUnits(abs(quoteAmt), quoteDecimals(market))),
            value: quoteToUsd(market, quoteAmt, ethUsd),
            block: Number(l.blockNumber),
            secondsAgo: Number(head - l.blockNumber) * perBlock,
          };
        });

        if (!cancelled) setTrades(out);
      } catch {
        if (!cancelled) setTrades([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, market, ethUsd]);

  return { trades, loading, windowSeconds };
}

function Panel({
  children,
  className = "",
  title,
  right,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className={`bg-[#1B1E24] border border-[#232730] rounded-2xl flex flex-col min-h-0 ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#232730] flex-shrink-0">
          <span className="text-[11px] font-semibold text-white">{title}</span>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export default function ExchangeTerminal({ initialTicker, onBack }: { initialTicker?: string; onBack?: () => void }) {
  const { address, isConnected } = useAccount();
  const { priced, ethUsd, isLoading } = usePrices();

  const [ticker, setTicker] = useState(initialTicker ?? MARKETS[0].ticker);
  const [q, setQ] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(0.5);
  const trade = useRouterTrade();
  const openWallet = useConnectWallet();

  const active = priced.find((p) => p.market.ticker === ticker) ?? priced[0];
  const { trades, loading: tradesLoading, windowSeconds } = useSwaps(active.market, ethUsd);
  const win = windowSeconds >= 82_800 ? "24h" : windowSeconds >= 3_600 ? `${Math.round(windowSeconds / 3600)}h` : "recent";

  const stats = useMemo(() => {
    const day = trades;
    const vol = day.reduce((s, t) => s + t.value, 0);
    const first = day[0];
    const change = first && active.usd ? ((active.usd - first.price) / first.price) * 100 : 0;
    const prices = day.map((t) => t.price).filter((p) => p > 0);
    return {
      vol,
      change,
      hi: prices.length ? Math.max(...prices) : 0,
      lo: prices.length ? Math.min(...prices) : 0,
      count: day.length,
      windowed: day.length > 0,
    };
  }, [trades, active.usd]);

  const series = useMemo(
    () => trades.slice(-160).map((t) => ({ t: ago(t.secondsAgo), price: t.price })),
    [trades],
  );

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rows = s
      ? priced.filter(
          (p) => p.market.ticker.toLowerCase().includes(s) || p.market.name.toLowerCase().includes(s),
        )
      : priced;
    return [...rows].sort((a, b) => b.usd - a.usd);
  }, [priced, q]);

  const { data: bal } = useReadContracts({
    contracts: [
      {
        address: active.market.token,
        abi: stockTokenAbi,
        functionName: "balanceOf",
        args: [address!],
        chainId: robinhood.id,
      } as const,
      {
        address: active.market.token,
        abi: stockTokenAbi,
        functionName: "uiMultiplier",
        chainId: robinhood.id,
      } as const,
    ],
    query: { enabled: isConnected && Boolean(address) },
  });

  const shares =
    bal?.[0]?.result !== undefined && bal?.[1]?.result !== undefined
      ? Number(formatUnits(toDisplayShares(bal[0].result as bigint, bal[1].result as bigint), 18))
      : undefined;

  const up = stats.change >= 0;
  const stroke = up ? "#10B981" : "#F87171";
  const qty = Number(amount) || 0;

  /*
   * The amount is entered in shares either way, so a buy spends shares x price
   * in WETH and a sell returns it. The quote is the pool's marginal price less
   * the protocol fee; the minimum submitted on-chain is that less slippage.
   */
  const grossOut = side === "buy" ? qty : qty * (active?.weth ?? 0);
  const minOut = grossOut * (1 - DEFAULT_FEE_BPS / 10_000) * (1 - slippage / 100);

  const submit = () => {
    if (!active || qty <= 0) return;
    if (side === "buy") trade.buy(active.market, qty * active.weth, minOut);
    else trade.sell(active.market, qty, minOut);
  };

  const headline: [string, string, string][] = [
    [`${win} change`, stats.windowed ? `${up ? "+" : ""}${stats.change.toFixed(2)}%` : "-", up ? "text-[#10B981]" : "text-red-400"],
    [`${win} volume`, stats.vol ? usd(stats.vol, 0) : "-", "text-gray-300"],
    [`${win} high`, stats.hi ? usd(stats.hi) : "-", "text-gray-300"],
    [`${win} low`, stats.lo ? usd(stats.lo) : "-", "text-gray-300"],
    ["Pool fee", `${(active.market.feeBps / 10000).toFixed(2)}%`, "text-gray-300"],
    [`Trades ${win}`, stats.count ? String(stats.count) : "-", "text-gray-300"],
  ];

  return (
    <div className="space-y-3">
      {onBack && (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white transition"
        >
          <ArrowLeft size={13} />
          Exchange
        </button>
      )}

      <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] flex items-center justify-center text-[10px] font-bold">
            {active.market.ticker.slice(0, 2)}
          </span>
          <div>
            <div className="text-white font-bold text-sm tracking-tight leading-none">
              {active.market.ticker}
              <span className="text-gray-600 font-normal"> / WETH</span>
            </div>
            <div className="text-[10px] text-gray-500 mt-1">{active.market.name}</div>
          </div>
        </div>

        <div>
          <div className="font-mono text-xl text-white leading-none">
            {active.usd ? usd(active.usd) : <span className="text-gray-600">-</span>}
          </div>
          <div className="text-[10px] text-gray-500 font-mono mt-1">{num(active.weth, 6)} WETH</div>
        </div>

        {headline.map(([label, value, cls]) => (
          <div key={label}>
            <div className="text-[9px] uppercase tracking-wide text-gray-500 mb-1">{label}</div>
            <div className={`font-mono text-[12px] ${cls}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[230px_1fr_300px] gap-3 items-start">
        <Panel title="Markets" className="lg:h-[520px]" right={<span className="text-[9px] text-gray-600 font-mono">{list.length}</span>}>
          <div className="p-2 border-b border-[#232730]">
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
            {list.map((p) => {
              const on = p.market.ticker === ticker;
              return (
                <button
                  key={p.market.ticker}
                  onClick={() => setTicker(p.market.ticker)}
                  className={`w-full flex items-center justify-between px-3 py-2 border-b border-[#1F2228] last:border-0 text-left transition ${
                    on ? "bg-[#10B981]/10" : "hover:bg-[#14161B]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className={`text-[11px] font-semibold ${on ? "text-[#10B981]" : "text-white"}`}>
                      {p.market.ticker}
                    </div>
                    <div className="text-[9px] text-gray-500 truncate">{p.market.name}</div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <div className="font-mono text-[10px] text-gray-200">{p.usd ? usd(p.usd) : "-"}</div>
                    <div className="font-mono text-[9px] text-gray-600">{(p.market.feeBps / 10000).toFixed(2)}%</div>
                  </div>
                </button>
              );
            })}
            {isLoading && (
              <div className="px-3 py-6 flex items-center justify-center gap-2 text-[10px] text-gray-500">
                <Loader2 size={11} className="animate-spin" /> reading pools
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title={`${active.market.ticker} price`}
          className="lg:h-[520px]"
          right={
            <span className="text-[9px] text-gray-600 font-mono">
              {tradesLoading ? "loading swaps..." : `${trades.length} swaps`}
            </span>
          }
        >
          <div className="flex-1 min-h-0 p-3">
            {series.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="exFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={stroke} stopOpacity={0.26} />
                      <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" tick={{ fill: "#5A6068", fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={44} />
                  <YAxis
                    domain={["dataMin", "dataMax"]}
                    tick={{ fill: "#5A6068", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                    tickFormatter={(v: number) => usd(v)}
                  />
                  <Tooltip
                    contentStyle={{ background: "#14161B", border: "1px solid #232730", borderRadius: 10, fontSize: 11 }}
                    labelStyle={{ color: "#9A9FA8" }}
                    formatter={(v) => [usd(Number(v)), "Price"] as [string, string]}
                    labelFormatter={(l) => `${l} ago`}
                  />
                  {active.usd > 0 && (
                    <ReferenceLine y={active.usd} stroke="#10B981" strokeDasharray="3 3" strokeOpacity={0.5} />
                  )}
                  <Area type="monotone" dataKey="price" stroke={stroke} strokeWidth={1.6} fill="url(#exFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-[11px] text-gray-500">
                {tradesLoading ? "Reading swap history..." : "No swaps in the lookback window."}
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Trade">
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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-gray-500">Amount</span>
                {isConnected && shares !== undefined && (
                  <button
                    onClick={() => setAmount(String(shares))}
                    className="text-[10px] text-gray-500 hover:text-[#10B981] font-mono transition"
                  >
                    Balance {num(shares, 4)}
                  </button>
                )}
              </div>
              <div className="flex items-center bg-[#14161B] border border-[#232730] rounded-xl px-3 py-2.5">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.0"
                  inputMode="decimal"
                  className="bg-transparent text-white font-mono text-lg w-full outline-none placeholder:text-gray-600 min-w-0"
                />
                <span className="text-[10px] text-gray-500 font-semibold flex-shrink-0">{active.market.ticker}</span>
              </div>
            </div>

            <div className="flex justify-center">
              <ArrowDownUp size={12} className="text-gray-600" />
            </div>

            <div className="bg-[#14161B] border border-[#232730] rounded-xl px-3 py-2.5">
              <div className="text-[10px] text-gray-500 mb-1">You {side === "buy" ? "pay" : "receive"}</div>
              <div className="font-mono text-lg text-white">
                {qty > 0 && active.weth ? `${num(qty * active.weth, 6)} WETH` : <span className="text-gray-600">-</span>}
              </div>
              {qty > 0 && active.usd > 0 && (
                <div className="text-[10px] text-gray-600 font-mono mt-0.5">{usd(qty * active.usd)}</div>
              )}
            </div>

            <div className="space-y-1.5 text-[10px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Pool fee</span>
                <span className="font-mono text-gray-300">{(active.market.feeBps / 10000).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Protocol fee to stakers</span>
                <span className="font-mono text-[#10B981]">
                  {(DEFAULT_FEE_BPS / 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Minimum received</span>
                <span className="font-mono text-gray-300">
                  {qty > 0
                    ? side === "buy"
                      ? `${num(minOut, 4)} ${active.market.ticker}`
                      : `${num(minOut, 6)} WETH`
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Max slippage</span>
                <span className="flex gap-1">
                  {SLIPPAGE_OPTIONS.map((v) => (
                    <button
                      key={v}
                      onClick={() => setSlippage(v)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition ${
                        slippage === v ? "bg-[#232730] text-white" : "text-gray-500 hover:text-white"
                      }`}
                    >
                      {v}%
                    </button>
                  ))}
                </span>
              </div>
            </div>

            <button
              onClick={() => (isConnected ? submit() : openWallet())}
              disabled={isConnected && (trade.busy || !ROUTER_ADDRESS || qty <= 0)}
              className={`w-full py-3 rounded-xl text-[11px] font-bold transition disabled:opacity-30 disabled:cursor-not-allowed ${
                side === "buy" ? "bg-[#10B981] hover:bg-[#0EA372] text-black" : "bg-red-500 hover:bg-red-600 text-white"
              }`}
            >
              {!isConnected
                ? "Connect wallet"
                : (trade.label ?? `${side === "buy" ? "Buy" : "Sell"} ${active.market.ticker}`)}
            </button>

            {trade.error && <p className="text-[10px] text-red-400 text-center">{trade.error}</p>}
            {trade.status === "done" && (
              <p className="text-[10px] text-[#10B981] text-center">
                Filled. The fee is on its way to stakers.
              </p>
            )}

            <p className="text-[10px] leading-relaxed text-gray-600">
              Prices, history and balances are live from chain 4663. Trades route through the DIVS
              router, which takes the fee that pays stakers.
            </p>
          </div>
        </Panel>
      </div>

      <Panel
        title="Recent trades"
        right={<span className="text-[9px] text-gray-600 font-mono">decoded from pool Swap events</span>}
      >
        <div className="overflow-x-auto max-h-[300px] overflow-y-auto scrollbar-none">
          <table className="w-full text-[11px] min-w-[560px]">
            <thead className="sticky top-0 bg-[#14161B]">
              <tr className="text-[9px] uppercase tracking-wide text-gray-500 border-b border-[#232730]">
                <th className="px-3 py-2 text-left font-semibold">Side</th>
                <th className="px-3 py-2 text-right font-semibold">Price</th>
                <th className="px-3 py-2 text-right font-semibold">Shares</th>
                <th className="px-3 py-2 text-right font-semibold">WETH</th>
                <th className="px-3 py-2 text-right font-semibold">Block</th>
                <th className="px-3 py-2 text-right font-semibold">Age</th>
              </tr>
            </thead>
            <tbody>
              {[...trades]
                .reverse()
                .slice(0, 60)
                .map((t) => (
                  <tr key={t.key} className="border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition">
                    <td className={`px-3 py-1.5 font-semibold uppercase text-[10px] ${t.side === "buy" ? "text-[#10B981]" : "text-red-400"}`}>
                      {t.side}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-200">{t.price ? usd(t.price) : "-"}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{num(t.shares, 4)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-400">{num(t.quote, 5)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-600">{t.block}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-600">{ago(t.secondsAgo)}</td>
                  </tr>
                ))}
              {!tradesLoading && trades.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-gray-500">
                    No swaps for this pool in the lookback window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Footer />
    </div>
  );
}
