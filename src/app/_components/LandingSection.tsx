"use client";

import { useState } from "react";
import { ArrowRight, Copy, Check } from "lucide-react";
import Footer from "./Footer";
import { useNav } from "./nav";
import { MARKETS } from "@/lib/exchange";
import { DEFAULT_FEE_BPS } from "@/lib/divsRouter";

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
            {/* A definition, not a slogan. Someone arriving here should be able
                to say what this is after one sentence. */}
            DIVS Protocol is an exchange for tokenized equities on Robinhood Chain. {MARKETS.length}{" "}
            stocks and funds, open every hour of every day. Every trade pays a fee, and every fee
            goes to holders staking $DIVS.
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
      <Title>What you trade, and what you stake</Title>
      <Lede>
        These are two different assets. Stock tokens are what you buy and sell. $DIVS is what earns
        from other people buying and selling. You do not stake the stocks.
      </Lede>

      <div className="grid md:grid-cols-2 gap-4 mt-8">
        <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-3">
            Traded · NVDA, AAPL, TSLA…
          </div>
          <h3 className="text-white font-bold text-lg mb-2 tracking-tight">
            Stock tokens
          </h3>
          <p className="text-[11px] leading-relaxed text-gray-400 mb-4">
            Equity exposure that settles in seconds, wallet to wallet. Issued by Robinhood, traded
            against on-chain pools. No market hours, no clearing house, nobody between you and the
            position.
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
            Staked $DIVS
          </h3>
          <p className="text-[11px] leading-relaxed text-gray-400 mb-4">
            Stake $DIVS on its own, or DIVS/WETH LP for more weight. You take a cut of every fee the
            exchange charges, paid in WETH, for as long as you stay staked.
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
  /*
   * Plain sentences, in the order a person actually meets them.
   *
   * The previous version led with "Trade. Collect. Distribute." and described
   * the protocol's internals. That is the right content for the docs and the
   * wrong content for someone deciding whether this is for them.
   */
  const steps = [
    "Connect a wallet. There is no account to open, no broker and no paperwork.",
    `Buy any of ${MARKETS.length} tokenized stocks and funds with ether or USDG, in one transaction.`,
    `Every trade pays a protocol fee of ${(DEFAULT_FEE_BPS / 100).toFixed(2)}%, charged on the cash side and never in the stock.`,
    "That fee is split across staked $DIVS by weight. Lock for longer and your weight rises, up to 4x.",
  ];

  const parts: [string, string][] = [
    [
      "Exchange",
      `The app at divsprotocol.com. ${MARKETS.length} markets with live prices, charts, depth and the insider filings for each company.`,
    ],
    [
      "$DIVS",
      "The token you stake. It is launched on Pons and the protocol neither mints it nor owns it.",
    ],
    [
      "DivsRouter",
      "The contract that executes a trade against a pool and charges the protocol fee in the same call.",
    ],
    [
      "DivsStaking",
      "The contract that holds staked $DIVS and pays out the fees it receives, by weight.",
    ],
    [
      "Stock tokens",
      "Robinhood Stock Tokens. Robinhood issues them, this protocol only reads and routes them.",
    ],
    [
      "Robinhood Chain",
      "Where all of it runs. Chain id 4663, gas paid in ether, blocks every tenth of a second.",
    ],
  ];

  return (
    <Section className="border-t border-[#1F2228]">
      <Title>How it works</Title>
      <Lede>Four steps, in the order you meet them.</Lede>

      <ol className="mt-8 space-y-4 max-w-3xl">
        {steps.map((body, i) => (
          <li key={body} className="flex gap-4">
            <span className="font-mono text-[11px] text-[#10B981] pt-0.5 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-[13px] md:text-sm leading-relaxed text-gray-300">{body}</span>
          </li>
        ))}
      </ol>

      <div className="mt-12 border border-[#232730] rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[130px_1fr] sm:grid-cols-[180px_1fr] bg-[#14161B] border-b border-[#232730]">
          <span className="px-4 py-3 text-[10px] font-mono uppercase tracking-wider text-gray-500">
            Part
          </span>
          <span className="px-4 py-3 text-[10px] font-mono uppercase tracking-wider text-gray-500">
            What it is
          </span>
        </div>
        {parts.map(([part, what]) => (
          <div
            key={part}
            className="grid grid-cols-[130px_1fr] sm:grid-cols-[180px_1fr] border-b border-[#1F2228] last:border-0"
          >
            <span className="px-4 py-3.5 font-mono text-[11px] text-white">{part}</span>
            <span className="px-4 py-3.5 text-[12px] leading-relaxed text-gray-400">{what}</span>
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
          <Title>How your share is worked out</Title>
          <Lede>
            Fees are split by weight, not evenly and not by size alone. Three things set your
            weight: which pool you staked in, how much you staked, and how long you locked it for.
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
      <Title>Where a fee goes</Title>
      <Lede>
        Every trade pays one. Nothing is held back by a treasury: it is converted to WETH and paid
        out to staked $DIVS, on-chain, in four steps.
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
        <Title>Own the fees</Title>
        <Lede>
          $DIVS is exposure to every trade on the exchange. Stake it and you take a share of what
          the platform charges, paid in WETH, for as long as you stay staked.
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

        <div className="border-t border-[#232730]">
          {(
            [
              ["Fee share", "Every buy and sell on the exchange pays staked $DIVS, in WETH"],
              ["Lock boost", "Lock for 52 weeks and carry 4x the weight of the same stake left flexible"],
              ["LP staking", "Stake DIVS/WETH LP for a higher multiplier, on top of what the pair already earns"],
              ["Emissions", "Funded $DIVS emissions accrue to stakers alongside the fee share"],
              ["Holding alone", "Earns nothing. Only a staked position carries weight"],
            ] as [string, string][]
          ).map(([label, benefit]) => (
            <div
              key={label}
              className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-6 py-5 border-b border-[#232730] last:border-0"
            >
              <span className="text-white font-bold text-base tracking-tight shrink-0">{label}</span>
              <span className="text-[12px] md:text-[13px] leading-relaxed text-gray-400 sm:text-right">
                {benefit}
              </span>
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
      <Title>Trade the markets, or earn from them</Title>
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
