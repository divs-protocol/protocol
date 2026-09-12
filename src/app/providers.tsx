"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config } from "@/lib/wagmi";
import { WalletProvider } from "./_components/wallet";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* Above the app, because every connect button reads from it. */}
        <WalletProvider>{children}</WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
