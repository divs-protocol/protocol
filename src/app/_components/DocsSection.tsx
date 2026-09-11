"use client";

import { useEffect, useRef, useState } from "react";
import { useNav } from "./nav";
import Footer from "./Footer";

/**
 * Protocol documentation.
 *
 * A contents rail that follows the reader, numbered steps for anything
 * sequential, spec rows for anything referenced, and callouts for the rules
 * that decide an outcome.
 *
 * Each topic carries an accent colour. Not decoration - it keys the rail, the
 * eyebrow and the step numerals together, so a reader scrolling always knows
 * which part of the document they are in.
 *
 * Content is derived from DivsStaking.sol, so signatures, multipliers and
 * revert strings match the contract. Values set at deployment are marked TBD
 * rather than invented.
 */

type Accent = { fg: string; bg: string; border: string };

const ACCENTS: Record<string, Accent> = {
  emerald: { fg: "#10B981", bg: "rgba(16,185,129,0.09)", border: "rgba(16,185,129,0.26)" },
  sky: { fg: "#38BDF8", bg: "rgba(56,189,248,0.09)", border: "rgba(56,189,248,0.26)" },
  violet: { fg: "#A78BFA", bg: "rgba(167,139,250,0.09)", border: "rgba(167,139,250,0.26)" },
  amber: { fg: "#FBBF24", bg: "rgba(251,191,36,0.09)", border: "rgba(251,191,36,0.26)" },
  rose: { fg: "#FB7185", bg: "rgba(251,113,133,0.09)", border: "rgba(251,113,133,0.26)" },
  cyan: { fg: "#22D3EE", bg: "rgba(34,211,238,0.09)", border: "rgba(34,211,238,0.26)" },
};

type Topic = {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  lead: string;
  accent: Accent;
  body: (a: Accent) => React.ReactNode;
};

/* ---------------- primitives ---------------- */

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="text-white font-bold text-[17px] tracking-tight mt-12 first:mt-0 mb-3">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-[1.75] text-gray-400 mb-4 max-w-[62ch]">{children}</p>;
}

