import { NextResponse } from "next/server";
import { cached, client } from "@/lib/chain";
import { STAKING_ADDRESS, stakingAbi } from "@/lib/divsStaking";

/**
 * Protocol-level staking figures, read from DivsStaking.
 *
 * The contract is not on Robinhood Chain yet, so the route first asks the
 * chain whether there is code at the configured address. If there is not, it
 * says so and reports nothing; the panels render empty rather than inventing
 * totals. When the contract is deployed, the same reads start returning and
 * the section fills in without a code change.
 */

export const dynamic = "force-dynamic";

const TTL_MS = 15_000;

export type StakingSnapshot = {
  deployed: boolean;
  address: string | null;
  totalStakedDivs: number;
  totalWeight: number;
  emissionsFunded: number;
  emissionsAccrued: number;
  emissionRate: number;
  periodFinish: number;
  accWethPerWeight: number;
  unallocatedFees: number;
};

const EMPTY = (address: string | null): StakingSnapshot => ({
  deployed: false,
  address,
  totalStakedDivs: 0,
  totalWeight: 0,
  emissionsFunded: 0,
  emissionsAccrued: 0,
  emissionRate: 0,
  periodFinish: 0,
  accWethPerWeight: 0,
  unallocatedFees: 0,
});

const toNumber = (v: unknown, decimals = 18) =>
  typeof v === "bigint" ? Number(v) / 10 ** decimals : 0;

async function load(): Promise<StakingSnapshot> {
  const address = STAKING_ADDRESS;
  if (!address) return EMPTY(null);

  const code = await client.getCode({ address });
  if (!code || code === "0x") return EMPTY(address);

  const reads = [
    "totalStakedDivs",
    "totalWeight",
    "emissionsFunded",
    "emissionsAccrued",
    "emissionRate",
    "periodFinish",
    "accWethPerWeight",
    "unallocatedFees",
  ] as const;

  const results = await client.multicall({
    contracts: reads.map((functionName) => ({ address, abi: stakingAbi, functionName })),
    allowFailure: true,
  });

  const at = (i: number) => results[i]?.result;

  return {
    deployed: true,
    address,
    totalStakedDivs: toNumber(at(0)),
    totalWeight: toNumber(at(1)),
    emissionsFunded: toNumber(at(2)),
    emissionsAccrued: toNumber(at(3)),
    emissionRate: toNumber(at(4)),
    // A timestamp, not a token amount.
    periodFinish: typeof at(5) === "bigint" ? Number(at(5)) : 0,
    accWethPerWeight: toNumber(at(6)),
    unallocatedFees: toNumber(at(7)),
  };
}

export async function GET() {
  try {
    const snapshot = await cached("staking", TTL_MS, load);
    return NextResponse.json(snapshot, {
      headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read the chain" },
      { status: 502 },
    );
  }
}
