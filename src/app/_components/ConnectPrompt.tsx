"use client";

import { useAccount, useConnect } from "wagmi";
import { Wallet } from "lucide-react";

/**
 * Stand-in for any view that describes the viewer's own position.
 *
 * Personal sections previously rendered placeholder rows regardless of wallet
 * state, so a visitor with nothing connected saw a table of positions and
 * balances that read as theirs. These sections now show this instead.
 */
export default function ConnectPrompt({ what }: { what: string }) {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const injected = connectors[0];

  if (isConnected) return null;

  return (
    <div className="flex flex-col items-center justify-center text-center bg-[#1B1E24] border border-[#232730] rounded-2xl p-10 min-h-[380px]">
      <div className="w-12 h-12 bg-[#10B981]/10 border border-[#10B981]/25 text-[#10B981] rounded-2xl flex items-center justify-center mb-4">
        <Wallet size={20} />
      </div>
      <h3 className="text-white font-semibold text-sm mb-1.5">Connect your wallet</h3>
      <p className="text-[11px] text-gray-500 max-w-xs leading-relaxed mb-5">
        {what} is specific to your address. Connect a wallet to see it.
      </p>
      <button
        onClick={() => injected && connect({ connector: injected })}
        disabled={!injected}
        title={injected ? undefined : "No browser wallet detected"}
        className="bg-[#10B981] hover:bg-[#0EA372] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-[11px] px-5 py-2.5 rounded-xl transition"
      >
        {injected ? "Connect Wallet" : "No Wallet Found"}
      </button>
    </div>
  );
}
