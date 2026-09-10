import { createConfig, http } from "wagmi";
import { hardhat, mainnet, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * A local `hardhat node` is a development convenience, not something a
 * production deployment should advertise. It is included when running
 * `next dev`, or when NEXT_PUBLIC_ENABLE_LOCAL_CHAIN is set for a preview
 * build pointed at a shared devnet.
 */
const includeLocalChain =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_LOCAL_CHAIN === "true";

const localRpcUrl = process.env.NEXT_PUBLIC_LOCAL_RPC_URL ?? "http://127.0.0.1:8545";

const sharedOptions = {
  connectors: [injected()],
  /**
   * `ssr: true` stops wagmi from reading persisted storage during the server
   * render, so the server and the first client render agree (disconnected) and
   * reconnection happens after hydration. Without it the app has to be gated
   * behind a `mounted` flag, which ships a blank first paint.
   */
  ssr: true,
} as const;

const remoteTransports = {
  [mainnet.id]: http(),
  [sepolia.id]: http(),
} as const;

export const config = includeLocalChain
  ? createConfig({
      ...sharedOptions,
      chains: [mainnet, sepolia, hardhat],
      transports: { ...remoteTransports, [hardhat.id]: http(localRpcUrl) },
    })
  : createConfig({
      ...sharedOptions,
      chains: [mainnet, sepolia],
      transports: remoteTransports,
    });

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
