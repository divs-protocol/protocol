import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the DivsVault.
 *
 * `feeCollector` defaults to the deploying account. Override it per network with
 * a parameters file, e.g.
 *
 *   npx hardhat ignition deploy ignition/modules/DivsVault.ts \
 *     --network sepolia --parameters ignition/params.sepolia.json
 *
 * where params.sepolia.json is:
 *
 *   { "DivsVaultModule": { "feeCollector": "0x..." } }
 *
 * The constructor rejects the zero address, so a missing parameter fails at
 * deploy time rather than bricking fee transfers on a live vault.
 */
export default buildModule("DivsVaultModule", (m) => {
  const feeCollector = m.getParameter("feeCollector", m.getAccount(0));

  const divsVault = m.contract("DivsVault", [feeCollector]);

  return { divsVault };
});
