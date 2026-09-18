import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin, hardhatVerify],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    /**
     * Robinhood Chain, where the stock tokens are issued and the protocol is
     * deployed. The deploy key is read from the keystore rather than a file, so
     * it is never in the repository or the shell history:
     *
     *   npx hardhat keystore set ROBINHOOD_PRIVATE_KEY
     */
    robinhood: {
      type: "http",
      chainType: "l1",
      chainId: 4663,
      url: configVariable("ROBINHOOD_RPC_URL"),
      accounts: [configVariable("ROBINHOOD_PRIVATE_KEY")],
    },
    // A `hardhat node` already running on the default port, for driving the
    // web app against real contract state. Accounts come from the node itself.
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },

  /**
   * Source verification, so the explorer shows readable Solidity at the
   * deployed address and anyone can confirm the bytecode matches this
   * repository. Without it a clone pointing at a malicious contract is harder
   * to disprove than it should be.
   *
   * Robinhood Chain runs Blockscout, which accepts verification without an API
   * key; the placeholder is only there because the plugin requires the field.
   */
  verify: {
    blockscout: {
      enabled: true,
    },
    etherscan: {
      apiKey: "unused-blockscout-needs-no-key",
      enabled: false,
    },
  },

  chainDescriptors: {
    4663: {
      name: "Robinhood Chain",
      blockExplorers: {
        blockscout: {
          name: "Blockscout",
          url: "https://robinhoodchain.blockscout.com",
          apiUrl: "https://robinhoodchain.blockscout.com/api",
        },
      },
    },
  },
});
