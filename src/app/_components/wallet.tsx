"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { useConnect } from "wagmi";
import { X, Wallet, Smartphone } from "lucide-react";

/**
 * Wallet connection, shared by every button that offers it.
 *
 * Every call site used to reach for `connectors[0]`, which is the injected
 * connector - a browser extension. A phone browsing in Chrome or Safari has no
 * injected provider, so those buttons had nothing to connect to and sat there
 * doing nothing. With more than one connector configured, picking the first
 * one silently would keep that bug.
 *
 * So the choice is put to the person instead, unless there is only one option
 * worth offering, in which case asking is just an extra tap.
 */

const ConnectContext = createContext<() => void>(() => {});

/** Opens the wallet picker, or connects directly when there is one option. */
export const useConnectWallet = () => useContext(ConnectContext);

/**
 * An injected connector is always listed, but is only usable if a wallet
 * actually installed one.
 *
 * Read through useSyncExternalStore rather than an effect: the server has no
 * window, so it answers false and the first client render agrees, then the
 * real value is adopted without a second render pass. A provider does not
 * appear or vanish mid-session, so there is nothing to subscribe to.
 */
const noSubscribe = () => () => {};
const readInjected = () => typeof window !== "undefined" && "ethereum" in window;

function useHasInjectedProvider() {
  return useSyncExternalStore(noSubscribe, readInjected, () => false);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { connect, connectors, isPending, error, reset } = useConnect();
  const [open, setOpen] = useState(false);
  const hasInjected = useHasInjectedProvider();

  const usable = connectors.filter((c) => c.type !== "injected" || hasInjected);

  const start = () => {
    reset();
    if (usable.length === 1) {
      connect({ connector: usable[0] });
      return;
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <ConnectContext.Provider value={start}>
      {children}

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-label="Connect a wallet">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden />

          <div className="relative w-full sm:w-[380px] bg-[#14161B] border border-[#232730] rounded-t-2xl sm:rounded-2xl p-4 m-0 sm:m-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-sm">Connect a wallet</h3>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-gray-500 p-1 -mr-1">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              {usable.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => {
                    connect({ connector });
                    setOpen(false);
                  }}
                  disabled={isPending}
                  className="w-full flex items-center gap-3 bg-[#1B1E24] border border-[#232730] hover:border-[#10B981]/40 disabled:opacity-50 rounded-xl px-4 py-3.5 text-left transition"
                >
                  <span className="w-8 h-8 rounded-lg bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] flex items-center justify-center flex-shrink-0">
                    {connector.type === "injected" ? <Wallet size={15} /> : <Smartphone size={15} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-white font-semibold text-[13px] truncate">
                      {connector.name}
                    </span>
                    <span className="block text-[10px] text-gray-500">
                      {connector.type === "injected" ? "Browser extension" : "Scan or open your wallet app"}
                    </span>
                  </span>
                </button>
              ))}

              {usable.length === 0 && (
                <p className="text-[12px] leading-relaxed text-gray-400 py-2">
                  No wallet is available in this browser. On a phone, open this page from inside
                  your wallet app&apos;s browser.
                </p>
              )}
            </div>

            {error && (
              <p className="mt-3 text-[11px] leading-relaxed text-red-400">{error.message}</p>
            )}
          </div>
        </div>
      )}
    </ConnectContext.Provider>
  );
}
