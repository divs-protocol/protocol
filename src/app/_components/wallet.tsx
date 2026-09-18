"use client";

import { useAppKit } from "@reown/appkit/react";

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
