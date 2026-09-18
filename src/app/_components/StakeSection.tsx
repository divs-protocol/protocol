"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import {
  useAccount,
  useBlockNumber,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, Info } from "lucide-react";
import {
  STAKING_ADDRESS,
  DIVS_ADDRESS,
  LP_ADDRESS,
  DIVS_POOL,
  LP_POOL,
  MAX_LOCK_WEEKS,
  lockMultiplierBps,
  stakingAbi,
  erc20Abi,
} from "@/lib/divsStaking";
import ConnectPrompt from "./ConnectPrompt";
import Footer from "./Footer";

/**
 * Stake - the protocol's utility action.
 *
 * Maps onto DivsStaking: stake with a lock, watch the weight it earns, claim
 * WETH fees and DIVS emissions, extend or exit.
 *
 * The lock maths is computed locally from the same formula the contract uses,
 * so the multiplier preview is exact whether or not anything is deployed. Every
 * position figure comes from a chain read - when no address is configured they
 * read zero rather than showing invented balances.
 */

const POOLS = [
  { id: DIVS_POOL, key: "divs", label: "DIVS", note: "Single-sided", token: DIVS_ADDRESS },
  { id: LP_POOL, key: "lp", label: "DIVS/WETH LP", note: "Higher pool weight", token: LP_ADDRESS },
] as const;

