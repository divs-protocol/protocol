"use client";

import { useCallback, useMemo, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { robinhood } from "wagmi/chains";
import { USDG, findMarket, quoteDecimals, quotePerShare, type Market, type MarketCommon, type V4Market } from "./exchange";

/**
 * Binding for DivsRouter.sol.
 *
 * The address comes from the environment because nothing is deployed yet. When
 * it is unset the trade panels still render live prices and quotes, but the
 * submit button says so rather than failing when tapped.
 *
 * `buy`/`sell` take an object with a `ticker`, not a full `Market` - a caller
 * usually only has a `LiveMarket` (identity plus live numbers, flat, no
 * venue-specific fields) on hand, not the registry entry itself. The real
 * `Market`, with the pool address or `PoolKey` a trade actually needs, is
 * looked up here from the static registry rather than trusted from the
 * caller, so a stale or reshaped row passed in can never send a trade to the
 * wrong venue.
 */

const addr = (v: string | undefined) =>
  v && /^0x[a-fA-F0-9]{40}$/.test(v) ? (v as `0x${string}`) : undefined;

export const ROUTER_ADDRESS = addr(process.env.NEXT_PUBLIC_DIVS_ROUTER_ADDRESS);

/** A V4 PoolKey, as the ABI encodes it. */
const poolKeyComponents = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

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
  {
    type: "function",
    name: "buyV2",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pair", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "buyWithETHV2",
    stateMutability: "payable",
    inputs: [
      { name: "pair", type: "address" },
      { name: "amountOutMin", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "sellV2",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pair", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "unwrap", type: "bool" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "buyV4",
    stateMutability: "nonpayable",
    inputs: [
      { name: "key", type: "tuple", components: poolKeyComponents },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "buyWithETHV4",
    stateMutability: "payable",
    inputs: [
      { name: "key", type: "tuple", components: poolKeyComponents },
      { name: "amountOutMin", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "sellV4",
    stateMutability: "nonpayable",
    inputs: [
      { name: "key", type: "tuple", components: poolKeyComponents },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "unwrap", type: "bool" },
    ],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  // Absent from the router deployed before V2/V4 support - a call to it
  // there simply fails, which `useV4Available` below reads as "not yet".
  { type: "function", name: "poolManager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
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
 * Shares received for an amount of the quote asset, after the protocol fee.
 *
 * The pool's marginal price, so it ignores the price impact of the trade
 * itself - which is why the submitted minimum is this figure less slippage
 * rather than this figure.
 */
export function quoteBuy(m: MarketCommon, sqrtPriceX96: bigint, quoteIn: number, feeBps = DEFAULT_FEE_BPS) {
  const price = quotePerShare(m, sqrtPriceX96);
  if (!price) return 0;
  return (quoteIn * (1 - feeBps / 10_000)) / price;
}

/** Quote asset received for a number of shares, after the protocol fee. */
export function quoteSell(m: MarketCommon, sqrtPriceX96: bigint, shares: number, feeBps = DEFAULT_FEE_BPS) {
  const price = quotePerShare(m, sqrtPriceX96);
  return shares * price * (1 - feeBps / 10_000);
}

const toWei = (n: number) => BigInt(Math.floor(n * 1e18));

/** Amounts of the quote asset are not always eighteen decimals. USDG is six. */
const toQuoteUnits = (m: MarketCommon, n: number) =>
  BigInt(Math.floor(n * 10 ** quoteDecimals(m)));

/** The tuple `buyV4`/`sellV4` take in place of a pool address. */
const v4Key = (m: V4Market) => ({
  currency0: m.currency0,
  currency1: m.currency1,
  fee: m.feeBps,
  tickSpacing: m.tickSpacing,
  hooks: m.hooks,
});

export type TradeStatus = "idle" | "approving" | "pending" | "confirming" | "done" | "error";

/**
 * Buying and selling through the router.
 *
 * Buys take the native-ETH path: the router wraps on the way in, so a purchase
 * is one transaction with no approval. Sells move a stock token, so they need
 * an allowance first, and that is only requested when the current one is too
 * small. Both branch on venue only after resolving the full `Market` from the
 * registry - see the module doc comment for why that lookup happens here
 * rather than trusting the caller's own object.
 */
/**
 * Whether the deployed router actually has V4 support, checked rather than
 * assumed. `poolManager()` only exists on the router built with V2/V4
 * support; a call to it on an older deployment simply fails - read here as
 * "not yet" rather than left to surface as a failed transaction once someone
 * taps Buy on a V4 market. This also means V4 trading unlocks itself the
 * moment the router is redeployed, with no code change to flip a flag back.
 */
function useV4Available() {
  const { data } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: routerAbi,
    functionName: "poolManager",
    chainId: robinhood.id,
    query: { enabled: Boolean(ROUTER_ADDRESS) },
  });
  return Boolean(data && data !== "0x0000000000000000000000000000000000000000");
}

export function useRouterTrade() {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: robinhood.id });
  const { writeContractAsync } = useWriteContract();
  const v4Available = useV4Available();

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
      "No liquidity",
      "Unsupported pair",
      "Not WETH quoted",
      "Hook not allowed",
      "V4 unset",
      "Unexpected callback",
      "User rejected",
      "insufficient funds",
    ].find((m) => raw.includes(m));
    setError(known ?? "Transaction failed");
    setStatus("error");
  }, []);

  /**
   * A WETH market is bought with native ether, which the router wraps - one
   * transaction, no approval. A USDG market has to move an ERC-20, so it needs
   * an allowance first, and only when the current one is too small.
   */
  const buy = useCallback(
    async (marketRef: { ticker: string }, quoteIn: number, minSharesOut: number) => {
      const market = findMarket(marketRef.ticker) as Market | undefined;
      if (!ROUTER_ADDRESS || !address || !client || !market) return;
      if (market.venue === "v4" && !v4Available) {
        reset();
        setError("V4 trading opens once the router is upgraded");
        setStatus("error");
        return;
      }
      reset();
      try {
        if (market.quote === "WETH") {
          setStatus("pending");
          // Each venue's ETH-in call is fully typed against its own ABI entry
          // rather than dispatched through one shared shape - the one place
          // this file spends extra lines is the one place a mismatched
          // argument would misroute a trade.
          const tx =
            market.venue === "v3"
              ? await writeContractAsync({
                  address: ROUTER_ADDRESS,
                  abi: routerAbi,
                  functionName: "buyWithETH",
                  args: [market.pool, toWei(minSharesOut), address],
                  value: toWei(quoteIn),
                  chainId: robinhood.id,
                })
              : market.venue === "v2"
                ? await writeContractAsync({
                    address: ROUTER_ADDRESS,
                    abi: routerAbi,
                    functionName: "buyWithETHV2",
                    args: [market.pool, toWei(minSharesOut), address],
                    value: toWei(quoteIn),
                    chainId: robinhood.id,
                  })
                : await writeContractAsync({
                    address: ROUTER_ADDRESS,
                    abi: routerAbi,
                    functionName: "buyWithETHV4",
                    args: [v4Key(market), toWei(minSharesOut), address],
                    value: toWei(quoteIn),
                    chainId: robinhood.id,
                  });
          setHash(tx);
          setStatus("confirming");
          await client.waitForTransactionReceipt({ hash: tx });
          setStatus("done");
          return;
        }

        const amount = toQuoteUnits(market, quoteIn);
        const allowance = await client.readContract({
          address: USDG,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, ROUTER_ADDRESS],
        });

        if (allowance < amount) {
          setStatus("approving");
          const approval = await writeContractAsync({
            address: USDG,
            abi: erc20Abi,
            functionName: "approve",
            args: [ROUTER_ADDRESS, amount],
            chainId: robinhood.id,
          });
          await client.waitForTransactionReceipt({ hash: approval });
        }

        setStatus("pending");
        const tx =
          market.venue === "v3"
            ? await writeContractAsync({
                address: ROUTER_ADDRESS,
                abi: routerAbi,
                functionName: "buy",
                args: [market.pool, amount, toWei(minSharesOut), address],
                chainId: robinhood.id,
              })
            : market.venue === "v2"
              ? await writeContractAsync({
                  address: ROUTER_ADDRESS,
                  abi: routerAbi,
                  functionName: "buyV2",
                  args: [market.pool, amount, toWei(minSharesOut), address],
                  chainId: robinhood.id,
                })
              : await writeContractAsync({
                  address: ROUTER_ADDRESS,
                  abi: routerAbi,
                  functionName: "buyV4",
                  args: [v4Key(market), amount, toWei(minSharesOut), address],
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
    [address, client, writeContractAsync, reset, fail, v4Available],
  );

  const sell = useCallback(
    async (marketRef: { ticker: string }, shares: number, minQuoteOut: number, unwrap = true) => {
      const market = findMarket(marketRef.ticker) as Market | undefined;
      if (!ROUTER_ADDRESS || !address || !client || !market) return;
      if (market.venue === "v4" && !v4Available) {
        reset();
        setError("V4 trading opens once the router is upgraded");
        setStatus("error");
        return;
      }
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
        // Unwrapping to ether is only possible on a WETH-quoted market.
        const unwrapToEth = unwrap && market.quote === "WETH";
        const minOut = toQuoteUnits(market, minQuoteOut);
        const tx =
          market.venue === "v3"
            ? await writeContractAsync({
                address: ROUTER_ADDRESS,
                abi: routerAbi,
                functionName: "sell",
                args: [market.pool, amount, minOut, address, unwrapToEth],
                chainId: robinhood.id,
              })
            : market.venue === "v2"
              ? await writeContractAsync({
                  address: ROUTER_ADDRESS,
                  abi: routerAbi,
                  functionName: "sellV2",
                  args: [market.pool, amount, minOut, address, unwrapToEth],
                  chainId: robinhood.id,
                })
              : await writeContractAsync({
                  address: ROUTER_ADDRESS,
                  abi: routerAbi,
                  functionName: "sellV4",
                  args: [v4Key(market), amount, minOut, address, unwrapToEth],
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
    [address, client, writeContractAsync, reset, fail, v4Available],
  );

  const busy = status === "approving" || status === "pending" || status === "confirming";

  const label = useMemo(() => {
    if (!ROUTER_ADDRESS) return "Coming soon";
    if (status === "approving") return "Approving…";
    if (status === "pending") return "Confirm in wallet…";
    if (status === "confirming") return "Submitting…";
    return undefined;
  }, [status]);

  return { ready, busy, status, hash, error, label, buy, sell, reset, v4Available };
}

export { WETH } from "./exchange";
