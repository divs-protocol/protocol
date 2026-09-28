"use client";

import { useReadContract } from "wagmi";
import { robinhood } from "wagmi/chains";

/**
 * $DIVSPRO - live on a Pons bonding-curve vault, not a pool DivsRouter can
 * trade. The router only speaks WETH/USDG-quoted V2/V3/V4 pools; this vault
 * is none of those, and its buy/sell functions are unverified, so trading
 * routes to Pons directly instead. This file is read-only: it prices the
 * curve off its own `getReserves()`, which was confirmed by direct probe
 * against the live vault, not assumed from the "V2" branding.
 */

export const DIVSPRO_TOKEN = "0x9338F804c444D38857c0299dF218227B05f68420" as const;
export const DIVSPRO_VAULT = "0x7f2F4c35EDf9A2849d8A58F44df5b878ad6b9b5B" as const;

export const DIVSPRO_TRADE_URL =
  "https://www.ponsfamily.com/launchpad/0x9338F804c444D38857c0299dF218227B05f68420";

const vaultAbi = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserveEth", type: "uint256" },
      { name: "reserveToken", type: "uint256" },
    ],
  },
] as const;

export function useDivsProPrice(ethUsd: number) {
  const { data, isLoading } = useReadContract({
    address: DIVSPRO_VAULT,
    abi: vaultAbi,
    functionName: "getReserves",
    chainId: robinhood.id,
    query: { refetchInterval: 15_000 },
  });

  if (!data) return { priceEth: 0, priceUsd: 0, reserveEth: 0, loading: isLoading };

  const [reserveEth, reserveToken] = data;
  // BigInt division scaled to 1e18 first, so the ratio survives reserveToken
  // being in the hundreds of millions - a plain Number() cast on that would
  // already have shed the precision this divides on.
  const priceEth = reserveToken > 0n ? Number((reserveEth * 10n ** 18n) / reserveToken) / 1e18 : 0;

  return {
    priceEth,
    priceUsd: priceEth * ethUsd,
    reserveEth: Number(reserveEth) / 1e18,
    loading: isLoading,
  };
}
