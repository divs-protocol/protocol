import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the protocol: the token, the staking vault, and the router that
 * charges the fee the vault distributes.
 *
 * `treasury` receives the entire fixed supply - there is no mint function, so
 * whatever this address is at deployment holds every token that will ever
 * exist. `weth` must be the canonical wrapped ether for the target chain, since
 * fees are paid in it.
 *
 * Order matters: the router takes the staking address in its constructor, so
 * staking is deployed first. Staking needs nothing back - `notifyFee` is
 * permissionless, and the router pays in as any caller would.
 */
export default buildModule("DivsProtocol", (m) => {
  const treasury = m.getParameter("treasury", m.getAccount(0));
  const weth = m.getParameter("weth");
  const owner = m.getParameter("owner", m.getAccount(0));

  /** Protocol fee in basis points, charged on the WETH side of every trade. */
  const feeBps = m.getParameter("feeBps", 10n);

  const divs = m.contract("DivsToken", [treasury]);
  const staking = m.contract("DivsStaking", [divs, weth, owner]);

  // Pool 0 single-sided DIVS at 1x; the LP pool is added once the pair exists.
  m.call(staking, "addPool", [divs, 10_000n]);

  const router = m.contract("DivsRouter", [weth, staking, feeBps, owner]);

  return { divs, staking, router };
});
