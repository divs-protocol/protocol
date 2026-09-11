"use client";

import { useState } from "react";

/**
 * Protocol documentation, rendered inside the dashboard's Docs section.
 *
 * Everything here is derived from DivsStaking.sol rather than written
 * separately, so signatures, multipliers and revert strings match the contract.
 * Values that are set at deployment or not yet decided are marked TBD instead of
 * being invented.
 */

const TOPICS = [
  { id: "overview", label: "Overview" },
  { id: "staking", label: "Staking" },
  { id: "weight", label: "Weight & multipliers" },
  { id: "fees", label: "Fee distribution" },
  { id: "emissions", label: "Emissions" },
  { id: "reference", label: "Contract reference" },
  { id: "risks", label: "Risks" },
  { id: "faq", label: "FAQ" },
] as const;

type TopicId = (typeof TOPICS)[number]["id"];

/* ---------- primitives ---------- */

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="text-white font-semibold text-[13px] mt-5 first:mt-0 mb-2">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-gray-400 mb-2.5">{children}</p>;
}

function C({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-[10px] bg-[#101216] border border-[#232730] rounded px-1 py-0.5 text-[#10B981]">
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="bg-[#101216] border border-[#232730] rounded-xl p-3 mb-2.5 overflow-x-auto text-[10px] leading-relaxed text-gray-300">
      <code>{children}</code>
    </pre>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto mb-2.5 rounded-xl border border-[#232730]">
      <table className="w-full text-[10px] min-w-[420px]">
        <thead>
          <tr className="bg-[#101216]">
            {head.map((h) => (
              <th
                key={h}
                className="text-left font-semibold text-gray-400 px-3 py-2 border-b border-[#232730] whitespace-nowrap"
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
                <td key={j} className="px-3 py-2 text-gray-400 align-top">
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

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-[#232730] bg-[#101216] rounded-xl p-3 mb-2.5 text-[10px] leading-relaxed text-gray-400">
      {children}
    </div>
  );
}

function TBD() {
  return (
    <span className="text-[9px] uppercase tracking-wide text-gray-500 font-semibold">TBD</span>
  );
}

/* ---------- topics ---------- */

function Overview() {
  return (
    <>
      <H>What DIVS is</H>
      <P>
        Apple trades here at 3am. So does gold, and the S&amp;P. Seventeen markets, no market hours,
        no broker in the middle.
      </P>
      <P>
        Every fill pays a fee. That fee is not revenue the protocol keeps - it goes to whoever is
        staking $DIVS when the trade lands. Two assets, two jobs, and confusing them is the common
        mistake:
      </P>
      <Table
        head={["Asset", "Role", "Do you stake it?"]}
        rows={[
          ["Tokenized stocks (NVDA, AAPL…)", "What gets traded on the platform", "No"],
          ["$DIVS", "Protocol token; claim on fee revenue", "Yes"],
          ["DIVS/WETH LP", "Liquidity position for the DIVS pair", "Yes"],
        ]}
      />
      <P>
        Holding $DIVS earns nothing. Only <em>staked</em> positions carry weight.
      </P>

    </>
  );
}

function Staking() {
  return (
    <>
      <H>Staking, step by step</H>
      <P>
        Two pools. Single-sided $DIVS is pool <C>0</C>, DIVS/WETH LP is pool <C>1</C>. Ids follow
        the order the pools were added.
      </P>
      <Pre>{`// 1. approve the staking contract to pull your tokens
divs.approve(stakingAddress, amount)

// 2. stake, choosing a lock length in whole weeks (0 = flexible)
staking.stake(poolId, amount, lockWeeks)

// 3. check what you have earned at any point
staking.pendingRewards(yourAddress) -> (pendingWeth, pendingDivs)

// 4. collect. Claiming does not touch your stake
staking.claim() -> (wethOut, divsOut)

// 5. exit, once any lock has expired
staking.unstake(poolId, amount)`}</Pre>

      <H>What each call does</H>
      <Table
        head={["Call", "Effect", "Fails when"]}
        rows={[
          [
            <C key="1">stake</C>,
            "Pulls tokens in, sets or extends your lock, recomputes your weight.",
            <>
              The new lock would end earlier than your current one (<C>Cannot shorten lock</C>), or{" "}
              <C>lockWeeks</C> exceeds 52.
            </>,
          ],
          [
            <C key="2">extendLock</C>,
            "Lengthens the lock on an existing position, raising its weight immediately.",
            <>
              The new end is not later than the current one (<C>Not an extension</C>).
            </>,
          ],
          [
            <C key="3">claim</C>,
            "Transfers pending WETH and DIVS. Your staked balance is unaffected.",
            "Never; claiming zero is a no-op.",
          ],
          [
            <C key="4">unstake</C>,
            "Returns principal, partially or in full, and lowers your weight.",
            <>
              The lock has not expired (<C>Still locked</C>), or the amount exceeds your position (
              <C>Bad amount</C>).
            </>,
          ],
        ]}
      />

      <Note>
        Partial exits work - pass any amount up to your position. Rewards settle before the
        withdrawal, so leaving never costs you what you already earned.
      </Note>

      <H>Adding to a locked position</H>
      <P>
        Adding to a locked position needs a <C>lockWeeks</C> ending no earlier than the lock you
        already have. Passing <C>0</C> while locked reverts. A top-up cannot quietly shorten a
        commitment.
      </P>

      <H>When a lock expires</H>
      <P>
        Nothing happens automatically. The boost falls to 1x the next time the position is touched,
        or when anyone calls <C>poke(poolId, user)</C>. Permissionless on purpose: nobody demotes
        their own stake, and an expired boost dilutes everyone still locked.
      </P>
    </>
  );
}

function Weight() {
  return (
    <>
      <H>How your share is calculated</H>
      <P>
        Fees split by weight. Not evenly, and not by size alone. Three multipliers set yours:
      </P>
      <Pre>{`weight = amount × poolMultiplier × tierMultiplier × lockMultiplier`}</Pre>
      <Table
        head={["Multiplier", "Set by", "Range"]}
        rows={[
          [
            "poolMultiplier",
            "Governance, per pool",
            <>
              Configured at deployment. LP is intended to sit above single-sided; exact values{" "}
              <TBD />
            </>,
          ],
          [
            "tierMultiplier",
            "Your position size vs. thresholds",
            <>
              1x if no tier is reached. Thresholds and values <TBD />
            </>,
          ],
          ["lockMultiplier", "Your chosen lock length", "1x flexible → 4x at 52 weeks"],
        ]}
      />

      <H>Lock multiplier</H>
      <P>
        1x flexible. 4x at 52 weeks. Linear between, computed on-chain as{" "}
        <C>10000 + 30000 × weeks / 52</C> in basis points:
      </P>
      <Table
        head={["Lock", "Multiplier"]}
        rows={[
          ["Flexible (0 weeks)", "1.00x"],
          ["4 weeks", "1.23x"],
          ["13 weeks (1 quarter)", "1.75x"],
          ["26 weeks (half a year)", "2.50x"],
          ["39 weeks", "3.25x"],
          ["52 weeks (1 year)", "4.00x"],
        ]}
      />

      <H>Worked example</H>
      <P>
        Same money, different commitment. Both single-sided at 1x, neither above a tier:
      </P>
      <Pre>{`Alice - 1,000 DIVS locked 52 weeks
  weight = 1,000 × 1.0 × 1.0 × 4.0 = 4,000

Bob   - 1,000 DIVS flexible
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
  );
}

function Fees() {
  return (
    <>
      <H>Where fees come from</H>
      <P>
        Every buy and sell pays a fee. Buy-side fees arrive as the traded token and are swapped to
        WETH upstream. Sell-side fees arrive as WETH already. The vault handles one asset, never a
        long tail of dust.
      </P>

      <H>How they are distributed</H>
      <P>
        One accumulator does the work. Fees arrive, the contract raises a global WETH-per-weight
        figure, and your claim is that figure against your weight, minus what you have been credited
        already.
      </P>
      <Pre>{`accWethPerWeight += amount / totalWeight     // on each fee
claim = weight × accWethPerWeight − debt     // your entitlement`}</Pre>
      <P>
        The consequence: you earn from fees that land <em>while</em> you are staked. Arrive late and
        you have no claim on what came before. Leave, and what you accrued is still yours.
      </P>

      <H>Solvency</H>
      <P>
        <C>notifyFee</C> moves the WETH in <em>first</em>, then raises the accumulator. The contract
        cannot promise revenue it is not holding. That is ordering in the code, not a policy.
      </P>
      <P>
        Fees arriving with nothing staked sit in <C>unallocatedFees</C> and fold into the next
        distribution. Nothing divided by zero, nothing stranded.
      </P>
      <Note>
        <C>notifyFee</C> is permissionless. Because the WETH is pulled from the caller first, an
        unauthorised caller can only donate to stakers, never divert.
      </Note>
    </>
  );
}

function Emissions() {
  return (
    <>
      <H>What emissions are</H>
      <P>
        $DIVS paid on top of the fees, to attract stake before volume arrives. Funded from treasury,
        not earned. Fees are revenue; emissions are spend. They end.
      </P>

      <H>How periods work</H>
      <P>
        Funding sets the rate, never the reverse. <C>notifyEmission(amount, duration)</C> pulls the
        DIVS in and derives the per-second rate from what arrived:
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
          ["Period ends, not renewed", "Emissions stop accruing. Fee revenue is unaffected."],
          ["Funded again mid-period", "The unspent remainder rolls into the new rate."],
          [
            "Nothing staked during a period",
            "Nothing accrues, and that budget stays available for a later period rather than being burned.",
          ],
          ["Emission schedule and rate", <TBD key="s" />],
        ]}
      />

      <H>Why principal is safe</H>
      <P>
        $DIVS is staked <em>and</em> emitted. Written carelessly, an emission pays out of someone
        else&apos;s deposit. <C>emissionsFunded</C> is tracked apart from <C>totalStakedDivs</C>, and
        only funded DIVS can be scheduled.
      </P>
    </>
  );
}

function Reference() {
  return (
    <>
      <H>User functions</H>
      <Table
        head={["Signature", "Notes"]}
        rows={[
          [
            <C key="1">stake(uint256 poolId, uint256 amount, uint256 lockWeeks)</C>,
            "Requires prior approval. lockWeeks ≤ 52.",
          ],
          [
            <C key="2">extendLock(uint256 poolId, uint256 lockWeeks)</C>,
            "Must strictly extend the current lock.",
          ],
          [<C key="3">unstake(uint256 poolId, uint256 amount)</C>, "Partial allowed. Lock must have expired."],
          [
            <C key="4">claim() → (uint256 wethOut, uint256 divsOut)</C>,
            "Collects both reward assets. Does not touch principal.",
          ],
          [
            <C key="5">poke(uint256 poolId, address user)</C>,
            "Permissionless. Realises an expired lock's weight drop.",
          ],
          [<C key="6">notifyFee(uint256 amount)</C>, "Permissionless. Pulls WETH from the caller."],
        ]}
      />

      <H>Views</H>
      <Table
        head={["Signature", "Returns"]}
        rows={[
          [<C key="1">pendingRewards(address user)</C>, "Unclaimed WETH and DIVS, including live accrual."],
          [<C key="2">currentWeight(uint256 poolId, address user)</C>, "The weight the position carries right now."],
          [<C key="3">lockMultiplierBps(uint256 lockWeeks)</C>, "10000-40000 (1x-4x)."],
          [<C key="4">tierMultiplierBps(uint256 amount)</C>, "Tier multiplier for a position size."],
          [<C key="5">positions(uint256 poolId, address user)</C>, "amount, weight, lockEnd, lockWeeks."],
          [<C key="6">lastTimeEmissionApplicable()</C>, "min(now, periodFinish)."],
        ]}
      />

      <H>Owner functions</H>
      <Table
        head={["Signature", "Notes"]}
        rows={[
          [<C key="1">addPool(address token, uint256 multiplierBps)</C>, "Appends a pool; returns its id."],
          [
            <C key="2">setPoolMultiplier(uint256 poolId, uint256 multiplierBps)</C>,
            "Applies to weights recomputed after the call, not retroactively.",
          ],
          [
            <C key="3">setTiers(uint256[] thresholds, uint256[] multipliersBps)</C>,
            "Ascending thresholds, max 8, each ≥ 1x.",
          ],
          [<C key="4">notifyEmission(uint256 amount, uint256 duration)</C>, "Funds a period and sets its rate."],
        ]}
      />

      <H>Events</H>
      <Pre>{`Staked(user, poolId, amount, lockWeeks, weight)
LockExtended(user, poolId, lockWeeks, weight)
Unstaked(user, poolId, amount, weight)
Claimed(user, wethAmount, divsAmount)
FeeNotified(from, amount)
EmissionNotified(amount, rate, periodFinish)
PoolAdded(poolId, token, multiplierBps)
PoolMultiplierUpdated(poolId, multiplierBps)
TiersUpdated(thresholds, multipliersBps)`}</Pre>

      <H>Common reverts</H>
      <Table
        head={["Message", "Cause"]}
        rows={[
          ["Still locked", "unstake before the lock expires."],
          ["Cannot shorten lock", "stake with a lockWeeks ending before the current lock."],
          ["Not an extension", "extendLock to the same or an earlier end."],
          ["Bad amount", "unstake of zero, or more than the position holds."],
          ["Lock too long", "lockWeeks above 52."],
          ["Insufficient emission budget", "A period scheduled beyond the funded budget."],
        ]}
      />
    </>
  );
}

function Risks() {
  return (
    <>
      <H>Design risks</H>
      <P>
        These come from how the protocol works, not from where it is today. Going live does not
        remove them.
      </P>
      <Table
        head={["Risk", "Detail"]}
        rows={[
          [
            "Locks are irreversible",
            "There is no early exit, no penalty option and no transfer. A 52-week lock is inaccessible for 52 weeks.",
          ],
          [
            "Fee revenue tracks volume",
            "Fees depend entirely on trading activity. No volume means no yield, regardless of your weight.",
          ],
          [
            "Emissions are finite",
            "Emissions run only while a period is funded. Any headline rate that includes them is temporary by construction.",
          ],
          [
            "Impermanent loss",
            "The LP pool carries the usual AMM exposure, on top of DIVS price risk.",
          ],
          [
            "Weights can be reweighted",
            "Governance can change a pool multiplier or the tier table, altering future reward shares. Existing positions keep their weight until next touched.",
          ],
          [
            "Boosts lapse silently",
            "An expired lock keeps its weight until the position is touched or poked. Your share can change without you acting.",
          ],
        ]}
      />
    </>
  );
}

function Faq() {
  const qa: [string, React.ReactNode][] = [
    [
      "Do I earn anything just for holding $DIVS?",
      "No. Rewards accrue to staked positions only. An unstaked balance has zero weight and earns zero.",
    ],
    [
      "Can I unstake early if I change my mind?",
      <>
        No. <C>unstake</C> reverts with <C>Still locked</C> until the lock expires. There is no
        penalty-based early exit.
      </>,
    ],
    [
      "Does claiming rewards reset or reduce my stake?",
      <>
        No. <C>claim</C> only moves earned WETH and DIVS. Your principal, lock and weight are
        untouched.
      </>,
    ],
    [
      "What happens the moment my lock expires?",
      <>
        Nothing automatically. Your weight falls to 1x the next time your position is touched, or
        when anyone calls <C>poke</C>. You can then unstake or lock again.
      </>,
    ],
    [
      "I staked right after a big trading day. Do I get a share of those fees?",
      "No. You earn from fees arriving while you are staked. Earlier fees were already assigned to whoever was staked at the time.",
    ],
    [
      "Do I lose unclaimed rewards if I unstake?",
      "No. Rewards are settled before the withdrawal is processed, and remain claimable afterwards.",
    ],
    [
      "Is the advertised APR real yield?",
      "Only the fee component is. Emissions are funded from treasury for a fixed period and stop when it ends, so any rate including them is not a steady-state figure.",
    ],
    [
      "Why is my share smaller than my deposit suggests?",
      "Someone else is likely locked for longer, in the higher-multiplier pool, or above a tier threshold. Compare weights, not deposits.",
    ],
  ];

  return (
    <>
      {qa.map(([q, a]) => (
        <div key={q} className="border-b border-[#1F2228] last:border-0 py-3 first:pt-0">
          <h3 className="text-white font-semibold text-[11px] mb-1.5">{q}</h3>
          <p className="text-[11px] leading-relaxed text-gray-400">{a}</p>
        </div>
      ))}
    </>
  );
}

const CONTENT: Record<TopicId, () => React.ReactElement> = {
  overview: Overview,
  staking: Staking,
  weight: Weight,
  fees: Fees,
  emissions: Emissions,
  reference: Reference,
  risks: Risks,
  faq: Faq,
};

export default function DocsSection() {
  const [topic, setTopic] = useState<TopicId>("overview");
  const Body = CONTENT[topic];

  return (
    <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-start">
      {/* topic nav */}
      <nav className="hidden md:flex flex-col gap-0.5 w-44 flex-shrink-0 sticky top-0">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTopic(t.id)}
            className={`text-left px-3 py-2 rounded-lg text-[11px] transition ${
              topic === t.id
                ? "bg-[#10B981]/10 text-[#10B981] font-semibold"
                : "text-gray-400 hover:bg-[#1F2228] hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* mobile topic switcher */}
      <div className="md:hidden w-full mb-2">
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value as TopicId)}
          className="w-full bg-[#1B1E24] border border-[#232730] rounded-lg px-3 py-2 text-[11px] text-white"
        >
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <article className="flex-1 min-w-0 bg-[#1B1E24] border border-[#232730] rounded-2xl p-5 pb-6">
        <Body />
      </article>
    </div>
  );
}
