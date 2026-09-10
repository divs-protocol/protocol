import type { Address } from "viem";

/**
 * Addresses come from the environment so the same build can target a local
 * node, Sepolia, or mainnet. Unset means "not deployed here" — the UI shows a
 * configuration notice rather than firing calls at the zero address.
 */
function readAddress(value: string | undefined): Address | undefined {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : undefined;
}

export const VAULT_ADDRESS = readAddress(process.env.NEXT_PUBLIC_DIVS_VAULT_ADDRESS);
export const STOCK_TOKEN_ADDRESS = readAddress(process.env.NEXT_PUBLIC_STOCK_TOKEN_ADDRESS);

export const divsVaultAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "stockToken", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "harvest",
    stateMutability: "nonpayable",
    inputs: [{ name: "stockToken", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "stockToken", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "pendingYield",
    stateMutability: "view",
    inputs: [
      { name: "stockToken", type: "address" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "positionValue",
    stateMutability: "view",
    inputs: [
      { name: "stockToken", type: "address" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposits",
    stateMutability: "view",
    inputs: [
      { name: "stockToken", type: "address" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "rawAmount", type: "uint256" },
      { name: "entryMultiplier", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "PROTOCOL_FEE_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const stockTokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "uiMultiplier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
