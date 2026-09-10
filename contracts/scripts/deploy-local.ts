/**
 * Deploys the real DivsToken plus DivsStaking on a local node, against mock
 * WETH and LP, wires two pools, funds emissions, and pushes a fee through so
 * the accumulator is non-zero on first look.
 *
 * DIVS is the production token here, not a mock: its supply is fixed at
 * deployment, so everything below is funded by transferring from the deployer's
 * balance rather than minting on demand.
 *
 *   npx hardhat node
 *   npx hardhat run scripts/deploy-local.ts --network localhost
 */
import { network } from "hardhat";

const WEEK = 7n * 24n * 60n * 60n;

async function main() {
  const { ethers } = await network.connect();
  const [deployer, alice] = await ethers.getSigners();

  // The whole fixed supply lands with the deployer, standing in for a treasury.
  const divs = await ethers.deployContract("DivsToken", [deployer.address]);
  const weth = await ethers.deployContract("MockERC20", ["Wrapped Ether", "WETH"]);
  const lp = await ethers.deployContract("MockERC20", ["DIVS/WETH LP", "DIVS-LP"]);
  await Promise.all([divs.waitForDeployment(), weth.waitForDeployment(), lp.waitForDeployment()]);

  const staking = await ethers.deployContract("DivsStaking", [
    await divs.getAddress(),
    await weth.getAddress(),
    deployer.address,
  ]);
  await staking.waitForDeployment();

  // Pool 0: single-sided DIVS at 1x. Pool 1: DIVS/WETH LP at 2x.
  await (await staking.addPool(await divs.getAddress(), 10_000n)).wait();
  await (await staking.addPool(await lp.getAddress(), 20_000n)).wait();

  // Fund a 30-day emission period. The rate is derived from what is funded, so
  // emissions can never be scheduled without the DIVS to back them.
  const emissionBudget = ethers.parseEther("100000");
  const emissionDuration = 30n * 24n * 60n * 60n;
  await (await divs.approve(await staking.getAddress(), emissionBudget)).wait();
  await (await staking.notifyEmission(emissionBudget, emissionDuration)).wait();

  // Give alice a locked position so the dashboard has something to render.
  const stakeAmount = ethers.parseEther("1000");
  await (await divs.transfer(alice.address, stakeAmount)).wait();
  await (await divs.connect(alice).approve(await staking.getAddress(), stakeAmount)).wait();
  await (await staking.connect(alice).stake(0n, stakeAmount, 52n)).wait();

  // Push a fee through as the launchpad eventually will.
  const fee = ethers.parseEther("5");
  await (await weth.mint(deployer.address, fee)).wait();
  await (await weth.approve(await staking.getAddress(), fee)).wait();
  await (await staking.notifyFee(fee)).wait();

  const [pendingWeth, pendingDivs] = await staking.pendingRewards(alice.address);

  console.log("\nDeployed to localhost (chain 31337):");
  console.log("  DivsStaking :", await staking.getAddress());
  console.log("  DIVS        :", await divs.getAddress(), `(supply ${ethers.formatEther(await divs.totalSupply())})`);
  console.log("  WETH        :", await weth.getAddress());
  console.log("  LP          :", await lp.getAddress());
  console.log("\nAlice staked 1000 DIVS locked 52 weeks (4x weight)");
  console.log("  pending WETH:", ethers.formatEther(pendingWeth));
  console.log("  pending DIVS:", ethers.formatEther(pendingDivs));
  console.log("\nLock ends in", WEEK * 52n, "seconds of chain time.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
