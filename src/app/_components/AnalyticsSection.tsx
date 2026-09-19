"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compact, num, usd, useProtocolStats, useStaking } from "@/lib/live";
import Footer from "./Footer";
import { InsiderFeedPanel } from "./InsiderPanel";
import AnalyticsHero from "./AnalyticsHero";
import MarketHeatmap from "./MarketHeatmap";
import { SessionSummary, Trending, WhatsMoving } from "./SessionPanels";
import SectorPanels from "./SectorPanels";

/**
 * Analytics - the protocol view.
 *
 * Two halves with different sources. The exchange half is read from the pools:
 * what traded, what it paid in fees, and which markets produced it. The
 * staking half comes from DivsStaking, which is not deployed yet - rather than
 * standing in numbers for it, that panel reports what the chain says and fills
 * in on its own once the contract exists.
 */


const TOOLTIP = {
  background: "#14161B",
  border: "1px solid #232730",
  borderRadius: 10,
  fontSize: 11,
};

function Stat({
  label,
  value,
  sub,
  accent,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">{label}</div>
      <div className={`font-mono text-xl ${accent ? "text-[#10B981]" : "text-white"}`}>
        {loading ? <span className="text-gray-600">···</span> : value}
      </div>
      {sub && <div className="text-[10px] text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}

function Panel({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#232730]">
        <span className="text-[11px] font-semibold text-white">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function AnalyticsSection() {
  const { markets, volume, fees, tvl, txns, buys, sells, byFees, window, loading } =
    useProtocolStats();
  const { staking } = useStaking();

  const win = window || "…";
  const feeRate = volume ? (fees / volume) * 100 : 0;
  const buyShare = buys + sells ? buys / (buys + sells) : 0.5;

  // Pool fees are concentrated in a handful of markets; a chart of every one
  // is mostly empty bars, so this shows the ones that produced it.
  const chartData = useMemo(
    () => byFees.filter((m) => m.fees > 0).slice(0, 10),
    [byFees],
  );

  const byVolume = useMemo(
    () => markets.slice().sort((a, b) => b.volume - a.volume).slice(0, 8),
    [markets],
  );

  return (
    <div className="space-y-4">
      <AnalyticsHero
        markets={markets}
        volume={volume}
        fees={fees}
        tvl={tvl}
        txns={txns}
        feeRate={feeRate}
        win={win}
        loading={loading}
      />

      {/* the sentence first: what happened, and which markets caused it */}
      <SessionSummary
        markets={markets}
        volume={volume}
        fees={fees}
        tvl={tvl}
        txns={txns}
        win={win}
        loading={loading}
      />

      <WhatsMoving markets={markets} win={win} loading={loading} />

      <Trending markets={markets} win={win} />

      {/* where the fees came from */}
      <MarketHeatmap markets={markets} loading={loading} />

      <SectorPanels markets={markets} win={win} />

      <Panel
        title="Pool fees by market"
        right={<span className="font-mono text-[10px] text-gray-500">last {win}</span>}
      >
        <div className="h-[260px] p-4 pt-5">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 4, bottom: 0, left: 4 }}>
                <XAxis
                  dataKey="ticker"
                  tick={{ fill: "#5A6068", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#5A6068", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v: number) => compact(v)}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  contentStyle={TOOLTIP}
                  labelStyle={{ color: "#9A9FA8" }}
                  formatter={(v) => [usd(Number(v)), "Fees"] as [string, string]}
                />
                <Bar dataKey="fees" radius={[4, 4, 0, 0]}>
                  {chartData.map((m, i) => (
                    <Cell key={m.ticker} fill="#10B981" fillOpacity={1 - i * 0.07} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-[11px] text-gray-600">
              {loading ? "Reading the pools…" : "No fees in this window."}
            </div>
          )}
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-3 items-start">
        {/* fee share */}
        <Panel title="Share of pool fees">
          <div className="p-4 space-y-3">
            {byFees.filter((m) => m.fees > 0).slice(0, 8).map((m) => (
              <div key={m.ticker}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[11px] text-white font-semibold">
                    {m.ticker}
                    <span className="text-gray-600 font-normal ml-2 text-[10px]">{m.name}</span>
                  </span>
                  <span className="font-mono text-[11px] text-[#10B981]">
                    {compact(m.fees)}
                    <span className="text-gray-600 ml-2">{(m.share * 100).toFixed(1)}%</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#14161B] overflow-hidden">
                  <div
                    className="h-full bg-[#10B981] rounded-full"
                    style={{ width: `${m.share * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {!byFees.some((m) => m.fees > 0) && (
              <div className="py-8 text-center text-[11px] text-gray-600">
                {loading ? "Reading the pools…" : "No fees in this window."}
              </div>
            )}
          </div>
        </Panel>

        {/* direction and volume */}
        <Panel title="Order flow">
          <div className="p-4">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[11px] text-gray-400">Buys vs sells</span>
              <span className="font-mono text-[11px]">
                <span className="text-[#10B981]">{num(buys)}</span>
                <span className="text-gray-600"> / </span>
                <span className="text-red-400">{num(sells)}</span>
              </span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-[#14161B] mb-5">
              <div className="bg-[#10B981]" style={{ width: `${buyShare * 100}%` }} />
              <div className="bg-red-500 flex-1" />
            </div>

            <div className="text-[11px] text-gray-400 mb-2">Volume by market</div>
            {byVolume.map((m) => {
              const share = volume ? m.volume / volume : 0;
              return (
                <div
                  key={m.ticker}
                  className="flex items-center justify-between py-2 border-b border-[#1F2228] last:border-0"
                >
                  <span className="text-[11px] text-white font-semibold w-16">{m.ticker}</span>
                  <span className="flex-1 h-1.5 rounded-full bg-[#14161B] overflow-hidden mx-3">
                    <span
                      className="block h-full rounded-full bg-[#38BDF8]"
                      style={{ width: `${share * 100}%` }}
                    />
                  </span>
                  <span className="font-mono text-[11px] text-gray-300 w-20 text-right">
                    {compact(m.volume)}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* the only panel here that reads the companies rather than their pools */}
      <InsiderFeedPanel />

      {/*
        Staking figures appear once there is a contract to read them from. An
        empty panel explaining why it is empty is a note to ourselves, not
        something a visitor needs.
      */}
      {staking?.deployed && (
        <Panel
          title="Staking"
          right={
            <span className="text-[9px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/25">
              Live
            </span>
          }
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
            <Stat
              label="Staked DIVS"
              value={num(staking.totalStakedDivs, 0)}
              sub="principal, both pools"
            />
            <Stat
              label="Total weight"
              value={num(staking.totalWeight, 0)}
              sub="what fees divide by"
            />
            <Stat
              label="Average boost"
              value={
                staking.totalStakedDivs
                  ? `${(staking.totalWeight / staking.totalStakedDivs).toFixed(2)}x`
                  : "—"
              }
              sub="weight over stake"
            />
            <Stat
              label="Emission budget"
              value={num(staking.emissionsFunded, 0)}
              sub={`${num(staking.emissionsAccrued, 0)} accrued`}
            />
          </div>
        </Panel>
      )}

      <Footer />
    </div>
  );
}
