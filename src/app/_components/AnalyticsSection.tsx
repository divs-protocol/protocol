"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import {
  FEE_WINDOWS,
  type FeeWindow,
  feeHistory,
  cumulativeFees,
  cumulativeEmissions,
  totalFees24h,
  totalVolume24h,
  totalLiquidity,
  LOCK_BUCKETS,
  totalStaked,
  totalWeight,
  avgLockWeeks,
  POOL_SPLIT,
  STAKERS,
  EMISSIONS,
  topMarketsByFees,
} from "@/lib/analytics";
import { compact, num } from "@/lib/markets";
import Footer from "./Footer";

/**
 * Analytics - the protocol view.
 *
 * Where fees come from, where they go, and how stake is distributed. The
 * distinction it exists to make: fee revenue is earned, emissions are spent.
 */

function Panel({
  title,
  children,
  right,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-[#1B1E24] border border-[#232730] rounded-2xl ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#232730]">
        <span className="text-[11px] font-semibold text-white">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">{label}</div>
      <div className={`font-mono text-xl ${accent ? "text-[#10B981]" : "text-white"}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}

const tooltipStyle = {
  background: "#14161B",
  border: "1px solid #232730",
  borderRadius: 10,
  fontSize: 11,
};

export default function AnalyticsSection() {
  const [win, setWin] = useState<FeeWindow>("30D");
  const days = useMemo(() => feeHistory(win), [win]);

  const feesTotal = cumulativeFees(days);
  const emissionsTotal = cumulativeEmissions(days);
  const selfFunded = feesTotal / (feesTotal + emissionsTotal);

  const poolTotal = POOL_SPLIT.reduce((s, p) => s + p.staked, 0);

  const lockData = LOCK_BUCKETS.map((b) => ({
    label: b.label,
    Staked: b.staked,
    Weight: b.staked * b.multiplier,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-bold tracking-tight text-xl mb-1">Analytics</h2>
        <p className="text-[11px] text-gray-500">
          Where fees come from, where they go, and how stake is distributed.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Fees to stakers 24h" value={compact(totalFees24h)} accent sub="paid in WETH" />
        <Stat label="Volume 24h" value={compact(totalVolume24h)} sub="across all markets" />
        <Stat label="Staked" value={`${num(totalStaked / 1_000_000, 2)}M`} sub="DIVS + LP" />
        <Stat label="Total weight" value={`${num(totalWeight / 1_000_000, 2)}M`} sub="what fees divide by" />
        <Stat label="Stakers" value={num(STAKERS)} sub={`avg lock ${avgLockWeeks.toFixed(1)}w`} />
      </div>

      {/* revenue vs emissions */}
      <Panel
        title="Fees earned vs emissions spent"
        right={
          <div className="flex items-center gap-1">
            {FEE_WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setWin(w)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition ${
                  win === w ? "bg-[#10B981] text-black" : "text-gray-400 hover:text-white"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        }
      >
        <div className="px-4 pt-4 pb-2 grid sm:grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Fees earned</div>
            <div className="font-mono text-lg text-[#10B981]">{compact(feesTotal)}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Emissions spent</div>
            <div className="font-mono text-lg text-[#3B82F6]">{compact(emissionsTotal)}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Self-funded</div>
            <div className="font-mono text-lg text-white">{(selfFunded * 100).toFixed(1)}%</div>
          </div>
        </div>

        <div className="h-[240px] px-2 pb-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="feeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="emFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="d" tick={{ fill: "#5A6068", fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={26} />
              <YAxis
                tick={{ fill: "#5A6068", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={(v: number) => compact(v)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: "#9A9FA8" }}
                formatter={(v, n) => [compact(Number(v)), String(n)] as [string, string]}
              />
              <Legend wrapperStyle={{ fontSize: 10, color: "#9A9FA8" }} iconType="plainline" />
              <Area type="monotone" dataKey="fees" name="Fees earned" stroke="#10B981" strokeWidth={1.6} fill="url(#feeFill)" />
              <Area type="monotone" dataKey="emissions" name="Emissions spent" stroke="#3B82F6" strokeWidth={1.6} fill="url(#emFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-3 items-start">
        {/* fee sources */}
        <Panel title="Top markets by fees (24h)">
          <div className="p-4 space-y-3">
            {topMarketsByFees.map((m) => (
              <div key={m.ticker}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[11px] text-white font-semibold">
                    {m.ticker}
                    <span className="text-gray-600 font-normal ml-2 text-[10px]">{m.name}</span>
                  </span>
                  <span className="font-mono text-[11px] text-[#10B981]">{compact(m.fees24h)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#14161B] overflow-hidden">
                  <div
                    className="h-full bg-[#10B981] rounded-full"
                    style={{ width: `${(m.share / topMarketsByFees[0].share) * 100}%`, opacity: 0.4 + m.share * 2 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* lock distribution */}
        <Panel title="Stake by lock length">
          <div className="h-[300px] p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lockData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tick={{ fill: "#5A6068", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: "#5A6068", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`}
                />
                <Tooltip
                  cursor={{ fill: "#ffffff08" }}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "#9A9FA8" }}
                  formatter={(v, n) => [`${num(Number(v) / 1_000_000, 2)}M`, String(n)] as [string, string]}
                />
                <Legend wrapperStyle={{ fontSize: 10, color: "#9A9FA8" }} />
                <Bar dataKey="Staked" fill="#232730" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Weight" fill="#10B981" radius={[3, 3, 0, 0]}>
                  {lockData.map((_, i) => (
                    <Cell key={i} fillOpacity={0.45 + i * 0.13} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="px-4 pb-4 text-[10px] text-gray-600">
            Longer locks carry more weight than principal, which is how commitment is rewarded.
          </div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-3 items-start">
        {/* pool split */}
        <Panel title="Stake by pool">
          <div className="p-4">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-[#14161B] mb-4">
              {POOL_SPLIT.map((p) => (
                <div key={p.label} style={{ width: `${(p.staked / poolTotal) * 100}%`, background: p.color }} />
              ))}
            </div>
            {POOL_SPLIT.map((p) => (
              <div key={p.label} className="flex items-center justify-between py-2 border-b border-[#1F2228] last:border-0">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                  <span className="text-[11px] text-white">{p.label}</span>
                  <span className="text-[9px] text-gray-600 font-mono">{p.multiplier}x</span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[11px] text-white">{num(p.staked / 1_000_000, 2)}M</div>
                  <div className="text-[9px] text-gray-600">{((p.staked / poolTotal) * 100).toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* emissions */}
        <Panel title="Emission period">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Rate</div>
                <div className="font-mono text-base text-white">{num(EMISSIONS.ratePerDay)}</div>
                <div className="text-[9px] text-gray-600">DIVS / day</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Ends in</div>
                <div className="font-mono text-base text-white">{EMISSIONS.daysRemaining} days</div>
                <div className="text-[9px] text-gray-600">unless renewed</div>
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[10px] text-gray-500">Budget distributed</span>
                <span className="font-mono text-[11px] text-white">
                  {num(EMISSIONS.distributed / 1_000_000, 2)}M / {num(EMISSIONS.funded / 1_000_000, 2)}M
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#14161B] overflow-hidden">
                <div
                  className="h-full bg-[#3B82F6] rounded-full"
                  style={{ width: `${(EMISSIONS.distributed / EMISSIONS.funded) * 100}%` }}
                />
              </div>
            </div>

            <p className="text-[10px] leading-relaxed text-gray-500">
              Emissions accrue only while a period is funded and stop at its end. Fee revenue is
              unaffected either way, so the fee line is the one that shows what the protocol earns
              on its own.
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Liquidity" value={compact(totalLiquidity)} sub="across all pools" />
        <Stat label="Avg lock" value={`${avgLockWeeks.toFixed(1)}w`} sub="stake weighted" />
        <Stat label="Weight / stake" value={`${(totalWeight / totalStaked).toFixed(2)}x`} sub="average boost" />
        <Stat label="Fee / volume" value={`${((totalFees24h / totalVolume24h) * 100).toFixed(3)}%`} sub="effective rate" />
      </div>

      <Footer />
    </div>
  );
}
