import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the staking vault and the router that charges the fee it distributes.
 *
 * $DIVS itself is not deployed here - it is launched on Pons, and its address
 * is passed in as `divs`. Nothing in this module mints or owns the token; the
 * vault only ever holds what stakers deposit and what is funded for emissions.
 *
 * `weth` must be the canonical wrapped ether for the target chain, since fees
 * are collected and distributed in it.
 *
 * Order matters: the router takes the staking address in its constructor, so
 * staking is deployed first. Staking needs nothing back - `notifyFee` is
 * permissionless, and the router pays in as any caller would.
 */
export default buildModule("DivsProtocol", (m) => {
  /** The $DIVS token from Pons. */
  const divs = m.getParameter("divs");
  const weth = m.getParameter("weth");
  const owner = m.getParameter("owner", m.getAccount(0));

  /** Protocol fee in basis points, charged on the WETH side of every trade. */
  const feeBps = m.getParameter("feeBps", 10n);

  const staking = m.contract("DivsStaking", [divs, weth, owner]);

  // Pool 0 single-sided DIVS at 1x; the LP pool is added once the pair exists.
  m.call(staking, "addPool", [divs, 10_000n]);

  const router = m.contract("DivsRouter", [weth, staking, feeBps, owner]);

  return { staking, router };
});
