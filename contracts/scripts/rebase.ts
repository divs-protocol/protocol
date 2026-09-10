/**
 * Moves the MockStockToken UI multiplier on a local node, simulating a dividend
 * (or a downward correction), so vault yield can be exercised from the web app.
 *
 *   npm run rebase --multiplier=1.5
 *
 * (`hardhat run` does not forward positional arguments, so the value comes in
 * as an npm config flag; MULTIPLIER=... in the environment also works.)
 *
 * The token address is read from the web app's .env.local (written by
 * deploy-local.ts); override it with TOKEN=0x...
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../../.env.local");

function tokenFromEnvFile(): string | undefined {
  if (!existsSync(envPath)) return undefined;
  const match = readFileSync(envPath, "utf8").match(
    /^NEXT_PUBLIC_STOCK_TOKEN_ADDRESS=(0x[0-9a-fA-F]{40})\s*$/m,
  );
  return match?.[1];
}

const target = process.env.MULTIPLIER ?? process.env.npm_config_multiplier;
if (!target || !/^\d+(\.\d+)?$/.test(target)) {
  throw new Error(
    "Usage: npm run rebase --multiplier=<value>   e.g. npm run rebase --multiplier=1.5",
  );
}

const tokenAddress = process.env.TOKEN ?? tokenFromEnvFile();
if (!tokenAddress) {
  throw new Error(
    `No token address. Run deploy:local first, or pass TOKEN=0x... (looked in ${envPath})`,
  );
}

const { ethers } = await network.create({ network: "localhost", chainType: "l1" });
const token = await ethers.getContractAt("MockStockToken", tokenAddress);

const before = await token.uiMultiplier();
const next = ethers.parseUnits(target, 18);
await (await token.setMultiplier(next)).wait();

console.log(
  `uiMultiplier ${ethers.formatUnits(before, 18)} -> ${ethers.formatUnits(next, 18)}`,
);
