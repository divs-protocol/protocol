"use client";

import Image from "next/image";
import { useNav } from "./nav";

/**
 * Shared site footer.
 *
 * Horizontal padding is passed in rather than baked in, because the landing
 * view renders full-bleed inside its own container while section views sit in
 * the already-padded content area.
 */
/** Off-site destinations. Anything not listed here is a section of the app. */
const EXTERNAL: Record<string, string> = {
  GitHub: "https://github.com/divs-protocol",
  X: "https://x.com/DIVSProtocol",
};

export default function Footer({ className = "" }: { className?: string }) {
  const nav = useNav();
  const targets: Record<string, string> = { Docs: "docs", App: "stake" };
  return (
    <footer
      className={`border-t border-[#1F2228] py-8 flex flex-col md:flex-row md:items-center justify-between gap-4 ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <Image src="/logo.png" alt="" width={20} height={22} className="h-[18px] w-auto" />
        <span className="font-bold text-white text-xs tracking-tight">DIVS</span>
        <span className="text-[10px] text-gray-600 font-mono">Robinhood Chain · 4663</span>
      </div>
      <div className="flex items-center gap-5 text-[11px] text-gray-500">
        {["Docs", "App", "GitHub", "X"].map((l) =>
          EXTERNAL[l] ? (
            <a
              key={l}
              href={EXTERNAL[l]}
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition"
            >
              {l}
            </a>
          ) : (
            <button
              key={l}
              onClick={() => targets[l] && nav(targets[l])}
              className="hover:text-white transition"
            >
              {l}
            </button>
          ),
        )}
      </div>
    </footer>
  );
}
