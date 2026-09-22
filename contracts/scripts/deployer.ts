/**
 * Which address is about to deploy, and can it pay for it?
 *
 * The deploy key lives in the encrypted keystore, so its address is not
 * something you can read off a file. This derives it from the key without
 * printing the key, which is the address to fund and the one that will be
 * recorded on the explorer as the router's creator, permanently.
 *
 *   npx hardhat run scripts/deployer.ts --network robinhood
 */
import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();

  const balance = await ethers.provider.getBalance(deployer.address);
  const { chainId } = await ethers.provider.getNetwork();

  console.log(`\n  chain    ${chainId}`);
  console.log(`  address  ${deployer.address}`);
  console.log(`  balance  ${ethers.formatEther(balance)} ETH\n`);

  if (balance === 0n) {
    console.log("  Nothing to spend. Fund this address before deploying.\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
