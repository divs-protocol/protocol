"use client";

import { useState } from "react";
import { ArrowRight, Copy, Check } from "lucide-react";
import Footer from "./Footer";
import { useNav } from "./nav";

/**
 * Landing view for the protocol - the "what is this" page, shown when the top
 * nav's first item is selected.
 *
 * The numbers on this page are protocol constants taken from DivsStaking.sol
 * (max boost, lock ceiling, pool count) or computed live from its actual
 * formulas. Nothing here is a market figure, so nothing goes stale.
 */

const BPS = 10_000;
const MAX_LOCK_BPS = 40_000;
const MAX_LOCK_WEEKS = 52;

/** Mirrors DivsStaking.lockMultiplierBps, integer division included. */
function lockMultiplierBps(weeks: number): number {
  if (weeks <= 0) return BPS;
  if (weeks >= MAX_LOCK_WEEKS) return MAX_LOCK_BPS;
  return BPS + Math.floor(((MAX_LOCK_BPS - BPS) * weeks) / MAX_LOCK_WEEKS);
}

const fmt = (n: number, d = 0) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

/* ---------- shared bits ---------- */

/** A block of translucent squares, used as a background field like PARE's. */
function GridMotif({
  className = "",
  cols = 6,
  rows = 3,
  size = 44,
}: {
  className?: string;
  cols?: number;
  rows?: number;
  size?: number;
}) {
  return (
    <div className={`pointer-events-none absolute select-none ${className}`} aria-hidden>
      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)` }}
      >
        {Array.from({ length: cols * rows }, (_, i) => (
          <div
            key={i}
            className="rounded-[4px] bg-[#10B981]"
            // Uneven, deterministic opacities so the field reads as texture
            // rather than a uniform block.
            style={{ height: size, opacity: 0.02 + ((i * 37) % 9) * 0.008 }}
          />
        ))}
      </div>
    </div>
  );
}

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`relative px-6 md:px-10 py-14 md:py-20 ${className}`}>{children}</section>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#10B981] mb-3">
      {children}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-white font-bold tracking-tight text-2xl md:text-4xl leading-[1.1] mb-3">
      {children}
    </h2>
  );
}

function Lede({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] md:text-sm leading-relaxed text-gray-400 max-w-2xl">{children}</p>;
}

/** label · · · · · value, the dotted-leader row PARE uses for spec data. */
function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5 border-b border-[#1F2228] last:border-0">
      <span className="text-[11px] text-gray-400 whitespace-nowrap">{label}</span>
      <span className="flex-1 border-b border-dotted border-[#232730] translate-y-[-3px]" />
      <span className="text-[11px] font-mono text-white whitespace-nowrap">{value}</span>
    </div>
  );
}

/* ---------- hero ---------- */

function BoostCalculator() {
  const [weeks, setWeeks] = useState(52);
  const [amount, setAmount] = useState(1000);

  const bps = lockMultiplierBps(weeks);
  const mult = bps / BPS;
  const weight = amount * mult;
  // Share of a fee event against one flexible staker of the same size.
  const share = weight / (weight + amount);

  return (
    <div className="relative bg-[#111317] border border-[#232730] rounded-2xl p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] text-gray-400">You stake</span>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
          live formula · on-chain
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 mb-5">
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 0))}
          className="bg-transparent text-white font-mono text-3xl w-full outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="flex items-center gap-2 bg-[#1B1E24] border border-[#232730] rounded-full pl-1.5 pr-3 py-1.5 flex-shrink-0">
          <span className="w-5 h-5 rounded-full bg-[#10B981]/20 border border-[#10B981]/40" />
          <span className="text-[11px] font-semibold text-white">DIVS</span>
        </span>
      </div>

      <div className="flex items-center gap-3 mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 flex-shrink-0">
          lock
        </span>
        <span className="flex-1 h-px bg-[#232730]" />
        <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
          {weeks === 0 ? "flexible" : `${weeks}w`}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={52}
        value={weeks}
        onChange={(e) => setWeeks(Number(e.target.value))}
        aria-label="Lock duration in weeks"
        className="w-full mb-5 accent-[#10B981] cursor-pointer"
      />

      <div className="space-y-2.5">
        <div className="flex items-center justify-between bg-[#14161B] border border-[#232730] rounded-xl px-3.5 py-3">
          <div>
            <div className="text-[11px] text-white font-medium">Lock multiplier</div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              1x flexible, 4x at {MAX_LOCK_WEEKS} weeks
            </div>
          </div>
          <div className="font-mono text-xl text-[#10B981]">{mult.toFixed(4)}x</div>
        </div>

        <div className="flex items-center justify-between bg-[#14161B] border border-[#232730] rounded-xl px-3.5 py-3">
          <div>
            <div className="text-[11px] text-white font-medium">Your weight</div>
            <div className="text-[10px] text-gray-500 mt-0.5">What fees are split by</div>
          </div>
          <div className="font-mono text-xl text-white">{fmt(weight)}</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[#1F2228]">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[10px] text-gray-500">
            Against an equal stake left flexible, you take
          </span>
          <span className="font-mono text-sm text-[#10B981]">{(share * 100).toFixed(1)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-[#1B1E24] overflow-hidden">
          <div
            className="h-full bg-[#10B981] rounded-full transition-all duration-300"
            style={{ width: `${share * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const nav = useNav();
  return (
    <Section className="!pt-14 md:!pt-20 lg:!pt-24 !pb-20 md:!pb-28 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(58% 50% at 76% 6%, rgba(16,185,129,0.10), transparent 70%)",
        }}
      />
      <div className="relative grid lg:grid-cols-[1.05fr_0.95fr] gap-14 lg:gap-20 items-center">
        <div>
          <Eyebrow>Robinhood Chain · 4663</Eyebrow>
          <h1 className="text-white font-bold tracking-tight text-3xl md:text-5xl leading-[1.05] mb-8">
            The exchange pays its
            <br />
            users, not its shareholders.
          </h1>
          <p className="text-[13px] md:text-sm leading-relaxed text-gray-400 max-w-xl mb-12">
            Buy Apple at 3am. Sell gold on a Sunday. Every fill pays a fee, and that fee does not
            become a brokerage&apos;s profit - it goes to whoever is staking $DIVS when the trade
            lands. Lock longer, take a bigger cut.
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-20">
            <button
              onClick={() => nav("stake")}
              className="bg-[#10B981] hover:bg-[#0EA372] text-black font-bold text-xs px-5 py-3 rounded-xl transition shadow-lg shadow-[#10B981]/10"
            >
              Stake $DIVS
            </button>
            <button
              onClick={() => nav("docs")}
              className="bg-[#1B1E24] hover:bg-[#232730] border border-[#232730] text-white font-semibold text-xs px-5 py-3 rounded-xl transition"
            >
              Read the docs
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["4x", "Maximum boost"],
              ["52", "Weeks max lock"],
              ["2", "Staking pools"],
              ["WETH", "Fees paid in"],
            ].map(([v, l]) => (
              <div key={l} className="bg-[#14161B] border border-[#232730] rounded-xl p-3.5">
                <div className="font-mono text-xl md:text-2xl text-white mb-1">{v}</div>
                <div className="text-[10px] text-gray-500 leading-tight">{l}</div>
                <div className="mt-2.5 h-0.5 w-7 bg-[#10B981] rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <BoostCalculator />
      </div>
    </Section>
  );
}

