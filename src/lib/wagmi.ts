import { cookieStorage, createStorage } from "wagmi";
import { hardhat, robinhood } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { http } from "viem";

/**
 * Wallet connection through Reown AppKit.
 *
 * AppKit supplies the connect modal every wallet already knows how to answer:
 * installed extensions detected and badged, a QR code for a desktop-to-phone
 * session, and deep links into wallet apps on mobile. A hand-written picker
 * cannot do the last of those - a phone's browser has no injected provider, so
 * without deep links mobile visitors have nothing to connect with.
 */

export const SITE_URL = "https://www.divsprotocol.com";

/**
 * Public by design: it is compiled into the browser bundle and readable by
 * anyone who opens the site. What it carries is quota, which is defended by
 * Allowed Domains in the Reown dashboard rather than by hiding the value.
 */
export const WC_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "3582d51bb0cbc7ebd35c7d75a2899ec4";

/**
 * A local `hardhat node` is a development convenience, not something a
 * production deployment should advertise.
 */
const includeLocalChain =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_LOCAL_CHAIN === "true";

const localRpcUrl = process.env.NEXT_PUBLIC_LOCAL_RPC_URL ?? "http://127.0.0.1:8545";
const robinhoodRpcUrl = process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL;

export const networks = includeLocalChain
  ? ([robinhood, hardhat] as const)
  : ([robinhood] as const);

/**
 * In the browser every read goes through `/api/rpc`. The public endpoint sends
 * `Access-Control-Allow-Origin` twice, which browsers reject outright, so a
 * direct transport returns nothing and the whole UI renders empty. On the
 * server there is no CORS, so the chain is called directly.
 *
 * Requests are batched into one HTTP call each tick; ninety-eight markets read
 * one at a time is a burst the public endpoint answers with 429.
 */
const robinhoodTransport =
  typeof window === "undefined"
    ? robinhoodRpcUrl
      ? http(robinhoodRpcUrl, { batch: true })
      : http(undefined, { batch: true })
    : http("/api/rpc", { batch: true });

export const wagmiAdapter = new WagmiAdapter({
  projectId: WC_PROJECT_ID,
  networks: [...networks],
  transports: includeLocalChain
    ? { [robinhood.id]: robinhoodTransport, [hardhat.id]: http(localRpcUrl) }
    : { [robinhood.id]: robinhoodTransport },
  /**
   * Cookie storage so the server render and the first client render agree on
   * the connection state, rather than the app flashing disconnected and then
   * correcting itself after hydration.
   */
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

export const config = wagmiAdapter.wagmiConfig;

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
