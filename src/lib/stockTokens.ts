/**
 * Robinhood Stock Tokens on Robinhood Chain (4663).
 *
 * Every address below was read from the chain, not copied from a listing:
 * `symbol()` matches the ticker for all 20, all report 18 decimals, and all
 * expose `uiMultiplier()`.
 *
 * Two properties of these tokens drive how the app has to treat them:
 *
 * 1. They implement ERC-8056. `uiMultiplier` is a *display* scalar - balances
 *    and transfers stay in raw units. A share count shown to a user is
 *    `rawBalance * uiMultiplier`, and a pool price is in raw units and must be
 *    scaled the same way or it will drift from the figure Robinhood shows.
 *    AAPL already sits at 1.000566 and SGOV at 1.005102, so this is not
 *    hypothetical.
 * 2. Every one of them is pausable by the issuer. Trading against a paused
 *    token fails, so the UI reads `paused()` rather than assuming.
 */

export type StockToken = {
  ticker: string;
  name: string;
  address: `0x${string}`;
  kind: "stock" | "etf";
};

/** Verified on-chain 2026-09-11: 20/20 symbol match, 20/20 ERC-8056. */
export const STOCK_TOKENS: StockToken[] = [
  { ticker: "AAPL", name: "Apple", address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", kind: "stock" },
  { ticker: "NVDA", name: "NVIDIA", address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", kind: "stock" },
  { ticker: "TSLA", name: "Tesla", address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", kind: "stock" },
  { ticker: "MSFT", name: "Microsoft", address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", kind: "stock" },
  { ticker: "AMZN", name: "Amazon", address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", kind: "stock" },
  { ticker: "GOOGL", name: "Alphabet Class A", address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", kind: "stock" },
  { ticker: "COIN", name: "Coinbase", address: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", kind: "stock" },
  { ticker: "PLTR", name: "Palantir Technologies", address: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", kind: "stock" },
  { ticker: "MSTR", name: "Strategy Inc.", address: "0xec262a75e413fAfD0dF80480274532C79D42da09", kind: "stock" },
  { ticker: "CRCL", name: "Circle Internet Group", address: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5", kind: "stock" },
  { ticker: "GME", name: "GameStop", address: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", kind: "stock" },
  { ticker: "AMC", name: "AMC Entertainment", address: "0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B", kind: "stock" },
  { ticker: "HIMS", name: "Hims & Hers Health", address: "0xCceE82fE024c36fA15E1005edE3E9e4787e23D09", kind: "stock" },
  { ticker: "LLY", name: "Eli Lilly", address: "0x8005d266423c7ea827372c9c864491e5786600ea", kind: "stock" },
  { ticker: "DJT", name: "Trump Media & Technology", address: "0x1D11f0496982706C5e14A514D4E79F2e6BdE4516", kind: "stock" },
  { ticker: "SPCX", name: "Space Exploration Technologies", address: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", kind: "stock" },
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", kind: "etf" },
  { ticker: "QQQ", name: "Invesco QQQ", address: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", kind: "etf" },
  { ticker: "GLD", name: "SPDR Gold Trust", address: "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e", kind: "etf" },
  { ticker: "SGOV", name: "iShares 0-3 Month Treasury Bond", address: "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5", kind: "etf" },
];

/**
 * Canonical WETH on Robinhood Chain - the quote asset, and what fees are paid
 * in. Several contracts on this chain report symbol "WETH"; this is the one
 * with a working payable `deposit()`, holding ~41.7k ETH. The impostors have no
 * deposit function and one claims a 100,000,000,000 supply.
 */
export const WETH_ADDRESS = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as `0x${string}`;

export const findToken = (ticker: string) => STOCK_TOKENS.find((t) => t.ticker === ticker);

/** Minimal surface the Exchange reads. `uiMultiplier` is the ERC-8056 extension. */
export const stockTokenAbi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "uiMultiplier", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * Raw balance to the share count a user should see.
 *
 * ERC-8056 keeps `balanceOf` in raw units and carries corporate actions in the
 * multiplier, so displaying the raw balance understates a holding after any
 * dividend or split.
 */
export function toDisplayShares(raw: bigint, uiMultiplier: bigint): bigint {
  return (raw * uiMultiplier) / 10n ** 18n;
}
