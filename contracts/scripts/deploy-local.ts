/**
 * Stands the protocol up on a local node: the staking vault and the router,
 * against mock DIVS, mock WETH and a mock pool. Wires two staking pools, funds
 * emissions, stakes a position, and then puts a real trade through the router
 * so the fee arrives the way it will in production.
 *
 * $DIVS is launched on Pons rather than deployed from this repo, so it is a
 * mock here - the vault treats it as any ERC20.
 *
 *   npx hardhat node
 *   npx hardhat run scripts/deploy-local.ts --network localhost
 */
import { network } from "hardhat";

const WEEK = 7n * 24n * 60n * 60n;

async function main() {
  const { ethers } = await network.connect();
  const [deployer, alice] = await ethers.getSigners();

  // $DIVS is launched on Pons, so a mock stands in for it locally. Nothing in
  // the protocol mints or owns the token - only this script does, to have
  // something to stake.
  const divs = await ethers.deployContract("MockERC20", ["DIVS", "DIVS"]);
  const weth = await ethers.deployContract("MockWETH");
  const lp = await ethers.deployContract("MockERC20", ["DIVS/WETH LP", "DIVS-LP"]);
  const aapl = await ethers.deployContract("MockERC20", ["Apple", "AAPL"]);
  await Promise.all([
    divs.waitForDeployment(),
    weth.waitForDeployment(),
    lp.waitForDeployment(),
    aapl.waitForDeployment(),
  ]);

  const wethAddress = await weth.getAddress();
  const aaplAddress = await aapl.getAddress();

  const staking = await ethers.deployContract("DivsStaking", [
    await divs.getAddress(),
    wethAddress,
    deployer.address,
  ]);
  await staking.waitForDeployment();

  // Pool 0: single-sided DIVS at 1x. Pool 1: DIVS/WETH LP at 2x.
  await (await staking.addPool(await divs.getAddress(), 10_000n)).wait();
  await (await staking.addPool(await lp.getAddress(), 20_000n)).wait();

  // 10 bps on the WETH side, matching the Ignition default.
  const router = await ethers.deployContract("DivsRouter", [
    wethAddress,
    await staking.getAddress(),
    10n,
    deployer.address,
  ]);
  await router.waitForDeployment();

  // A market to trade against: 1 WETH buys 10 AAPL. The mock pool orders its
  // own tokens, so the rate is expressed for whichever side ends up token0.
  const wethIsToken0 = wethAddress.toLowerCase() < aaplAddress.toLowerCase();
  const rate = ethers.parseEther("10");
  const pool = await ethers.deployContract("MockV3Pool", [
    wethAddress,
    aaplAddress,
    wethIsToken0 ? rate : (10n ** 36n) / rate,
  ]);
  await pool.waitForDeployment();

  const poolAddress = await pool.getAddress();
  await (await aapl.mint(poolAddress, ethers.parseEther("1000000"))).wait();
  await (await weth.mint(poolAddress, ethers.parseEther("1000000"))).wait();

  // Fund a 30-day emission period. The rate is derived from what is funded, so
  // emissions can never be scheduled without the DIVS to back them.
  const emissionBudget = ethers.parseEther("100000");
  const emissionDuration = 30n * 24n * 60n * 60n;
  await (await divs.mint(deployer.address, emissionBudget + ethers.parseEther("1000"))).wait();
  await (await divs.approve(await staking.getAddress(), emissionBudget)).wait();
  await (await staking.notifyEmission(emissionBudget, emissionDuration)).wait();

  // Give alice a locked position so the dashboard has something to render.
  const stakeAmount = ethers.parseEther("1000");
  await (await divs.transfer(alice.address, stakeAmount)).wait();
  await (await divs.connect(alice).approve(await staking.getAddress(), stakeAmount)).wait();
  await (await staking.connect(alice).stake(0n, stakeAmount, 52n)).wait();

  // A real trade. The router takes its fee on the WETH side and pushes it to
  // staking once the threshold is passed, so nothing here calls notifyFee.
  const spend = ethers.parseEther("60");
  await (await weth.mint(deployer.address, spend)).wait();
  await (await weth.approve(await router.getAddress(), spend)).wait();
  await (await router.buy(poolAddress, spend, 0n, deployer.address)).wait();

  const [pendingWeth, pendingDivs] = await staking.pendingRewards(alice.address);

  console.log("\nDeployed to localhost (chain 31337):");
  console.log("  DivsStaking :", await staking.getAddress());
  console.log("  DivsRouter  :", await router.getAddress());
  console.log("  DIVS (mock) :", await divs.getAddress());
  console.log("  WETH        :", wethAddress);
  console.log("  LP          :", await lp.getAddress());
  console.log("  AAPL        :", aaplAddress);
  console.log("  AAPL pool   :", poolAddress);

  console.log("\nTraded 60 WETH through the router:");
  console.log("  AAPL bought   :", ethers.formatEther(await aapl.balanceOf(deployer.address)));
  console.log("  fee to staking:", ethers.formatEther(await weth.balanceOf(await staking.getAddress())));
  console.log("  held in router:", ethers.formatEther(await router.pendingFees()));

  console.log("\nAlice staked 1000 DIVS locked 52 weeks (4x weight)");
  console.log("  pending WETH:", ethers.formatEther(pendingWeth));
  console.log("  pending DIVS:", ethers.formatEther(pendingDivs));
  console.log("\nLock ends in", WEEK * 52n, "seconds of chain time.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
