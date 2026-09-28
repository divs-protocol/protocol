/**
 * Estimates the gas cost of deploying DivsRouter with the current
 * params.json values, without sending anything. Run before a real deploy
 * when the balance looks tight.
 *
 *   npx hardhat run scripts/estimate-deploy.ts --network robinhood
 */
import { network } from "hardhat";
import params from "../params.json" with { type: "json" };

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();

  const p = params.DivsRouterOnly;
  const Router = await ethers.getContractFactory("DivsRouter");
  const deployTx = await Router.getDeployTransaction(
    p.weth,
    p.usdg,
    p.usdgWethPool,
    "0x0000000000000000000000000000000000000000",
    p.feeBps,
    deployer.address,
    p.poolManager,
  );

  const [gas, feeData, balance] = await Promise.all([
    ethers.provider.estimateGas({ ...deployTx, from: deployer.address }),
    ethers.provider.getFeeData(),
    ethers.provider.getBalance(deployer.address),
  ]);

  const gasPrice = feeData.gasPrice ?? 0n;
  const cost = gas * gasPrice;

  console.log(`\n  gas       ${gas.toString()}`);
  console.log(`  gasPrice  ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`  cost      ${ethers.formatEther(cost)} ETH`);
  console.log(`  balance   ${ethers.formatEther(balance)} ETH`);
  console.log(
    balance > cost * 2n
      ? "  plenty of headroom\n"
      : balance > cost
        ? "  covers it, but tight - consider topping up\n"
        : "  NOT ENOUGH - fund the deployer before deploying\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
