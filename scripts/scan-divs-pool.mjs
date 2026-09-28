/**
 * One-off: find DIVS's own V4 pool(s) now that the token has launched.
 *
 *   node scripts/scan-divs-pool.mjs
 */
import { createPublicClient, http, keccak256, encodeAbiParameters, parseAbiParameters, getAddress } from "viem";
import { robinhood } from "viem/chains";

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const DEPLOYED_AT = "0x236e";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73".toLowerCase();
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168".toLowerCase();
const DIVS = "0xA66849230804F8A918e29208c93Ba40b814A9884".toLowerCase();
const POOLS_SLOT = 6n;

const INITIALIZE = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";

const extsloadAbi = [
  { type: "function", name: "extsload", stateMutability: "view", inputs: [{ name: "slot", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
];

const client = createPublicClient({ chain: robinhood, transport: http(undefined, { batch: true }) });

const toSlot = (n) => `0x${n.toString(16).padStart(64, "0")}`;
const asTopic = (addr) => `0x${addr.slice(2).toLowerCase().padStart(64, "0")}`;
const word = (data, i) => data.slice(2 + i * 64, 2 + (i + 1) * 64);
const stateSlot = (id) => BigInt(keccak256(encodeAbiParameters(parseAbiParameters("bytes32, uint256"), [id, POOLS_SLOT])));

async function rpc(method, params, attempt = 0) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (r.status === 429) {
    if (attempt >= 6) throw new Error("Too Many Requests");
    await new Promise((res) => setTimeout(res, 400 * 2 ** attempt));
    return rpc(method, params, attempt + 1);
  }
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function poolsFor(token) {
  const out = [];
  for (const position of [2, 3]) {
    const topics = [INITIALIZE, null, null, null];
    topics[position] = asTopic(token);
    const logs = await rpc("eth_getLogs", [{ address: POOL_MANAGER, fromBlock: DEPLOYED_AT, toBlock: "latest", topics }]);
    for (const l of logs) {
      const other = `0x${l.topics[position === 2 ? 3 : 2].slice(26)}`.toLowerCase();
      out.push({
        id: l.topics[1],
        currency0: `0x${l.topics[2].slice(26)}`,
        currency1: `0x${l.topics[3].slice(26)}`,
        other,
        fee: parseInt(word(l.data, 0), 16),
        tickSpacing: parseInt(word(l.data, 1), 16),
        hooks: `0x${word(l.data, 2).slice(24)}`,
      });
    }
  }
  return out;
}

const pools = await poolsFor(DIVS);
console.log(`DIVS has ${pools.length} V4 pool(s) total\n`);

for (const p of pools) {
  const quote = p.other === WETH ? "WETH" : p.other === USDG ? "USDG" : "other:" + p.other;
  console.log(`pool ${p.id}`);
  console.log(`  quote        : ${quote}`);
  console.log(`  fee          : ${p.fee}`);
  console.log(`  tickSpacing  : ${p.tickSpacing}`);
  console.log(`  hooks        : ${p.hooks}`);

  const base = stateSlot(p.id);
  const [s0, lq] = await client.multicall({
    contracts: [
      { address: POOL_MANAGER, abi: extsloadAbi, functionName: "extsload", args: [toSlot(base)] },
      { address: POOL_MANAGER, abi: extsloadAbi, functionName: "extsload", args: [toSlot(base + 3n)] },
    ],
    allowFailure: true,
  });
  const sqrtPriceX96 = s0.status === "success" ? BigInt(s0.result) & ((1n << 160n) - 1n) : 0n;
  const liquidity = lq.status === "success" ? BigInt(lq.result) & ((1n << 128n) - 1n) : 0n;
  console.log(`  sqrtPriceX96 : ${sqrtPriceX96}`);
  console.log(`  liquidity    : ${liquidity}`);

  if (sqrtPriceX96 > 0n && liquidity > 0n) {
    const quoteIsToken0 = p.currency0.toLowerCase() === p.other;
    console.log(`\n  registry row:`);
    console.log(
      `  { venue: "v4", ticker: "DIVS", name: "DIVS Protocol", kind: "token", token: "${getAddress(DIVS)}", ` +
        `feeBps: ${p.fee}, quote: "${quote}", quoteIsToken0: ${quoteIsToken0}, ` +
        `currency0: "${getAddress(p.currency0)}", currency1: "${getAddress(p.currency1)}", tickSpacing: ${p.tickSpacing}, hooks: "${getAddress(p.hooks)}" },`,
    );
  }
  console.log();
}
