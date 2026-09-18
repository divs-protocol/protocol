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
 *
 * Both contracts are deployed owned by the deploying account and then handed
 * to `owner`, rather than being constructed owned by it. Two reasons. The
 * initial configuration below is `onlyOwner`, so constructing under a multisig
 * would revert the deployment partway through. And ownership is transferred in
 * two steps, so a bad `owner` - wrong chain, mistyped, a Safe that does not
 * exist at that address yet - is still recoverable here, where a constructor
 * argument would not be.
 */
export default buildModule("DivsProtocol", (m) => {
  /** The $DIVS token from Pons. */
  const divs = m.getParameter("divs");
  const weth = m.getParameter("weth");

  /** Intended to be a multisig. Defaults to the deployer for local runs. */
  const owner = m.getParameter("owner", m.getAccount(0));
  const deployer = m.getAccount(0);

  /**
   * The second quote asset, and the pool used to convert fees taken in it.
   * Around sixty of the listed markets are priced in USDG rather than WETH, and
   * the router turns those fees into WETH before the vault sees them.
   */
  const usdg = m.getParameter("usdg");
  const usdgWethPool = m.getParameter("usdgWethPool");

  /** Protocol fee in basis points, charged on the quote side of every trade. */
  const feeBps = m.getParameter("feeBps", 10n);

  const staking = m.contract("DivsStaking", [divs, weth, deployer]);

  // Pool 0 single-sided DIVS at 1x; the LP pool is added once the pair exists.
  // This is onlyOwner, which is why the deployer holds the vault until here.
  const addPool = m.call(staking, "addPool", [divs, 10_000n]);

  const router = m.contract("DivsRouter", [weth, usdg, usdgWethPool, staking, feeBps, deployer]);

  /**
   * Nominate the real owner. Neither transfer completes until `owner` calls
   * `acceptOwnership` on each contract; until then the deployer still holds
   * them, which is what makes a wrong address here survivable.
   */
  m.call(staking, "transferOwnership", [owner], { after: [addPool], id: "handStakingToOwner" });
  m.call(router, "transferOwnership", [owner], { id: "handRouterToOwner" });

  return { staking, router };
});
