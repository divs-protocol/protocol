"use client";

/**
 * The "what is this" content for the dashboard's Docs section. Kept out of
 * page.tsx purely for length; it is styled to the dashboard's own density
 * rather than as a marketing page.
 */

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-4">
      <h3 className="text-white font-semibold text-xs mb-2">{title}</h3>
      <div className="text-[11px] leading-relaxed text-gray-400 space-y-2">{children}</div>
    </div>
  );
}

function Group({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-[9px] font-bold uppercase tracking-widest text-[#10B981]">{eyebrow}</p>
      {children}
    </div>
  );
}

export default function DocsSection() {
  return (
    <div className="space-y-5 max-w-4xl pb-4">
      {/* WHAT IT IS */}
      <div className="bg-gradient-to-br from-[#10B981]/[0.07] to-transparent border border-[#10B981]/25 rounded-2xl p-5">
        <span className="inline-flex items-center gap-1.5 text-[9px] text-amber-500/90 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          PRE-LAUNCH — NOT DEPLOYED, NOT AUDITED
        </span>
        <h2 className="text-white font-bold text-lg leading-snug">
          The exchange pays its users, not its shareholders.
        </h2>
        <p className="text-[11px] leading-relaxed text-gray-400 mt-2.5 max-w-2xl">
          DIVS is a protocol for trading tokenized stocks around the clock, on-chain. Every trade
          pays a fee — and instead of that fee becoming a brokerage&apos;s profit, it is routed back
          to the people who stake $DIVS.
        </p>
      </div>

      {/* THE PROBLEM */}
      <Group eyebrow="The problem">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Panel title="Fixed hours">
            Markets open and close on someone else&apos;s schedule. Weekends and holidays, your
            position is frozen whatever the news does.
          </Panel>
          <Panel title="T+2 settlement">
            A trade that executes in milliseconds still takes two business days to settle through a
            clearinghouse.
          </Panel>
          <Panel title="Payment for order flow">
            Your order is sold to a market maker. The price you get is shaped by a deal you never
            saw.
          </Panel>
          <Panel title="Fees leave">
            Commissions, spread and interest on idle cash become profit for the brokerage&apos;s
            shareholders — not for the traders who generated them.
          </Panel>
        </div>
      </Group>

      {/* HOW IT WORKS */}
      <Group eyebrow="How it works">
        {[
          {
            n: "01",
            t: "Traders trade tokenized stocks",
            d: "Tokenized stock exposure trades on the protocol's pools, 24/7, wallet to wallet. No broker, no market hours, settlement at block time.",
          },
          {
            n: "02",
            t: "The protocol collects a fee on every trade",
            d: "Each buy and sell pays a transaction fee. Buy-side fees arrive as the traded token and are swapped to WETH; sell-side fees arrive as WETH already. Everything consolidates into a single WETH stream.",
          },
          {
            n: "03",
            t: "Stakers receive that fee stream",
            d: "The WETH is routed to the staking contract and split across everyone staking $DIVS or DIVS/WETH LP, in proportion to their weight. Staking is how you own a share of the exchange's revenue.",
          },
        ].map((s) => (
          <div
            key={s.n}
            className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-4 flex gap-4"
          >
            <div className="text-[11px] font-bold text-[#10B981] flex-shrink-0">{s.n}</div>
            <div>
              <h3 className="text-white font-semibold text-xs mb-1">{s.t}</h3>
              <p className="text-[11px] leading-relaxed text-gray-400">{s.d}</p>
            </div>
          </div>
        ))}

        <div className="bg-[#101216] border border-[#232730] rounded-2xl p-4">
          <h3 className="text-white font-semibold text-xs mb-1.5">
            One distinction worth being clear about
          </h3>
          <p className="text-[11px] leading-relaxed text-gray-400">
            You do not stake the stock tokens. Stock tokens are what gets{" "}
            <span className="text-gray-200">traded</span> on the platform. $DIVS is what you{" "}
            <span className="text-gray-200">stake</span> to receive a share of the fees those trades
            generate. Two different roles.
          </p>
        </div>
      </Group>

      {/* STAKING */}
      <Group eyebrow="Staking">
        <p className="text-[11px] leading-relaxed text-gray-400">
          Fees are split by <span className="text-gray-200">weight</span>, not by headcount. Your
          weight is your staked amount multiplied by three factors.
        </p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Panel title="What you stake">
            $DIVS single-sided, or DIVS/WETH LP tokens. LP carries a higher pool multiplier, because
            providing liquidity carries more risk than simply holding.
          </Panel>
          <Panel title="How long you lock">
            Flexible staking counts at 1x, scaling linearly up to 4x at a 52-week lock. Locked stake
            cannot be withdrawn early.
          </Panel>
          <Panel title="How much you stake">
            Position size crosses tier thresholds, each carrying its own multiplier on top of the
            other two.
          </Panel>
        </div>
        <div className="bg-[#101216] border border-[#232730] rounded-2xl p-4 overflow-x-auto">
          <p className="text-[9px] text-gray-500 mb-2">Your weight, and your claim:</p>
          <pre className="text-[10px] leading-relaxed text-gray-300">
            <code>{`weight = amount × poolMultiplier × tierMultiplier × lockMultiplier
claim  = weight × accWethPerWeight − debt`}</code>
          </pre>
        </div>
      </Group>

      {/* SUSTAINABILITY */}
      <Group eyebrow="Where the yield comes from">
        <div className="grid gap-2.5 lg:grid-cols-2">
          <div className="bg-[#10B981]/[0.04] border border-[#10B981]/30 rounded-2xl p-4">
            <h3 className="text-white font-semibold text-xs mb-2">Trading fees — the real revenue</h3>
            <p className="text-[11px] leading-relaxed text-gray-400">
              Actual WETH, collected from actual trades, already sitting in the contract before it is
              distributed. This is the part that sustains itself: it grows with volume and requires
              nobody to print anything.
            </p>
          </div>
          <Panel title="DIVS emissions — the boost">
            Additional $DIVS paid on top, to attract liquidity early while volume is still building.
            Emissions are funded in advance for a fixed period and stop when it ends. An incentive,
            not a source of value.
          </Panel>
        </div>
        <p className="text-[10px] leading-relaxed text-gray-500">
          The staking contract cannot distribute fees it has not received, and cannot promise
          emissions that have not been funded. Both are enforced in code rather than by policy.
        </p>
      </Group>

      {/* STATUS */}
      <Group eyebrow="Status">
        <div className="grid gap-2.5 lg:grid-cols-2">
          <Panel title="Built">
            <ul className="space-y-1.5">
              <li>
                The staking contract — fee distribution, lock and tier weighting, funded emission
                periods
              </li>
              <li>A test suite covering it, including fuzzed solvency invariants</li>
              <li>This dashboard shell</li>
            </ul>
          </Panel>
          <Panel title="Not built yet">
            <ul className="space-y-1.5">
              <li>The $DIVS token itself</li>
              <li>The launchpad, its pool, and the fee routing into staking</li>
              <li>A security audit, pause controls, and a multisig owner</li>
            </ul>
          </Panel>
        </div>
        <div className="bg-amber-500/[0.05] border border-amber-500/25 rounded-2xl p-4">
          <p className="text-[10px] leading-relaxed text-amber-200/70">
            Nothing is deployed and nothing is audited. Figures shown elsewhere in this dashboard are
            placeholders so the interface can be reviewed — they are not live market data, and no
            part of this is an offer or investment advice.
          </p>
        </div>
      </Group>
    </div>
  );
}
