import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

/**
 * Live markets on Robinhood Chain (4663), across three venues.
 *
 * V3 entries were discovered on-chain, not typed: pools come from factory
 * 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA, the deepest fee tier with
 * non-zero liquidity wins, and addresses are checksummed by ethers. Hand-typing
 * one address with the wrong case previously broke an entire multicall batch,
 * because viem rejects the whole request on a single bad checksum.
 *
 * V4 entries come from `Initialize` events on the one shared `PoolManager`,
 * per `scripts/scan-v4.mjs` - there is no per-market pool contract to
 * discover the way there is for V3, only a `PoolKey` whose hash is the
 * market's identity. Only hookless pools are populated here: a hooked pool
 * runs arbitrary code on every swap through it, so it is not listed until
 * its hook has been reviewed and allowlisted on the router (`v4HookAllowed`,
 * `setV4HookAllowed`) - see SECURITY.md, "Hooked V4 pools need individual
 * review."
 *
 * V2 is not populated yet. Robinhood Chain's V2 factory has not been
 * identified, so there is no discovery path for it the way there is for V3
 * (a known factory) and V4 (a known singleton) - this is a gap to close, not
 * a decision that V2 does not matter. DivsRouter already supports it
 * (`buyV2`/`sellV2`); the registry does not yet have anything to point it at.
 *
 * Both V3 and V4 price the same way - a `sqrtPriceX96` in the same Q64.96
 * format - so every pricing function below reads `sqrtPriceX96` generically
 * and works unchanged across venues. USD is derived from the WETH/USDG pool
 * rather than assumed - USDG has 6 decimals against WETH's 18, and getting
 * that scaling backwards produces $0.00.
 */

/**
 * The fields every venue shares - what the pure pricing functions below
 * actually read. Exported (not just `Market`) so a caller holding something
 * shaped like a market but not literally one of the three variants - a
 * `LiveMarket`, say, which has already merged in live numbers - can still
 * call them without satisfying a discriminated union it isn't a member of.
 */
export type MarketCommon = {
  ticker: string;
  name: string;
  kind: "stock" | "etf";
  token: `0x${string}`;
  /** The pool's own fee tier, in hundredths of a basis point (Uniswap's unit) - unrelated to DivsRouter's protocol fee. */
  feeBps: number;
  /**
   * The asset the pool prices a share against. Most markets are WETH-paired,
   * but around sixty are quoted in USDG - including AMZN, MSFT and NFLX - and
   * they were invisible for as long as the app assumed WETH.
   */
  quote: "WETH" | "USDG";
  /** Orientation decides whether slot0/extsload gives quote-per-share or its reciprocal. */
  quoteIsToken0: boolean;
};

/** A V3 market: one deployed pool contract, read with `slot0`. */
export type V3Market = MarketCommon & {
  venue: "v3";
  pool: `0x${string}`;
};

/** A V2 market: one deployed pair contract, read with `getReserves`. */
export type V2Market = MarketCommon & {
  venue: "v2";
  pool: `0x${string}`;
};

/**
 * A V4 market: no deployed pool contract, only a key. Its `PoolId` is not
 * stored - it is the hash of these five fields (`v4PoolId`), and storing it
 * separately would let it drift from the key that actually produces it if
 * one were edited without the other. State comes from `extsload` against the
 * one shared `PoolManager` (`V4_POOL_MANAGER`), at a slot computed from the
 * id.
 */
export type V4Market = MarketCommon & {
  venue: "v4";
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  tickSpacing: number;
  hooks: `0x${string}`;
};

export type Market = V3Market | V2Market | V4Market;

export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as `0x${string}`;
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as `0x${string}`;
/** WETH/USDG 0.05%, the deepest stable pair - the ETH/USD reference. */
export const ETH_USD_POOL = "0x69BfaF19C9f377BB306a89aEd9F6B07e2c1a8d9a" as `0x${string}`;
export const USDG_DECIMALS = 6;
/** The V4 singleton every V4 market's state is read from. */
export const V4_POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as `0x${string}`;

