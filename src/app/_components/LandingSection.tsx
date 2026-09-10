"use client";

import { useState } from "react";
import { ArrowRight, Copy, Check } from "lucide-react";

/**
 * Landing view for the protocol — the "what is this" page, shown when the top
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

/** The faint square-grid motif used as a background accent. */
function GridMotif({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute select-none ${className}`} aria-hidden>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            className="w-10 h-10 rounded-[3px] bg-[#10B981]"
            style={{ opacity: [0.05, 0.02, 0.07, 0.03, 0.09, 0.02, 0.06, 0.04, 0.02][i] }}
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
  return (
    <Section className="pt-10 md:pt-14 overflow-hidden">
      <GridMotif className="top-0 right-0 opacity-70 hidden lg:block" />
      <div className="relative grid lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
        <div>
          <Eyebrow>Robinhood Chain · 4663</Eyebrow>
          <h1 className="text-white font-bold tracking-tight text-3xl md:text-5xl leading-[1.05] mb-5">
            The exchange pays its
            <br />
            users, not its shareholders.
          </h1>
          <p className="text-[13px] md:text-sm leading-relaxed text-gray-400 max-w-xl mb-7">
            Trade tokenized stocks around the clock, on-chain. Every trade pays a fee — and instead
            of that fee becoming a brokerage&apos;s profit, it is routed back to the people who stake
            $DIVS. Lock longer, take a bigger share.
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-10">
            <button className="bg-[#10B981] hover:bg-[#0EA372] text-black font-bold text-xs px-5 py-3 rounded-xl transition shadow-lg shadow-[#10B981]/10">
              Stake $DIVS
            </button>
            <button className="bg-[#1B1E24] hover:bg-[#232730] border border-[#232730] text-white font-semibold text-xs px-5 py-3 rounded-xl transition">
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
        The most common misunderstanding is that you stake the stocks. You do not. Stock tokens are
        what gets traded; $DIVS is what earns from that trading.
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
            Tokenized equity exposure that settles on-chain in seconds, wallet to wallet. No market
            hours, no clearinghouse, no broker between you and the position.
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
            Stake $DIVS single-sided, or DIVS/WETH LP for a higher weight. You collect a share of
            every fee the platform charges, for as long as you are staked.
          </p>
          <DataRow label="Paid in" value="WETH" />
          <DataRow label="Boost" value="up to 4x" />
          <DataRow label="Earns protocol fees" value="yes" />
        </div>
      </div>

      <p className="text-[11px] text-gray-500 mt-4">
        Holding $DIVS in your wallet earns nothing — only staked positions carry weight.
      </p>
    </Section>
  );
}

function HowItWorks() {
  const steps = [
    [
      "Trade",
      "Someone buys or sells a tokenized stock on the platform. The trade executes on-chain and settles immediately.",
    ],
    [
      "Collect",
      "The trade pays a fee. Buy-side fees arrive as the traded token and are swapped to WETH, so the vault holds one clean asset instead of a long tail of dust.",
    ],
    [
      "Distribute",
      "The WETH is pushed to the staking contract and split across every staked position by weight. You claim whenever you like.",
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
            Fees are split by weight, not by headcount and not purely by size. Three independent
            multipliers decide yours — which pool you are in, how large the position is, and how long
            you have locked it.
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
            The lock component scales linearly to a hard ceiling of 4x at one year. It is not a
            promise of yield — it is a claim on whatever the platform actually earns, sized by how
            long you are willing to leave your stake in place.
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
        Every trade on the platform pays a fee, and the treasury routes it straight back on-chain to
        the people staking behind it.
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
            every trade on the platform pays the people staking it.
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
              "Stake $DIVS and take a share of the fees from every buy and sell on the platform, paid in WETH.",
            ],
            [
              "BOOST",
              "Lock for a bigger share",
              "Commit for up to a year and carry as much as 4x the weight of the same stake left flexible.",
            ],
            [
              "PROVIDE",
              "Deepen the pool",
              "Stake DIVS/WETH LP instead for a higher pool multiplier, on top of whatever the pair earns.",
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
  return (
    <Section className="border-t border-[#1F2228] text-center">
      <Title>Start earning from the tape.</Title>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
        <button className="bg-[#10B981] hover:bg-[#0EA372] text-black font-bold text-xs px-6 py-3 rounded-xl transition shadow-lg shadow-[#10B981]/10">
          Open the app
        </button>
        <button className="bg-[#1B1E24] hover:bg-[#232730] border border-[#232730] text-white font-semibold text-xs px-6 py-3 rounded-xl transition">
          Read the docs
        </button>
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#1F2228] px-6 md:px-10 py-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <span className="font-bold text-white text-xs tracking-tight">DIVS</span>
        <span className="text-[10px] text-gray-600 font-mono">Robinhood Chain · 4663</span>
      </div>
      <div className="flex items-center gap-5 text-[11px] text-gray-500">
        {["Docs", "App", "GitHub", "X"].map((l) => (
          <button key={l} className="hover:text-white transition">
            {l}
          </button>
        ))}
      </div>
    </footer>
  );
}

export default function LandingSection() {
  return (
    <div className="-m-4 bg-[#0B0C0E] rounded-2xl overflow-hidden border border-[#1F2228]">
      <Hero />
      <TwoRoles />
      <HowItWorks />
      <Weighting />
      <FeeFlow />
      <Utility />
      <Cta />
      <Footer />
    </div>
  );
}
