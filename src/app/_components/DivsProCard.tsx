"use client";

import { ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useLiveMarkets, usd, shortAddr } from "@/lib/live";
import { DIVSPRO_TOKEN, DIVSPRO_TRADE_URL, useDivsProPrice } from "@/lib/divspro";
import TickerLogo from "./TickerLogo";

const EXPLORER = "https://robinhoodchain.blockscout.com";

/**
 * $DIVSPRO, read-only. It sits outside the market registry because it isn't
 * on a pool DivsRouter can trade yet - see divspro.ts for why - so there is
 * no Buy/Sell here, only the live bonding-curve price and a way out to where
 * it actually trades. The card itself opens the fuller token page, the same
 * as clicking any row in the table below; the three action buttons stop that
 * click from bubbling, since each already has its own destination.
 */
export default function DivsProCard({ onOpen }: { onOpen?: () => void }) {
  const { ethUsd } = useLiveMarkets();
  const { priceUsd, priceEth, reserveEth, loading } = useDivsProPrice(ethUsd);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(DIVSPRO_TOKEN);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      onClick={onOpen}
      className={`bg-[#1B1E24] border border-[#10B981]/25 rounded-2xl p-4 flex flex-wrap items-center gap-4 ${
        onOpen ? "cursor-pointer hover:bg-[#1F2228] transition" : ""
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <TickerLogo ticker="DIVSPRO" className="w-11 h-11 rounded-xl flex-shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-bold text-sm">DIVSPRO</h3>
            <span className="px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/25">
              Bonding curve · Pons
            </span>
          </div>
          <div className="text-[10px] text-gray-500 truncate">DIVS Protocol&apos;s token</div>
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-mono text-lg text-white">
          {/* A curve this early prices in fractions of a cent - the shared
              2-decimal usd() would round that to $0.00 and read as a dead
              feed, so this shows enough precision to look alive. */}
          {loading ? "…" : priceUsd ? usd(priceUsd, priceUsd < 0.01 ? 8 : 2) : "—"}
        </span>
        {!loading && priceEth > 0 && (
          <span className="font-mono text-[10px] text-gray-500">
            {priceEth.toFixed(9)} ETH · {reserveEth.toFixed(2)} ETH raised
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        <code className="font-mono text-[10px] text-gray-500">{shortAddr(DIVSPRO_TOKEN)}</code>
        <button
          onClick={(e) => {
            e.stopPropagation();
            copy();
          }}
          className="flex items-center gap-1 bg-[#14161B] border border-[#232730] text-gray-400 hover:text-white text-[9px] px-1.5 py-1 rounded-md transition"
        >
          {copied ? <Check size={9} /> : <Copy size={9} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={`${EXPLORER}/address/${DIVSPRO_TOKEN}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 bg-[#14161B] border border-[#232730] text-gray-400 hover:text-white text-[9px] px-1.5 py-1 rounded-md transition"
        >
          <ExternalLink size={9} />
          Explorer
        </a>
        <a
          href={DIVSPRO_TRADE_URL}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 bg-[#10B981] hover:bg-[#0EA372] text-black text-[10px] font-bold px-3 py-1.5 rounded-lg transition"
        >
          Trade on Pons
          <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
}