export const MARKETS: Market[] = [
  { venue: "v3", ticker: "HIMS", name: "Hims and Hers Health", kind: "stock", token: "0xCceE82fE024c36fA15E1005edE3E9e4787e23D09", pool: "0xd10E6245961D697d975963682ECe9979E9917fBC", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "RDDT", name: "Reddit", kind: "stock", token: "0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C", pool: "0xA541143F20D7b0643123064aBF25F423E375b531", feeBps: 10000, quote: "WETH", quoteIsToken0: false },
  { venue: "v3", ticker: "SPY", name: "SPDR S&P 500 ETF", kind: "etf", token: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", pool: "0xDDCBBa3666f578E3F09516f21Ff85BFee859AB5e", feeBps: 500, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "NVDA", name: "NVIDIA", kind: "stock", token: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", pool: "0x62AB521f71431f78ac374CdbadC6cda3c8916b6C", feeBps: 500, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "CRCL", name: "Circle Internet Group", kind: "stock", token: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5", pool: "0x754DdD4bF8E8635B4301a7f4Af2Ea7A82AB6cEA7", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "META", name: "Meta Platforms", kind: "stock", token: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", pool: "0xa4BdB396a69617eb7F70E2cc1EF526f7340b1B0d", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "SPCX", name: "SpaceX", kind: "stock", token: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", pool: "0xC3c9F0171490Ef0F4536fe493F3b0EbB5ee0CB5e", feeBps: 500, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "TSLA", name: "Tesla", kind: "stock", token: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", pool: "0xA953CA88ff430e9487c60cA34d757414f4efdA07", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "GLD", name: "SPDR Gold Trust", kind: "etf", token: "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e", pool: "0x98996e833EA35EC17c3645Ca7b6Dd40d188564C4", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "GOOGL", name: "Alphabet Class A", kind: "stock", token: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", pool: "0x8c2B4303fA0B99d07A5D3E9411497A277e65b673", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "MSTR", name: "Strategy Inc.", kind: "stock", token: "0xec262a75e413fAfD0dF80480274532C79D42da09", pool: "0x70504a6FafdbfB75fE971FAA4dD716e79aC5624c", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "AMC", name: "AMC Entertainment", kind: "stock", token: "0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B", pool: "0xcF38764Ae8c92222Af4358A701871A6235Cfc7b7", feeBps: 10000, quote: "WETH", quoteIsToken0: false },
  { venue: "v3", ticker: "COIN", name: "Coinbase", kind: "stock", token: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", pool: "0x6707aeAc7D0e519B083219d27BB427364363183A", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "RBLX", name: "Roblox", kind: "stock", token: "0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8", pool: "0x6d25417718A8D6c529130a8ccC4BfBf0a18219D3", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "AAPL", name: "Apple", kind: "stock", token: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", pool: "0x8bb3514e2204E1cDF3Ac149EFEe7Ff04D91B719f", feeBps: 500, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "SGOV", name: "iShares 0-3M Treasury", kind: "etf", token: "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5", pool: "0x7F310e3D05E575Bd449E4484eF5Da15863ea43B1", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "DJT", name: "Trump Media and Technology", kind: "stock", token: "0x1D11f0496982706C5e14A514D4E79F2e6BdE4516", pool: "0x95DEF4ea143630d64CAA8F55F7570D8023f20265", feeBps: 500, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "QQQ", name: "Invesco QQQ", kind: "etf", token: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", pool: "0xA40D00a55d43bA2d188039DCF88bD68f4F133E78", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "LLY", name: "Eli Lilly", kind: "stock", token: "0x8005d266423c7ea827372c9c864491e5786600ea", pool: "0x666bA98aB094793e276215448F2485FD8e3c3CE5", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "MU", name: "Micron Technology", kind: "stock", token: "0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD", pool: "0x301F48EC369BB3bfA0bC04d44A79037aa0EE2340", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "INDA", name: "iShares MSCI India ETF", kind: "etf", token: "0xACEF2e09adb47aD6aBeBAD9fF06689E60615C2B6", pool: "0xF5b37a305E7304a70067be356EE611ac29f706EB", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "GME", name: "GameStop", kind: "stock", token: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", pool: "0xc6BCC95043DC48C204bB2D57fb264a10Efe0a607", feeBps: 500, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "TSM", name: "Taiwan Semiconductor", kind: "stock", token: "0x58FfE4a942d3885bAa22D7520691F611EF09e7AA", pool: "0x91280dB3392EA92C08d8134b5760Fb4798B69547", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "BB", name: "BlackBerry", kind: "stock", token: "0x48E39E56aCdbA37b09020C0b734A613C9a2f100A", pool: "0x183304567485e97e68835708f572aAA0e0E71d08", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "SLV", name: "iShares Silver Trust", kind: "etf", token: "0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f", pool: "0xCa2734C70E3C348eDcDA36A6478c9275A0Ff0c90", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "SNAP", name: "Snap", kind: "stock", token: "0xF6589F11Bc40b669e584073F428B05562F568733", pool: "0x84D251CeDecdB949cA392E7BD9dD26481Ab91088", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "PLTR", name: "Palantir Technologies", kind: "stock", token: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", pool: "0x61be5Bfbaf17aE28Bf68006103B2e78Fe6112638", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "SKYHY", name: "SK Hynix", kind: "stock", token: "0x84CAb63bc87912E71ad199ff14A0bA45de68FeF8", pool: "0x60E7B5a09c723525eEfd5A02a1116E9bfe79dfF1", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "SNDK", name: "Sandisk", kind: "stock", token: "0xB90A19fF0Af67f7779afF50A882A9CfF42446400", pool: "0x995c1Ad5Eb998b1BdD89F515C4BB64760c411b62", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "COST", name: "Costco", kind: "stock", token: "0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2", pool: "0xc478A811a0002BE4321A142D5446247456b1cB05", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "MRVL", name: "Marvell Technology", kind: "stock", token: "0x62fd0668e10D8B72339BE2DCF7643001688ff13B", pool: "0x5201ea77c950aBB8d3706A20bF3b83d872E4A98b", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "QUBT", name: "Quantum Computing", kind: "stock", token: "0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4", pool: "0xb0b255ecf93eE03E69B6780CB85da769c0C5E0Ea", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "INTC", name: "Intel", kind: "stock", token: "0xc72b96e0E48ecd4DC75E1e45396e26300BC39681", pool: "0x1b375A9c30Ac43391AEFaE1bcf3a988D92458725", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "MRNA", name: "Moderna", kind: "stock", token: "0x43B07D15cE533bEc5476d70C22a78a1B2B662155", pool: "0xae6D85E96Bee054417d8D627b310a945484415Be", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "DELL", name: "Dell", kind: "stock", token: "0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd", pool: "0x61346CD249a6453fBa2ADa35f210376ac0B4957c", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "AMD", name: "Advanced Micro Devices", kind: "stock", token: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC", pool: "0x5ca1B5e6Cb510b3bf53E7cd8f7d9B5a71b4a4dc0", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "TTWO", name: "Take-Two Interactive", kind: "stock", token: "0x5e81213613b6B86EaB4c6c50d718d34359459786", pool: "0xe69fE23b708362eF5817048F16E4171E0831341c", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "BULL", name: "Webull", kind: "stock", token: "0xceF9027c7d6985b85f0BA431125073529A947A68", pool: "0x0a393801FEA32A50BE77Dab6c8BBb503Db3a4663", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "JNJ", name: "Johnson and Johnson", kind: "stock", token: "0x03DfbBE0AC4E7bCDaFd08eD41A400326B77D8c80", pool: "0x9FFb2cd935eBbf9F02494E9eF43Fee2E9a761972", feeBps: 3000, quote: "WETH", quoteIsToken0: false },
  { venue: "v3", ticker: "IBM", name: "IBM", kind: "stock", token: "0x980dcf6766FA79f5Cf0c4AAdb3ab477ff15a9619", pool: "0x7502f81AEF932e82CcF240f023dD989689A3eF65", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "BE", name: "Bloom Energy", kind: "stock", token: "0x822CC93fFD030293E9842c30BBD678F530701867", pool: "0xe3ECA0Fa4A9Bd2C90852c94FE4A756dA11300489", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { venue: "v3", ticker: "USO", name: "United States Oil Fund", kind: "etf", token: "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344", pool: "0x02175608F1b5E6b5ed221cCFdC7Be197D111D915", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "F", name: "Ford Motor", kind: "stock", token: "0x25C288E6D899b9BC30160965aD9644c67e73bE0C", pool: "0x4dbAC19E895322ac5b93abad9008691632bFFC05", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "AMZN", name: "Amazon", kind: "stock", token: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", pool: "0x8AC92DA74AB5F3b1d024Dc1943Ad7e15Dc4179Ef", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "MSFT", name: "Microsoft", kind: "stock", token: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", pool: "0xeb60bCD1D920ad6E102690CCFC6fB488899E1510", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "PFE", name: "Pfizer", kind: "stock", token: "0x7066A64c24e4206CD62E83bf198c1E7EB361F51e", pool: "0xC7d573Fcda6D2107C97fb582ae18411F9Db32E7f", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "GLXY", name: "Galaxy Digital", kind: "stock", token: "0x2D427692E928fa156ec22acfaBaFA0447C5805B7", pool: "0xC67C2D200E0b7E5D99F4CFBede8CB09B48892f2c", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "NU", name: "Nu Holdings", kind: "stock", token: "0x408c14038a04f7bD235329E26d2bf569ee20e250", pool: "0x0E3FaEd512E7909758EB924E6919e0057Bd6b45E", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "FIG", name: "Figma", kind: "stock", token: "0x41F4267525a8AFf329540eF24fD83d9044758B33", pool: "0xca5904C0a9d42F0Ec1Bf760FDf779907877144fD", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "LULU", name: "Lululemon", kind: "stock", token: "0x4e62068525Ab11FE768e29dfD00ef909B9803016", pool: "0x0F4227D27082B3BCA6818381b9ea6460275e49f4", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "NFLX", name: "Netflix", kind: "stock", token: "0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8", pool: "0x59895C0302F41aEaa129D2fa2442CEc01E7eF45E", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "BABA", name: "Alibaba", kind: "stock", token: "0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4", pool: "0xa57ab582b310dd6f9e934EA1EEEa152741545E6A", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "RIVN", name: "Rivian Automotive", kind: "stock", token: "0xB1BF26c1D20ff267A4f93550d1E0d06ac40a114B", pool: "0xb30A75B200D98A600a3766869344928E35823E23", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "USAR", name: "USA Rare Earth", kind: "stock", token: "0xd917B029C761D264c6A312BBbcDA868658eF86a6", pool: "0x04391780F519B7d3ba59c9590459D76e23d225C4", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "BA", name: "Boeing", kind: "stock", token: "0x4D21483a44Bf67a86b77E3dA301411880797D452", pool: "0xc6517047b189c72D3bAa9eF37D1d28F27a63638a", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "ON", name: "ON Semiconductor", kind: "stock", token: "0xbBD09F72b025360FeE5C928053Dca6248d35be54", pool: "0xfcE637eeAd7D62d9ED27F81D9767de03e9E534Cf", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "WYFI", name: "WhiteFiber", kind: "stock", token: "0x9e7ABD3C9139D14E4c86DcE0e455AAB7A0C2FB3E", pool: "0x2a3063e34C60253ABB23C2442F4CDFBC5cbd02c2", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "UPS", name: "UPS", kind: "stock", token: "0xf23250dac154D05Bb671CB0d0eBEf3c635c79CE2", pool: "0x3Ab74C45DceCC6A62898204Dd42143a816B44CB1", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "VTI", name: "Vanguard Total Stock Market ETF", kind: "etf", token: "0x0594134DF3f171a354D9C85eBD65b7A6148F6D09", pool: "0xb78DD1A97fa544c65d7D1f12453EcaAF1e05c36d", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "CCL", name: "Carnival", kind: "stock", token: "0x9651342CeA770aE9a2969Ba2A52611523146aef9", pool: "0xB19AcE635Ef3A28B85bFB01Bae97d0DE80750680", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "POET", name: "POET Technologies", kind: "stock", token: "0xcf6B2D875361be807EAfa57458c80f28521F9333", pool: "0xa1C781ed62AC2d0283f50fF5A843647a56ddd80a", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "RCAT", name: "Red Cat Holdings", kind: "stock", token: "0xFDE6b5d9BB419B10C23268c74e369AbFF39C0460", pool: "0x64710a70839585Af718e1B1FAEf9E7f1665F1116", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "SHOP", name: "Shopify", kind: "stock", token: "0xF53F66751B1Eff985311b693531E3290F600c410", pool: "0x18A1aFa849A6940870c2163B7ECBCC85d455Ad99", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "AVGO", name: "Broadcom", kind: "stock", token: "0x156E175DD063a8cE274C50654eF40e0032b3fbcF", pool: "0x5B7C404f1d7d77F9f3885aB13d7764F8a173028c", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "SNOW", name: "Snowflake", kind: "stock", token: "0xBa0CAB75495255d0cB58E22B648bFED4ECD1F47E", pool: "0xE0cA1dfc1161500Fb410C8181F7CC33860FfB16B", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "SOXX", name: "iShares Semiconductor ETF", kind: "etf", token: "0x75742c18BC1f1C5c5f448f4C9D9C6F66dafAAa38", pool: "0x0663E66c880E27a5cE3c4c25234aB64eAd7dFF67", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "CEG", name: "Constellation Energy", kind: "stock", token: "0xaE517A2903E68bd929Dfd15be875F8369D53e94a", pool: "0xc9529b7dc74BF15da6Cee01a282908E8C7aB6BA3", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "ASML", name: "ASML Holding", kind: "stock", token: "0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA", pool: "0xedb22516B14Eb2d1C86927Db373B0E8bF70F5cD1", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "HPE", name: "Hewlett Packard Enterprise", kind: "stock", token: "0x59dd09d4900C2E4B5F75b7c0d4E6796fcc234Cb1", pool: "0xe0E25884A3B690B1699732De475b2281600B0934", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "PENG", name: "Penguin Solutions", kind: "stock", token: "0x9b23573b156B52565012F5cE02CDF60AFBaa70Be", pool: "0x1cD650500fa6F07646361F5F508aa6Fbf7ddaD36", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "NET", name: "Cloudflare", kind: "stock", token: "0x116F00968269B7bfbaD4109cE591d6E74c0601d4", pool: "0xA9Caebb1b2fB2b954F192572b309aEf1cAf6a330", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "DDOG", name: "Datadog", kind: "stock", token: "0x27c99fBde9D0d2AA4f4Bfb4943f237843DdF6958", pool: "0x8fbF4C8e6EE5a95f0d23Ef7A065Fe266fC59F680", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "LMT", name: "Lockheed Martin", kind: "stock", token: "0x329fcACEb9AD6F9580DD5F643fed0646900D043c", pool: "0x54f160Bea60EC5207918C539d86E0b906b4DA297", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "WULF", name: "TeraWulf", kind: "stock", token: "0x348Be1A8663f15edDe5CDf8A96BB69078f7aB6Fd", pool: "0x0c72e22D7a3EF8Bb845478e5D77aec87789dEfc6", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "RUN", name: "Sunrun", kind: "stock", token: "0x756Bc80af765C82da966a788858d65aDF14f3793", pool: "0xe6d0f53073041E12bC46759519499764a4B92d13", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "FLY", name: "Firefly Aerospace", kind: "stock", token: "0x03BC731Ffb162cdd7B98D3C6542bFC291126075d", pool: "0x3594F65fE47577202C17BAfB18E5096b44DCEe6D", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "CLOV", name: "Clover Health", kind: "stock", token: "0x62200915e7DEab1eC7f79fb246daDbB80eACdDd0", pool: "0xBDfBc71db927fD566080AC21c6A2A89AE061F940", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "PATH", name: "UiPath", kind: "stock", token: "0xfb2664f07B6Aadd29ea7a59D8859b1AeB8645cDa", pool: "0x85e93fA4a14B266643B8C9bACe0312425815E72E", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "SOFI", name: "SoFi Technologies", kind: "stock", token: "0x98E75885157C80992A8D41b696D8c9C6Fb30A926", pool: "0xEA9368e1c88bCe7F04D16919eB131778A0dF826a", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "UMC", name: "United Microelectronics", kind: "stock", token: "0x0E6e67Ba88e7b5d9B67636A215c76779B948dE79", pool: "0xD95a760934ddf6818176d51c12e89520DD7bAC44", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "SCHD", name: "Schwab US Dividend Equity ETF", kind: "etf", token: "0xd63ABB2C13d7a8421a8017a712802053568e3C1D", pool: "0x359555e1fa3f28d5A25091dd9F6D350Cb66566cf", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "IONQ", name: "IonQ", kind: "stock", token: "0x558378E000D634A36593E338eBacdd6207640EfE", pool: "0xbc44b11f569d3FEEd9B4088F5A3fC569D2E3c77F", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "RKLB", name: "Rocket Lab", kind: "stock", token: "0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2", pool: "0xa9888De1B9D64A93eaeb495A39FE9B3d00654928", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "AAOI", name: "Applied Optoelectronics", kind: "stock", token: "0x521Cf887E6531c6F667b5BC4D896E5d9bfE8EB2E", pool: "0x078c1690865964838Ae346077046750846a552D1", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "FTNT", name: "Fortinet", kind: "stock", token: "0x3FB8976980d486084b2eb4a404BD12e72823958f", pool: "0x4f2e6B13f5b9595caEE276e14F9f457E17484503", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "XLK", name: "Technology Select Sector SPDR", kind: "etf", token: "0x15Cd20759CE7F3285c29A319dE2D1A2e098c6f43", pool: "0xe20463635cEEEA8E30A315FFc4D4e81c80E53147", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "XOM", name: "ExxonMobil", kind: "stock", token: "0xf9B46d3D1B22199D4D1025a9cEDB540A33F1a2d5", pool: "0x6aF79a2c154E7EeA9c87B38617D5f0B598B690FB", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "NOW", name: "ServiceNow", kind: "stock", token: "0x0C3260aF4B8f13a69c4c2dFb84fD667890CDFa14", pool: "0x00Ed6C6954EdF77FfA945696F1EACf08eDcC8d3A", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "ANET", name: "Arista Networks", kind: "stock", token: "0x28bABD556b60E53663B8615036479a29c2CDd1Bf", pool: "0x6369190700480aE579a331adFcDb7967255186dD", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "HWM", name: "Howmet Aerospace", kind: "stock", token: "0xAEa445c5F3DB1a462998ccC422A875A361ee5d99", pool: "0xdAaB22B473029a8F8F00cbe3a33dE82dBbeB6Ec9", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "ADBE", name: "Adobe", kind: "stock", token: "0x232B8ed6377BE97813853B0Ac104c4Cda8378d1B", pool: "0xd25e11E45f42660668AcC3Db09DFE56F890F2e58", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "VRT", name: "Vertiv Holdings", kind: "stock", token: "0xFA78C12E6488814A0262E4e802749a4a737d5fB7", pool: "0xb15E0E29161917D36bBBc496ae482DCE2C77C875", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "CLS", name: "Celestica", kind: "stock", token: "0xBf449977089c718C004a66C554B26B94ef3Ad4De", pool: "0xaEa7d4E856a1fC2Bd23C7EA26a3433464DE0428F", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "AMAT", name: "Applied Materials", kind: "stock", token: "0x36046893810a7E7fCE501229d57dc3FC8c8716d0", pool: "0xa255bAfB65F9c79047EC74814e456e53713C8Cb3", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "SMH", name: "VanEck Semiconductor ETF", kind: "etf", token: "0x072f979c2CAc8e1391B0162a87Fee094bF8744a0", pool: "0xF9d5F058099707F60740c09Bf67B32967971DC63", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "PWR", name: "Quanta Services", kind: "stock", token: "0x9Ab02Ead789b6903c3c44d0ED32F9c707CDF12FD", pool: "0x5CC24380A863119148723d2970aB712e4949B12c", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { venue: "v3", ticker: "MPWR", name: "Monolithic Power Systems", kind: "stock", token: "0x52D50D0280AD1054b43f052bD70a49a212A1b128", pool: "0x56Ad01aE395869ae9c491A007c36be3B839A14A6", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { venue: "v3", ticker: "FIX", name: "Comfort Systems USA", kind: "stock", token: "0x93Dbb1d2Dc5D63F4abACFF30485273f538Df68Ac", pool: "0x745104601f86bE0B2392C916442A922F2923FA6C", feeBps: 10000, quote: "USDG", quoteIsToken0: true },

  // --- V4 ---
  //
  // Discovered from PoolManager Initialize events (scripts/scan-v4.mjs), not
  // hand-typed. Hookless only, per the policy in SECURITY.md, "Hooked V4
  // pools need individual review" - every entry below has hooks set to the
  // zero address, so there is no third-party code in its swap path to have
  // reviewed first. A hooked pool for one of these tickers may exist too and
  // hold more liquidity; it is deliberately not the one listed here.
  { venue: "v4", ticker: "INOD", name: "Innodata", kind: "stock", token: "0xf1953DAB6FaD537488d5A022361FfAa8B4c95eC6", feeBps: 11, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xf1953DAB6FaD537488d5A022361FfAa8B4c95eC6", tickSpacing: 1, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "CRWV", name: "CoreWeave", kind: "stock", token: "0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3", feeBps: 9000, quote: "USDG", quoteIsToken0: false, currency0: "0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 90, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "QCOM", name: "Qualcomm", kind: "stock", token: "0x0f17206447090e464C277571124dD2688E48AEA9", feeBps: 3500, quote: "USDG", quoteIsToken0: false, currency0: "0x0f17206447090e464C277571124dD2688E48AEA9", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 71, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "CRM", name: "Salesforce", kind: "stock", token: "0xd95B44124e475743a7589e68F3D74008A5536D44", feeBps: 10000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xd95B44124e475743a7589e68F3D74008A5536D44", tickSpacing: 100, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "GE", name: "GE Aerospace", kind: "stock", token: "0x63b814DDBd6BF339f25Fed8c36158a008D5B373e", feeBps: 20000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x63b814DDBd6BF339f25Fed8c36158a008D5B373e", tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "NNE", name: "Nano Nuclear Energy", kind: "stock", token: "0xBEF75684C43c4ea7BD18Dd532a2244674Ee8b926", feeBps: 10000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xBEF75684C43c4ea7BD18Dd532a2244674Ee8b926", tickSpacing: 100, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "SOUN", name: "SoundHound AI", kind: "stock", token: "0x6E3Dfd9f7e1649BaA14D25cac18C94d62dB10A54", feeBps: 2457, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x6E3Dfd9f7e1649BaA14D25cac18C94d62dB10A54", tickSpacing: 25, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "EWY", name: "iShares MSCI South Korea", kind: "etf", token: "0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "NBIS", name: "Nebius Group", kind: "stock", token: "0x9D9c6684F596F66a64C030B93A886D51Fd4D7931", feeBps: 9900, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x9D9c6684F596F66a64C030B93A886D51Fd4D7931", tickSpacing: 99, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "ZM", name: "Zoom", kind: "stock", token: "0x44c4F142009036cF477eD2d09932051843137CF1", feeBps: 30000, quote: "USDG", quoteIsToken0: false, currency0: "0x44c4F142009036cF477eD2d09932051843137CF1", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 300, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "CELH", name: "Celsius", kind: "stock", token: "0x8cF07C5A878945185d327aAa6e33FAa95F95e7bF", feeBps: 48000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x8cF07C5A878945185d327aAa6e33FAa95F95e7bF", tickSpacing: 480, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "ELF", name: "elf Beauty", kind: "stock", token: "0x39EC44Bee4F6A116c6F9B8De566848a985C53C60", feeBps: 20100, quote: "USDG", quoteIsToken0: false, currency0: "0x39EC44Bee4F6A116c6F9B8De566848a985C53C60", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 201, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "ORCL", name: "Oracle", kind: "stock", token: "0xb0992820E760d836549ba69BC7598b4af75dEE03", feeBps: 10000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xb0992820E760d836549ba69BC7598b4af75dEE03", tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "SMR", name: "NuScale Power", kind: "stock", token: "0x1Eebee7F74517e0279dFb09d25B0407bEEc3FDd6", feeBps: 9000, quote: "USDG", quoteIsToken0: false, currency0: "0x1Eebee7F74517e0279dFb09d25B0407bEEc3FDd6", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 90, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "JOBY", name: "Joby Aviation", kind: "stock", token: "0xb334C5cE741B80B5B671F47F5C269Cb193fe8E24", feeBps: 25000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xb334C5cE741B80B5B671F47F5C269Cb193fe8E24", tickSpacing: 250, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "ASTS", name: "AST SpaceMobile", kind: "stock", token: "0x1AF6446f07eb1d97c546AFC8c9544cBDF3AD5137", feeBps: 60000, quote: "USDG", quoteIsToken0: false, currency0: "0x1AF6446f07eb1d97c546AFC8c9544cBDF3AD5137", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 600, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "CBRS", name: "Cerebras Systems", kind: "stock", token: "0x5c90450Bbb4273D7b2f17CF6917AEB237A569679", feeBps: 10000, quote: "USDG", quoteIsToken0: false, currency0: "0x5c90450Bbb4273D7b2f17CF6917AEB237A569679", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 100, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "WDAY", name: "Workday", kind: "stock", token: "0x82DA4646242e1D962e96e932269Dc644c94a9CaA", feeBps: 20000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x82DA4646242e1D962e96e932269Dc644c94a9CaA", tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "IREN", name: "IREN", kind: "stock", token: "0xF0AB0c93bE6F41369d302e55db1A96b3c430212D", feeBps: 9000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xF0AB0c93bE6F41369d302e55db1A96b3c430212D", tickSpacing: 90, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "FUTU", name: "Futu Holdings", kind: "stock", token: "0xeB30663bDFf0622Ef4e4E5cBb4E975F19f33f51D", feeBps: 45000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xeB30663bDFf0622Ef4e4E5cBb4E975F19f33f51D", tickSpacing: 450, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "SIMO", name: "Silicon Motion", kind: "stock", token: "0x77E655E37F4d913fB9540e0d541D824171a60e81", feeBps: 30000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x77E655E37F4d913fB9540e0d541D824171a60e81", tickSpacing: 300, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "P", name: "Everpure", kind: "stock", token: "0x1Cdad396DB64BDa184d5182A97Dd9B3C62100b7D", feeBps: 30000, quote: "USDG", quoteIsToken0: false, currency0: "0x1Cdad396DB64BDa184d5182A97Dd9B3C62100b7D", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 300, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "CVNA", name: "Carvana", kind: "stock", token: "0xa4f319104089FE321dc8093C6E707d4fE190A988", feeBps: 20000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xa4f319104089FE321dc8093C6E707d4fE190A988", tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "HII", name: "Huntington Ingalls", kind: "stock", token: "0xEB61c0Ed490A367d4E3631cCf8a74B3bfc7E775D", feeBps: 30000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xEB61c0Ed490A367d4E3631cCf8a74B3bfc7E775D", tickSpacing: 300, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "CSCO", name: "Cisco Systems", kind: "stock", token: "0xF543967EEBB6f1917992eF0E68De63ab07a5a0dA", feeBps: 18000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xF543967EEBB6f1917992eF0E68De63ab07a5a0dA", tickSpacing: 180, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "TEAM", name: "Atlassian", kind: "stock", token: "0x5B97476b922F3305131B8f0B9D333172E87f4aaE", feeBps: 27900, quote: "USDG", quoteIsToken0: false, currency0: "0x5B97476b922F3305131B8f0B9D333172E87f4aaE", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 279, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "FISV", name: "Fiserv", kind: "stock", token: "0x9ECe29A4A2397C0a35fb5fA8EE2b9509130a98cc", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x9ECe29A4A2397C0a35fb5fA8EE2b9509130a98cc", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "SHY", name: "iShares 1-3 Year Treasury", kind: "etf", token: "0xBE274710Bf3d9567e1B290eF6a5F9f90ca016FD8", feeBps: 48380, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xBE274710Bf3d9567e1B290eF6a5F9f90ca016FD8", tickSpacing: 1, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "APP", name: "AppLovin", kind: "stock", token: "0xA249BAF1063Af884807C1E1400AEf7784836917E", feeBps: 34000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xA249BAF1063Af884807C1E1400AEf7784836917E", tickSpacing: 340, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "RGTI", name: "Rigetti Computing", kind: "stock", token: "0x284358abc07F9359f19f4b5b4aC91901Be2597Ba", feeBps: 50000, quote: "USDG", quoteIsToken0: false, currency0: "0x284358abc07F9359f19f4b5b4aC91901Be2597Ba", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "APLD", name: "Applied Digital", kind: "stock", token: "0xb8DBf92F9741c9ac1c32115E78581f23509916FD", feeBps: 46000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xb8DBf92F9741c9ac1c32115E78581f23509916FD", tickSpacing: 460, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "INTU", name: "Intuit", kind: "stock", token: "0x56d23beE5f41A7120170b0c603Dae30128e460e9", feeBps: 30000, quote: "USDG", quoteIsToken0: false, currency0: "0x56d23beE5f41A7120170b0c603Dae30128e460e9", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 300, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "CTSH", name: "Cognizant Technology", kind: "stock", token: "0x63D5a3b6939a33f1e75d8Bcd85759858239600DB", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x63D5a3b6939a33f1e75d8Bcd85759858239600DB", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "CLSK", name: "CleanSpark", kind: "stock", token: "0xcBB95BBF36099d34dA091dc6Fa6F49EfA257Cee3", feeBps: 46800, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xcBB95BBF36099d34dA091dc6Fa6F49EfA257Cee3", tickSpacing: 468, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "LITE", name: "Lumentum", kind: "stock", token: "0x8eF20885F94e3D9bc7eB3080279188Bd5ED7c08C", feeBps: 10000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x8eF20885F94e3D9bc7eB3080279188Bd5ED7c08C", tickSpacing: 100, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "AUR", name: "Aurora Innovation", kind: "stock", token: "0x373C06c4f7BDe527D7Dae4BA169E42b55E393CeD", feeBps: 69000, quote: "USDG", quoteIsToken0: false, currency0: "0x373C06c4f7BDe527D7Dae4BA169E42b55E393CeD", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 690, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "SMCI", name: "Super Micro Computer", kind: "stock", token: "0xc01aA1fECeC0605b13bc84874ff7256C0f5F562a", feeBps: 48000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xc01aA1fECeC0605b13bc84874ff7256C0f5F562a", tickSpacing: 480, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "IBRX", name: "ImmunityBio", kind: "stock", token: "0x7c148F74ac7445D1F28366b7FcDC6792a9Fcd0Cf", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x7c148F74ac7445D1F28366b7FcDC6792a9Fcd0Cf", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "VST", name: "Vistra", kind: "stock", token: "0x561e2a49212b7cCF47f2744Ccb83e200722fADBc", feeBps: 39000, quote: "USDG", quoteIsToken0: false, currency0: "0x561e2a49212b7cCF47f2744Ccb83e200722fADBc", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 390, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "POWL", name: "Powell Industries", kind: "stock", token: "0x237c16D66590F67B886d978ACD362EAeaD8B18c7", feeBps: 50000, quote: "USDG", quoteIsToken0: false, currency0: "0x237c16D66590F67B886d978ACD362EAeaD8B18c7", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "UNH", name: "UnitedHealth Group", kind: "stock", token: "0xcF364ea52787e289De6F32077834056E3E70D6A8", feeBps: 8000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xcF364ea52787e289De6F32077834056E3E70D6A8", tickSpacing: 80, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "ABCL", name: "AbCellera Biologics", kind: "stock", token: "0x3139D77Ace0cbAA5bDfD38bD1F1911a794AF0B0e", feeBps: 50000, quote: "USDG", quoteIsToken0: false, currency0: "0x3139D77Ace0cbAA5bDfD38bD1F1911a794AF0B0e", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "LHX", name: "L3Harris Technologies", kind: "stock", token: "0x48d60243c66437c6ac3c2495Be94747aEd5Dfe25", feeBps: 20000, quote: "USDG", quoteIsToken0: false, currency0: "0x48d60243c66437c6ac3c2495Be94747aEd5Dfe25", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "KSS", name: "Kohls", kind: "stock", token: "0x12e3c047bf9AeCAF9dDC98c05C31BFD1dd043993", feeBps: 49000, quote: "USDG", quoteIsToken0: false, currency0: "0x12e3c047bf9AeCAF9dDC98c05C31BFD1dd043993", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 490, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "QBTS", name: "D-Wave Quantum", kind: "stock", token: "0xC583c60aeF9Dc401Da72cEC1B404743a93cea1Cc", feeBps: 45000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xC583c60aeF9Dc401Da72cEC1B404743a93cea1Cc", tickSpacing: 450, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "XNDU", name: "Xanadu Quantum", kind: "stock", token: "0xA8eB3BCcbf2017eE7CBfb652eB51CF2E1B153289", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xA8eB3BCcbf2017eE7CBfb652eB51CF2E1B153289", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "OKLO", name: "Oklo", kind: "stock", token: "0x8B2f88497f15A18E9D4FFa1a8fFB8538399aE774", feeBps: 45000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x8B2f88497f15A18E9D4FFa1a8fFB8538399aE774", tickSpacing: 450, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "INFQ", name: "Infleqtion", kind: "stock", token: "0xB853bC83a753342a4f8320ea680b4B1E84118D21", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xB853bC83a753342a4f8320ea680b4B1E84118D21", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "LUNR", name: "Intuitive Machines", kind: "stock", token: "0xa5D4968421bA94814Be3B136b15cf422101aC1a3", feeBps: 60000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xa5D4968421bA94814Be3B136b15cf422101aC1a3", tickSpacing: 600, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "GEV", name: "GE Vernova", kind: "stock", token: "0x94B8AAE43A1cCc08Aa64B7D1F29b4D920aF4a0C9", feeBps: 40000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x94B8AAE43A1cCc08Aa64B7D1F29b4D920aF4a0C9", tickSpacing: 400, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "MXL", name: "MaxLinear", kind: "stock", token: "0x48961813349333209994750ffA89b3c5C22eC969", feeBps: 48910, quote: "USDG", quoteIsToken0: false, currency0: "0x48961813349333209994750ffA89b3c5C22eC969", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 1, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "KTOS", name: "Kratos Defense", kind: "stock", token: "0x7FD06a4d81cCfA3F351394E144d5191874C31313", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x7FD06a4d81cCfA3F351394E144d5191874C31313", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "ONTO", name: "Onto Innovation", kind: "stock", token: "0x8ff63eAeEe3fE54Ba450c4F5538064Ec5A893Aef", feeBps: 48600, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x8ff63eAeEe3fE54Ba450c4F5538064Ec5A893Aef", tickSpacing: 1, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "COHR", name: "Coherent", kind: "stock", token: "0x92F9F459F1a9a5AD266b182BE7Bffd1C6c666894", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x92F9F459F1a9a5AD266b182BE7Bffd1C6c666894", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "MDB", name: "MongoDB", kind: "stock", token: "0xDdf2266b79abf0B48898959B0ed6E6adf512be74", feeBps: 38400, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xDdf2266b79abf0B48898959B0ed6E6adf512be74", tickSpacing: 384, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "TER", name: "Teradyne", kind: "stock", token: "0x2778C5024D5cA2CdB0f8eAD671ffc69963AdCD9C", feeBps: 50000, quote: "USDG", quoteIsToken0: false, currency0: "0x2778C5024D5cA2CdB0f8eAD671ffc69963AdCD9C", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "AMKR", name: "Amkor Technology", kind: "stock", token: "0xDd356AA38F40A7b7076755aC854B6FBb1F0D305B", feeBps: 49000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xDd356AA38F40A7b7076755aC854B6FBb1F0D305B", tickSpacing: 490, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "AXTI", name: "AXT", kind: "stock", token: "0x141eEa040c2250eEc0314e336975e81f85f6585e", feeBps: 47000, quote: "USDG", quoteIsToken0: false, currency0: "0x141eEa040c2250eEc0314e336975e81f85f6585e", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 470, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "FICO", name: "Fair Isaac", kind: "stock", token: "0xa48F22A46C0F1C46CA7D111CB6c137c271987180", feeBps: 44000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xa48F22A46C0F1C46CA7D111CB6c137c271987180", tickSpacing: 440, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "CRDO", name: "Credo Technology", kind: "stock", token: "0x4D67253bc223e6b0e104F1084c1fb2b669dDC41b", feeBps: 69000, quote: "USDG", quoteIsToken0: false, currency0: "0x4D67253bc223e6b0e104F1084c1fb2b669dDC41b", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 690, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "PR", name: "Permian Resources", kind: "stock", token: "0x4189F0c66EBBB0bfeF1C31f763131361EF32f77C", feeBps: 47500, quote: "USDG", quoteIsToken0: false, currency0: "0x4189F0c66EBBB0bfeF1C31f763131361EF32f77C", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 475, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "DOCN", name: "DigitalOcean", kind: "stock", token: "0xc02f12B9fe9E707079EC0d546f3050d3F6C1F8bD", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xc02f12B9fe9E707079EC0d546f3050d3F6C1F8bD", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "KLAC", name: "KLA Corporation", kind: "stock", token: "0x96b933C74eCB4A0926b9210cef7b743EF46be2E9", feeBps: 40000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x96b933C74eCB4A0926b9210cef7b743EF46be2E9", tickSpacing: 400, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "TE", name: "T1 Energy", kind: "stock", token: "0xb1969f6604CA1AE7a2cD3F1827876e914594CA2D", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xb1969f6604CA1AE7a2cD3F1827876e914594CA2D", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "SPMO", name: "Invesco S&P 500 Momentum ETF", kind: "etf", token: "0xAd622320e520de39e72d41EF07438C3Fd3354875", feeBps: 69000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xAd622320e520de39e72d41EF07438C3Fd3354875", tickSpacing: 690, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "VSAT", name: "ViaSat", kind: "stock", token: "0x26dCbfb34FC83CAbD6990f449674efDc6097fF85", feeBps: 46520, quote: "USDG", quoteIsToken0: false, currency0: "0x26dCbfb34FC83CAbD6990f449674efDc6097fF85", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 465, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "NVTS", name: "Navitas Semiconductor", kind: "stock", token: "0xbE6702d7b70315376dC48a3293f24f0982F86386", feeBps: 49000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xbE6702d7b70315376dC48a3293f24f0982F86386", tickSpacing: 490, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "AEHR", name: "Aehr Test Systems", kind: "stock", token: "0x5F604fBA1162193A4388A5DFa56F556f3E133cC2", feeBps: 47000, quote: "USDG", quoteIsToken0: false, currency0: "0x5F604fBA1162193A4388A5DFa56F556f3E133cC2", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 470, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "VICR", name: "Vicor", kind: "stock", token: "0x6006ed4B2F94110851ff7509D97D034f0EeD9226", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x6006ed4B2F94110851ff7509D97D034f0EeD9226", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "SLS", name: "SELLAS Life Sciences", kind: "stock", token: "0x285b231728c7E4333799183DF1094d775246a535", feeBps: 50000, quote: "USDG", quoteIsToken0: false, currency0: "0x285b231728c7E4333799183DF1094d775246a535", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "ALAB", name: "Astera Labs", kind: "stock", token: "0x748c32c3ca24eDf31ea597Db1F3d330a7a6DA3Dc", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x748c32c3ca24eDf31ea597Db1F3d330a7a6DA3Dc", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "TEM", name: "Tempus AI", kind: "stock", token: "0xB1CC0EC7Db69Cf43539119814df40071b9d61793", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xB1CC0EC7Db69Cf43539119814df40071b9d61793", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "LRCX", name: "Lam Research", kind: "stock", token: "0x57b0030166DB0C31690d1A5aA167e2e26e2C29a4", feeBps: 69000, quote: "USDG", quoteIsToken0: false, currency0: "0x57b0030166DB0C31690d1A5aA167e2e26e2C29a4", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 690, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "PL", name: "Planet Labs", kind: "stock", token: "0xAA4d64474c172010aB57719cb9951E6142a100d3", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xAA4d64474c172010aB57719cb9951E6142a100d3", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "AEIS", name: "Advanced Energy Industries", kind: "stock", token: "0xfAf9cb261B5FCC1f404Bb10CD39C5c6C1974E612", feeBps: 69000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xfAf9cb261B5FCC1f404Bb10CD39C5c6C1974E612", tickSpacing: 690, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "AMBA", name: "Ambarella", kind: "stock", token: "0x99D9D8663545151603863C5AcbD6FC3218899009", feeBps: 45000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x99D9D8663545151603863C5AcbD6FC3218899009", tickSpacing: 450, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "MOD", name: "Modine Manufacturing", kind: "stock", token: "0xc6Cbad1016b38B797610c25E1dc7D95988B1f362", feeBps: 40000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xc6Cbad1016b38B797610c25E1dc7D95988B1f362", tickSpacing: 260, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "AVAV", name: "AeroVironment", kind: "stock", token: "0xF6290b5e7C26502e2dA514C31509849718EA76A5", feeBps: 69000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xF6290b5e7C26502e2dA514C31509849718EA76A5", tickSpacing: 690, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "FLNC", name: "Fluence Energy", kind: "stock", token: "0x282e87451E10fA6679BC7D76C69BE44cD3fC777C", feeBps: 50000, quote: "USDG", quoteIsToken0: false, currency0: "0x282e87451E10fA6679BC7D76C69BE44cD3fC777C", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "OUST", name: "Ouster", kind: "stock", token: "0x40E7a279850e443f582059ae5dC1c3b6563E6395", feeBps: 50000, quote: "USDG", quoteIsToken0: false, currency0: "0x40E7a279850e443f582059ae5dC1c3b6563E6395", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "RDW", name: "Redwire", kind: "stock", token: "0x92Ef19E82bD8fF36661DE838D5eaE7e5CEF0EfFE", feeBps: 48930, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x92Ef19E82bD8fF36661DE838D5eaE7e5CEF0EfFE", tickSpacing: 1, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "WDC", name: "Western Digital", kind: "stock", token: "0xF52597345A8Edf418bc4071b4a35112472277D3e", feeBps: 60000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xF52597345A8Edf418bc4071b4a35112472277D3e", tickSpacing: 600, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "PANW", name: "Palo Alto Networks", kind: "stock", token: "0xB039597eD45CBa7B6E2fb9E8BE51802969CEe5Be", feeBps: 42000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xB039597eD45CBa7B6E2fb9E8BE51802969CEe5Be", tickSpacing: 420, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "TTD", name: "The Trade Desk", kind: "stock", token: "0x0b5fb4031cae9163db10B169Ee72685F0EdC8545", feeBps: 35000, quote: "USDG", quoteIsToken0: false, currency0: "0x0b5fb4031cae9163db10B169Ee72685F0EdC8545", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 350, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "ZS", name: "Zscaler", kind: "stock", token: "0x7dc013eB55e436f30d7ED1AFE4E36d6e45e3c3f7", feeBps: 38500, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x7dc013eB55e436f30d7ED1AFE4E36d6e45e3c3f7", tickSpacing: 385, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "NAVN", name: "Navan", kind: "stock", token: "0xf7181b63Fdb858558A74ba96BC42732684cd7965", feeBps: 48730, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xf7181b63Fdb858558A74ba96BC42732684cd7965", tickSpacing: 1, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "GLW", name: "Corning", kind: "stock", token: "0x7c04E6A3368F2A1DE3874f0e80d2e0A1a9915da6", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x7c04E6A3368F2A1DE3874f0e80d2e0A1a9915da6", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "TSEM", name: "Tower Semiconductor", kind: "stock", token: "0x89776d4Cd68193597A2fC132cfaC1fDe36CCeA8a", feeBps: 49000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x89776d4Cd68193597A2fC132cfaC1fDe36CCeA8a", tickSpacing: 490, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "MTSI", name: "MACOM Technology", kind: "stock", token: "0xC93f4d80e268AB922e871bd169156C3CC41894e6", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xC93f4d80e268AB922e871bd169156C3CC41894e6", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "EWT", name: "iShares MSCI Taiwan ETF", kind: "etf", token: "0x1c690498150252222C275A5CEd69d3A6b1f52D5E", feeBps: 100000, quote: "USDG", quoteIsToken0: false, currency0: "0x1c690498150252222C275A5CEd69d3A6b1f52D5E", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 1000, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "CIEN", name: "Ciena", kind: "stock", token: "0x44f6D488021f8233B9416294d1FE9b1fEe28382d", feeBps: 50000, quote: "USDG", quoteIsToken0: false, currency0: "0x44f6D488021f8233B9416294d1FE9b1fEe28382d", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "JBL", name: "Jabil", kind: "stock", token: "0xEAf2512dFC1bEAc608F8794B3793CD4E02894Aa6", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xEAf2512dFC1bEAc608F8794B3793CD4E02894Aa6", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
  { venue: "v4", ticker: "AXON", name: "Axon Enterprise", kind: "stock", token: "0xC27dBD474aF5181c5A8777903690D8D262D12648", feeBps: 50000, quote: "USDG", quoteIsToken0: true, currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xC27dBD474aF5181c5A8777903690D8D262D12648", tickSpacing: 500, hooks: "0x0000000000000000000000000000000000000000" },
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

/** Decimals of the asset a market is quoted in. USDG carries six, WETH eighteen. */
export const quoteDecimals = (m: MarketCommon) => (m.quote === "USDG" ? USDG_DECIMALS : 18);

/**
 * USD per share.
 *
 * A USDG pair is already in dollars, so the ETH reference is only applied to
 * WETH pairs. Getting the decimals the wrong way round on an 18/6 pool does
 * not error - it silently reads as $0.00 - so the ordering is derived from
 * orientation rather than assumed.
 */
export function usdPerShare(m: MarketCommon, sqrtPriceX96: bigint, ethUsd: number): number {
  if (sqrtPriceX96 === 0n) return 0;
  const shareDecimals = 18;
  const qd = quoteDecimals(m);

  // priceFromSqrt returns token1 per token0, so the arguments follow the pool's
  // own ordering and the result is inverted when the share is token1.
  const [dec0, dec1] = m.quoteIsToken0 ? [qd, shareDecimals] : [shareDecimals, qd];
  const p = priceFromSqrt(sqrtPriceX96, dec0, dec1);
  if (p === 0) return 0;

  const perShare = m.quoteIsToken0 ? 1 / p : p;
  return m.quote === "USDG" ? perShare : perShare * ethUsd;
}

/**
 * Quote asset per share, in that asset's own units.
 *
 * This is what a trade is actually denominated in: WETH for most markets, USDG
 * for around sixty of them. USD conversion belongs to display, not to sizing a
 * transaction.
 */
export function quotePerShare(m: MarketCommon, sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 === 0n) return 0;
  const qd = quoteDecimals(m);
  const [dec0, dec1] = m.quoteIsToken0 ? [qd, 18] : [18, qd];
  const p = priceFromSqrt(sqrtPriceX96, dec0, dec1);
  if (p === 0) return 0;
  return m.quoteIsToken0 ? 1 / p : p;
}

/** A raw quote-side swap amount, in USD. */
export function quoteToUsd(m: MarketCommon, raw: bigint, ethUsd: number): number {
  const abs = raw < 0n ? -raw : raw;
  const amount = Number(abs) / 10 ** quoteDecimals(m);
  return m.quote === "USDG" ? amount : amount * ethUsd;
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

/** A V2 pair: reserves stand in for slot0/liquidity, and there is no Swap topic to key state reads off, only the pair's own address. */
export const pairAbi = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function", name: "getReserves", stateMutability: "view", inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" }, { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
  {
    type: "event", name: "Swap",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "amount0In", type: "uint256" }, { name: "amount1In", type: "uint256" },
      { name: "amount0Out", type: "uint256" }, { name: "amount1Out", type: "uint256" },
      { name: "to", type: "address", indexed: true },
    ],
  },
] as const;

/**
 * The V4 singleton. `extsload` reads one raw storage word; the pools mapping
 * sits at slot 6, so a pool's slot0 (packed sqrtPriceX96 + tick) is at
 * `keccak256(poolId, 6)` and its liquidity three words further in - see
 * `v4StateSlot` below and `scripts/scan-v4.mjs`, which this mirrors.
 */
export const v4ManagerAbi = [
  {
    type: "function", name: "extsload", stateMutability: "view",
    inputs: [{ name: "slot", type: "bytes32" }], outputs: [{ type: "bytes32" }],
  },
  {
    type: "event", name: "Swap",
    inputs: [
      { name: "id", type: "bytes32", indexed: true }, { name: "sender", type: "address", indexed: true },
      { name: "amount0", type: "int128" }, { name: "amount1", type: "int128" },
      { name: "sqrtPriceX96", type: "uint160" }, { name: "liquidity", type: "uint128" },
      { name: "tick", type: "int24" }, { name: "fee", type: "uint24" },
    ],
  },
] as const;

const V4_POOLS_SLOT = 6n;

/** The storage slot holding a V4 pool's packed slot0 (sqrtPriceX96 + tick). Liquidity sits three words after it. */
export function v4StateSlot(poolId: `0x${string}`): bigint {
  return BigInt(
    keccak256(encodeAbiParameters(parseAbiParameters("bytes32, uint256"), [poolId, V4_POOLS_SLOT])),
  );
}

/**
 * The key a market's swaps and state are grouped under: a pool/pair address
 * for V3 and V2, a `PoolId` for V4. Shared by the client and the server, so
 * a component reading `MARKETS` directly and the server reading swap logs
 * agree on the same identity without either hard-coding the other's venue
 * logic.
 */
export function marketKey(m: Market): string {
  return (m.venue === "v4" ? v4PoolId(m) : m.pool).toLowerCase();
}

/** A V4 pool's id: the hash of its whole key, hooks included. */
export function v4PoolId(m: V4Market): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("address, address, uint24, int24, address"),
      [m.currency0, m.currency1, m.feeBps, m.tickSpacing, m.hooks],
    ),
  );
}

/** A storage slot as the 32-byte hex `extsload` takes. */
export function v4SlotHex(slot: bigint): `0x${string}` {
  return `0x${slot.toString(16).padStart(64, "0")}` as `0x${string}`;
}

/** `sqrtPriceX96` packed into the low 160 bits of a V4 pool's slot0 word. */
export function v4DecodeSqrtPriceX96(word: `0x${string}`): bigint {
  return BigInt(word) & ((1n << 160n) - 1n);
}

/** Liquidity packed into the low 128 bits of the word three slots after slot0. */
export function v4DecodeLiquidity(word: `0x${string}`): bigint {
  return BigInt(word) & ((1n << 128n) - 1n);
}

/**
 * Reserves implied by liquidity at the current price alone, not summed over
 * a position's actual range - the same "virtual reserves" a V3 pool's own
 * `liquidity()` represents. A V3 market's TVL here comes from real balances
 * instead (`balanceOf` on a pool that is its own contract); V4 has no
 * per-pool contract to hold a real balance, every pool's tokens sit in the
 * one shared `PoolManager`, so this is the closest a V4 market gets to a
 * comparable number - an approximation at the current tick, not an exact
 * figure.
 */
export function v4VirtualReserves(liquidity: bigint, sqrtPriceX96: bigint): { reserve0: bigint; reserve1: bigint } {
  if (sqrtPriceX96 === 0n) return { reserve0: 0n, reserve1: 0n };
  const Q96 = 2n ** 96n;
  return {
    reserve0: (liquidity * Q96) / sqrtPriceX96,
    reserve1: (liquidity * sqrtPriceX96) / Q96,
  };
}
