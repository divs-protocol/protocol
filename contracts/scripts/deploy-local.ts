/**
 * Stands the protocol up on a local node: the staking vault and the router,
 * against mock DIVS, mock WETH, a mock V3 pool, a mock V2 pair and a mock V4
 * pool manager. Wires two staking pools, funds emissions, stakes a position,
 * and puts a real trade through each venue so every fee arrives the way it
 * will in production.
 *
 * $DIVS launches through a Uniswap V4 launchpad rather than being deployed
 * from this repo, so it is a mock here - the vault treats it as any ERC20.
 *
 *   npx hardhat node
 *   npx hardhat run scripts/deploy-local.ts --network localhost
 */
import { network } from "hardhat";

const WEEK = 7n * 24n * 60n * 60n;

async function main() {
  const { ethers } = await network.connect();
  const [deployer, alice] = await ethers.getSigners();

  // $DIVS launches through a Uniswap V4 launchpad, so a mock stands in for it
  // locally. Nothing in the protocol mints or owns the token - only this
  // script does, to have something to stake.
  const divs = await ethers.deployContract("MockERC20", ["DIVS", "DIVS"]);
  const weth = await ethers.deployContract("MockWETH");
  const usdg = await ethers.deployContract("MockERC20", ["Global Dollar", "USDG"]);
  const lp = await ethers.deployContract("MockERC20", ["DIVS/WETH LP", "DIVS-LP"]);
  const aapl = await ethers.deployContract("MockERC20", ["Apple", "AAPL"]);
  const amzn = await ethers.deployContract("MockERC20", ["Amazon", "AMZN"]);
  // One more stock per venue, so the local chain exercises all three.
  const msft = await ethers.deployContract("MockERC20", ["Microsoft", "MSFT"]);
  const goog = await ethers.deployContract("MockERC20", ["Alphabet", "GOOG"]);
  await Promise.all([
    divs.waitForDeployment(),
    weth.waitForDeployment(),
    usdg.waitForDeployment(),
    lp.waitForDeployment(),
    aapl.waitForDeployment(),
    amzn.waitForDeployment(),
    msft.waitForDeployment(),
    goog.waitForDeployment(),
  ]);
  await (await usdg.setDecimals(6)).wait();

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

  // The reference pool the router converts USDG fees through: 1 WETH = 2,500 USDG.
  const usdgAddress = await usdg.getAddress();
  const ethUsdg = 2500n * 10n ** 6n;
  const usdgIsToken0 = usdgAddress.toLowerCase() < wethAddress.toLowerCase();
  const usdgWethPool = await ethers.deployContract("MockV3Pool", [
    usdgAddress,
    wethAddress,
    usdgIsToken0 ? (10n ** 36n) / ethUsdg : ethUsdg,
  ]);
  await usdgWethPool.waitForDeployment();
  await (await usdg.mint(await usdgWethPool.getAddress(), 10n ** 15n)).wait();
  await (await weth.mint(await usdgWethPool.getAddress(), ethers.parseEther("1000000"))).wait();

  const poolManager = await ethers.deployContract("MockPoolManager");
  await poolManager.waitForDeployment();

  // 10 bps on the quote side, matching the Ignition default.
  const router = await ethers.deployContract("DivsRouter", [
    wethAddress,
    usdgAddress,
    await usdgWethPool.getAddress(),
    await staking.getAddress(),
    10n,
    deployer.address,
    await poolManager.getAddress(),
  ]);
  await router.waitForDeployment();

  // A USDG-quoted market, so the local chain exercises both fee paths.
  const usdgRate = 250n * 10n ** 6n; // 1 AMZN = 250 USDG
  const amznAddress = await amzn.getAddress();
  const usdgIsToken0Here = usdgAddress.toLowerCase() < amznAddress.toLowerCase();
  const amznPool = await ethers.deployContract("MockV3Pool", [
    usdgAddress,
    amznAddress,
    usdgIsToken0Here ? (10n ** 36n) / usdgRate : usdgRate,
  ]);
  await amznPool.waitForDeployment();
  await (await amzn.mint(await amznPool.getAddress(), ethers.parseEther("1000000"))).wait();
  await (await usdg.mint(await amznPool.getAddress(), 10n ** 15n)).wait();

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

  // A V2 market: 1 WETH buys 8 MSFT. No callback, so seeding it is a plain
  // mint of reserves onto the pair.
  const msftAddress = await msft.getAddress();
  const v2Pair = await ethers.deployContract("MockV2Pair", [wethAddress, msftAddress]);
  await v2Pair.waitForDeployment();
  const v2PairAddress = await v2Pair.getAddress();
  await (await msft.mint(v2PairAddress, ethers.parseEther("8000000"))).wait();
  await (await weth.mint(v2PairAddress, ethers.parseEther("1000000"))).wait();

  // A V4 market: 1 WETH buys 5 GOOG. V4 has no deployed pool contract - the
  // key itself is the identifier, and the mock manager is told its rate
  // directly rather than seeded with reserves priced by a curve.
  const googAddress = await goog.getAddress();
  const wethIsToken0V4 = wethAddress.toLowerCase() < googAddress.toLowerCase();
  const v4Rate = ethers.parseEther("5");
  const v4Key = {
    currency0: wethIsToken0V4 ? wethAddress : googAddress,
    currency1: wethIsToken0V4 ? googAddress : wethAddress,
    fee: 3000n,
    tickSpacing: 60n,
    hooks: ethers.ZeroAddress,
  };
  await (await poolManager.setRate(v4Key, wethIsToken0V4 ? v4Rate : (10n ** 36n) / v4Rate)).wait();
  await (await goog.mint(await poolManager.getAddress(), ethers.parseEther("1000000"))).wait();
  await (await weth.mint(await poolManager.getAddress(), ethers.parseEther("1000000"))).wait();

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

  // And a trade on the USDG side, whose fee is converted before it lands.
  const usdgSpend = 120_000n * 10n ** 6n;
  await (await usdg.mint(deployer.address, usdgSpend)).wait();
  await (await usdg.approve(await router.getAddress(), usdgSpend)).wait();
  await (await router.buy(await amznPool.getAddress(), usdgSpend, 0n, deployer.address)).wait();

  // One trade through each new venue, so all three are proven live locally,
  // not just deployed.
  const v2Spend = ethers.parseEther("10");
  await (await weth.mint(deployer.address, v2Spend)).wait();
  await (await weth.approve(await router.getAddress(), v2Spend)).wait();
  await (await router.buyV2(v2PairAddress, v2Spend, 0n, deployer.address)).wait();

  const v4Spend = ethers.parseEther("10");
  await (await weth.mint(deployer.address, v4Spend)).wait();
  await (await weth.approve(await router.getAddress(), v4Spend)).wait();
  await (await router.buyV4(v4Key, v4Spend, 0n, deployer.address)).wait();

  const [pendingWeth, pendingDivs] = await staking.pendingRewards(alice.address);

  console.log("\nDeployed to localhost (chain 31337):");
  console.log("  DivsStaking :", await staking.getAddress());
  console.log("  DivsRouter  :", await router.getAddress());
  console.log("  DIVS (mock) :", await divs.getAddress());
  console.log("  WETH        :", wethAddress);
  console.log("  LP          :", await lp.getAddress());
  console.log("  AAPL        :", aaplAddress);
  console.log("  AAPL pool   :", poolAddress, "(WETH quoted)");
  console.log("  USDG (mock) :", usdgAddress);
  console.log("  AMZN        :", amznAddress);
  console.log("  AMZN pool   :", await amznPool.getAddress(), "(USDG quoted)");
  console.log("  V4 manager  :", await poolManager.getAddress(), "(mock)");
  console.log("  MSFT        :", msftAddress);
  console.log("  MSFT pair   :", v2PairAddress, "(V2, WETH quoted)");
  console.log("  GOOG        :", googAddress, "(V4, WETH quoted, hookless)");

  console.log("\nTraded 60 WETH through the router:");
  console.log("  AAPL bought   :", ethers.formatEther(await aapl.balanceOf(deployer.address)));
  console.log("  fee to staking:", ethers.formatEther(await weth.balanceOf(await staking.getAddress())));
  console.log("  held in router:", ethers.formatEther(await router.pendingFees()));

  console.log("\nTraded 120,000 USDG through the router:");
  console.log("  AMZN bought     :", ethers.formatEther(await amzn.balanceOf(deployer.address)));
  console.log("  USDG held       :", await router.pendingUsdgFees());
  console.log("  staking (WETH)  :", ethers.formatEther(await weth.balanceOf(await staking.getAddress())));
  console.log("  staking (USDG)  :", await usdg.balanceOf(await staking.getAddress()), "(must be 0)");

  console.log("\nTraded 10 WETH through V2 and 10 WETH through V4:");
  console.log("  MSFT bought (V2):", ethers.formatEther(await msft.balanceOf(deployer.address)));
  console.log("  GOOG bought (V4):", ethers.formatEther(await goog.balanceOf(deployer.address)));
  console.log(
    "  staking (WETH)  :",
    ethers.formatEther(await weth.balanceOf(await staking.getAddress())),
    "(flushed from all four trades)",
  );
  console.log(
    "  held in router  :",
    ethers.formatEther(await router.pendingFees()),
    "(these two, below the flush threshold)",
  );

  console.log("\nAlice staked 1000 DIVS locked 52 weeks (4x weight)");
  console.log("  pending WETH:", ethers.formatEther(pendingWeth));
  console.log("  pending DIVS:", ethers.formatEther(pendingDivs));
  console.log("\nLock ends in", WEEK * 52n, "seconds of chain time.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
