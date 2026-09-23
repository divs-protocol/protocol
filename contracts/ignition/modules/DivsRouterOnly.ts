import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the router on its own, so trading can open before $DIVS exists.
 *
 * The full module deploys the staking vault first, and the vault takes the
 * $DIVS address in its constructor. That makes the whole deployment wait on a
 * token launch that trading does not actually depend on.
 *
 * The router does not need the vault. It is constructed with no staking
 * address, and `_accrue` holds fees inside the router instead of pushing them
 * out:
 *
 *     if (staking == address(0)) return;
 *
 * So every fee charged before the vault exists is kept, not lost. When the
 * vault is deployed, the owner calls `setStaking`, then anyone calls
 * `flushFees`, and the whole accumulated balance is paid out to stakers at
 * once. `test_RouterWorksWithNoStakingAddress` covers exactly that sequence.
 *
 *   npx hardhat ignition deploy ignition/modules/DivsRouterOnly.ts \
 *     --network robinhood --parameters params.json
 *
 * The owner starts as the deploying account. Handing it to a multisig is a
 * separate step, `transferOwnership` then `acceptOwnership` from the Safe,
 * because ownership here is two-step and the router needs no owner calls to
 * start working.
 *
 * `poolManager` works the same way as `staking`: pass zero and V2/V4 trading
 * stays disabled (revert with a clear message) rather than failing the
 * deployment, and `setV4HookAllowed` needs no vault either, so hooks can be
 * reviewed and allowlisted independently of when $DIVS itself launches.
 */
export default buildModule("DivsRouterOnly", (m) => {
  const weth = m.getParameter("weth");
  const usdg = m.getParameter("usdg");
  const usdgWethPool = m.getParameter("usdgWethPool");

  /** Protocol fee in basis points, charged on the quote side of every trade. */
  const feeBps = m.getParameter("feeBps", 10n);

  const owner = m.getParameter("owner", m.getAccount(0));

  /**
   * No vault yet. Fees accumulate in the router until one is set, which is why
   * opening trading does not depend on the token launch.
   */
  const staking = "0x0000000000000000000000000000000000000000";

  /** The chain's V4 singleton. Zero deploys with V4 trading disabled. */
  const poolManager = m.getParameter(
    "poolManager",
    "0x0000000000000000000000000000000000000000",
  );

  const router = m.contract("DivsRouter", [
    weth,
    usdg,
    usdgWethPool,
    staking,
    feeBps,
    owner,
    poolManager,
  ]);

  return { router };
});
