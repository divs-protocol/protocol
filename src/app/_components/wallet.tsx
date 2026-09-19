"use client";

import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";

/**
 * Wallet connection, shared by every button that offers it.
 *
 * The modal itself is Reown AppKit's, created once in providers.tsx. It lists
 * installed extensions with a badge, offers a QR code for a desktop-to-phone
 * session, and deep links into wallet apps on mobile - the last of which is the
 * only way a phone can connect at all, because a phone's browser has no
 * injected provider.
 *
 * This hook exists so call sites keep asking for "open the wallet picker"
 * without knowing which library answers.
 */
export const useConnectWallet = () => {
  const { open } = useAppKit();
  return () => open();
};

/**
 * Connection state as the interface needs to read it.
 *
 * `isConnected` alone is not enough. Between the click and the wallet
 * answering, and again on every page load while a stored session is restored,
 * wagmi reports "connecting" or "reconnecting" and `isConnected` is still
 * false. A button that renders that as "Connect Wallet" invites a second click
 * which reopens the picker on a connection already in flight, and the whole
 * thing reads as stuck.
 *
 * Use this for the label only, never to disable the button. Abandoning a
 * WalletConnect handshake leaves wagmi reporting "connecting" indefinitely -
 * measured, not assumed - so a button disabled on this state can never be
 * pressed again, which is worse than the wrong label.
 */
export function useWalletStatus() {
  const { address, isConnected, status } = useAccount();
  return {
    address,
    isConnected,
    /** Waiting on the wallet or on a stored session. Not yet connected. */
    settling: status === "connecting" || status === "reconnecting",
  };
}
