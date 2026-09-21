/**
 * Does a Uniswap V4 pool exist for a given pair, and how deep is it?
 *
 * V4 has no factory to ask. Pools live inside one PoolManager, keyed by the
 * hash of their own parameters, so a pool is found by computing the key rather
 * than by looking it up:
 *
 *   poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 *
 * State is then read with `extsload`, which returns a raw storage word. The
 * pools mapping sits at slot 6 of the PoolManager, so a pool's first word is at
 * keccak256(poolId, 6) and holds slot0: sqrtPriceX96 in the low 160 bits, the
 * tick above it. Liquidity is three words further in.
 *
 * This finds pools with no hook attached. A pool deployed behind a hook has a
 * different key and will not appear, which is a real limit of this approach and
 * the reason the count it reports is a floor rather than a total.
 */
import { createPublicClient, http, keccak256, encodeAbiParameters, parseAbiParameters, getAddress } from "viem";
import { robinhood } from "viem/chains";

const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

/** Uniswap's standard fee tiers and the tick spacing each one ships with. */
const TIERS = [
  { fee: 100, tickSpacing: 1 },
  { fee: 500, tickSpacing: 10 },
  { fee: 3000, tickSpacing: 60 },
  { fee: 10000, tickSpacing: 200 },
];

/** `mapping(PoolId => Pool.State) internal _pools` is the seventh slot. */
const POOLS_SLOT = 6n;

const extsloadAbi = [
  {
    type: "function",
    name: "extsload",
    stateMutability: "view",
    inputs: [{ name: "slot", type: "bytes32" }],
    outputs: [{ type: "bytes32" }],
  },
];

const client = createPublicClient({ chain: robinhood, transport: http(undefined, { batch: true }) });

const toSlot = (n) => `0x${n.toString(16).padStart(64, "0")}`;

function poolId(currency0, currency1, fee, tickSpacing, hooks = "0x0000000000000000000000000000000000000000") {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, address, uint24, int24, address"), [
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks,
    ]),
  );
}

/** Sorted, because a PoolKey is defined with the lower address first. */
function order(a, b) {
  return BigInt(a) < BigInt(b) ? [getAddress(a), getAddress(b)] : [getAddress(b), getAddress(a)];
}

async function readPool(id) {
  const base = BigInt(keccak256(encodeAbiParameters(parseAbiParameters("bytes32, uint256"), [id, POOLS_SLOT])));

  const [slot0, liquidity] = await Promise.all([
    client.readContract({ address: POOL_MANAGER, abi: extsloadAbi, functionName: "extsload", args: [toSlot(base)] }),
    // slot0, feeGrowth0, feeGrowth1, then liquidity.
    client.readContract({ address: POOL_MANAGER, abi: extsloadAbi, functionName: "extsload", args: [toSlot(base + 3n)] }),
  ]);

  const word = BigInt(slot0);
  return {
    sqrtPriceX96: word & ((1n << 160n) - 1n),
    tick: BigInt.asIntN(24, (word >> 160n) & ((1n << 24n) - 1n)),
    liquidity: BigInt(liquidity) & ((1n << 128n) - 1n),
  };
}

const [, , tokenArg, symbolArg] = process.argv;
const token = tokenArg ?? "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9"; // AAPL
const symbol = symbolArg ?? "AAPL";

console.log(`Probing V4 pools for ${symbol} ${token}\n`);

for (const [quoteName, quote] of [["WETH", WETH], ["USDG", USDG]]) {
  const [c0, c1] = order(token, quote);
  for (const { fee, tickSpacing } of TIERS) {
    const id = poolId(c0, c1, fee, tickSpacing);
    try {
      const { sqrtPriceX96, tick, liquidity } = await readPool(id);
      if (sqrtPriceX96 === 0n) continue;
      console.log(
        `${quoteName.padEnd(5)} fee=${String(fee).padStart(5)} spacing=${String(tickSpacing).padStart(4)}` +
          `  liquidity=${liquidity}  tick=${tick}\n      poolId ${id}`,
      );
    } catch (e) {
      console.log(`${quoteName} fee=${fee} read failed: ${e.shortMessage ?? e.message}`);
    }
    await new Promise((r) => setTimeout(r, 60));
  }
}
