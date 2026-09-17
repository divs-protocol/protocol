"use client";

import { useEffect, useRef, useState } from "react";
import { useNav } from "./nav";
import Footer from "./Footer";
import { MARKETS } from "@/lib/exchange";

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
    eyebrow: "Introduction",
    title: "Overview",
    lead: "DIVS Protocol is an exchange for tokenized equities on Robinhood Chain. Fees charged on trades are distributed to staked $DIVS rather than retained by the protocol.",
    accent: ACCENTS.emerald,
    body: (a) => (
      <>
        <P>
          {MARKETS.length} markets are live, covering individual equities, index ETFs and
          commodity ETFs. They trade continuously: there are no market hours, and a trade settles
          against an on-chain pool rather than through a broker.
        </P>
        <H>Assets</H>
        <P>Three assets appear in the protocol. Two of them can be staked.</P>
        <Table
          head={["Asset", "Role", "Staked?"]}
          rows={[
            ["Tokenized stocks (NVDA, AAPL…)", "Traded on the exchange", "No"],
            ["$DIVS", "Claim on fee revenue", "Yes"],
            ["DIVS/WETH LP", "Liquidity for the DIVS pair", "Yes"],
          ]}
        />
        <Note accent={a} label="Eligibility">
          Rewards accrue to staked positions only. An unstaked $DIVS balance carries no weight and
          receives no distribution.
        </Note>
      </>
    ),
  },
  {
    id: "stocks",
    label: "Tokenized stocks",
    eyebrow: "The assets",
    title: "Tokenized stocks",
    lead: `${MARKETS.length} equities and ETFs trade on the protocol as Robinhood Stock Tokens: ERC-20 contracts on Robinhood Chain that track a listed security.`,
    accent: ACCENTS.cyan,
    body: (a) => (
      <>
        <H>What is listed</H>
        <P>
          Many more stock tokens are issued on the chain than are listed here. A market appears
          once its pool holds liquidity, because a listing is a pool this protocol can read - not
          a permission anyone grants.
        </P>
        <Table
          head={["Kind", "Examples"]}
          rows={[
            ["Equities", "AAPL, NVDA, TSLA, GOOGL, COIN, MSTR, GME, LLY, DJT"],
            ["Index ETFs", "SPY, QQQ"],
            ["Commodity and treasury ETFs", "GLD, SGOV"],
          ]}
        />

        <H>Settlement</H>
        <P>
          A trade is a swap against a pool, so it settles in the block it lands in. Robinhood Chain
          produces a block roughly every tenth of a second. There is no settlement period, no
          custodian holding the position in between, and no counterparty to fail.
        </P>

        <H>Trading hours</H>
        <P>
          There are none. The pools accept a swap at any hour on any day, including weekends and
          market holidays, because nothing about the pool refers to an exchange calendar.
        </P>

        <H>Dividends and splits</H>
        <P>
          These tokens implement ERC-8056. A corporate action is applied by changing a display
          scalar, <C>uiMultiplier</C>, rather than by moving tokens into or out of a holder&apos;s
          wallet. The balance in the contract does not change; the number of shares it represents
          does.
        </P>
        <Pre>{`shares shown = balanceOf(holder) × uiMultiplier()`}</Pre>
        <P>
          This is not hypothetical: AAPL currently sits at 1.000566 and SGOV at 1.005102. Any figure
          in the app that represents a share count applies the multiplier, and any figure that
          represents a token amount does not.
        </P>

        <H>What the issuer controls</H>
        <P>
          The tokens are issued by Robinhood, not by DIVS. The protocol provides the venue and takes
          a fee on trades; it does not mint, redeem or custody the assets.
        </P>
        <Table
          head={["Control", "Effect"]}
          rows={[
            ["uiMultiplier", "Applies dividends and splits to every holder at once."],
            ["pause", "Halts transfers of that token, so its market stops trading until unpaused."],
            ["Issuance", "New tokens and new listings are the issuer's decision, not the protocol's."],
          ]}
        />
        <Note accent={a} label="Transfers are permissionless">
          Within those limits the tokens move like any ERC-20. There is no allowlist on transfer, so
          a wallet that holds one can trade it without the issuer&apos;s involvement.
        </Note>
      </>
    ),
  },
  {
    id: "staking",
    label: "Staking",
    eyebrow: "Guide",
    title: "Staking",
    lead: "Two pools accept deposits. Single-sided $DIVS is pool 0 and the DIVS/WETH LP token is pool 1. Pool ids follow the order in which pools were added.",
    accent: ACCENTS.sky,
    body: (a) => (
      <>
        <div className="mb-8">
          <Step n={1} title="Approve" accent={a}>
            Authorise the staking contract to transfer the deposit:{" "}
            <C>divs.approve(stakingAddress, amount)</C>.
          </Step>
          <Step n={2} title="Stake" accent={a}>
            <C>stake(poolId, amount, lockWeeks)</C>. <C>lockWeeks</C> accepts 0 for a flexible
            position, up to a maximum of 52.
          </Step>
          <Step n={3} title="Monitor accrual" accent={a}>
            <C>pendingRewards(account)</C> returns unclaimed WETH and DIVS, including amounts
            accrued since the position was last updated.
          </Step>
          <Step n={4} title="Claim" accent={a}>
            <C>claim()</C> transfers both assets. The deposit, lock and weight are unchanged.
          </Step>
          <Step n={5} title="Withdraw" accent={a}>
            <C>unstake(poolId, amount)</C>, after the lock has expired. Partial withdrawals are
            supported.
          </Step>
        </div>

        <H>Revert conditions</H>
        <Table
          head={["Call", "Reverts when"]}
          rows={[
            [
              <C key="1">stake</C>,
              <>
                The supplied lock ends earlier than the current lock, or <C>lockWeeks</C> exceeds 52.
              </>,
            ],
            [<C key="2">extendLock</C>, <>The new end is not later than the current end.</>],
            [<C key="3">unstake</C>, <>The lock has not expired, or the amount exceeds the position.</>],
            [<C key="4">claim</C>, <>Does not revert. A claim of zero is a no-op.</>],
          ]}
        />

        <Note accent={a} label="Adding to a locked position">
          A deposit into a position that is already locked requires a <C>lockWeeks</C> value ending
          no earlier than the existing lock. Passing <C>0</C> while locked reverts, so a deposit
          cannot shorten an existing commitment.
        </Note>

        <H>Lock expiry</H>
        <P>
          Weight is not reduced automatically when a lock ends. The lock multiplier falls to 1x the
          next time the position is updated, or when <C>poke(poolId, account)</C> is called. Any
          address may call <C>poke</C>, since an expired lock that retains its multiplier dilutes
          the positions that are still locked.
        </P>
      </>
    ),
  },
  {
    id: "weight",
    label: "Weight & multipliers",
    eyebrow: "Mechanism",
    title: "Weight and multipliers",
    lead: "A position receives a share of each distribution proportional to its weight. Weight is the staked amount multiplied by three independent multipliers.",
    accent: ACCENTS.violet,
    body: (a) => (
      <>
        <Pre>{`weight = amount × poolMultiplier × tierMultiplier × lockMultiplier`}</Pre>
        <Table
          head={["Multiplier", "Set by", "Range"]}
          rows={[
            ["poolMultiplier", "Owner, per pool", <>Set at deployment · <TBD key="a" /></>],
            [
              "tierMultiplier",
              "Position size against thresholds",
              <>1x below the first tier · <TBD key="b" /></>,
            ],
            ["lockMultiplier", "Lock duration chosen at stake", "1x flexible to 4x at 52 weeks"],
          ]}
        />

        <H>Lock multiplier</H>
        <P>
          The lock multiplier is 1x for a flexible position and 4x at 52 weeks, linear between the
          two. It is computed on-chain as <C>10000 + 30000 × weeks / 52</C> basis points.
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
            <div
              key={label}
              className="flex items-center gap-4 px-4 py-2.5 border-b border-[#1F2228] last:border-0"
            >
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

        <H>Example</H>
        <P>
          Two positions of equal size in pool 0, neither above a tier threshold, differing only in
          lock duration.
        </P>
        <Pre>{`Alice — 1,000 DIVS locked 52 weeks
  weight = 1,000 × 1.0 × 1.0 × 4.0 = 4,000

Bob   — 1,000 DIVS flexible
  weight = 1,000 × 1.0 × 1.0 × 1.0 = 1,000

totalWeight = 5,000

A 10 WETH fee is distributed:
  Alice  4,000 / 5,000 × 10 = 8 WETH
  Bob    1,000 / 5,000 × 10 = 2 WETH`}</Pre>
        <P>
          <C>currentWeight(poolId, account)</C> returns the live weight of any position.
        </P>
      </>
    ),
  },
  {
    id: "fees",
    label: "Fee distribution",
    eyebrow: "Mechanism",
    title: "Fee distribution",
    lead: "Fees charged on trades are distributed to staked positions in WETH, in proportion to weight.",
    accent: ACCENTS.cyan,
    body: (a) => (
      <>
        <P>
          Sell-side fees are collected in WETH. Buy-side fees are collected in the traded token and
          swapped to WETH before reaching the staking contract, so distributions are single-asset.
        </P>
        <H>Accounting</H>
        <Pre>{`accWethPerWeight += amount / totalWeight     // on each distribution
claim = weight × accWethPerWeight − debt     // entitlement of a position`}</Pre>
        <P>
          A position earns from distributions that occur while it is staked. Fees distributed before
          a deposit are not claimable by it, and rewards accrued before a withdrawal remain
          claimable after it.
        </P>

        <Note accent={a} label="Order of operations">
          <C>notifyFee</C> transfers the WETH into the contract before increasing the accumulator,
          so the contract cannot record an entitlement it does not hold.
        </Note>

        <P>
          Fees that arrive while <C>totalWeight</C> is zero are held in <C>unallocatedFees</C> and
          included in the next distribution.
        </P>
        <P>
          <C>notifyFee</C> may be called by any address. The WETH is transferred from the caller, so
          an unauthorised call can only add to the amount distributed.
        </P>
      </>
    ),
  },
  {
    id: "emissions",
    label: "Emissions",
    eyebrow: "Mechanism",
    title: "Emissions",
    lead: "$DIVS distributed in addition to fee revenue, funded from treasury and scheduled over a fixed period.",
    accent: ACCENTS.amber,
    body: (a) => (
      <>
        <H>Funding</H>
        <P>
          <C>notifyEmission(amount, duration)</C> transfers the DIVS into the contract and derives
          the per-second rate from the amount received. The rate is a function of the funding rather
          than a separately configured parameter.
        </P>
        <Pre>{`rate = (amount + unspentRemainder) / duration
periodFinish = now + duration`}</Pre>
        <P>
          Accrual stops at <C>periodFinish</C> unless a further period is funded.
        </P>
        <Table
          head={["Situation", "Behaviour"]}
          rows={[
            ["Period ends without renewal", "Emissions stop. Fee distributions are unaffected."],
            ["Funded again mid-period", "The unspent remainder is added to the new rate."],
            ["Nothing staked during a period", "Nothing accrues, and the budget remains available."],
            ["Schedule and rate", <TBD key="s" />],
          ]}
        />
        <Note accent={a} label="Reward budget">
          $DIVS is both staked and emitted, and the contract holds the two separately.{" "}
          <C>emissionsFunded</C> tracks the reward budget and <C>totalStakedDivs</C> tracks
          deposits. Only funded DIVS can be scheduled, so an emission cannot be paid out of
          principal.
        </Note>
      </>
    ),
  },
  {
    id: "reference",
    label: "Contract reference",
    eyebrow: "Reference",
    title: "DivsStaking",
    lead: "Function signatures, views, events and revert reasons.",
    accent: ACCENTS.sky,
    body: () => (
      <>
        <H>User functions</H>
        <div className="mb-6 rounded-xl border border-[#232730] px-4">
          <Spec k="Stake with a lock" v="stake(uint256,uint256,uint256)" />
          <Spec k="Extend a lock" v="extendLock(uint256,uint256)" />
          <Spec k="Withdraw" v="unstake(uint256,uint256)" />
          <Spec k="Claim rewards" v="claim() → (weth, divs)" />
          <Spec k="Update an expired lock" v="poke(uint256,address)" />
          <Spec k="Distribute a fee" v="notifyFee(uint256)" />
        </div>

        <H>Views</H>
        <div className="mb-6 rounded-xl border border-[#232730] px-4">
          <Spec k="Unclaimed rewards" v="pendingRewards(address)" />
          <Spec k="Live position weight" v="currentWeight(uint256,address)" />
          <Spec k="Lock multiplier, bps" v="lockMultiplierBps(uint256)" />
          <Spec k="Tier multiplier, bps" v="tierMultiplierBps(uint256)" />
          <Spec k="Raw position" v="positions(uint256,address)" />
          <Spec k="Emission accrual cutoff" v="lastTimeEmissionApplicable()" />
        </div>

        <H>Owner functions</H>
        <div className="mb-6 rounded-xl border border-[#232730] px-4">
          <Spec k="Append a pool" v="addPool(address,uint256)" />
          <Spec k="Change a pool multiplier" v="setPoolMultiplier(uint256,uint256)" />
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

        <H>Revert reasons</H>
        <Table
          head={["Message", "Condition"]}
          rows={[
            ["Still locked", "unstake called before the lock expires"],
            [
              "Cannot shorten lock",
              "stake called with a lockWeeks ending earlier than the current lock",
            ],
            ["Not an extension", "extendLock called with the same or an earlier end"],
            ["Bad amount", "unstake of zero, or of more than the position holds"],
            ["Insufficient emission budget", "a period scheduled beyond the funded budget"],
          ]}
        />
      </>
    ),
  },
  {
    id: "risks",
    label: "Risks",
    eyebrow: "Risk",
    title: "Risk factors",
    lead: "Conditions that can reduce or eliminate a return. They follow from the design of the protocol and apply at every stage of its operation.",
    accent: ACCENTS.rose,
    body: (a) => (
      <>
        <Note accent={a} label="Locks are irreversible">
          A lock cannot be ended early. There is no penalty exit and no transfer of a locked
          position. A 52-week lock is withdrawable after 52 weeks.
        </Note>
        <Table
          head={["Risk", "Detail"]}
          rows={[
            [
              "Revenue depends on volume",
              "Fee distributions are a function of trading activity. Low volume produces a low return at any weight.",
            ],
            [
              "Emissions are finite",
              "Emissions accrue only while a period is funded. A rate that includes them is temporary.",
            ],
            [
              "Impermanent loss",
              "The LP pool carries standard AMM exposure in addition to $DIVS price risk.",
            ],
            [
              "Multipliers are configurable",
              "The owner can change a pool multiplier or the tier table, which changes relative weights.",
            ],
            [
              "Expired locks retain weight",
              "An expired lock keeps its multiplier until the position is updated or poked.",
            ],
            [
              "Markets can be paused",
              "Every stock token can be paused by its issuer. While paused, swaps against that market fail and no fee is generated from it.",
            ],
          ]}
        />
      </>
    ),
  },
  {
    id: "faq",
    label: "FAQ",
    eyebrow: "Support",
    title: "Frequently asked questions",
    lead: "Common questions about staking, rewards and locks.",
    accent: ACCENTS.emerald,
    body: () => (
      <div className="rounded-xl border border-[#232730] px-5">
        {(
          [
            [
              "Does holding $DIVS earn rewards?",
              "No. Rewards accrue to staked positions only. An unstaked balance has zero weight.",
            ],
            [
              "Can a position be unstaked early?",
              "No. unstake reverts with “Still locked” until the lock expires. There is no penalty exit.",
            ],
            [
              "Does claiming reduce the stake?",
              "No. claim transfers earned WETH and DIVS. The deposit, lock and weight are unchanged.",
            ],
            [
              "What happens when a lock ends?",
              "Nothing automatically. The multiplier falls to 1x when the position is next updated, or when any address calls poke.",
            ],
            [
              "Are fees distributed before a deposit claimable?",
              "No. A position earns from distributions that occur while it is staked. Earlier fees are already assigned.",
            ],
            [
              "Are unclaimed rewards lost on withdrawal?",
              "No. Rewards are settled before the withdrawal and remain claimable.",
            ],
            [
              "Does a displayed rate represent fee revenue?",
              "Only in part. Emissions are treasury-funded and run for a fixed period; fee revenue does not depend on a schedule.",
            ],
            [
              "Why is a share smaller than the deposit suggests?",
              "Another position is locked for longer, sits in a pool with a higher multiplier, or is above a tier threshold. Shares are proportional to weight, not to deposit.",
            ],
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
  ["Markets", String(MARKETS.length)],
  ["Pools", "2"],
  ["Max lock multiplier", "4x"],
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
            Reference for the DIVS staking contract: how fees are collected, how they are
            distributed by weight, and the rules governing locks and emissions.
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
