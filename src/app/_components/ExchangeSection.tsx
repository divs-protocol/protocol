"use client";

import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { ArrowDownUp, ChevronDown, Search, CircleSlash } from "lucide-react";
import {
  STOCK_TOKENS,
  type StockToken,
  stockTokenAbi,
  toDisplayShares,
} from "@/lib/stockTokens";
import Footer from "./Footer";

/**
 * Exchange - swapping stock tokens.
 *
 * A swap interface rather than an order book, because the venue underneath is
 * an AMM: there are no resting orders to display, so a book and limit orders
 * would be decoration with nothing behind them.
 *
 * Everything on this screen is read from Robinhood Chain: the token addresses
 * were verified on-chain, and multiplier, supply, pause state and balances come
 * from live calls. Quoting is the one thing that cannot be real yet, because it
 * needs a pool - so it is disabled rather than estimated.
 */

const ONE = 10n ** 18n;

const fmt = (v: bigint | undefined, places = 4) =>
  v === undefined ? "-" : Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: places });

function TokenPicker({
  selected,
  onSelect,
  exclude,
}: {
  selected: StockToken;
  onSelect: (t: StockToken) => void;
  exclude?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return STOCK_TOKENS.filter(
      (s) =>
        s.ticker !== exclude &&
        (!t || s.ticker.toLowerCase().includes(t) || s.name.toLowerCase().includes(t)),
    );
  }, [q, exclude]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-[#232730] hover:bg-[#2C313B] rounded-full pl-2 pr-2.5 py-1.5 transition flex-shrink-0"
      >
        <span className="w-6 h-6 rounded-full bg-[#10B981]/15 border border-[#10B981]/30 text-[#10B981] flex items-center justify-center text-[8px] font-bold">
          {selected.ticker.slice(0, 2)}
        </span>
        <span className="text-[12px] font-bold text-white">{selected.ticker}</span>
        <ChevronDown size={12} className="text-gray-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-64 max-h-72 overflow-hidden bg-[#14161B] border border-[#232730] rounded-2xl shadow-2xl z-30 flex flex-col">
            <div className="p-2 border-b border-[#232730]">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search"
                  className="w-full bg-[#1B1E24] border border-[#232730] rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-white placeholder:text-gray-500 outline-none"
                />
              </div>
            </div>
            <div className="overflow-y-auto scrollbar-none">
              {list.map((t) => (
                <button
                  key={t.ticker}
                  onClick={() => {
                    onSelect(t);
                    setOpen(false);
                    setQ("");
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#1B1E24] transition text-left"
                >
                  <span className="w-6 h-6 rounded-full bg-[#10B981]/15 border border-[#10B981]/30 text-[#10B981] flex items-center justify-center text-[8px] font-bold flex-shrink-0">
                    {t.ticker.slice(0, 2)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold text-white">{t.ticker}</span>
                    <span className="block text-[9px] text-gray-500 truncate">{t.name}</span>
                  </span>
                </button>
              ))}
              {list.length === 0 && (
                <div className="px-3 py-6 text-center text-[10px] text-gray-500">No match.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ExchangeSection() {
  const { address, isConnected } = useAccount();

  const [sell, setSell] = useState<StockToken>(STOCK_TOKENS[0]);
  const [buy, setBuy] = useState<StockToken>(STOCK_TOKENS[1]);
  const [amount, setAmount] = useState("");

  /* ---------- live chain reads ---------- */

  const marketReads = useMemo(
    () =>
      STOCK_TOKENS.flatMap((t) => [
        { address: t.address, abi: stockTokenAbi, functionName: "uiMultiplier" } as const,
        { address: t.address, abi: stockTokenAbi, functionName: "paused" } as const,
        { address: t.address, abi: stockTokenAbi, functionName: "totalSupply" } as const,
      ]),
    [],
  );

  const { data: market, isLoading } = useReadContracts({ contracts: marketReads });

  const { data: balances } = useReadContracts({
    contracts: STOCK_TOKENS.map(
      (t) =>
        ({ address: t.address, abi: stockTokenAbi, functionName: "balanceOf", args: [address!] }) as const,
    ),
    query: { enabled: isConnected && Boolean(address) },
  });

  const rows = STOCK_TOKENS.map((t, i) => ({
    token: t,
    multiplier: market?.[i * 3]?.result as bigint | undefined,
    paused: market?.[i * 3 + 1]?.result as boolean | undefined,
    supply: market?.[i * 3 + 2]?.result as bigint | undefined,
    balance: balances?.[i]?.result as bigint | undefined,
  }));

  const byTicker = (tk: string) => rows.find((r) => r.token.ticker === tk);
  const sellRow = byTicker(sell.ticker);
  const buyRow = byTicker(buy.ticker);

  const sellShares =
    sellRow?.balance !== undefined && sellRow.multiplier !== undefined
      ? toDisplayShares(sellRow.balance, sellRow.multiplier)
      : undefined;

  const eitherPaused = Boolean(sellRow?.paused || buyRow?.paused);

  const flip = () => {
    setSell(buy);
    setBuy(sell);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-bold tracking-tight text-xl mb-1">Exchange</h2>
        <p className="text-[11px] text-gray-500">
          Swap tokenized stocks on Robinhood Chain. Every trade pays a fee to $DIVS stakers.
        </p>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
        {/* swap */}
        <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-4">
          <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-3.5 mb-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-500">Sell</span>
              {isConnected && (
                <button
                  onClick={() => sellRow?.balance && setAmount(formatUnits(sellRow.balance, 18))}
                  className="text-[10px] text-gray-500 hover:text-[#10B981] transition font-mono"
                >
                  Balance {fmt(sellShares)}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.0"
                inputMode="decimal"
                className="bg-transparent text-white font-mono text-2xl w-full outline-none placeholder:text-gray-600 min-w-0"
              />
              <TokenPicker selected={sell} onSelect={setSell} exclude={buy.ticker} />
            </div>
          </div>

          <div className="flex justify-center -my-2 relative z-10">
            <button
              onClick={flip}
              className="w-8 h-8 rounded-xl bg-[#232730] border-4 border-[#1B1E24] hover:bg-[#2C313B] text-gray-300 flex items-center justify-center transition"
              aria-label="Swap direction"
            >
              <ArrowDownUp size={13} />
            </button>
          </div>

          <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-3.5 mt-1">
            <div className="text-[10px] text-gray-500 mb-2">Buy</div>
            <div className="flex items-center gap-2">
              <span className="text-gray-600 font-mono text-2xl w-full min-w-0">-</span>
              <TokenPicker selected={buy} onSelect={setBuy} exclude={sell.ticker} />
            </div>
          </div>

          <div className="mt-3 space-y-1.5 text-[10px]">
            <div className="flex justify-between">
              <span className="text-gray-500">{sell.ticker} multiplier</span>
              <span className="font-mono text-gray-300">
                {sellRow?.multiplier ? Number(formatUnits(sellRow.multiplier, 18)).toFixed(6) : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fee to stakers</span>
              <span className="font-mono text-[#10B981]">on every swap</span>
            </div>
          </div>

          <button
            disabled
            title="Swapping opens when the DIVS pools are deployed"
            className="w-full mt-3 py-3 rounded-xl text-[11px] font-bold bg-[#10B981] text-black opacity-30 cursor-not-allowed"
          >
            {eitherPaused ? "Token paused by issuer" : "Swap"}
          </button>

          <p className="text-[10px] leading-relaxed text-gray-600 mt-2.5">
            Quotes need a pool. The tokens, multipliers and balances above are live from chain 4663;
            pricing arrives with the DIVS pools.
          </p>
        </div>

        {/* listed tokens, all live */}
        <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#232730]">
            <span className="text-[11px] font-semibold text-white">Listed on Robinhood Chain</span>
            <span className="text-[10px] text-gray-500 font-mono">
              {isLoading ? "reading chain..." : `${STOCK_TOKENS.length} tokens`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[560px]">
              <thead>
                <tr className="bg-[#14161B] border-b border-[#232730] text-[9px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 text-left font-semibold">Token</th>
                  <th className="px-3 py-2 text-right font-semibold">UI multiplier</th>
                  <th className="px-3 py-2 text-right font-semibold">Supply</th>
                  {isConnected && <th className="px-3 py-2 text-right font-semibold">Your shares</th>}
                  <th className="px-3 py-2 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.token.ticker}
                    onClick={() => setSell(r.token)}
                    className="border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition cursor-pointer"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] flex items-center justify-center text-[8px] font-bold flex-shrink-0">
                          {r.token.ticker.slice(0, 2)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-white font-semibold">{r.token.ticker}</span>
                          <span className="block text-[9px] text-gray-500 truncate">{r.token.name}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-300">
                      {r.multiplier ? Number(formatUnits(r.multiplier, 18)).toFixed(6) : "-"}
                      {r.multiplier !== undefined && r.multiplier > ONE && (
                        <span className="text-[#10B981] ml-1">↑</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-400">{fmt(r.supply, 0)}</td>
                    {isConnected && (
                      <td className="px-3 py-2.5 text-right font-mono text-white">
                        {r.balance !== undefined && r.multiplier !== undefined
                          ? fmt(toDisplayShares(r.balance, r.multiplier))
                          : "-"}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-right">
                      {r.paused === undefined ? (
                        <span className="text-gray-600">-</span>
                      ) : r.paused ? (
                        <span className="inline-flex items-center gap-1 text-amber-400 text-[9px] font-semibold uppercase tracking-wide">
                          <CircleSlash size={9} /> Paused
                        </span>
                      ) : (
                        <span className="text-[#10B981] text-[9px] font-semibold uppercase tracking-wide">
                          Live
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-[#232730] text-[10px] leading-relaxed text-gray-600">
            Shares are the raw balance scaled by the ERC-8056 multiplier, which is how the issuer
            applies dividends and splits without moving tokens. Status reads each token&apos;s own
            pause flag.
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
