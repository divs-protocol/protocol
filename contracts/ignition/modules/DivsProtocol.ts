import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys DIVS and the staking vault together.
 *
 * `treasury` receives the entire fixed supply - there is no mint function, so
 * whatever this address is at deployment holds every token that will ever
 * exist. `weth` must be the canonical wrapped ether for the target chain, since
 * fees are paid in it.
 */
export default buildModule("DivsProtocol", (m) => {
  const treasury = m.getParameter("treasury", m.getAccount(0));
  const weth = m.getParameter("weth");
  const owner = m.getParameter("owner", m.getAccount(0));

  const divs = m.contract("DivsToken", [treasury]);
  const staking = m.contract("DivsStaking", [divs, weth, owner]);

  // Pool 0 single-sided DIVS at 1x; the LP pool is added once the pair exists.
  m.call(staking, "addPool", [divs, 10_000n]);

  return { divs, staking };
});
