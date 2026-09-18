"use client";

/**
 * The shell every section hero sits in.
 *
 * Two columns, because one is not a hero. A headline and a paragraph alone
 * leave the right half of a wide screen empty and the text reading as though it
 * were shoved into a corner. The Protocol and Exchange pages already worked
 * this way: words on the left, something live on the right.
 *
 * What goes on the right is the section's own business and is deliberately
 * different on each one. This file owns the frame and the spacing so those stay
 * consistent, and owns nothing else so the pages do not end up identical.
 */

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#10B981] mb-4">
      {children}
    </div>
  );
}

/** A figure in the inline row under the copy. */
export function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-xl text-white">{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5 max-w-[18ch] leading-snug">{label}</div>
    </div>
  );
}

export function HeroCard({
  title,
  icon,
  right,
  children,
  className = "",
}: {
  title: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-[#14161B] border border-[#232730] rounded-2xl p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="flex items-center gap-1.5 min-w-0">
          {icon}
          <span className="text-[11px] font-semibold text-white truncate">{title}</span>
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function PageHero({
  left,
  right,
  /** Where the glow sits, so the three pages are not lit identically. */
  glow = "78% 10%",
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  glow?: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-[#0F1115] border border-[#1F2228] px-6 md:px-10 py-12 md:py-16">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background: `radial-gradient(60% 50% at ${glow}, rgba(16,185,129,0.10), transparent 70%)`,
        }}
      />
      <div className="relative grid lg:grid-cols-[1fr_440px] gap-10 items-center">
        <div className="min-w-0">{left}</div>
        <div className="min-w-0">{right}</div>
      </div>
    </section>
  );
}