function C({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-[12px] font-mono bg-[#0E1013] border border-[#232730] rounded-[5px] px-1.5 py-0.5 text-gray-200">
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="bg-[#0E1013] border border-[#232730] rounded-xl p-4 mb-5 overflow-x-auto text-[12px] leading-[1.7] text-gray-300">
      <code>{children}</code>
    </pre>
  );
}

function Step({ n, title, children, accent }: { n: number; title: string; children: React.ReactNode; accent: Accent }) {
  return (
    <div className="flex gap-5 py-5 border-t border-[#1F2228] first:border-t-0">
      <span className="font-mono text-[13px] pt-0.5 flex-shrink-0 w-6" style={{ color: accent.fg }}>
        {String(n).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <div className="text-white font-semibold text-[14px] mb-1.5">{title}</div>
        <div className="text-[13px] leading-[1.7] text-gray-400 max-w-[58ch]">{children}</div>
      </div>
    </div>
  );
}

function Note({ accent, label, children }: { accent: Accent; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 mb-5 border" style={{ background: accent.bg, borderColor: accent.border }}>
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] mb-2" style={{ color: accent.fg }}>
        {label}
      </div>
      <div className="text-[13px] leading-[1.7] text-gray-300">{children}</div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto mb-5 rounded-xl border border-[#232730]">
      <table className="w-full text-[13px] min-w-[440px]">
        <thead>
          <tr className="bg-[#0E1013]">
            {head.map((h) => (
              <th
                key={h}
                className="text-left font-semibold text-gray-500 text-[11px] uppercase tracking-wide px-4 py-2.5 border-b border-[#232730] whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[#1F2228] last:border-0">
              {r.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-gray-400 align-top leading-[1.6]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Spec({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 py-3 border-b border-[#1F2228] last:border-0">
      <span className="text-[13px] text-gray-500 whitespace-nowrap">{k}</span>
      <span className="flex-1 border-b border-dotted border-[#232730] translate-y-[-3px]" />
      <span className="text-[12px] font-mono text-gray-200 whitespace-nowrap text-right">{v}</span>
    </div>
  );
}

function TBD() {
  return <span className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">TBD</span>;
}

/* ---------------- topics ---------------- */

const TOPICS: Topic[] = [
  {
    id: "overview",
    label: "Overview",
    eyebrow: "Start here",
    title: "What DIVS is",
    lead: "Apple trades here at 3am. So does gold, and the S&P. Seventeen markets, no market hours, no broker in the middle.",
    accent: ACCENTS.emerald,
    body: (a) => (
      <>
        <P>
          Every fill pays a fee. That fee is not revenue the protocol keeps - it goes to whoever is
          staking $DIVS when the trade lands.
        </P>
        <H>Two assets, two jobs</H>
        <P>The stocks are what you trade. $DIVS is what you stake.</P>
        <Table
          head={["Asset", "Role", "Staked?"]}
          rows={[
            ["Tokenized stocks (NVDA, AAPL…)", "What gets traded", "No"],
            ["$DIVS", "Claim on fee revenue", "Yes"],
            ["DIVS/WETH LP", "Liquidity for the DIVS pair", "Yes"],
          ]}
        />
        <Note accent={a} label="The one rule">
          Holding $DIVS earns nothing. Only staked positions carry weight.
        </Note>
      </>
    ),
  },
  {
    id: "staking",
    label: "Staking",
    eyebrow: "How to",
    title: "Staking, step by step",
    lead: "Two pools. Single-sided $DIVS is pool 0, DIVS/WETH LP is pool 1. Ids follow the order the pools were added.",
    accent: ACCENTS.sky,
    body: (a) => (
      <>
        <div className="mb-8">
          <Step n={1} title="Approve" accent={a}>
            Let the staking contract pull your tokens: <C>divs.approve(stakingAddress, amount)</C>.
          </Step>
          <Step n={2} title="Stake with a lock" accent={a}>
            <C>stake(poolId, amount, lockWeeks)</C>. Zero weeks is flexible; 52 is the ceiling.
          </Step>
          <Step n={3} title="Watch it accrue" accent={a}>
            <C>pendingRewards(you)</C> returns unclaimed WETH and DIVS, including what has accrued
            since you last touched the position.
          </Step>
          <Step n={4} title="Claim" accent={a}>
            <C>claim()</C> moves both. Your stake, lock and weight are untouched.
          </Step>
          <Step n={5} title="Exit" accent={a}>
            <C>unstake(poolId, amount)</C>, once the lock has expired. Partial amounts work.
          </Step>
        </div>

        <H>What each call refuses</H>
        <Table
          head={["Call", "Reverts when"]}
          rows={[
            [<C key="1">stake</C>, <>The new lock ends earlier than your current one, or <C>lockWeeks</C> is above 52.</>],
            [<C key="2">extendLock</C>, <>The new end is not later than the current one.</>],
            [<C key="3">unstake</C>, <>The lock has not expired, or the amount exceeds your position.</>],
            [<C key="4">claim</C>, <>Never. Claiming zero is a no-op.</>],
          ]}
        />

        <Note accent={a} label="Adding to a locked position">
          A top-up needs a <C>lockWeeks</C> ending no earlier than the lock you already have.
          Passing <C>0</C> while locked reverts, so a top-up cannot quietly shorten a commitment.
        </Note>

        <H>When a lock expires</H>
        <P>
          Nothing happens automatically. The boost falls to 1x the next time the position is
          touched, or when anyone calls <C>poke(poolId, user)</C>. Permissionless on purpose:
          nobody demotes their own stake, and an expired boost dilutes everyone still locked.
        </P>
      </>
    ),
  },
  {
    id: "weight",
    label: "Weight & multipliers",
    eyebrow: "Mechanism",
    title: "Commitment is the multiplier",
    lead: "Fees split by weight. Not evenly, and not by size alone. Three multipliers set yours.",
    accent: ACCENTS.violet,
    body: (a) => (
      <>
        <Pre>{`weight = amount × poolMultiplier × tierMultiplier × lockMultiplier`}</Pre>
        <Table
          head={["Multiplier", "Set by", "Range"]}
          rows={[
            ["poolMultiplier", "Governance, per pool", <>Set at deployment · <TBD key="a" /></>],
            ["tierMultiplier", "Position size vs thresholds", <>1x until a tier is reached · <TBD key="b" /></>],
            ["lockMultiplier", "Your chosen lock", "1x flexible → 4x at 52 weeks"],
          ]}
        />

        <H>The lock curve</H>
        <P>
          1x flexible. 4x at 52 weeks. Linear between, computed on-chain as{" "}
          <C>10000 + 30000 × weeks / 52</C> in basis points.
        </P>
        <div className="mb-5 rounded-xl border border-[#232730] overflow-hidden">
          {(
            [
              ["Flexible", 1.0],
              ["4 weeks", 1.23],
              ["13 weeks", 1.75],
              ["26 weeks", 2.5],
              ["39 weeks", 3.25],
              ["52 weeks", 4.0],
            ] as [string, number][]
          ).map(([label, mult]) => (
            <div key={label} className="flex items-center gap-4 px-4 py-2.5 border-b border-[#1F2228] last:border-0">
              <span className="text-[13px] text-gray-400 w-24 flex-shrink-0">{label}</span>
              <span className="flex-1 h-1.5 rounded-full bg-[#0E1013] overflow-hidden">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(mult / 4) * 100}%`, background: a.fg, opacity: 0.35 + (mult / 4) * 0.65 }}
                />
              </span>
              <span className="text-[13px] font-mono w-14 text-right" style={{ color: a.fg }}>
                {mult.toFixed(2)}x
              </span>
            </div>
          ))}
        </div>

        <H>Worked example</H>
        <P>Same money, different commitment. Both single-sided at 1x, neither above a tier.</P>
        <Pre>{`Alice — 1,000 DIVS locked 52 weeks
  weight = 1,000 × 1.0 × 1.0 × 4.0 = 4,000

Bob   — 1,000 DIVS flexible
  weight = 1,000 × 1.0 × 1.0 × 1.0 = 1,000

totalWeight = 5,000

A 10 WETH fee arrives:
  Alice  4,000 / 5,000 × 10 = 8 WETH
  Bob    1,000 / 5,000 × 10 = 2 WETH`}</Pre>
        <P>
          Four times the share for the same capital. The price is a year without access to it.{" "}
          <C>currentWeight(poolId, user)</C> returns any position&apos;s live weight.
        </P>
      </>
    ),
  },
  {
    id: "fees",
    label: "Fee distribution",
    eyebrow: "Mechanism",
    title: "Where the fees go",
    lead: "Every buy and sell pays a fee. The vault handles one asset, never a long tail of dust.",
    accent: ACCENTS.cyan,
    body: (a) => (
      <>
        <P>
          Buy-side fees arrive as the traded token and are swapped to WETH upstream. Sell-side fees
          arrive as WETH already.
        </P>
        <H>How a claim is computed</H>
        <Pre>{`accWethPerWeight += amount / totalWeight     // on each fee
claim = weight × accWethPerWeight − debt     // your entitlement`}</Pre>
        <P>
          The consequence: you earn from fees that land <em>while</em> you are staked. Arrive late
          and you have no claim on what came before. Leave, and what you accrued is still yours.
        </P>

        <Note accent={a} label="Why it cannot overpay">
          <C>notifyFee</C> moves the WETH in first, then raises the accumulator. The contract cannot
          promise revenue it is not holding. That is ordering in the code, not a policy.
        </Note>

        <P>
          Fees arriving with nothing staked sit in <C>unallocatedFees</C> and fold into the next
          distribution. Nothing divided by zero, nothing stranded.
        </P>
        <P>
          <C>notifyFee</C> is permissionless. Because the WETH is pulled from the caller first, an
          unauthorised caller can only donate, never divert.
        </P>
      </>
    ),
  },
  {
    id: "emissions",
    label: "Emissions",
    eyebrow: "Mechanism",
    title: "Emissions are spend, not revenue",
    lead: "$DIVS paid on top of the fees, to attract stake before volume arrives. Funded from treasury, not earned. They end.",
    accent: ACCENTS.amber,
    body: (a) => (
      <>
        <H>Funding sets the rate</H>
        <P>
          Never the reverse. <C>notifyEmission(amount, duration)</C> pulls the DIVS in and derives
          the per-second rate from what arrived.
        </P>
        <Pre>{`rate = (amount + unspentRemainder) / duration
periodFinish = now + duration`}</Pre>
        <P>
          Accrual stops at <C>periodFinish</C> unless a new period is funded. No claims nobody can
          pay, and no race to empty a short pot.
        </P>
        <Table
          head={["Situation", "Behaviour"]}
          rows={[
            ["Period ends, not renewed", "Emissions stop. Fee revenue is unaffected."],
            ["Funded again mid-period", "The unspent remainder rolls into the new rate."],
            ["Nothing staked during a period", "Nothing accrues; that budget stays available."],
            ["Schedule and rate", <TBD key="s" />],
          ]}
        />
        <Note accent={a} label="Principal is not the budget">
          $DIVS is both staked and emitted, so the contract keeps the two apart.
          <C>emissionsFunded</C> holds the reward budget, <C>totalStakedDivs</C> holds deposits, and
          only funded DIVS can be scheduled. An emission can never be paid out of principal.
        </Note>
      </>
    ),
  },
  {
    id: "reference",
    label: "Contract reference",
    eyebrow: "Reference",
    title: "DivsStaking",
    lead: "Every entry point, what it returns, and what it refuses.",
    accent: ACCENTS.sky,
    body: () => (
      <>
        <H>User functions</H>
        <div className="mb-6 rounded-xl border border-[#232730] px-4">
          <Spec k="Stake with a lock" v="stake(uint256,uint256,uint256)" />
          <Spec k="Lengthen a lock" v="extendLock(uint256,uint256)" />
          <Spec k="Exit, fully or partly" v="unstake(uint256,uint256)" />
          <Spec k="Collect both assets" v="claim() → (weth, divs)" />
          <Spec k="Realise an expired lock" v="poke(uint256,address)" />
          <Spec k="Route fees in" v="notifyFee(uint256)" />
        </div>

        <H>Views</H>
        <div className="mb-6 rounded-xl border border-[#232730] px-4">
          <Spec k="Unclaimed rewards" v="pendingRewards(address)" />
          <Spec k="Live position weight" v="currentWeight(uint256,address)" />
          <Spec k="Lock multiplier, bps" v="lockMultiplierBps(uint256)" />
          <Spec k="Tier multiplier, bps" v="tierMultiplierBps(uint256)" />
          <Spec k="Raw position" v="positions(uint256,address)" />
          <Spec k="Emission window end" v="lastTimeEmissionApplicable()" />
        </div>

        <H>Owner functions</H>
        <div className="mb-6 rounded-xl border border-[#232730] px-4">
          <Spec k="Append a pool" v="addPool(address,uint256)" />
          <Spec k="Reweight a pool" v="setPoolMultiplier(uint256,uint256)" />
          <Spec k="Set size tiers" v="setTiers(uint256[],uint256[])" />
          <Spec k="Fund an emission period" v="notifyEmission(uint256,uint256)" />
        </div>

        <H>Events</H>
        <Pre>{`Staked(user, poolId, amount, lockWeeks, weight)
LockExtended(user, poolId, lockWeeks, weight)
Unstaked(user, poolId, amount, weight)
Claimed(user, wethAmount, divsAmount)
FeeNotified(from, amount)
EmissionNotified(amount, rate, periodFinish)`}</Pre>

        <H>Reverts you will meet</H>
        <Table
          head={["Message", "Cause"]}
          rows={[
            ["Still locked", "unstake before the lock expires"],
            ["Cannot shorten lock", "stake with a lockWeeks ending earlier than the current lock"],
            ["Not an extension", "extendLock to the same or an earlier end"],
            ["Bad amount", "unstake of zero, or more than the position holds"],
            ["Insufficient emission budget", "a period scheduled beyond the funded budget"],
          ]}
        />
      </>
    ),
  },
  {
    id: "risks",
    label: "Risks",
    eyebrow: "Before you stake",
    title: "What can go against you",
    lead: "These come from how the protocol works, not from where it is today. Going live does not remove them.",
    accent: ACCENTS.rose,
    body: (a) => (
      <>
        <Note accent={a} label="Irreversible">
          A lock has no early exit, no penalty option and no transfer. Fifty-two weeks means
          fifty-two weeks.
        </Note>
        <Table
          head={["Risk", "Detail"]}
          rows={[
            ["Fee revenue tracks volume", "No trading means no yield, whatever your weight."],
            ["Emissions are finite", "They run while a period is funded. Any rate quoting them is temporary."],
            ["Impermanent loss", "The LP pool carries the usual AMM exposure, on top of DIVS price risk."],
            ["Weights can be reweighted", "Governance can change a pool multiplier or the tier table."],
            ["Boosts lapse silently", "An expired lock keeps its weight until touched or poked."],
          ]}
        />
      </>
    ),
  },
  {
    id: "faq",
    label: "FAQ",
    eyebrow: "Quick answers",
    title: "Frequently asked",
    lead: "The questions that come up most.",
    accent: ACCENTS.emerald,
    body: () => (
      <div className="rounded-xl border border-[#232730] px-5">
        {(
          [
            ["Do I earn just for holding $DIVS?", "No. Rewards accrue to staked positions only. An unstaked balance has zero weight."],
            ["Can I unstake early?", "No. unstake reverts with “Still locked” until the lock expires. There is no penalty exit."],
            ["Does claiming reduce my stake?", "No. claim moves earned WETH and DIVS. Principal, lock and weight are untouched."],
            ["What happens the moment my lock ends?", "Nothing automatic. Weight falls to 1x when the position is next touched, or when anyone pokes it."],
            ["I staked after a big day. Do I get those fees?", "No. You earn from fees arriving while staked. Earlier fees were already assigned."],
            ["Do I lose unclaimed rewards by unstaking?", "No. Rewards settle before the withdrawal and stay claimable."],
            ["Is the advertised rate real yield?", "Only the fee part. Emissions are treasury spend for a fixed period."],
            ["Why is my share smaller than my deposit suggests?", "Someone else is locked longer, in a heavier pool, or above a tier. Compare weights, not deposits."],
          ] as [string, string][]
        ).map(([q, ans]) => (
          <div key={q} className="py-4 border-b border-[#1F2228] last:border-0">
            <div className="text-white font-semibold text-[13.5px] mb-1.5">{q}</div>
            <div className="text-[13px] leading-[1.7] text-gray-400 max-w-[60ch]">{ans}</div>
          </div>
        ))}
      </div>
    ),
  },
];

const META: [string, string][] = [
  ["Chain", "Robinhood (4663)"],
  ["Markets", "17"],
  ["Pools", "2"],
  ["Max boost", "4x"],
];

/* ---------------- section ---------------- */

export default function DocsSection() {
  const nav = useNav();
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(TOPICS[0].id);

  // The rail follows the reader rather than only responding to clicks.
  useEffect(() => {
    // The app scrolls inside a container, not the window. An observer left on
    // the default viewport root never fires here, so find the scrolling
    // ancestor and observe against that instead.
    let scroller: Element | null = rootRef.current?.parentElement ?? null;
    while (scroller) {
      const oy = getComputedStyle(scroller).overflowY;
      if (oy === "auto" || oy === "scroll") break;
      scroller = scroller.parentElement;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { root: scroller, rootMargin: "-96px 0px -68% 0px", threshold: 0 },
    );
    TOPICS.forEach((t) => {
      const el = document.getElementById(t.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="-m-4">
      <header className="px-6 md:px-12 lg:px-16 pt-12 pb-10 border-b border-[#1F2228]">
        <div className="max-w-5xl">
          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#10B981] mb-4">
            Documentation
          </div>
          <h1 className="text-white font-bold tracking-tight text-3xl md:text-5xl leading-[1.08] mb-5">
            DIVS Protocol
          </h1>
          <p className="text-[15px] md:text-base leading-[1.75] text-gray-400 max-w-[56ch] mb-8">
            How the exchange collects fees, how staking splits them, and every rule that decides
            what lands in your position.
          </p>
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            {META.map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-2">
                <span className="text-[12px] text-gray-500">{k}</span>
                <span className="text-[13px] font-mono text-white">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="px-6 md:px-12 lg:px-16 py-10">
        <div className="max-w-5xl flex flex-col lg:flex-row gap-8 lg:gap-12">
          <nav className="hidden lg:block w-52 flex-shrink-0">
            <div className="sticky top-4">
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500 mb-4">
                Contents
              </div>
              <ul className="border-l border-[#232730]">
                {TOPICS.map((t) => {
                  const on = active === t.id;
                  return (
                    <li key={t.id}>
                      <a
                        href={`#${t.id}`}
                        className="block pl-4 py-2 text-[13px] transition -ml-px border-l-2"
                        style={{
                          color: on ? t.accent.fg : "#7A828C",
                          borderColor: on ? t.accent.fg : "transparent",
                          fontWeight: on ? 600 : 400,
                        }}
                      >
                        {t.label}
                      </a>
                    </li>
                  );
                })}
              </ul>

              <button
                onClick={() => nav("stake")}
                className="mt-8 w-full bg-[#10B981] hover:bg-[#0EA372] text-black text-[12px] font-bold py-2.5 rounded-xl transition"
              >
                Stake $DIVS
              </button>
            </div>
          </nav>

          <div className="lg:hidden">
            <select
              value={active}
              onChange={(e) => {
                setActive(e.target.value);
                document.getElementById(e.target.value)?.scrollIntoView({ behavior: "smooth" });
              }}
              className="w-full bg-[#1B1E24] border border-[#232730] rounded-xl px-3 py-2.5 text-[13px] text-white"
            >
              {TOPICS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <article className="flex-1 min-w-0">
            {TOPICS.map((t, i) => (
              <section
                key={t.id}
                id={t.id}
                className="scroll-mt-6 pb-16 mb-16 border-b border-[#1F2228] last:border-0 last:mb-0 last:pb-0"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.accent.fg }} />
                  <span
                    className="text-[10px] font-mono uppercase tracking-[0.16em]"
                    style={{ color: t.accent.fg }}
                  >
                    {String(i + 1).padStart(2, "0")} · {t.eyebrow}
                  </span>
                </div>
                <h2 className="text-white font-bold tracking-tight text-2xl md:text-[28px] leading-tight mb-3">
                  {t.title}
                </h2>
                <p className="text-[14.5px] leading-[1.75] text-gray-400 max-w-[60ch] mb-8">{t.lead}</p>
                {t.body(t.accent)}
              </section>
            ))}
          </article>
        </div>
      </div>

      <div className="px-6 md:px-12 lg:px-16">
        <Footer />
      </div>
    </div>
  );
}
