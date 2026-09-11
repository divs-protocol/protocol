import { createConfig, http } from "wagmi";
import { hardhat, robinhood } from "wagmi/chains";
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

/**
 * The protocol lives on Robinhood Chain, where the stock tokens are issued.
 * Ethereum mainnet and Sepolia were create-next-app defaults and nothing in the
 * app is deployed to them.
 */
const robinhoodRpcUrl = process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL;

/**
 * In the browser every read goes through `/api/rpc`. The public endpoint sends
 * `Access-Control-Allow-Origin` twice, which browsers reject outright, so a
 * direct transport returns nothing and the whole UI renders empty. On the
 * server there is no CORS, so the chain is called directly.
 *
 * Requests are batched into one HTTP call each tick. Seventeen markets read
 * one at a time is a burst the public endpoint answers with 429.
 *
 * `http(undefined, ...)` is deliberate: viem falls back to the chain's default
 * RPC only when the url is undefined, and there is no overload that takes
 * options without it.
 */
const robinhoodTransport =
  typeof window === "undefined"
    ? robinhoodRpcUrl
      ? http(robinhoodRpcUrl, { batch: true })
      : http(undefined, { batch: true })
    : http("/api/rpc", { batch: true });

const remoteTransports = {
  [robinhood.id]: robinhoodTransport,
} as const;

export const config = includeLocalChain
  ? createConfig({
      ...sharedOptions,
      chains: [robinhood, hardhat],
      transports: { ...remoteTransports, [hardhat.id]: http(localRpcUrl) },
    })
  : createConfig({
      ...sharedOptions,
      chains: [robinhood],
      transports: remoteTransports,
    });

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