const fmt = (v: bigint | undefined, d = 18, places = 4) =>
  v === undefined
    ? "0"
    : Number(formatUnits(v, d)).toLocaleString(undefined, { maximumFractionDigits: places });

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">{label}</div>
      <div className={`font-mono text-xl ${accent ? "text-[#10B981]" : "text-white"}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#232730]">
        <span className="text-[11px] font-semibold text-white">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function StakeSection() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();

  const [poolKey, setPoolKey] = useState<"divs" | "lp">("divs");
  // Wall clock lives in state so render stays pure and the server, which has a
  // different clock, does not disagree with the first client paint.
  const [now, setNow] = useState(0);
  const [amount, setAmount] = useState("");
  const [weeks, setWeeks] = useState(26);

  const pool = POOLS.find((p) => p.key === poolKey)!;
  const live = Boolean(STAKING_ADDRESS);
  const enabled = live && isConnected && Boolean(address);

  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  /* ---------- reads ---------- */

  const { data, queryKey } = useReadContracts({
    contracts: [
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "positions", args: [DIVS_POOL, address!] },
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "positions", args: [LP_POOL, address!] },
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "pendingRewards", args: [address!] },
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "totalWeight" },
      { address: DIVS_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address!] },
      { address: LP_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address!] },
      { address: pool.token, abi: erc20Abi, functionName: "allowance", args: [address!, STAKING_ADDRESS!] },
    ],
    query: { enabled },
  });

  // The multiplier lapses and rewards accrue without the user acting, so track
  // the chain head rather than only refetching after our own transactions.
  const { data: blockNumber } = useBlockNumber({ watch: enabled });
  useEffect(() => {
    if (blockNumber) queryClient.invalidateQueries({ queryKey });
  }, [blockNumber, queryClient, queryKey]);

  const divsPos = data?.[0]?.result as readonly [bigint, bigint, bigint, number] | undefined;
  const lpPos = data?.[1]?.result as readonly [bigint, bigint, bigint, number] | undefined;
  const rewards = data?.[2]?.result as readonly [bigint, bigint] | undefined;
  const totalWeight = data?.[3]?.result as bigint | undefined;
  const divsBal = data?.[4]?.result as bigint | undefined;
  const lpBal = data?.[5]?.result as bigint | undefined;
  const allowance = data?.[6]?.result as bigint | undefined;

  const positions = [
    { ...POOLS[0], pos: divsPos, balance: divsBal },
    { ...POOLS[1], pos: lpPos, balance: lpBal },
  ];

  const myWeight = (divsPos?.[1] ?? 0n) + (lpPos?.[1] ?? 0n);
  const myStaked = (divsPos?.[0] ?? 0n) + (lpPos?.[0] ?? 0n);
  const share = totalWeight && totalWeight > 0n ? Number((myWeight * 10000n) / totalWeight) / 100 : 0;

  /* ---------- preview maths (exact, local) ---------- */

  const multiplier = lockMultiplierBps(weeks) / 10_000;
  const previewWeight = useMemo(() => {
    const n = Number(amount) || 0;
    return n * multiplier * (poolKey === "lp" ? 2 : 1);
  }, [amount, multiplier, poolKey]);

  const balance = poolKey === "divs" ? divsBal : lpBal;
  const parsed = (() => {
    try {
      return amount ? parseUnits(amount, 18) : 0n;
    } catch {
      return 0n;
    }
  })();
  const needsApproval = allowance !== undefined && parsed > 0n && allowance < parsed;

  /* ---------- writes ---------- */

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });
  const busy = isPending || isConfirming;

  /**
   * Approves exactly what is being staked, never an unlimited allowance.
   *
   * `maxUint256` here is the signature wallet drainers use, and wallet security
   * scanners classify a dApp that requests one as wallet-draining - MetaMask
   * put this site behind a "transactions designed to steal your funds" warning
   * for it. An exact approval also means a bug or a compromise of the staking
   * contract can never move more than the amount in front of the user.
   */
  const approve = () =>
    writeContract({
      address: pool.token!,
      abi: erc20Abi,
      functionName: "approve",
      args: [STAKING_ADDRESS!, parsed],
    });

  const doStake = () =>
    writeContract({
      address: STAKING_ADDRESS!,
      abi: stakingAbi,
      functionName: "stake",
      args: [pool.id, parsed, BigInt(weeks)],
    });

  const doClaim = () =>
    writeContract({ address: STAKING_ADDRESS!, abi: stakingAbi, functionName: "claim" });

  const doUnstake = (poolId: bigint, amt: bigint) =>
    writeContract({ address: STAKING_ADDRESS!, abi: stakingAbi, functionName: "unstake", args: [poolId, amt] });

  if (!isConnected) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-white font-bold tracking-tight text-xl mb-1">Stake</h2>
          <p className="text-[11px] text-gray-500">
            Stake $DIVS or DIVS/WETH LP and collect a share of every trading fee.
          </p>
        </div>
        <ConnectPrompt what="Your staking position" />
        <Footer />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-white font-bold tracking-tight text-xl mb-1">Stake</h2>
        <p className="text-[11px] text-gray-500">
          Stake $DIVS or DIVS/WETH LP and collect a share of every trading fee. Lock longer for more
          weight.
        </p>
      </div>

      {!live && (
        <div className="flex items-start gap-2.5 bg-[#14161B] border border-[#232730] rounded-2xl p-3.5">
          <Info size={14} className="text-gray-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-gray-400">
            The staking contract is not deployed yet, so balances read zero and staking is disabled.
            The lock preview below is exact - it runs the same formula the contract uses. Set{" "}
            <code className="text-[#10B981]">NEXT_PUBLIC_DIVS_STAKING_ADDRESS</code> to point this at
            a deployment.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Your stake" value={fmt(myStaked)} sub="DIVS + LP" />
        <Stat label="Your weight" value={fmt(myWeight)} sub={`${share.toFixed(2)}% of pool`} />
        <Stat label="Claimable fees" value={fmt(rewards?.[0])} sub="WETH" accent />
        <Stat label="Claimable emissions" value={fmt(rewards?.[1])} sub="DIVS" />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-3 items-start">
        {/* positions */}
        <Panel
          title="Your positions"
          right={
            <button
              onClick={doClaim}
              disabled={!live || busy || !((rewards?.[0] ?? 0n) > 0n || (rewards?.[1] ?? 0n) > 0n)}
              className="flex items-center gap-1.5 bg-[#10B981] hover:bg-[#0EA372] disabled:opacity-30 disabled:cursor-not-allowed text-black text-[10px] font-bold px-3 py-1.5 rounded-lg transition"
            >
              {busy && <Loader2 size={11} className="animate-spin" />}
              Claim all
            </button>
          }
        >
          <div className="divide-y divide-[#1F2228]">
            {positions.map((p) => {
              const amt = p.pos?.[0] ?? 0n;
              const w = p.pos?.[1] ?? 0n;
              const lockEnd = Number(p.pos?.[2] ?? 0n);
              const locked = now > 0 && lockEnd > now;
              const daysLeft = locked ? Math.ceil((lockEnd - now) / 86400) : 0;

              return (
                <div key={p.key} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[12px] text-white font-semibold">{p.label}</div>
                      <div className="text-[10px] text-gray-500">{p.note}</div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-[9px] uppercase tracking-wide text-gray-500">Staked</div>
                        <div className="font-mono text-[12px] text-white">{fmt(amt)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] uppercase tracking-wide text-gray-500">Weight</div>
                        <div className="font-mono text-[12px] text-[#10B981]">{fmt(w)}</div>
                      </div>
                      <div className="text-right min-w-[70px]">
                        <div className="text-[9px] uppercase tracking-wide text-gray-500">Lock</div>
                        <div className="font-mono text-[12px] text-gray-300 flex items-center gap-1 justify-end">
                          {locked && <Lock size={9} className="text-amber-400" />}
                          {amt === 0n ? "-" : locked ? `${daysLeft}d` : "flexible"}
                        </div>
                      </div>
                      <button
                        onClick={() => doUnstake(p.id, amt)}
                        disabled={!live || busy || amt === 0n || locked}
                        title={locked ? `Locked for ${daysLeft} more days` : undefined}
                        className="bg-[#232730] hover:bg-[#2C313B] disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-semibold px-3 py-1.5 rounded-lg transition"
                      >
                        Unstake
                      </button>
                    </div>
                  </div>
                  {amt === 0n && (
                    <p className="text-[10px] text-gray-600 mt-2">
                      No position in this pool.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>

        {/* stake form */}
        <Panel title="Stake">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-1.5 bg-[#14161B] border border-[#232730] rounded-xl p-1">
              {POOLS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPoolKey(p.key)}
                  className={`py-2 rounded-lg text-[10px] font-bold transition ${
                    poolKey === p.key ? "bg-[#10B981] text-black" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] text-gray-500">Amount</label>
                <button
                  onClick={() => balance && setAmount(formatUnits(balance, 18))}
                  className="text-[10px] text-gray-500 hover:text-[#10B981] transition font-mono"
                >
                  Balance {fmt(balance)}
                </button>
              </div>
              <div className="flex items-center bg-[#14161B] border border-[#232730] rounded-xl px-3 py-2.5">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.0"
                  inputMode="decimal"
                  className="bg-transparent text-white font-mono text-lg w-full outline-none placeholder:text-gray-600"
                />
                <span className="text-[10px] text-gray-500 font-semibold flex-shrink-0">{pool.label}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] text-gray-500">Lock</label>
                <span className="font-mono text-[10px] text-gray-400">
                  {weeks === 0 ? "flexible" : `${weeks} weeks`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={MAX_LOCK_WEEKS}
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                aria-label="Lock duration in weeks"
                className="w-full accent-[#10B981] cursor-pointer"
              />
              <div className="flex justify-between mt-1 text-[9px] text-gray-600 font-mono">
                <span>0</span>
                <span>26</span>
                <span>52</span>
              </div>
            </div>

            <div className="bg-[#14161B] border border-[#232730] rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">Lock multiplier</span>
                <span className="font-mono text-[#10B981]">{multiplier.toFixed(4)}x</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">Weight earned</span>
                <span className="font-mono text-white">
                  {previewWeight.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {error && (
              <p className="text-[10px] text-red-400 leading-relaxed">
                {error.message.split("\n")[0]}
                <button onClick={reset} className="ml-2 underline hover:text-white">
                  dismiss
                </button>
              </p>
            )}

            <button
              onClick={needsApproval ? approve : doStake}
              disabled={!live || busy || parsed === 0n}
              title={live ? undefined : "Staking contract not deployed"}
              className="w-full flex items-center justify-center gap-2 bg-[#10B981] hover:bg-[#0EA372] disabled:opacity-30 disabled:cursor-not-allowed text-black py-3 rounded-xl text-[11px] font-bold transition"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              {needsApproval ? `Approve ${pool.label}` : "Stake"}
            </button>

            <p className="text-[10px] leading-relaxed text-gray-600">
              A lock cannot be shortened. Rewards keep accruing while locked and claiming never
              touches your principal.
            </p>
          </div>
        </Panel>
      </div>

      <Footer />
    </div>
  );
}