/* ---------- content sections ---------- */

function TwoRoles() {
  return (
    <Section className="border-t border-[#1F2228]">
      <Title>Two assets. Two jobs.</Title>
      <Lede>
        You do not stake the stocks. Stock tokens are what gets traded. $DIVS is what earns from the
        trading.
      </Lede>

      <div className="grid md:grid-cols-2 gap-4 mt-8">
        <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-3">
            Traded · NVDA, AAPL, TSLA…
          </div>
          <h3 className="text-white font-bold text-lg mb-2 tracking-tight">
            Buy the stock. Any hour.
          </h3>
          <p className="text-[11px] leading-relaxed text-gray-400 mb-4">
            Equity exposure that settles in seconds, wallet to wallet. No market hours. No
            clearinghouse. Nobody between you and the position.
          </p>
          <DataRow label="Settlement" value="on-chain, instant" />
          <DataRow label="Trading window" value="24 / 7" />
          <DataRow label="Earns protocol fees" value="no" />
        </div>

        <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#10B981] mb-3">
            Staked · $DIVS
          </div>
          <h3 className="text-white font-bold text-lg mb-2 tracking-tight">
            Own the fees. Nothing else.
          </h3>
          <p className="text-[11px] leading-relaxed text-gray-400 mb-4">
            Stake $DIVS on its own, or DIVS/WETH LP for more weight. You take a cut of every fee the
            platform charges, for as long as you stay staked.
          </p>
          <DataRow label="Paid in" value="WETH" />
          <DataRow label="Boost" value="up to 4x" />
          <DataRow label="Earns protocol fees" value="yes" />
        </div>
      </div>

      <p className="text-[11px] text-gray-500 mt-4">
        Holding $DIVS in your wallet earns nothing - only staked positions carry weight.
      </p>
    </Section>
  );
}

