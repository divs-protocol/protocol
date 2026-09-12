import { createConfig, http } from "wagmi";
import { hardhat, robinhood } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

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

/**
 * A phone has no injected provider in Chrome or Safari, so an injected-only
 * app cannot be connected to from one at all - the button has nothing to talk
 * to unless the page is open inside a wallet's own browser. WalletConnect
 * deep-links into the wallet app instead, which is how a phone connects.
 *
 * It needs a project id from cloud.reown.com. Without one the connector is
 * left out rather than added in a state that fails when tapped.
 */
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

/** The origin the app is actually served from; the env var covers the server render. */
const siteOrigin =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://divs-protocol.vercel.app");

const connectors = [
  injected(),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
          metadata: {
            name: "DIVS Protocol",
            description: "Decentralized exchange for tokenized equities on Robinhood Chain.",
            // Wallets compare this against the origin that opened the session
            // and warn the user when the two disagree, so it is read from the
            // page rather than pinned to one deployment's URL.
            url: siteOrigin,
            icons: [`${siteOrigin}/logo.png`],
          },
        }),
      ]
    : []),
];

const sharedOptions = {
  connectors,
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
/**
 * 30s, not viem's default 10s. A `getLogs` over tens of thousands of blocks
 * takes seconds upstream and may queue behind other calls in the proxy; at the
 * default it was aborted mid-flight and the flow columns silently stayed empty.
 */
const transportOptions = { batch: true, timeout: 30_000 } as const;

const robinhoodTransport =
  typeof window === "undefined"
    ? robinhoodRpcUrl
      ? http(robinhoodRpcUrl, transportOptions)
      : http(undefined, transportOptions)
    : http("/api/rpc", transportOptions);

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
