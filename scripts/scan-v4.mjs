/**
 * Measures how much of Robinhood Chain's stock liquidity DIVS cannot reach.
 *
 * The registry is built from Uniswap V3 pools, because that is the only venue
 * DivsRouter can call. Most of the liquidity on this chain is in V4, which the
 * router has no path to, and dozens of tokens trade only there and so are not
 * listed at all.
 *
 *   node scripts/scan-v4.mjs
 *
 * Pools are found from `Initialize` events rather than by computing pool ids.
 * An id is the hash of the whole PoolKey, hooks included, so computing one
 * requires already knowing the hook address. Most V4 pools here carry a hook:
 * of the seventy-one pools holding CRM, thirty-eight do. A scan that assumes no
 * hook misses those, which is exactly how an earlier version of this script
 * reported twenty-five tokens with V4 liquidity when the true figure is higher.
 *
 * The event gives the full key. State then comes from `extsload`, which returns
 * a raw storage word: the pools mapping is at slot 6, so a pool's slot0 is at
 * keccak256(poolId, 6) and its liquidity three words later.
 */
import { createPublicClient, http, keccak256, encodeAbiParameters, parseAbiParameters, getAddress } from "viem";
import { robinhood } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const DEPLOYED_AT = "0x236e"; // block 9070
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73".toLowerCase();
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168".toLowerCase();
const POOLS_SLOT = 6n;

/** keccak256("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)") */
const INITIALIZE =
  "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";

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
const asTopic = (addr) => `0x${addr.slice(2).toLowerCase().padStart(64, "0")}`;
const word = (data, i) => data.slice(2 + i * 64, 2 + (i + 1) * 64);

const stateSlot = (id) =>
  BigInt(keccak256(encodeAbiParameters(parseAbiParameters("bytes32, uint256"), [id, POOLS_SLOT])));

/**
 * Retries a 429 with backoff rather than surfacing it as "no pool" - the
 * earlier version of this script had no retry, and a run late in the token
 * list would get rate-limited hard enough that most of it came back "Too
 * Many Requests," silently undercounting real V4 liquidity rather than
 * failing loudly.
 */
async function rpc(method, params, attempt = 0) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (r.status === 429) {
    if (attempt >= 6) throw new Error("Too Many Requests (out of retries)");
    await new Promise((res) => setTimeout(res, 400 * 2 ** attempt));
    return rpc(method, params, attempt + 1);
  }
  const j = await r.json();
  if (j.error) {
    if (/too many requests|rate limit/i.test(j.error.message) && attempt < 6) {
      await new Promise((res) => setTimeout(res, 400 * 2 ** attempt));
      return rpc(method, params, attempt + 1);
    }
    throw new Error(j.error.message);
  }
  return j.result;
}

/** Every pool ever created with this token on one side. */
async function poolsFor(token) {
  const out = [];
  // The currencies are indexed, so each side is its own topic position.
  for (const position of [2, 3]) {
    const topics = [INITIALIZE, null, null, null];
    topics[position] = asTopic(token);
    const logs = await rpc("eth_getLogs", [
      { address: POOL_MANAGER, fromBlock: DEPLOYED_AT, toBlock: "latest", topics },
    ]);
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

function knownTokens() {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, "tokens.json"), "utf8"));
  const rows = Array.isArray(raw) ? raw : Object.entries(raw).map(([symbol, address]) => ({ symbol, address }));
  return rows
    .map((r) => ({ symbol: r.symbol ?? r.ticker, address: getAddress(r.address ?? r.token) }))
    .filter((r) => r.symbol && r.address);
}

function listed() {
  const src = fs.readFileSync(path.join(DIR, "..", "src", "lib", "exchange.ts"), "utf8");
  const out = new Set();
  for (const line of src.split("\n")) {
    // ticker: is no longer the first field - venue: leads every row since the
    // registry became venue-aware, so this can't anchor on the opening brace.
    const m = line.match(/ticker: "([^"]+)"/);
    if (m) out.add(m[1]);
  }
  return out;
}

const tokens = knownTokens();
const onDivs = listed();
console.log(`${tokens.length} tokens known, ${onDivs.size} listed on DIVS\n`);

const rows = [];

