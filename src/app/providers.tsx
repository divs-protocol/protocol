"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { createAppKit } from "@reown/appkit/react";
import { robinhood } from "@reown/appkit/networks";
import { config, networks, wagmiAdapter, WC_PROJECT_ID, SITE_URL } from "@/lib/wagmi";

/**
 * Connect-modal features.
 *
 * `reownBranding` removes the "UX by reown" footer. AppKit reads it out of the
 * local feature map at runtime, but 1.7.18 does not declare it on the `Features`
 * type, so it is asserted here rather than spread through an `any`.
 *
 * It only applies while Reown Cloud does not return a setting of its own for
 * the project. If it does, the remote value wins and AppKit logs a warning
 * naming the setting it ignored, and the change has to be made in the project
 * dashboard instead.
 */
const features = () =>
  ({
    // Wallets only. No email or social sign-in, which would mint a custodial
    // account rather than connect one the person already controls.
    email: false,
    socials: false,
    analytics: false,
    reownBranding: false,
  }) as Parameters<typeof createAppKit>[0]["features"];

/**
 * AppKit is created once at module scope rather than inside the component.
 * It registers custom elements on the document, and doing that on every render
 * throws in development where effects run twice.
 */
createAppKit({
  adapters: [wagmiAdapter],
  projectId: WC_PROJECT_ID,
  networks: [...networks],
  defaultNetwork: robinhood,
  metadata: {
    name: "DIVS Protocol",
    description: "Decentralized exchange for tokenized equities on Robinhood Chain.",
    // Wallets compare this against the origin that opened the session and warn
    // when the two disagree, so it has to match the deployment exactly.
    url: typeof window !== "undefined" ? window.location.origin : SITE_URL,
    icons: [`${SITE_URL}/logo.png`],
  },
  features: features(),
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#10B981",
    "--w3m-border-radius-master": "3px",
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
