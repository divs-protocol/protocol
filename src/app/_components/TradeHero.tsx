"use client";

import { Coins } from "lucide-react";
import { usd, type LiveMarket } from "@/lib/live";
import { DEFAULT_FEE_BPS, ROUTER_ADDRESS } from "@/lib/divsRouter";
import PageHero, { Eyebrow, HeroCard, HeroStat } from "./PageHero";

/**
 * The top of Trade: what the book on this page is, and what a fill costs.
 *
 * The right column prices the fee rather than describing it. "Ten basis points
 * to stakers" is a sentence nobody converts into money in their head, and the
 * pool's own fee is the larger of the two on most markets, so showing them side
 * by side is the honest comparison.
 */

/** A worked example. Round, and large enough that both fees round to cents. */
const EXAMPLE = 10_000;

function FeeSplit({ market }: { market: LiveMarket | undefined }) {
  // A pool's tier is in hundredths of a basis point, Uniswap's unit: 10000 is
  // one percent, not one hundred. The protocol's own fee is in plain basis
  // points. Two different scales, so they are converted separately.
  const poolPct = (market?.feeBps ?? 3000) / 10_000;
  const protocolPct = DEFAULT_FEE_BPS / 100;

  const poolFee = (EXAMPLE * poolPct) / 100;
  const protocolFee = (EXAMPLE * protocolPct) / 100;
  const total = poolFee + protocolFee;

  return (
    <HeroCard
      title="Where a fill goes"
      icon={<Coins size={13} className="text-[#10B981]" />}
      right={
        <span className="font-mono text-[10px] text-gray-500">
          on {usd(EXAMPLE, 0)}
          {market ? ` of ${market.ticker}` : ""}
        </span>
      }
    >
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-mono text-3xl text-white leading-none">{usd(total)}</span>
        <span className="text-[11px] text-gray-500">total cost</span>
      </div>
      <div className="text-[10px] text-gray-600 mb-4">
        {((total / EXAMPLE) * 100).toFixed(3)}% of the trade, before price impact
      </div>

      <div className="flex h-1.5 rounded-full overflow-hidden bg-[#0E1013] mb-4">
        <span className="bg-[#2C7A63]" style={{ width: `${(poolFee / total) * 100}%` }} />
        <span className="bg-[#10B981]" style={{ width: `${(protocolFee / total) * 100}%` }} />
      </div>

      <div className="flex items-center justify-between py-2 border-b border-[#1F2228]">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[11px] text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2C7A63] shrink-0" />
            Liquidity providers
          </span>
          <span className="block text-[10px] text-gray-500 ml-3">
            The pool&apos;s own tier, {poolPct.toFixed(2)}%
          </span>
        </span>
        <span className="font-mono text-[12px] text-gray-200 shrink-0">{usd(poolFee)}</span>
      </div>

      <div className="flex items-center justify-between py-2">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[11px] text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0" />
            Staked $DIVS
          </span>
          <span className="block text-[10px] text-gray-500 ml-3">
            The protocol fee, {protocolPct.toFixed(2)}%
          </span>
        </span>
        <span className="font-mono text-[12px] text-[#10B981] shrink-0">{usd(protocolFee)}</span>
      </div>

      <p className="text-[10px] text-gray-600 leading-relaxed mt-3 pt-3 border-t border-[#232730]">
        {/* The fee is taken on the quote side so the router never holds an
            equity position between transactions. */}
        Every cent of the protocol fee goes to staked $DIVS. The protocol keeps none of it.
      </p>
    </HeroCard>
  );
}

export default function TradeHero({
  market,
  markets,
}: {
  market: LiveMarket | undefined;
  markets: LiveMarket[];
}) {
  const active = markets.filter((m) => m.txns > 0).length;

  return (
    <PageHero
      glow="50% 4%"
      left={
        <div>
          <Eyebrow>Order entry</Eyebrow>

          <h1 className="text-white font-bold tracking-tight text-3xl md:text-5xl leading-[1.06] mb-5">
            Buy and sell,
            <br className="hidden md:inline" />
            any hour of any day.
          </h1>

          <p className="text-sm md:text-[15px] leading-relaxed text-gray-400 max-w-lg mb-4">
            Pick a market, choose a size, and the trade settles in one transaction. Live depth on
            every market shows what a trade of your size will cost before you send it.
          </p>

          {!ROUTER_ADDRESS && (
            <p className="text-[12px] text-gray-500 max-w-lg mb-8">
              The router is not deployed yet. Prices, depth and quotes are live, but an order
              cannot be submitted.
            </p>
          )}

          <div className={`flex flex-wrap gap-x-10 gap-y-4 ${ROUTER_ADDRESS ? "mt-8" : ""}`}>
            <HeroStat value={String(markets.length)} label="Markets you can route to" />
            <HeroStat value={String(active)} label="Trading in this window" />
            <HeroStat value="0" label="Orders resting on a book" />
          </div>
        </div>
      }
      right={<FeeSplit market={market} />}
    />
  );
}
