/**
 * Binding for DivsStaking.sol.
 *
 * Addresses come from the environment because nothing is deployed yet. When
 * they are unset the Stake view still renders - the lock maths is computed from
 * the same formula the contract uses - but every position figure reads zero
 * rather than showing invented numbers, and writes are disabled.
 */

const addr = (v: string | undefined) =>
  v && /^0x[a-fA-F0-9]{40}$/.test(v) ? (v as `0x${string}`) : undefined;

export const STAKING_ADDRESS = addr(process.env.NEXT_PUBLIC_DIVS_STAKING_ADDRESS);
export const DIVS_ADDRESS = addr(process.env.NEXT_PUBLIC_DIVS_TOKEN_ADDRESS);
export const LP_ADDRESS = addr(process.env.NEXT_PUBLIC_DIVS_LP_ADDRESS);

export const DIVS_POOL = 0n;
export const LP_POOL = 1n;

export const MAX_LOCK_WEEKS = 52;
const BPS = 10_000;
const MAX_LOCK_BPS = 40_000;

/** Mirrors DivsStaking.lockMultiplierBps, integer division included. */
export function lockMultiplierBps(weeks: number): number {
  if (weeks <= 0) return BPS;
  if (weeks >= MAX_LOCK_WEEKS) return MAX_LOCK_BPS;
  return BPS + Math.floor(((MAX_LOCK_BPS - BPS) * weeks) / MAX_LOCK_WEEKS);
}

export const stakingAbi = [
  {
    type: "function",
    name: "stake",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "lockWeeks", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "extendLock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolId", type: "uint256" },
      { name: "lockWeeks", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "unstake",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [
      { name: "wethOut", type: "uint256" },
      { name: "divsOut", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [
      { name: "poolId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "weight", type: "uint256" },
      { name: "lockEnd", type: "uint64" },
      { name: "lockWeeks", type: "uint32" },
    ],
  },
  {
    type: "function",
    name: "pendingRewards",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "pendingWeth", type: "uint256" },
      { name: "pendingDivs", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "currentWeight",
    stateMutability: "view",
    inputs: [
      { name: "poolId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalWeight",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalStakedDivs",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "periodFinish",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  /*
   * Protocol-wide figures, for the panels that describe the vault rather than
   * one person's position in it. All are plain public state on DivsStaking, so
   * none of this needs an indexer.
   */
  { type: "function", name: "emissionReserve", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "unallocatedFees", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "emissionsFunded", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "emissionsAccrued", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "emissionRate", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "poolCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "pools",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "uint256" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "multiplierBps", type: "uint256" },
      { name: "exists", type: "bool" },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
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
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