function HowItWorks() {
  const steps = [
    [
      "Trade",
      "Someone buys or sells. It executes on-chain and settles immediately - no T+2, no clearing house.",
    ],
    [
      "Collect",
      "The fee is taken once, at execution. Buy-side fees arrive as the traded token and are swapped to WETH upstream, so the vault holds one asset and never a long tail of dust.",
    ],
    [
      "Distribute",
      "The WETH lands in the staking contract and splits across every staked position by weight. Claim it whenever you like.",
    ],
  ];

  return (
    <Section className="border-t border-[#1F2228]">
      <Title>How it works</Title>
      <Lede>Three steps. The fee never leaves the chain.</Lede>

      <div className="grid md:grid-cols-3 gap-8 mt-9">
        {steps.map(([title, body], i) => (
          <div key={title} className="border-t border-[#232730] pt-5">
            <div className="font-mono text-2xl text-[#10B981] mb-3">
              {String(i + 1).padStart(2, "0")}
            </div>
            <h3 className="text-white font-bold text-base mb-2 tracking-tight">{title}</h3>
            <p className="text-[11px] leading-relaxed text-gray-400">{body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Weighting() {
  const rows: [string, string][] = [
    ["Flexible", "1.00x"],
    ["4 weeks", "1.23x"],
    ["13 weeks", "1.75x"],
    ["26 weeks", "2.50x"],
    ["39 weeks", "3.25x"],
    ["52 weeks", "4.00x"],
  ];

  return (
    <Section className="border-t border-[#1F2228] overflow-hidden">
      <GridMotif className="bottom-0 left-0 opacity-60 hidden lg:block" />
      <div className="relative grid lg:grid-cols-2 gap-10 items-start">
        <div>
          <Title>Commitment is the multiplier.</Title>
          <Lede>
            Fees split by weight. Not evenly, and not by size alone. Three multipliers set yours:
            which pool, how large, and how long you locked it.
          </Lede>

          <div className="bg-[#101216] border border-[#232730] rounded-xl p-4 mt-6 mb-6 overflow-x-auto">
            <code className="text-[11px] font-mono text-gray-300 whitespace-nowrap">
              weight = amount ×{" "}
              <span className="text-[#10B981]">pool</span> ×{" "}
              <span className="text-[#10B981]">tier</span> ×{" "}
              <span className="text-[#10B981]">lock</span>
            </code>
          </div>

          <p className="text-[11px] leading-relaxed text-gray-400">
            The lock scales linearly to a hard ceiling of 4x at one year. It promises no yield. It is
            a claim on whatever the platform actually earns, sized by how long you leave your stake
            alone.
          </p>
        </div>

        <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-3">
            Lock curve
          </div>
          {rows.map(([label, value]) => {
            const pct = (parseFloat(value) / 4) * 100;
            return (
              <div key={label} className="mb-3 last:mb-0">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[11px] text-gray-400">{label}</span>
                  <span className="text-[11px] font-mono text-white">{value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#1B1E24] overflow-hidden">
                  <div
                    className="h-full bg-[#10B981] rounded-full"
                    style={{ width: `${pct}%`, opacity: 0.35 + (pct / 100) * 0.65 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function FeeFlow() {
  const cards = [
    ["Trade", "A buy or sell executes", "The fee is taken once, at execution."],
    ["Swap", "Buy-side fees become WETH", "One asset to account for, no dust."],
    ["Route", "WETH lands in the vault", "Pulled in before any claim is credited."],
    ["Earn", "Stakers split it by weight", "Claim any time. Your stake stays put."],
  ];

  return (
    <Section className="border-t border-[#1F2228]">
      <Title>Fees don&apos;t sit. They circulate.</Title>
      <Lede>
        Every trade pays a fee. The treasury routes it straight back on-chain, to the people staking
        behind it.
      </Lede>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-8">
        {cards.map(([tag, title, body], i) => (
          <div key={tag} className="relative">
            <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4 h-full">
              <div className="font-mono text-sm text-[#10B981] mb-3">{tag}</div>
              <h3 className="text-white font-semibold text-[12px] mb-1.5">{title}</h3>
              <p className="text-[10px] leading-relaxed text-gray-500">{body}</p>
              {i === cards.length - 1 && (
                <p className="text-[10px] text-gray-600 mt-3 font-mono">↻ and around again</p>
              )}
            </div>
            {i < cards.length - 1 && (
              <ArrowRight
                size={14}
                className="hidden xl:block absolute top-1/2 -right-2.5 -translate-y-1/2 text-gray-600 z-10"
              />
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function Utility() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText("");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Section className="border-t border-[#1F2228] overflow-hidden">
      <GridMotif className="top-8 right-0 opacity-60 hidden lg:block" />
      <div className="relative">
        <Title>$DIVS</Title>
        <Lede>
          The token behind the exchange. One idea:{" "}
          <span className="text-white font-semibold">
            every trade pays the people staking it.
          </span>
        </Lede>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[#14161B] border border-[#232730] rounded-2xl px-4 py-3.5 mt-7 mb-6">
          <span className="text-[10px] text-gray-500 whitespace-nowrap">
            Official $DIVS contract
          </span>
          <span className="flex-1 font-mono text-[11px] text-gray-600">not yet deployed</span>
          <button
            onClick={copy}
            disabled
            className="flex items-center gap-1.5 bg-[#1B1E24] border border-[#232730] text-gray-600 text-[10px] font-semibold px-3 py-1.5 rounded-lg cursor-not-allowed"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            Copy
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          {[
            [
              "EARN",
              "Every trade pays you",
              "Take a cut of the fee from every buy and sell on the platform, paid in WETH.",
            ],
            [
              "BOOST",
              "Lock for a bigger share",
              "Commit for a year and carry 4x the weight of the same stake left flexible.",
            ],
            [
              "PROVIDE",
              "Deepen the pool",
              "Stake the LP instead for a higher pool multiplier, on top of what the pair already earns.",
            ],
          ].map(([tag, title, body]) => (
            <div key={tag} className="bg-[#14161B] border border-[#232730] rounded-2xl p-5">
              <div className="text-[10px] font-mono tracking-wider text-[#10B981] mb-3">{tag}</div>
              <h3 className="text-white font-bold text-base mb-2 tracking-tight">{title}</h3>
              <p className="text-[11px] leading-relaxed text-gray-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Cta() {
  const nav = useNav();
  return (
    <Section className="border-t border-[#1F2228] text-center">
      <Title>Start earning from the tape.</Title>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
        <button
          onClick={() => nav("stake")}
          className="bg-[#10B981] hover:bg-[#0EA372] text-black font-bold text-xs px-6 py-3 rounded-xl transition shadow-lg shadow-[#10B981]/10"
        >
          Open the app
        </button>
        <button
          onClick={() => nav("docs")}
          className="bg-[#1B1E24] hover:bg-[#232730] border border-[#232730] text-white font-semibold text-xs px-6 py-3 rounded-xl transition"
        >
          Read the docs
        </button>
      </div>
    </Section>
  );
}

export default function LandingSection() {
  return (
    <div
      className="-m-4 bg-[#0B0C0E] rounded-2xl overflow-hidden border border-[#1F2228]"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.085) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    >
      <Hero />
      <TwoRoles />
      <HowItWorks />
      <Weighting />
      <FeeFlow />
      <Utility />
      <Cta />
      <Footer className="px-8 md:px-14 lg:px-20" />
    </div>
  );
}
