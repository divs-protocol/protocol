"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, ChevronRight, Plus, Minus, ExternalLink } from "lucide-react";

/**
 * Support panel.
 *
 * Slides in over the app rather than taking someone to another section, so a
 * question asked mid-task does not lose their place.
 *
 * Social links come from SOCIALS below. Only entries with a url render as
 * links; the rest stay visibly inactive rather than pointing somewhere wrong.
 */

const SOCIALS: { label: string; url?: string }[] = [
  { label: "GitHub", url: "https://github.com/valeinfralabs-dotcom/divs-protocol" },
  { label: "X", url: undefined },
  { label: "Telegram", url: undefined },
  { label: "Discord", url: undefined },
];

const QUESTIONS: [string, string][] = [
  [
    "How do I earn from DIVS?",
    "Stake $DIVS, or DIVS/WETH LP, and you receive a share of the fee from every trade on the platform, paid in WETH. Holding without staking earns nothing.",
  ],
  [
    "Do I need to stake to trade?",
    "No. Trading needs a wallet and nothing else. Traders pay the fees; stakers receive them. You can do either, or both.",
  ],
  [
    "Why does my share count look wrong?",
    "Stock tokens follow ERC-8056: dividends and splits are applied through a display multiplier instead of moving tokens. Your holding is the raw balance scaled by that multiplier, which is what the app shows.",
  ],
  [
    "Can a market stop trading?",
    "The issuer can pause its own token. If that happens, swaps against that market fail until it is unpaused. Every market's pause flag is read live, so the app will show it.",
  ],
  [
    "What does locking actually do?",
    "It raises the weight your stake carries, from 1x flexible up to 4x at 52 weeks. A lock cannot be shortened, and rewards keep accruing while it runs.",
  ],
];

export default function SupportWidget({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (section: string) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(0);

  // Escape closes it, as with any dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (section: string) => {
    onNavigate(section);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} aria-hidden />

      <aside
        role="dialog"
        aria-label="Support"
        className="fixed right-3 bottom-3 top-3 z-50 w-[min(380px,calc(100vw-1.5rem))] bg-[#14161B] border border-[#232730] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#232730] flex-shrink-0">
          <span className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={20} height={22} className="h-[18px] w-auto" />
            <span className="text-white font-bold text-sm tracking-tight">Support</span>
          </span>
          <button
            onClick={onClose}
            aria-label="Close support"
            className="text-gray-500 hover:text-white transition p-1 rounded-lg hover:bg-[#1F2228]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-[13px]">Common questions</h3>
              <button
                onClick={() => go("docs")}
                className="flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-[#10B981] transition font-semibold"
              >
                View all <ChevronRight size={11} />
              </button>
            </div>

            <div className="space-y-0">
              {QUESTIONS.map(([q, a], i) => (
                <div key={q} className="border-b border-[#1F2228] last:border-0">
                  <button
                    onClick={() => setExpanded(expanded === i ? null : i)}
                    className="w-full flex items-start justify-between gap-3 py-3 text-left group"
                  >
                    <span className="text-[12px] font-medium text-white group-hover:text-[#10B981] transition leading-snug">
                      {q}
                    </span>
                    <span className="text-gray-600 flex-shrink-0 mt-0.5">
                      {expanded === i ? <Minus size={13} /> : <Plus size={13} />}
                    </span>
                  </button>
                  {expanded === i && (
                    <p className="text-[11px] leading-relaxed text-gray-400 pb-3.5 pr-6">{a}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-4 border-t border-[#232730]">
            <h3 className="text-white font-bold text-[13px] mb-3">You might be looking for</h3>
            <div className="space-y-0">
              {(
                [
                  ["Read the docs", "docs"],
                  ["Stake $DIVS", "stakes"],
                  ["Open the exchange", "exchange"],
                  ["View your portfolio", "positions"],
                ] as const
              ).map(([label, section]) => (
                <button
                  key={label}
                  onClick={() => go(section)}
                  className="w-full flex items-center justify-between py-3 border-b border-[#1F2228] last:border-0 text-left group"
                >
                  <span className="text-[12px] text-gray-300 group-hover:text-white transition">{label}</span>
                  <ChevronRight size={13} className="text-gray-600 group-hover:text-[#10B981] transition" />
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-4 border-t border-[#232730]">
            <h3 className="text-white font-bold text-[13px] mb-3">Community</h3>
            <div className="grid grid-cols-2 gap-2">
              {SOCIALS.map((s) =>
                s.url ? (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 bg-[#1B1E24] border border-[#232730] hover:border-[#10B981]/40 rounded-xl px-3 py-2.5 transition group"
                  >
                    <span className="text-[11px] font-semibold text-gray-300 group-hover:text-white transition">
                      {s.label}
                    </span>
                    <ExternalLink size={11} className="text-gray-600 group-hover:text-[#10B981] transition" />
                  </a>
                ) : (
                  <span
                    key={s.label}
                    title="Not published yet"
                    className="flex items-center gap-2 bg-[#1B1E24] border border-[#232730] rounded-xl px-3 py-2.5 opacity-40 cursor-not-allowed"
                  >
                    <span className="text-[11px] font-semibold text-gray-400">{s.label}</span>
                  </span>
                ),
              )}
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-[#232730] flex-shrink-0">
          <button
            onClick={() => go("docs")}
            className="w-full bg-[#10B981] hover:bg-[#0EA372] text-black text-[12px] font-bold py-3 rounded-xl transition"
          >
            Browse the full docs
          </button>
        </div>
      </aside>
    </>
  );
}