for (let i = 0; i < tokens.length; i += 1) {
  const t = tokens[i];
  process.stdout.write(`\r  ${i + 1}/${tokens.length}  ${t.symbol.padEnd(8)}`);

  let pools;
  try {
    pools = await poolsFor(t.address);
  } catch (e) {
    console.log(`\n  ${t.symbol}: ${e.message}`);
    continue;
  }

  // Only pairs against an asset the router could actually pay in.
  const quoted = pools.filter((p) => p.other === WETH || p.other === USDG);
  if (!quoted.length) continue;

  const contracts = quoted.flatMap((p) => {
    const base = stateSlot(p.id);
    return [
      { address: POOL_MANAGER, abi: extsloadAbi, functionName: "extsload", args: [toSlot(base)] },
      { address: POOL_MANAGER, abi: extsloadAbi, functionName: "extsload", args: [toSlot(base + 3n)] },
    ];
  });

  const state = await client.multicall({ contracts, allowFailure: true });

  for (let n = 0; n < quoted.length; n += 1) {
    const s0 = state[n * 2];
    const lq = state[n * 2 + 1];
    if (s0?.status !== "success") continue;
    const sqrtPriceX96 = BigInt(s0.result) & ((1n << 160n) - 1n);
    if (sqrtPriceX96 === 0n) continue;
    const liquidity = lq?.status === "success" ? BigInt(lq.result) & ((1n << 128n) - 1n) : 0n;
    if (liquidity === 0n) continue;
    rows.push({ ...quoted[n], symbol: t.symbol, liquidity, quote: quoted[n].other === WETH ? "WETH" : "USDG" });
  }
}

console.log("\n");

const best = new Map();
for (const r of rows) {
  const prev = best.get(r.symbol);
  if (!prev || r.liquidity > prev.liquidity) best.set(r.symbol, r);
}

const missing = [...best.values()].filter((b) => !onDivs.has(b.symbol));
const hooked = rows.filter((r) => !/^0x0+$/.test(r.hooks));

console.log(`V4 pools with liquidity    : ${rows.length}`);
console.log(`  of those, behind a hook  : ${hooked.length}`);
console.log(`tokens with V4 liquidity   : ${best.size}`);
console.log(`  of those, not on DIVS    : ${missing.length}`);
console.log();

if (missing.length) {
  console.log("Tradeable on V4 today, absent from DIVS:");
  console.log(missing.sort((a, b) => (b.liquidity > a.liquidity ? 1 : -1)).map((b) => b.symbol).join(" "));
  console.log();

  // Only these are immediately listable - a hooked pool runs arbitrary code
  // on every swap through it, so it stays off the registry until someone has
  // actually reviewed that hook and the router owner has allowlisted it.
  const hookless = missing.filter((b) => /^0x0+$/.test(b.hooks));
  console.log(`Hookless and absent - listable now: ${hookless.length}`);
  console.log(
    hookless
      .sort((a, b) => (b.liquidity > a.liquidity ? 1 : -1))
      .map((b) => `${b.symbol.padEnd(7)} ${b.quote.padEnd(4)} fee=${b.fee.toString().padStart(6)} liquidity=${b.liquidity} ${b.other}`)
      .join("\n"),
  );
  console.log();

  // Ready to paste into MARKETS in src/lib/exchange.ts - the token's own
  // name and kind come from tokens.json, everything else from the pool this
  // scan already found.
  const byTicker = new Map(tokens.map((t) => [t.symbol, t]));
  const known = JSON.parse(fs.readFileSync(path.join(DIR, "tokens.json"), "utf8"));
  const meta = new Map((Array.isArray(known) ? known : []).map((t) => [t.ticker ?? t.symbol, t]));
  console.log("Registry rows for the hookless set:");
  for (const b of hookless.sort((a, c) => (c.liquidity > a.liquidity ? 1 : -1))) {
    const t = meta.get(b.symbol) ?? byTicker.get(b.symbol);
    const name = t?.name ?? b.symbol;
    const kind = t?.kind ?? "stock";
    const token = t?.token ?? t?.address;
    const quoteIsToken0 = b.currency0.toLowerCase() === (b.quote === "WETH" ? WETH : USDG).toLowerCase();
    // Addresses come off raw event topics, lowercase, not checksummed - the
    // same mistake the registry's own header warns about: one bad checksum
    // here breaks the whole multicall batch, not just this row.
    console.log(
      `  { venue: "v4", ticker: "${b.symbol}", name: "${name}", kind: "${kind}", token: "${getAddress(token)}", ` +
        `feeBps: ${b.fee}, quote: "${b.quote}", quoteIsToken0: ${quoteIsToken0}, ` +
        `currency0: "${getAddress(b.currency0)}", currency1: "${getAddress(b.currency1)}", tickSpacing: ${b.tickSpacing}, hooks: "${getAddress(b.hooks)}" },`,
    );
  }
  console.log();
}

console.log("Deepest V4 pool per token, top 40:");
for (const b of [...best.values()].sort((a, b) => (b.liquidity > a.liquidity ? 1 : -1)).slice(0, 40)) {
  const hook = /^0x0+$/.test(b.hooks) ? "no hook" : `hook ${b.hooks.slice(0, 10)}`;
  console.log(
    `${b.symbol.padEnd(7)} ${b.quote.padEnd(5)} fee=${String(b.fee).padStart(6)} ${hook.padEnd(16)}` +
      ` liquidity=${b.liquidity.toString().padStart(24)}  ${onDivs.has(b.symbol) ? "listed" : "NOT LISTED"}`,
  );
}
