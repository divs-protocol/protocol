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
  /**
   * The asset the pool prices a share against. Most markets are WETH-paired,
   * but around sixty are quoted in USDG - including AMZN, MSFT and NFLX - and
   * they were invisible for as long as the app assumed WETH.
   */
  quote: "WETH" | "USDG";
  /** Orientation decides whether slot0 gives quote-per-share or its reciprocal. */
  quoteIsToken0: boolean;
};

export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as `0x${string}`;
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as `0x${string}`;
/** WETH/USDG 0.05%, the deepest stable pair - the ETH/USD reference. */
export const ETH_USD_POOL = "0x69BfaF19C9f377BB306a89aEd9F6B07e2c1a8d9a" as `0x${string}`;
export const USDG_DECIMALS = 6;

export const MARKETS: Market[] = [
  { ticker: "HIMS", name: "Hims and Hers Health", kind: "stock", token: "0xCceE82fE024c36fA15E1005edE3E9e4787e23D09", pool: "0xd10E6245961D697d975963682ECe9979E9917fBC", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "RDDT", name: "Reddit", kind: "stock", token: "0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C", pool: "0xA541143F20D7b0643123064aBF25F423E375b531", feeBps: 10000, quote: "WETH", quoteIsToken0: false },
  { ticker: "SPY", name: "SPDR S&P 500 ETF", kind: "etf", token: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", pool: "0xDDCBBa3666f578E3F09516f21Ff85BFee859AB5e", feeBps: 500, quote: "WETH", quoteIsToken0: true },
  { ticker: "NVDA", name: "NVIDIA", kind: "stock", token: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", pool: "0x62AB521f71431f78ac374CdbadC6cda3c8916b6C", feeBps: 500, quote: "WETH", quoteIsToken0: true },
  { ticker: "CRCL", name: "Circle Internet Group", kind: "stock", token: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5", pool: "0x754DdD4bF8E8635B4301a7f4Af2Ea7A82AB6cEA7", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "META", name: "Meta Platforms", kind: "stock", token: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", pool: "0xa4BdB396a69617eb7F70E2cc1EF526f7340b1B0d", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "SPCX", name: "SpaceX", kind: "stock", token: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", pool: "0xC3c9F0171490Ef0F4536fe493F3b0EbB5ee0CB5e", feeBps: 500, quote: "WETH", quoteIsToken0: true },
  { ticker: "TSLA", name: "Tesla", kind: "stock", token: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", pool: "0xA953CA88ff430e9487c60cA34d757414f4efdA07", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "GLD", name: "SPDR Gold Trust", kind: "etf", token: "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e", pool: "0x98996e833EA35EC17c3645Ca7b6Dd40d188564C4", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "GOOGL", name: "Alphabet Class A", kind: "stock", token: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", pool: "0x8c2B4303fA0B99d07A5D3E9411497A277e65b673", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "MSTR", name: "Strategy Inc.", kind: "stock", token: "0xec262a75e413fAfD0dF80480274532C79D42da09", pool: "0x70504a6FafdbfB75fE971FAA4dD716e79aC5624c", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "AMC", name: "AMC Entertainment", kind: "stock", token: "0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B", pool: "0xcF38764Ae8c92222Af4358A701871A6235Cfc7b7", feeBps: 10000, quote: "WETH", quoteIsToken0: false },
  { ticker: "COIN", name: "Coinbase", kind: "stock", token: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", pool: "0x6707aeAc7D0e519B083219d27BB427364363183A", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "RBLX", name: "Roblox", kind: "stock", token: "0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8", pool: "0x6d25417718A8D6c529130a8ccC4BfBf0a18219D3", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "AAPL", name: "Apple", kind: "stock", token: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", pool: "0x8bb3514e2204E1cDF3Ac149EFEe7Ff04D91B719f", feeBps: 500, quote: "WETH", quoteIsToken0: true },
  { ticker: "SGOV", name: "iShares 0-3M Treasury", kind: "etf", token: "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5", pool: "0x7F310e3D05E575Bd449E4484eF5Da15863ea43B1", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "DJT", name: "Trump Media and Technology", kind: "stock", token: "0x1D11f0496982706C5e14A514D4E79F2e6BdE4516", pool: "0x95DEF4ea143630d64CAA8F55F7570D8023f20265", feeBps: 500, quote: "WETH", quoteIsToken0: true },
  { ticker: "QQQ", name: "Invesco QQQ", kind: "etf", token: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", pool: "0xA40D00a55d43bA2d188039DCF88bD68f4F133E78", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "LLY", name: "Eli Lilly", kind: "stock", token: "0x8005d266423c7ea827372c9c864491e5786600ea", pool: "0x666bA98aB094793e276215448F2485FD8e3c3CE5", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "MU", name: "Micron Technology", kind: "stock", token: "0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD", pool: "0x301F48EC369BB3bfA0bC04d44A79037aa0EE2340", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "INDA", name: "iShares MSCI India ETF", kind: "etf", token: "0xACEF2e09adb47aD6aBeBAD9fF06689E60615C2B6", pool: "0xF5b37a305E7304a70067be356EE611ac29f706EB", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "GME", name: "GameStop", kind: "stock", token: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", pool: "0xc6BCC95043DC48C204bB2D57fb264a10Efe0a607", feeBps: 500, quote: "WETH", quoteIsToken0: true },
  { ticker: "TSM", name: "Taiwan Semiconductor", kind: "stock", token: "0x58FfE4a942d3885bAa22D7520691F611EF09e7AA", pool: "0x91280dB3392EA92C08d8134b5760Fb4798B69547", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "BB", name: "BlackBerry", kind: "stock", token: "0x48E39E56aCdbA37b09020C0b734A613C9a2f100A", pool: "0x183304567485e97e68835708f572aAA0e0E71d08", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "SLV", name: "iShares Silver Trust", kind: "etf", token: "0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f", pool: "0xCa2734C70E3C348eDcDA36A6478c9275A0Ff0c90", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "SNAP", name: "Snap", kind: "stock", token: "0xF6589F11Bc40b669e584073F428B05562F568733", pool: "0x84D251CeDecdB949cA392E7BD9dD26481Ab91088", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "PLTR", name: "Palantir Technologies", kind: "stock", token: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", pool: "0x61be5Bfbaf17aE28Bf68006103B2e78Fe6112638", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "SKYHY", name: "SK Hynix", kind: "stock", token: "0x84CAb63bc87912E71ad199ff14A0bA45de68FeF8", pool: "0x60E7B5a09c723525eEfd5A02a1116E9bfe79dfF1", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "SNDK", name: "Sandisk", kind: "stock", token: "0xB90A19fF0Af67f7779afF50A882A9CfF42446400", pool: "0x995c1Ad5Eb998b1BdD89F515C4BB64760c411b62", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "COST", name: "Costco", kind: "stock", token: "0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2", pool: "0xc478A811a0002BE4321A142D5446247456b1cB05", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "MRVL", name: "Marvell Technology", kind: "stock", token: "0x62fd0668e10D8B72339BE2DCF7643001688ff13B", pool: "0x5201ea77c950aBB8d3706A20bF3b83d872E4A98b", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "QUBT", name: "Quantum Computing", kind: "stock", token: "0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4", pool: "0xb0b255ecf93eE03E69B6780CB85da769c0C5E0Ea", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "INTC", name: "Intel", kind: "stock", token: "0xc72b96e0E48ecd4DC75E1e45396e26300BC39681", pool: "0x1b375A9c30Ac43391AEFaE1bcf3a988D92458725", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "MRNA", name: "Moderna", kind: "stock", token: "0x43B07D15cE533bEc5476d70C22a78a1B2B662155", pool: "0xae6D85E96Bee054417d8D627b310a945484415Be", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "DELL", name: "Dell", kind: "stock", token: "0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd", pool: "0x61346CD249a6453fBa2ADa35f210376ac0B4957c", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "AMD", name: "Advanced Micro Devices", kind: "stock", token: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC", pool: "0x5ca1B5e6Cb510b3bf53E7cd8f7d9B5a71b4a4dc0", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "TTWO", name: "Take-Two Interactive", kind: "stock", token: "0x5e81213613b6B86EaB4c6c50d718d34359459786", pool: "0xe69fE23b708362eF5817048F16E4171E0831341c", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "BULL", name: "Webull", kind: "stock", token: "0xceF9027c7d6985b85f0BA431125073529A947A68", pool: "0x0a393801FEA32A50BE77Dab6c8BBb503Db3a4663", feeBps: 10000, quote: "WETH", quoteIsToken0: true },
  { ticker: "JNJ", name: "Johnson and Johnson", kind: "stock", token: "0x03DfbBE0AC4E7bCDaFd08eD41A400326B77D8c80", pool: "0x9FFb2cd935eBbf9F02494E9eF43Fee2E9a761972", feeBps: 3000, quote: "WETH", quoteIsToken0: false },
  { ticker: "IBM", name: "IBM", kind: "stock", token: "0x980dcf6766FA79f5Cf0c4AAdb3ab477ff15a9619", pool: "0x7502f81AEF932e82CcF240f023dD989689A3eF65", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "BE", name: "Bloom Energy", kind: "stock", token: "0x822CC93fFD030293E9842c30BBD678F530701867", pool: "0xe3ECA0Fa4A9Bd2C90852c94FE4A756dA11300489", feeBps: 3000, quote: "WETH", quoteIsToken0: true },
  { ticker: "USO", name: "United States Oil Fund", kind: "etf", token: "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344", pool: "0x02175608F1b5E6b5ed221cCFdC7Be197D111D915", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { ticker: "F", name: "Ford Motor", kind: "stock", token: "0x25C288E6D899b9BC30160965aD9644c67e73bE0C", pool: "0x4dbAC19E895322ac5b93abad9008691632bFFC05", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { ticker: "AMZN", name: "Amazon", kind: "stock", token: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", pool: "0x8AC92DA74AB5F3b1d024Dc1943Ad7e15Dc4179Ef", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { ticker: "MSFT", name: "Microsoft", kind: "stock", token: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", pool: "0xeb60bCD1D920ad6E102690CCFC6fB488899E1510", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { ticker: "PFE", name: "Pfizer", kind: "stock", token: "0x7066A64c24e4206CD62E83bf198c1E7EB361F51e", pool: "0xC7d573Fcda6D2107C97fb582ae18411F9Db32E7f", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { ticker: "GLXY", name: "Galaxy Digital", kind: "stock", token: "0x2D427692E928fa156ec22acfaBaFA0447C5805B7", pool: "0xC67C2D200E0b7E5D99F4CFBede8CB09B48892f2c", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { ticker: "NU", name: "Nu Holdings", kind: "stock", token: "0x408c14038a04f7bD235329E26d2bf569ee20e250", pool: "0x0E3FaEd512E7909758EB924E6919e0057Bd6b45E", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { ticker: "FIG", name: "Figma", kind: "stock", token: "0x41F4267525a8AFf329540eF24fD83d9044758B33", pool: "0xca5904C0a9d42F0Ec1Bf760FDf779907877144fD", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { ticker: "LULU", name: "Lululemon", kind: "stock", token: "0x4e62068525Ab11FE768e29dfD00ef909B9803016", pool: "0x0F4227D27082B3BCA6818381b9ea6460275e49f4", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { ticker: "NFLX", name: "Netflix", kind: "stock", token: "0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8", pool: "0x59895C0302F41aEaa129D2fa2442CEc01E7eF45E", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { ticker: "BABA", name: "Alibaba", kind: "stock", token: "0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4", pool: "0xa57ab582b310dd6f9e934EA1EEEa152741545E6A", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { ticker: "RIVN", name: "Rivian Automotive", kind: "stock", token: "0xB1BF26c1D20ff267A4f93550d1E0d06ac40a114B", pool: "0xb30A75B200D98A600a3766869344928E35823E23", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "USAR", name: "USA Rare Earth", kind: "stock", token: "0xd917B029C761D264c6A312BBbcDA868658eF86a6", pool: "0x04391780F519B7d3ba59c9590459D76e23d225C4", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { ticker: "BA", name: "Boeing", kind: "stock", token: "0x4D21483a44Bf67a86b77E3dA301411880797D452", pool: "0xc6517047b189c72D3bAa9eF37D1d28F27a63638a", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { ticker: "ON", name: "ON Semiconductor", kind: "stock", token: "0xbBD09F72b025360FeE5C928053Dca6248d35be54", pool: "0xfcE637eeAd7D62d9ED27F81D9767de03e9E534Cf", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "WYFI", name: "WhiteFiber", kind: "stock", token: "0x9e7ABD3C9139D14E4c86DcE0e455AAB7A0C2FB3E", pool: "0x2a3063e34C60253ABB23C2442F4CDFBC5cbd02c2", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { ticker: "UPS", name: "UPS", kind: "stock", token: "0xf23250dac154D05Bb671CB0d0eBEf3c635c79CE2", pool: "0x3Ab74C45DceCC6A62898204Dd42143a816B44CB1", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "VTI", name: "Vanguard Total Stock Market ETF", kind: "etf", token: "0x0594134DF3f171a354D9C85eBD65b7A6148F6D09", pool: "0xb78DD1A97fa544c65d7D1f12453EcaAF1e05c36d", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "CCL", name: "Carnival", kind: "stock", token: "0x9651342CeA770aE9a2969Ba2A52611523146aef9", pool: "0xB19AcE635Ef3A28B85bFB01Bae97d0DE80750680", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "POET", name: "POET Technologies", kind: "stock", token: "0xcf6B2D875361be807EAfa57458c80f28521F9333", pool: "0xa1C781ed62AC2d0283f50fF5A843647a56ddd80a", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "RCAT", name: "Red Cat Holdings", kind: "stock", token: "0xFDE6b5d9BB419B10C23268c74e369AbFF39C0460", pool: "0x64710a70839585Af718e1B1FAEf9E7f1665F1116", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "SHOP", name: "Shopify", kind: "stock", token: "0xF53F66751B1Eff985311b693531E3290F600c410", pool: "0x18A1aFa849A6940870c2163B7ECBCC85d455Ad99", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "AVGO", name: "Broadcom", kind: "stock", token: "0x156E175DD063a8cE274C50654eF40e0032b3fbcF", pool: "0x5B7C404f1d7d77F9f3885aB13d7764F8a173028c", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { ticker: "SNOW", name: "Snowflake", kind: "stock", token: "0xBa0CAB75495255d0cB58E22B648bFED4ECD1F47E", pool: "0xE0cA1dfc1161500Fb410C8181F7CC33860FfB16B", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { ticker: "SOXX", name: "iShares Semiconductor ETF", kind: "etf", token: "0x75742c18BC1f1C5c5f448f4C9D9C6F66dafAAa38", pool: "0x0663E66c880E27a5cE3c4c25234aB64eAd7dFF67", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { ticker: "CEG", name: "Constellation Energy", kind: "stock", token: "0xaE517A2903E68bd929Dfd15be875F8369D53e94a", pool: "0xc9529b7dc74BF15da6Cee01a282908E8C7aB6BA3", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "ASML", name: "ASML Holding", kind: "stock", token: "0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA", pool: "0xedb22516B14Eb2d1C86927Db373B0E8bF70F5cD1", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "HPE", name: "Hewlett Packard Enterprise", kind: "stock", token: "0x59dd09d4900C2E4B5F75b7c0d4E6796fcc234Cb1", pool: "0xe0E25884A3B690B1699732De475b2281600B0934", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { ticker: "PENG", name: "Penguin Solutions", kind: "stock", token: "0x9b23573b156B52565012F5cE02CDF60AFBaa70Be", pool: "0x1cD650500fa6F07646361F5F508aa6Fbf7ddaD36", feeBps: 3000, quote: "USDG", quoteIsToken0: true },
  { ticker: "NET", name: "Cloudflare", kind: "stock", token: "0x116F00968269B7bfbaD4109cE591d6E74c0601d4", pool: "0xA9Caebb1b2fB2b954F192572b309aEf1cAf6a330", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { ticker: "DDOG", name: "Datadog", kind: "stock", token: "0x27c99fBde9D0d2AA4f4Bfb4943f237843DdF6958", pool: "0x8fbF4C8e6EE5a95f0d23Ef7A065Fe266fC59F680", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { ticker: "LMT", name: "Lockheed Martin", kind: "stock", token: "0x329fcACEb9AD6F9580DD5F643fed0646900D043c", pool: "0x54f160Bea60EC5207918C539d86E0b906b4DA297", feeBps: 3000, quote: "USDG", quoteIsToken0: false },
  { ticker: "WULF", name: "TeraWulf", kind: "stock", token: "0x348Be1A8663f15edDe5CDf8A96BB69078f7aB6Fd", pool: "0x0c72e22D7a3EF8Bb845478e5D77aec87789dEfc6", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "RUN", name: "Sunrun", kind: "stock", token: "0x756Bc80af765C82da966a788858d65aDF14f3793", pool: "0xe6d0f53073041E12bC46759519499764a4B92d13", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "FLY", name: "Firefly Aerospace", kind: "stock", token: "0x03BC731Ffb162cdd7B98D3C6542bFC291126075d", pool: "0x3594F65fE47577202C17BAfB18E5096b44DCEe6D", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "CLOV", name: "Clover Health", kind: "stock", token: "0x62200915e7DEab1eC7f79fb246daDbB80eACdDd0", pool: "0xBDfBc71db927fD566080AC21c6A2A89AE061F940", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "PATH", name: "UiPath", kind: "stock", token: "0xfb2664f07B6Aadd29ea7a59D8859b1AeB8645cDa", pool: "0x85e93fA4a14B266643B8C9bACe0312425815E72E", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "SOFI", name: "SoFi Technologies", kind: "stock", token: "0x98E75885157C80992A8D41b696D8c9C6Fb30A926", pool: "0xEA9368e1c88bCe7F04D16919eB131778A0dF826a", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "UMC", name: "United Microelectronics", kind: "stock", token: "0x0E6e67Ba88e7b5d9B67636A215c76779B948dE79", pool: "0xD95a760934ddf6818176d51c12e89520DD7bAC44", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "SCHD", name: "Schwab US Dividend Equity ETF", kind: "etf", token: "0xd63ABB2C13d7a8421a8017a712802053568e3C1D", pool: "0x359555e1fa3f28d5A25091dd9F6D350Cb66566cf", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "IONQ", name: "IonQ", kind: "stock", token: "0x558378E000D634A36593E338eBacdd6207640EfE", pool: "0xbc44b11f569d3FEEd9B4088F5A3fC569D2E3c77F", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "RKLB", name: "Rocket Lab", kind: "stock", token: "0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2", pool: "0xa9888De1B9D64A93eaeb495A39FE9B3d00654928", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "AAOI", name: "Applied Optoelectronics", kind: "stock", token: "0x521Cf887E6531c6F667b5BC4D896E5d9bfE8EB2E", pool: "0x078c1690865964838Ae346077046750846a552D1", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "FTNT", name: "Fortinet", kind: "stock", token: "0x3FB8976980d486084b2eb4a404BD12e72823958f", pool: "0x4f2e6B13f5b9595caEE276e14F9f457E17484503", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "XLK", name: "Technology Select Sector SPDR", kind: "etf", token: "0x15Cd20759CE7F3285c29A319dE2D1A2e098c6f43", pool: "0xe20463635cEEEA8E30A315FFc4D4e81c80E53147", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "XOM", name: "ExxonMobil", kind: "stock", token: "0xf9B46d3D1B22199D4D1025a9cEDB540A33F1a2d5", pool: "0x6aF79a2c154E7EeA9c87B38617D5f0B598B690FB", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "NOW", name: "ServiceNow", kind: "stock", token: "0x0C3260aF4B8f13a69c4c2dFb84fD667890CDFa14", pool: "0x00Ed6C6954EdF77FfA945696F1EACf08eDcC8d3A", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "ANET", name: "Arista Networks", kind: "stock", token: "0x28bABD556b60E53663B8615036479a29c2CDd1Bf", pool: "0x6369190700480aE579a331adFcDb7967255186dD", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "HWM", name: "Howmet Aerospace", kind: "stock", token: "0xAEa445c5F3DB1a462998ccC422A875A361ee5d99", pool: "0xdAaB22B473029a8F8F00cbe3a33dE82dBbeB6Ec9", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "ADBE", name: "Adobe", kind: "stock", token: "0x232B8ed6377BE97813853B0Ac104c4Cda8378d1B", pool: "0xd25e11E45f42660668AcC3Db09DFE56F890F2e58", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "VRT", name: "Vertiv Holdings", kind: "stock", token: "0xFA78C12E6488814A0262E4e802749a4a737d5fB7", pool: "0xb15E0E29161917D36bBBc496ae482DCE2C77C875", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "CLS", name: "Celestica", kind: "stock", token: "0xBf449977089c718C004a66C554B26B94ef3Ad4De", pool: "0xaEa7d4E856a1fC2Bd23C7EA26a3433464DE0428F", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "AMAT", name: "Applied Materials", kind: "stock", token: "0x36046893810a7E7fCE501229d57dc3FC8c8716d0", pool: "0xa255bAfB65F9c79047EC74814e456e53713C8Cb3", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "SMH", name: "VanEck Semiconductor ETF", kind: "etf", token: "0x072f979c2CAc8e1391B0162a87Fee094bF8744a0", pool: "0xF9d5F058099707F60740c09Bf67B32967971DC63", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "PWR", name: "Quanta Services", kind: "stock", token: "0x9Ab02Ead789b6903c3c44d0ED32F9c707CDF12FD", pool: "0x5CC24380A863119148723d2970aB712e4949B12c", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
  { ticker: "MPWR", name: "Monolithic Power Systems", kind: "stock", token: "0x52D50D0280AD1054b43f052bD70a49a212A1b128", pool: "0x56Ad01aE395869ae9c491A007c36be3B839A14A6", feeBps: 10000, quote: "USDG", quoteIsToken0: false },
  { ticker: "FIX", name: "Comfort Systems USA", kind: "stock", token: "0x93Dbb1d2Dc5D63F4abACFF30485273f538Df68Ac", pool: "0x745104601f86bE0B2392C916442A922F2923FA6C", feeBps: 10000, quote: "USDG", quoteIsToken0: true },
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
export const quoteDecimals = (m: Market) => (m.quote === "USDG" ? USDG_DECIMALS : 18);

/**
 * USD per share.
 *
 * A USDG pair is already in dollars, so the ETH reference is only applied to
 * WETH pairs. Getting the decimals the wrong way round on an 18/6 pool does
 * not error - it silently reads as $0.00 - so the ordering is derived from
 * orientation rather than assumed.
 */
export function usdPerShare(m: Market, sqrtPriceX96: bigint, ethUsd: number): number {
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
 * WETH per share, for the router only.
 *
 * DivsRouter charges its fee on the WETH side, so it can only trade a
 * WETH-quoted market. This returns 0 for anything else rather than a number
 * that looks usable.
 */
export function wethPerShare(m: Market, sqrtPriceX96: bigint): number {
  if (m.quote !== "WETH" || sqrtPriceX96 === 0n) return 0;
  const p = priceFromSqrt(sqrtPriceX96, 18, 18);
  if (p === 0) return 0;
  return m.quoteIsToken0 ? 1 / p : p;
}

/** A raw quote-side swap amount, in USD. */
export function quoteToUsd(m: Market, raw: bigint, ethUsd: number): number {
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
