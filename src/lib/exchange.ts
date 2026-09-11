/**
 * Live markets on Robinhood Chain (4663).
 *
 * Every entry was discovered on-chain, not typed: pools come from factory
 * 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA, the deepest fee tier with
 * non-zero liquidity wins, and addresses are checksummed by ethers. Hand-typing
 * one address with the wrong case previously broke an entire multicall batch,
 * because viem rejects the whole request on a single bad checksum.
 *
 * Prices come from each pool's `slot0`, which is the live marginal price. USD
 * is derived from the WETH/USDG pool rather than assumed - USDG has 6 decimals
 * against WETH's 18, and getting that scaling backwards produces $0.00.
 */

export type Market = {
  ticker: string;
  name: string;
  kind: "stock" | "etf";
  token: `0x${string}`;
  pool: `0x${string}`;
  feeBps: number;
  /** Orientation decides whether slot0 gives WETH-per-share or its reciprocal. */
  wethIsToken0: boolean;
};

export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as `0x${string}`;
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as `0x${string}`;
/** WETH/USDG 0.05%, the deepest stable pair - the ETH/USD reference. */
export const ETH_USD_POOL = "0x69BfaF19C9f377BB306a89aEd9F6B07e2c1a8d9a" as `0x${string}`;
export const USDG_DECIMALS = 6;

export const MARKETS: Market[] = [
  { ticker: "AAPL", name: "Apple", kind: "stock", token: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", pool: "0x8bb3514e2204E1cDF3Ac149EFEe7Ff04D91B719f", feeBps: 500, wethIsToken0: true },
  { ticker: "NVDA", name: "NVIDIA", kind: "stock", token: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", pool: "0x62AB521f71431f78ac374CdbadC6cda3c8916b6C", feeBps: 500, wethIsToken0: true },
  { ticker: "TSLA", name: "Tesla", kind: "stock", token: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", pool: "0xA953CA88ff430e9487c60cA34d757414f4efdA07", feeBps: 3000, wethIsToken0: true },
  { ticker: "GOOGL", name: "Alphabet Class A", kind: "stock", token: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", pool: "0x8fB9301586f27e2cff85312F7c1d0F16C6167cdE", feeBps: 100, wethIsToken0: true },
  { ticker: "COIN", name: "Coinbase", kind: "stock", token: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", pool: "0x6707aeAc7D0e519B083219d27BB427364363183A", feeBps: 3000, wethIsToken0: true },
  { ticker: "MSTR", name: "Strategy Inc.", kind: "stock", token: "0xec262a75e413fAfD0dF80480274532C79D42da09", pool: "0x70504a6FafdbfB75fE971FAA4dD716e79aC5624c", feeBps: 10000, wethIsToken0: true },
  { ticker: "CRCL", name: "Circle Internet Group", kind: "stock", token: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5", pool: "0x754DdD4bF8E8635B4301a7f4Af2Ea7A82AB6cEA7", feeBps: 10000, wethIsToken0: true },
  { ticker: "GME", name: "GameStop", kind: "stock", token: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", pool: "0xc6BCC95043DC48C204bB2D57fb264a10Efe0a607", feeBps: 500, wethIsToken0: true },
  { ticker: "AMC", name: "AMC Entertainment", kind: "stock", token: "0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B", pool: "0xcF38764Ae8c92222Af4358A701871A6235Cfc7b7", feeBps: 10000, wethIsToken0: false },
  { ticker: "HIMS", name: "Hims & Hers Health", kind: "stock", token: "0xCceE82fE024c36fA15E1005edE3E9e4787e23D09", pool: "0xd10E6245961D697d975963682ECe9979E9917fBC", feeBps: 10000, wethIsToken0: true },
  { ticker: "LLY", name: "Eli Lilly", kind: "stock", token: "0x8005d266423c7ea827372c9c864491e5786600ea", pool: "0x666bA98aB094793e276215448F2485FD8e3c3CE5", feeBps: 3000, wethIsToken0: true },
  { ticker: "DJT", name: "Trump Media & Technology", kind: "stock", token: "0x1D11f0496982706C5e14A514D4E79F2e6BdE4516", pool: "0x95DEF4ea143630d64CAA8F55F7570D8023f20265", feeBps: 500, wethIsToken0: true },
  { ticker: "SPCX", name: "SpaceX", kind: "stock", token: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", pool: "0xC3c9F0171490Ef0F4536fe493F3b0EbB5ee0CB5e", feeBps: 500, wethIsToken0: true },
  { ticker: "SPY", name: "SPDR S&P 500 ETF", kind: "etf", token: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", pool: "0xDDCBBa3666f578E3F09516f21Ff85BFee859AB5e", feeBps: 500, wethIsToken0: true },
  { ticker: "QQQ", name: "Invesco QQQ", kind: "etf", token: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", pool: "0xA40D00a55d43bA2d188039DCF88bD68f4F133E78", feeBps: 3000, wethIsToken0: true },
  { ticker: "GLD", name: "SPDR Gold Trust", kind: "etf", token: "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e", pool: "0x98996e833EA35EC17c3645Ca7b6Dd40d188564C4", feeBps: 10000, wethIsToken0: true },
  { ticker: "SGOV", name: "iShares 0-3M Treasury", kind: "etf", token: "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5", pool: "0x7F310e3D05E575Bd449E4484eF5Da15863ea43B1", feeBps: 10000, wethIsToken0: true },
];

export const findMarket = (t: string) => MARKETS.find((m) => m.ticker === t);

const Q192 = 2n ** 192n;

/**
 * Decimal-adjusted price of token0 in token1 from a sqrtPriceX96.
 *
 * `sqrt^2 / 2^192` is token1 per token0 in *base units*; the decimal difference
 * has to be applied or an 18/6 pair reads as zero.
 */
export function priceFromSqrt(sqrtPriceX96: bigint, dec0: number, dec1: number): number {
  if (sqrtPriceX96 === 0n) return 0;
  const scaled = (sqrtPriceX96 * sqrtPriceX96 * 10n ** BigInt(dec0) * 1_000_000n) / (Q192 * 10n ** BigInt(dec1));
  return Number(scaled) / 1e6;
}

/** WETH per share for a market, given its pool's sqrtPriceX96. */
export function wethPerShare(m: Market, sqrtPriceX96: bigint): number {
  const p = priceFromSqrt(sqrtPriceX96, 18, 18);
  if (p === 0) return 0;
  return m.wethIsToken0 ? 1 / p : p;
}

/** ETH/USD from the WETH/USDG pool. WETH is token0 there. */
export function ethUsdFromSqrt(sqrtPriceX96: bigint): number {
  return priceFromSqrt(sqrtPriceX96, 18, USDG_DECIMALS);
}

export const poolAbi = [
  {
    type: "function", name: "slot0", stateMutability: "view", inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" }, { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" }, { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  {
    type: "event", name: "Swap",
    inputs: [
      { name: "sender", type: "address", indexed: true }, { name: "recipient", type: "address", indexed: true },
      { name: "amount0", type: "int256" }, { name: "amount1", type: "int256" },
      { name: "sqrtPriceX96", type: "uint160" }, { name: "liquidity", type: "uint128" },
      { name: "tick", type: "int24" },
    ],
  },
] as const;
