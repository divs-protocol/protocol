"use client";

import { ArrowRight } from "lucide-react";

/**
 * Conversion strip for the public landing view.
 *
 * Deliberately its own control rather than repurposing the Place Order button:
 * a trade button that navigates somewhere else teaches people the labels on the
 * page cannot be trusted.
 */
export default function StakeBanner({ onStake }: { onStake: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-[#10B981]/[0.07] border border-[#10B981]/20 rounded-2xl px-4 py-3">
      <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] flex-shrink-0" />
      <p className="text-[11px] text-gray-300 leading-relaxed">
        Every trade here pays <span className="text-white font-semibold">$DIVS</span> stakers.
        <span className="text-gray-500"> Lock longer, take a bigger share of the fees.</span>
      </p>
      <button
        onClick={onStake}
        className="ml-auto flex items-center gap-1.5 bg-[#10B981] hover:bg-[#0EA372] text-black text-[10px] font-bold px-3.5 py-2 rounded-lg transition flex-shrink-0"
      >
        Start earning
        <ArrowRight size={11} />
      </button>
    </div>
  );
}
