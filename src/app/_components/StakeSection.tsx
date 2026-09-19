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
import { Loader2, Lock, Info, Copy, Check, ExternalLink } from "lucide-react";
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

const EXPLORER = "https://robinhoodchain.blockscout.com";

/** One figure in the vault-wide panels. */
function Tile({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-xl p-3.5">
      <div className="text-[10px] text-gray-500 mb-1.5">{label}</div>
      <div className={`font-mono text-lg ${accent ? "text-[#10B981]" : "text-white"}`}>{value}</div>
      {unit && <div className="text-[10px] text-gray-600 mt-1">{unit}</div>}
    </div>
  );
}

/**
 * An address with the two things anyone would want to do with one.
 *
 * Shown even when unset, because "not deployed yet" is information and an
 * absent row would just look like an oversight.
 */
function AddressRow({ label, value }: { label: string; value?: `0x${string}` }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable, the address is on screen to read */
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1F2228] last:border-0">
      <span className="text-[11px] text-gray-400 w-[124px] flex-shrink-0">{label}</span>

      {value ? (
        <>
          <span className="font-mono text-[11px] text-white truncate flex-1 min-w-0">{value}</span>
          <button
            onClick={copy}
            aria-label={`Copy ${label}`}
            className="text-gray-500 hover:text-[#10B981] transition p-1 flex-shrink-0"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <a
            href={`${EXPLORER}/address/${value}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`${label} on the explorer`}
            className="text-gray-500 hover:text-[#10B981] transition p-1 flex-shrink-0"
          >
            <ExternalLink size={13} />
          </a>
        </>
      ) : (
        <span className="text-[11px] text-gray-600 flex-1">Not deployed yet</span>
      )}
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
  /**
   * Which side of the form is showing.
   *
   * Withdrawing used to be a small button at the end of a position row that
   * pulled the entire stake in one click, with nothing to confirm and no way to
   * take out part of it. The contract has always accepted an amount; only the
   * interface insisted on all of it.
   */
  const [mode, setMode] = useState<"stake" | "withdraw" | null>(null);
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
      // Vault-wide, not this wallet's. These describe what everyone is staked
      // into and what is waiting to be paid out of it.
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "totalStakedDivs" },
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "emissionReserve" },
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "unallocatedFees" },
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "emissionsFunded" },
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "emissionsAccrued" },
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "periodFinish" },
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "pools", args: [DIVS_POOL] },
      { address: STAKING_ADDRESS, abi: stakingAbi, functionName: "pools", args: [LP_POOL] },
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

  const totalStaked = data?.[7]?.result as bigint | undefined;
  const emissionReserve = data?.[8]?.result as bigint | undefined;
  const unallocatedFees = data?.[9]?.result as bigint | undefined;
  const emissionsFunded = data?.[10]?.result as bigint | undefined;
  const emissionsAccrued = data?.[11]?.result as bigint | undefined;
  const periodFinish = data?.[12]?.result as bigint | undefined;
  const divsPool = data?.[13]?.result as readonly [string, bigint, boolean] | undefined;
  const lpPool = data?.[14]?.result as readonly [string, bigint, boolean] | undefined;

  const emissionsLeft =
    emissionsFunded !== undefined && emissionsAccrued !== undefined
      ? emissionsFunded - emissionsAccrued
      : undefined;

  /** Seconds until the funded emission period runs out, or zero once it has. */
  const emissionsEndIn =
    periodFinish !== undefined && now > 0 && Number(periodFinish) > now
      ? Number(periodFinish) - now
      : 0;

  const positions = [
    { ...POOLS[0], pos: divsPos, balance: divsBal },
    { ...POOLS[1], pos: lpPos, balance: lpBal },
  ];

  const myWeight = (divsPos?.[1] ?? 0n) + (lpPos?.[1] ?? 0n);
  const myStaked = (divsPos?.[0] ?? 0n) + (lpPos?.[0] ?? 0n);
  const hasRewards = (rewards?.[0] ?? 0n) > 0n || (rewards?.[1] ?? 0n) > 0n;
  const share = totalWeight && totalWeight > 0n ? Number((myWeight * 10000n) / totalWeight) / 100 : 0;

  /* ---------- preview maths (exact, local) ---------- */

  const multiplier = lockMultiplierBps(weeks) / 10_000;
  const previewWeight = useMemo(() => {
    const n = Number(amount) || 0;
    return n * multiplier * (poolKey === "lp" ? 2 : 1);
  }, [amount, multiplier, poolKey]);

  const walletBalance = poolKey === "divs" ? divsBal : lpBal;
  const activePos = poolKey === "divs" ? divsPos : lpPos;
  const stakedHere = activePos?.[0] ?? 0n;
  const lockEndsAt = Number(activePos?.[2] ?? 0n);
  const lockedHere = now > 0 && lockEndsAt > now;
  const lockDaysLeft = lockedHere ? Math.ceil((lockEndsAt - now) / 86400) : 0;

  /** Stake is capped by the wallet, withdraw by what is already in the pool. */
  const balance = mode === "stake" ? walletBalance : stakedHere;

  const parsed = (() => {
    try {
      return amount ? parseUnits(amount, 18) : 0n;
    } catch {
      return 0n;
    }
  })();
  const needsApproval =
    mode === "stake" && allowance !== undefined && parsed > 0n && allowance < parsed;

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

  const doWithdraw = () =>
    writeContract({
      address: STAKING_ADDRESS!,
      abi: stakingAbi,
      functionName: "unstake",
      args: [pool.id, parsed],
    });

  const openForm = (next: "stake" | "withdraw") => {
    setMode(next);
    setAmount("");
    reset();
  };

  const closeForm = () => {
    setMode(null);
    setAmount("");
    reset();
  };

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

      {/*
        One card, the way DARK does it: what you have, what you can collect,
        and the two things you can do. The detail that makes DIVS different,
        two pools and a lock that earns weight, belongs inside the action and
        not in front of someone who has not chosen one yet.
      */}
      <div className="bg-[#14161B] border border-[#232730] rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="text-[13px] font-semibold text-white">Your position</span>
          <span className="text-[11px] text-gray-500">
            {myStaked > 0n ? `${share.toFixed(2)}% of total weight` : "Nothing staked yet"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="bg-[#1B1E24] border border-[#232730] rounded-xl p-4">
            <div className="text-[11px] text-gray-500 mb-1.5">Staked</div>
            <div className="font-mono text-2xl text-white">{fmt(myStaked)}</div>
            <div className="text-[10px] text-gray-600 mt-1">DIVS and LP</div>
          </div>

          <div className="bg-[#1B1E24] border border-[#232730] rounded-xl p-4">
            <div className="text-[11px] text-gray-500 mb-1.5">Share of pool</div>
            <div className="font-mono text-2xl text-white">{share.toFixed(2)}%</div>
            <div className="text-[10px] text-gray-600 mt-1">{fmt(myWeight)} weight</div>
          </div>

          <div className="bg-[#1B1E24] border border-[#232730] rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-gray-500 mb-1.5">Claimable</div>
              <div className="font-mono text-2xl text-[#10B981]">{fmt(rewards?.[0])}</div>
              <div className="text-[10px] text-gray-600 mt-1">
                WETH{(rewards?.[1] ?? 0n) > 0n ? ` and ${fmt(rewards?.[1])} DIVS` : ""}
              </div>
            </div>
            <button
              onClick={doClaim}
              disabled={!live || busy || !hasRewards}
              title={hasRewards ? undefined : "Nothing to claim yet"}
              className="flex items-center gap-1.5 bg-[#10B981] hover:bg-[#0EA372] disabled:opacity-25 disabled:cursor-not-allowed text-black text-[11px] font-bold px-4 py-2 rounded-lg transition flex-shrink-0"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              Claim
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => openForm("stake")}
            disabled={!live}
            className="px-7 py-3 rounded-xl text-[13px] font-bold transition disabled:opacity-30 disabled:cursor-not-allowed bg-[#10B981] hover:bg-[#0EA372] text-black"
          >
            Stake
          </button>
          <button
            onClick={() => openForm("withdraw")}
            disabled={!live || myStaked === 0n}
            title={myStaked === 0n ? "Nothing staked to withdraw" : undefined}
            className="px-7 py-3 rounded-xl text-[13px] font-bold transition disabled:opacity-30 disabled:cursor-not-allowed bg-[#232730] hover:bg-[#2C313B] text-white"
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* The form exists only once one of those two has been chosen. */}
      {mode && (
        <Panel
          title={mode === "stake" ? "Stake" : "Withdraw"}
          right={
            <button
              onClick={closeForm}
              className="text-[10px] text-gray-500 hover:text-white transition"
            >
              Close
            </button>
          }
        >
          <div className="p-4 space-y-4 max-w-md">
            <div>
              <div className="text-[10px] text-gray-500 mb-1.5">Pool</div>
              <div className="grid grid-cols-2 gap-1.5 bg-[#14161B] border border-[#232730] rounded-xl p-1">
                {POOLS.map((pl) => (
                  <button
                    key={pl.key}
                    onClick={() => {
                      setPoolKey(pl.key);
                      setAmount("");
                    }}
                    className={`py-2 rounded-lg text-[10px] font-bold transition ${
                      poolKey === pl.key ? "bg-[#10B981] text-black" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {pl.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] text-gray-500">Amount</label>
                <button
                  onClick={() => balance && setAmount(formatUnits(balance, 18))}
                  className="text-[10px] text-gray-500 hover:text-[#10B981] transition font-mono"
                >
                  {mode === "stake" ? "Balance" : "Staked"} {fmt(balance)}
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
                <span className="text-[10px] text-gray-500 font-semibold flex-shrink-0">
                  {pool.label}
                </span>
              </div>
            </div>

            {mode === "stake" && (
              <>
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
              </>
            )}

            {mode === "withdraw" && (
              <div className="bg-[#14161B] border border-[#232730] rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">Staked in this pool</span>
                  <span className="font-mono text-white">{fmt(stakedHere)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">Left after this</span>
                  <span className="font-mono text-white">
                    {fmt(parsed > stakedHere ? 0n : stakedHere - parsed)}
                  </span>
                </div>
                {lockedHere && (
                  <p className="flex items-start gap-1.5 text-[10px] text-amber-400 leading-relaxed pt-1">
                    <Lock size={10} className="mt-0.5 flex-shrink-0" />
                    Locked for {lockDaysLeft} more {lockDaysLeft === 1 ? "day" : "days"}. A lock
                    cannot be shortened, so nothing comes out until it ends.
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="text-[10px] text-red-400 leading-relaxed">
                {error.message.split("\n")[0]}
                <button onClick={reset} className="ml-2 underline hover:text-white">
                  dismiss
                </button>
              </p>
            )}

            {parsed > (balance ?? 0n) && (
              <p className="text-[10px] text-amber-400">
                {mode === "stake"
                  ? "More than the wallet holds."
                  : "More than is staked in this pool."}
              </p>
            )}

            <button
              onClick={mode === "withdraw" ? doWithdraw : needsApproval ? approve : doStake}
              disabled={
                !live ||
                busy ||
                parsed === 0n ||
                parsed > (balance ?? 0n) ||
                (mode === "withdraw" && lockedHere)
              }
              className={`w-full flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed py-3 rounded-xl text-[12px] font-bold transition ${
                mode === "withdraw"
                  ? "bg-[#232730] hover:bg-[#2C313B] text-white"
                  : "bg-[#10B981] hover:bg-[#0EA372] text-black"
              }`}
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              {mode === "withdraw"
                ? `Withdraw ${pool.label}`
                : needsApproval
                  ? `Approve ${pool.label}`
                  : `Stake ${pool.label}`}
            </button>

            <p className="text-[10px] leading-relaxed text-gray-600">
              {mode === "stake"
                ? "A lock cannot be shortened. Rewards keep accruing while locked, and claiming never touches your principal."
                : "Only the amount entered comes out. Rewards stay claimable and are not touched by this."}
            </p>
          </div>
        </Panel>
      )}

      {/* The per-pool breakdown, for anyone who wants it. */}
      {myStaked > 0n && (
        <Panel title="By pool">
          <div className="divide-y divide-[#1F2228]">
            {positions.map((pl) => {
              const amt = pl.pos?.[0] ?? 0n;
              const w = pl.pos?.[1] ?? 0n;
              const lockEnd = Number(pl.pos?.[2] ?? 0n);
              const locked = now > 0 && lockEnd > now;
              const daysLeft = locked ? Math.ceil((lockEnd - now) / 86400) : 0;
              if (amt === 0n) return null;

              return (
                <div
                  key={pl.key}
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-[12px] text-white font-semibold">{pl.label}</div>
                    <div className="text-[10px] text-gray-500">{pl.note}</div>
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
                    <div className="text-right min-w-[64px]">
                      <div className="text-[9px] uppercase tracking-wide text-gray-500">Lock</div>
                      <div className="font-mono text-[12px] text-gray-300 flex items-center gap-1 justify-end">
                        {locked && <Lock size={9} className="text-amber-400" />}
                        {locked ? `${daysLeft}d` : "flexible"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}


      {/*
        The vault, not the visitor. Every figure here is plain public state on
        DivsStaking, so none of it needs an indexer and none of it is an
        estimate. Until the contract is deployed they all read zero, which is
        the honest number rather than a placeholder.
      */}
      <Panel
        title="Network"
        right={
          <span className="font-mono text-[10px] text-gray-500">
            {live ? "live from the vault" : "not deployed"}
          </span>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          <Tile label="Total staked" value={fmt(totalStaked)} unit="DIVS" />
          <Tile label="Total weight" value={fmt(totalWeight)} unit="what fees divide by" />
          <Tile
            label="Your share"
            value={`${share.toFixed(2)}%`}
            unit={myStaked > 0n ? "of total weight" : "nothing staked"}
            accent={myStaked > 0n}
          />
          <Tile label="Fees waiting" value={fmt(unallocatedFees)} unit="WETH, unallocated" />
          <Tile label="Emission reserve" value={fmt(emissionReserve)} unit="DIVS held for rewards" />
          <Tile
            label="Emissions left"
            value={fmt(emissionsLeft)}
            unit={
              emissionsEndIn > 0
                ? `${Math.ceil(emissionsEndIn / 86400)}d of funding left`
                : "no period funded"
            }
          />
        </div>
      </Panel>

      {/*
        What each pool weighs, and the addresses behind all of it.

        The addresses matter more than the numbers. Nowhere else on this site
        can someone see which contract they are about to approve tokens to, and
        "here is the address, go and check it" is the only claim a protocol can
        make that the reader can verify for themselves.
      */}
      <Panel title="Pool">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
          <Tile
            label="DIVS pool"
            // The owner can change a pool multiplier, so an unreadable one is
            // unknown rather than the value it was deployed with.
            value={divsPool ? `${(Number(divsPool[1]) / 10_000).toFixed(2)}x` : "—"}
            unit="pool multiplier"
          />
          <Tile
            label="LP pool"
            value={lpPool ? `${(Number(lpPool[1]) / 10_000).toFixed(2)}x` : "—"}
            unit="pool multiplier"
          />
          <Tile label="Max lock" value={`${MAX_LOCK_WEEKS}w`} unit="one year" />
          <Tile label="Max boost" value="4.00x" unit="at the full lock" accent />
        </div>

        <div className="border-t border-[#232730]">
          <AddressRow label="Staking contract" value={STAKING_ADDRESS} />
          <AddressRow label="Staked token" value={DIVS_ADDRESS} />
          <AddressRow label="LP token" value={LP_ADDRESS} />
        </div>
      </Panel>

      <Footer />
    </div>
  );
}
