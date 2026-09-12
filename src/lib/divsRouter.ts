"use client";

import { useCallback, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { robinhood } from "wagmi/chains";
import { WETH, wethPerShare, type Market } from "./exchange";

/**
 * Binding for DivsRouter.sol.
 *
 * The address comes from the environment because nothing is deployed yet. When
 * it is unset the trade panels still render live prices and quotes, but the
 * submit button says so rather than failing when tapped.
 */

const addr = (v: string | undefined) =>
  v && /^0x[a-fA-F0-9]{40}$/.test(v) ? (v as `0x${string}`) : undefined;

export const ROUTER_ADDRESS = addr(process.env.NEXT_PUBLIC_DIVS_ROUTER_ADDRESS);

export const routerAbi = [
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pool", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "buyWithETH",
    stateMutability: "payable",
    inputs: [
      { name: "pool", type: "address" },
      { name: "amountOutMin", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pool", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "unwrap", type: "bool" },
    ],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "pendingFees", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** The router's default, mirrored here so a quote can be shown before a wallet connects. */
export const DEFAULT_FEE_BPS = 10;

export const SLIPPAGE_OPTIONS = [0.1, 0.5, 1] as const;

/**
 * Shares received for an amount of WETH, after the protocol fee.
 *
 * The pool's marginal price, so it ignores the price impact of the trade
 * itself - which is why the submitted minimum is this figure less slippage
 * rather than this figure.
 */
export function quoteBuy(m: Market, sqrtPriceX96: bigint, wethIn: number, feeBps = DEFAULT_FEE_BPS) {
  const price = wethPerShare(m, sqrtPriceX96);
  if (!price) return 0;
  return (wethIn * (1 - feeBps / 10_000)) / price;
}

/** WETH received for a number of shares, after the protocol fee. */
export function quoteSell(m: Market, sqrtPriceX96: bigint, shares: number, feeBps = DEFAULT_FEE_BPS) {
  const price = wethPerShare(m, sqrtPriceX96);
  return shares * price * (1 - feeBps / 10_000);
}

const toWei = (n: number) => BigInt(Math.floor(n * 1e18));

export type TradeStatus = "idle" | "approving" | "pending" | "confirming" | "done" | "error";

/**
 * Buying and selling through the router.
 *
 * Buys take the native-ETH path: the router wraps on the way in, so a purchase
 * is one transaction with no approval. Sells move a stock token, so they need
 * an allowance first, and that is only requested when the current one is too
 * small.
 */
export function useRouterTrade() {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: robinhood.id });
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<TradeStatus>("idle");
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | undefined>();

  const ready = Boolean(ROUTER_ADDRESS && address && client);

  const reset = useCallback(() => {
    setStatus("idle");
    setHash(undefined);
    setError(undefined);
  }, []);

  /** Turns a revert into the contract's own reason, which is the useful half. */
  const fail = useCallback((e: unknown) => {
    const raw = e instanceof Error ? e.message : String(e);
    const known = [
      "Too little received",
      "Zero amount",
      "No output",
      "Unexpected callback",
      "User rejected",
      "insufficient funds",
    ].find((m) => raw.includes(m));
    setError(known ?? "Transaction failed");
    setStatus("error");
  }, []);

  const buy = useCallback(
    async (market: Market, wethIn: number, minSharesOut: number) => {
      if (!ROUTER_ADDRESS || !address || !client) return;
      reset();
      try {
        setStatus("pending");
        const tx = await writeContractAsync({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "buyWithETH",
          args: [market.pool, toWei(minSharesOut), address],
          value: toWei(wethIn),
          chainId: robinhood.id,
        });
        setHash(tx);
        setStatus("confirming");
        await client.waitForTransactionReceipt({ hash: tx });
        setStatus("done");
      } catch (e) {
        fail(e);
      }
    },
    [address, client, writeContractAsync, reset, fail],
  );

  const sell = useCallback(
    async (market: Market, shares: number, minWethOut: number, unwrap = true) => {
      if (!ROUTER_ADDRESS || !address || !client) return;
      reset();
      const amount = toWei(shares);
      try {
        const allowance = await client.readContract({
          address: market.token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, ROUTER_ADDRESS],
        });

        if (allowance < amount) {
          setStatus("approving");
          const approval = await writeContractAsync({
            address: market.token,
            abi: erc20Abi,
            functionName: "approve",
            args: [ROUTER_ADDRESS, amount],
            chainId: robinhood.id,
          });
          await client.waitForTransactionReceipt({ hash: approval });
        }

        setStatus("pending");
        const tx = await writeContractAsync({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "sell",
          args: [market.pool, amount, toWei(minWethOut), address, unwrap],
          chainId: robinhood.id,
        });
        setHash(tx);
        setStatus("confirming");
        await client.waitForTransactionReceipt({ hash: tx });
        setStatus("done");
      } catch (e) {
        fail(e);
      }
    },
    [address, client, writeContractAsync, reset, fail],
  );

  const busy = status === "approving" || status === "pending" || status === "confirming";

  const label = useMemo(() => {
    if (!ROUTER_ADDRESS) return "Trading not live yet";
    if (status === "approving") return "Approving…";
    if (status === "pending") return "Confirm in wallet…";
    if (status === "confirming") return "Submitting…";
    return undefined;
  }, [status]);

  return { ready, busy, status, hash, error, label, buy, sell, reset };
}

export { WETH };
