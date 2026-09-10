import Image from "next/image";

/**
 * Shared site footer.
 *
 * Horizontal padding is passed in rather than baked in, because the landing
 * view renders full-bleed inside its own container while section views sit in
 * the already-padded content area.
 */
export default function Footer({ className = "" }: { className?: string }) {
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
        {["Docs", "App", "GitHub", "X"].map((l) => (
          <button key={l} className="hover:text-white transition">
            {l}
          </button>
        ))}
      </div>
    </footer>
  );
}
