/**
 * Deploys a MockStockToken + DivsVault pair to a running `hardhat node`, seeds
 * the first account with tokens, and writes the addresses into the web app's
 * .env.local so the UI picks them up on the next reload.
 *
 *   npm run node          # terminal 1
 *   npm run deploy:local  # terminal 2
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../../.env.local");

/** Rewrites only the keys we own, leaving anything else in the file intact. */
function updateEnv(values: Record<string, string>) {
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const lines = existing.split(/\r?\n/).filter((l) => l.trim() !== "");
  const kept = lines.filter((l) => !Object.keys(values).some((k) => l.startsWith(`${k}=`)));
  const next = [...kept, ...Object.entries(values).map(([k, v]) => `${k}=${v}`)];
  writeFileSync(envPath, next.join("\n") + "\n");
}

const { ethers } = await network.create({ network: "localhost", chainType: "l1" });

const [deployer] = await ethers.getSigners();

// Start at 1.0 so the UI multiplier reads naturally; `rebase.ts` moves it later.
const token = await ethers.deployContract("MockStockToken", [10n ** 18n]);
await token.waitForDeployment();
const tokenAddress = await token.getAddress();

const vault = await ethers.deployContract("DivsVault", [deployer.address]);
await vault.waitForDeployment();
const vaultAddress = await vault.getAddress();

const mintAmount = 1000n * 10n ** 18n;
await (await token.mint(deployer.address, mintAmount)).wait();

updateEnv({
  NEXT_PUBLIC_DIVS_VAULT_ADDRESS: vaultAddress,
  NEXT_PUBLIC_STOCK_TOKEN_ADDRESS: tokenAddress,
});

console.log("Deployer:      ", deployer.address);
console.log("MockStockToken:", tokenAddress);
console.log("DivsVault:     ", vaultAddress);
console.log("Minted:        ", ethers.formatUnits(mintAmount, 18), "MSTK to deployer");
console.log("Wrote:         ", envPath);
console.log();
console.log("Reload the web app; the Vaults tab will pick these up.");
