"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseUnits, maxUint256 } from "viem";
import {
  useAccount,
  useBlockNumber,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  VAULT_ADDRESS,
  STOCK_TOKEN_ADDRESS,
  divsVaultAbi,
  stockTokenAbi,
} from "@/lib/divsVault";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#14161B] border border-[#232730] rounded-xl px-3 py-2">
      <div className="text-[9px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-white font-mono text-sm mt-0.5">{value}</div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-[#1B1E24] border border-[#232730] rounded-2xl p-4 text-gray-400">
      <AlertTriangle size={15} className="text-[#10B981] flex-shrink-0 mt-0.5" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export default function VaultPanel() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("");

  const vault = VAULT_ADDRESS;
  const stockToken = STOCK_TOKEN_ADDRESS;
  const configured = Boolean(vault && stockToken);
  const enabled = configured && Boolean(address);

  const { data: tokenMeta, queryKey: tokenMetaKey } = useReadContracts({
    contracts: [
      { address: stockToken, abi: stockTokenAbi, functionName: "symbol" },
      { address: stockToken, abi: stockTokenAbi, functionName: "decimals" },
      { address: stockToken, abi: stockTokenAbi, functionName: "uiMultiplier" },
    ],
    query: { enabled: configured },
  });

  const symbol = tokenMeta?.[0]?.result ?? "TOKEN";
  const decimals = tokenMeta?.[1]?.result ?? 18;
  const multiplier = tokenMeta?.[2]?.result;

  const { data: position, queryKey: positionKey } = useReadContracts({
    contracts: [
      {
        address: vault,
        abi: divsVaultAbi,
        functionName: "positionValue",
        args: address && stockToken ? [stockToken, address] : undefined,
      },
      {
        address: vault,
        abi: divsVaultAbi,
        functionName: "pendingYield",
        args: address && stockToken ? [stockToken, address] : undefined,
      },
      {
        address: stockToken,
        abi: stockTokenAbi,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
      {
        address: stockToken,
        abi: stockTokenAbi,
        functionName: "allowance",
        args: address && vault ? [address, vault] : undefined,
      },
    ],
    query: { enabled },
  });

  const positionValue = position?.[0]?.result;
  const pendingYield = position?.[1]?.result;
  const walletBalance = position?.[2]?.result;
  const allowance = position?.[3]?.result;

  const { data: feeBps } = useReadContract({
    address: vault,
    abi: divsVaultAbi,
    functionName: "PROTOCOL_FEE_BPS",
    query: { enabled: configured },
  });

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });

  // Vault state changes on someone else's schedule: the multiplier rebases with
  // no action from this user, so refetching only after our own transactions
  // leaves stale numbers on screen. Watch the chain head and invalidate on each
  // new block — reads then fire exactly when state can have changed, instead of
  // on a fixed timer that is both wasteful when idle and laggy when not. Block
  // watching also keeps running while the tab is unfocused, which `refetchInterval`
  // does not.
  const queryClient = useQueryClient();
  const { data: blockNumber } = useBlockNumber({ watch: configured });

  useEffect(() => {
    if (blockNumber === undefined) return;
    void queryClient.invalidateQueries({ queryKey: tokenMetaKey });
    void queryClient.invalidateQueries({ queryKey: positionKey });
  }, [blockNumber, queryClient, tokenMetaKey, positionKey]);

  const busy = isPending || isConfirming;

  const fmt = (v: bigint | undefined) =>
    v === undefined ? "—" : `${Number(formatUnits(v, decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol}`;

  let parsedAmount: bigint | undefined;
  try {
    parsedAmount = amount.trim() ? parseUnits(amount.trim(), decimals) : undefined;
  } catch {
    parsedAmount = undefined;
  }

  const needsApproval =
    parsedAmount !== undefined && allowance !== undefined && allowance < parsedAmount;

  if (!configured) {
    return (
      <Notice>
        <span className="text-white font-semibold">Vault not configured.</span> Set{" "}
        <code className="text-[#10B981]">NEXT_PUBLIC_DIVS_VAULT_ADDRESS</code> and{" "}
        <code className="text-[#10B981]">NEXT_PUBLIC_STOCK_TOKEN_ADDRESS</code> in{" "}
        <code className="text-[#10B981]">.env.local</code> after deploying with{" "}
        <code className="text-[#10B981]">hardhat ignition deploy</code>.
      </Notice>
    );
  }

  if (!isConnected) {
    return <Notice>Connect a wallet to view your vault position.</Notice>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Position value" value={fmt(positionValue)} />
        <Stat label="Pending yield" value={fmt(pendingYield)} />
        <Stat label="Wallet balance" value={fmt(walletBalance)} />
        <Stat
          label="UI multiplier"
          value={multiplier === undefined ? "—" : Number(formatUnits(multiplier, 18)).toFixed(4)}
        />
      </div>

      <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold">Manage position</h3>
          <span className="text-[9px] text-gray-500">
            Protocol fee {feeBps === undefined ? "—" : `${Number(feeBps) / 100}%`} on harvested yield
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              reset();
            }}
            placeholder={`Amount in ${symbol}`}
            className="flex-1 bg-[#14161B] border border-[#232730] rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#10B981] font-mono"
          />
          <button
            onClick={() => setAmount(walletBalance ? formatUnits(walletBalance, decimals) : "")}
            className="px-3 py-2 bg-[#14161B] border border-[#232730] rounded-xl text-[10px] font-bold text-gray-400 hover:text-white transition"
          >
            MAX
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {needsApproval ? (
            <button
              disabled={busy || !stockToken || !vault}
              onClick={() =>
                writeContract({
                  address: stockToken!,
                  abi: stockTokenAbi,
                  functionName: "approve",
                  args: [vault!, maxUint256],
                })
              }
              className="col-span-2 py-2 bg-[#10B981] text-black font-bold rounded-xl text-[11px] hover:bg-[#0EA5E9] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Approve {symbol}
            </button>
          ) : (
            <button
              disabled={busy || parsedAmount === undefined || parsedAmount === 0n}
              onClick={() =>
                writeContract({
                  address: vault!,
                  abi: divsVaultAbi,
                  functionName: "deposit",
                  args: [stockToken!, parsedAmount!],
                })
              }
              className="col-span-2 py-2 bg-[#10B981] text-black font-bold rounded-xl text-[11px] hover:bg-[#0EA5E9] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Deposit
            </button>
          )}

          <button
            disabled={busy || !pendingYield}
            onClick={() =>
              writeContract({
                address: vault!,
                abi: divsVaultAbi,
                functionName: "harvest",
                args: [stockToken!],
              })
            }
            className="py-2 bg-[#14161B] border border-[#10B981] text-[#10B981] rounded-xl text-[11px] font-bold hover:bg-[#10B981]/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Harvest
          </button>

          <button
            disabled={busy || !positionValue}
            onClick={() =>
              writeContract({
                address: vault!,
                abi: divsVaultAbi,
                functionName: "withdraw",
                args: [stockToken!],
              })
            }
            className="py-2 bg-[#14161B] border border-[#232730] text-gray-300 rounded-xl text-[11px] font-bold hover:border-red-500 hover:text-red-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Withdraw all
          </button>
        </div>

        {busy && (
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            <Loader2 size={12} className="animate-spin" />
            {isPending ? "Confirm in your wallet…" : "Waiting for confirmation…"}
          </div>
        )}
        {error && (
          <div className="text-[10px] text-red-400 break-words">
            {error.message.split("\n")[0]}
          </div>
        )}
      </div>
    </div>
  );
}
