/**
 * Rebuilds the market registry from the chain.
 *
 * A listing here is a Uniswap pool this protocol can read, not a permission
 * anyone grants - so the set of markets changes whenever Robinhood issues a
 * token or somebody seeds a pool. The registry in src/lib/exchange.ts was
 * written by hand once and went stale within a week: it carried seventeen
 * markets while thirty-four had liquidity.
 *
 *   node scripts/scan-markets.mjs            # report what is tradeable
 *   node scripts/scan-markets.mjs --write    # rewrite the MARKETS array
 *
 * Token addresses come from tokens.json beside this file, which is refreshed
 * from the explorer's token list. The explorer sits behind a bot check, so it
 * cannot be scripted - paste the list in rather than fetching it here.
 */
import { createPublicClient, http, getAddress } from "viem";
import { robinhood } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const FEES = [100, 500, 3000, 10000];

/** Anything quoted in USDG needs router work before it can be traded here. */
const QUOTES = { WETH, USDG };

const factoryAbi = [
  { type: "function", name: "getPool", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }] },
];
const poolAbi = [
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
/** ERC-8056. A ticker squatter will not have it, which is how they are caught. */
const tokenAbi = [
  { type: "function", name: "uiMultiplier", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

const client = createPublicClient({
  chain: robinhood,
  transport: http(process.env.ROBINHOOD_RPC_URL, { batch: true, timeout: 60_000 }),
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The endpoint rate-limits, and a full scan is roughly fifteen hundred calls.
 * Without this the script dies somewhere in the middle and leaves no way to
 * tell a token with no pool from one the RPC simply refused to answer for.
 */
async function withRetry(fn, attempts = 5) {
  for (let i = 0; ; i += 1) {
    try {
      return await fn();
    } catch (error) {
      const retryable = /rate|limit|timeout|invalid parameters|unknown RPC/i.test(String(error?.message));
      if (!retryable || i >= attempts - 1) throw error;
      await sleep(400 * 2 ** i);
    }
  }
}

/** Deepest pool for a token against one quote asset, or null. */
async function deepestPool(token, quote) {
  const pools = await withRetry(() =>
    Promise.all(
      FEES.map((fee) => client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getPool", args: [token, quote, fee] })),
    ),
  );
  let best = null;
  for (let i = 0; i < FEES.length; i += 1) {
    const pool = pools[i];
    if (pool === "0x0000000000000000000000000000000000000000") continue;
    try {
      const [liquidity, token0] = await withRetry(() =>
        Promise.all([
          client.readContract({ address: pool, abi: poolAbi, functionName: "liquidity" }),
          client.readContract({ address: pool, abi: poolAbi, functionName: "token0" }),
        ]),
      );
      if (liquidity > 0n && (!best || liquidity > best.liquidity)) {
        best = { pool: getAddress(pool), feeBps: FEES[i], liquidity, quoteIsToken0: token0.toLowerCase() === quote.toLowerCase() };
      }
    } catch {
      // An un-initialised pool reverts on read; treat it as absent.
    }
  }
  return best;
}

const tokens = JSON.parse(fs.readFileSync(path.join(DIR, "tokens.json"), "utf8"));
const tradeable = [];
const quotedInUsdg = [];
const noLiquidity = [];
const notStockTokens = [];

for (const t of tokens) {
  const token = getAddress(t.token);

  try {
    await withRetry(() => client.readContract({ address: token, abi: tokenAbi, functionName: "uiMultiplier" }), 3);
  } catch {
    notStockTokens.push(t.ticker);
    continue;
  }

  const weth = await deepestPool(token, QUOTES.WETH);
  if (weth) {
    tradeable.push({ ...t, token, pool: weth.pool, feeBps: weth.feeBps, wethIsToken0: weth.quoteIsToken0, liquidity: weth.liquidity });
    continue;
  }

  const usdg = await deepestPool(token, QUOTES.USDG);
  if (usdg) quotedInUsdg.push(t.ticker);
  else noLiquidity.push(t.ticker);

  await sleep(60);
}

tradeable.sort((a, b) => (b.liquidity > a.liquidity ? 1 : -1));

console.log(`\ntradeable against WETH : ${tradeable.length}`);
console.log(`quoted in USDG only    : ${quotedInUsdg.length}  ${quotedInUsdg.join(" ")}`);
console.log(`no pool liquidity      : ${noLiquidity.length}  ${noLiquidity.join(" ")}`);
if (notStockTokens.length) console.log(`not ERC-8056           : ${notStockTokens.join(" ")}`);
console.log();
for (const m of tradeable) console.log(`${m.ticker.padEnd(6)} fee=${String(m.feeBps).padStart(5)}  liquidity=${m.liquidity}`);

if (!process.argv.includes("--write")) {
  console.log("\nRe-run with --write to update src/lib/exchange.ts");
  process.exit(0);
}

const rows = tradeable
  .map((m) => `  { ticker: "${m.ticker}", name: "${m.name}", kind: "${m.kind}", token: "${m.token}", pool: "${m.pool}", feeBps: ${m.feeBps}, wethIsToken0: ${m.wethIsToken0} },`)
  .join("\n");

const file = path.join(DIR, "..", "src", "lib", "exchange.ts");
const src = fs.readFileSync(file, "utf8");
const start = src.indexOf("export const MARKETS: Market[] = [");
const end = src.indexOf("];", start) + 2;
fs.writeFileSync(file, `${src.slice(0, start)}export const MARKETS: Market[] = [\n${rows}\n];${src.slice(end)}`);
console.log(`\nwrote ${tradeable.length} markets to src/lib/exchange.ts`);
