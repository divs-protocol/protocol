"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Trash2, X as Close } from "lucide-react";
import { usd, useLiveMarkets } from "@/lib/live";
import {
  addAlert,
  clearTriggered,
  evaluate,
  markAllRead,
  removeAlert,
  useAlerts,
} from "@/lib/alerts";

/**
 * The bell.
 *
 * It used to be a button with no handler, which is a promise the interface
 * could not keep. It now holds price alerts: pick a market, pick a level, and
 * it says so when the price reaches it.
 *
 * Alerts are checked against the same fifteen-second poll every other price on
 * the page comes from, so this adds no request of its own.
 */

function ago(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AlertsBell() {
  const { markets } = useLiveMarkets();
  const alerts = useAlerts();

  const [open, setOpen] = useState(false);
  const [ticker, setTicker] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [price, setPrice] = useState("");
  const [now, setNow] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const priceOf = useMemo(() => {
    const map = new Map(markets.map((m) => [m.ticker, m.price]));
    return (t: string) => map.get(t);
  }, [markets]);

  /*
   * Every poll is a chance for a level to have been crossed, and so is adding
   * an alert: someone who sets one that is already true should not wait up to
   * fifteen seconds to be told so.
   *
   * `alerts` is in the dependencies for that reason. It does not loop, because
   * `evaluate` writes only when something actually changed, so the pass it
   * triggers settles immediately.
   */
  useEffect(() => {
    if (markets.length) evaluate(priceOf);
  }, [markets, priceOf, alerts]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = alerts.filter((a) => a.unread).length;
  const triggered = alerts.filter((a) => a.triggeredAt);
  const watching = alerts.filter((a) => !a.triggeredAt);

  const match = useMemo(() => {
    const q = ticker.trim().toUpperCase();
    if (!q) return undefined;
    return markets.find((m) => m.ticker === q);
  }, [ticker, markets]);

  const suggestions = useMemo(() => {
    const q = ticker.trim().toUpperCase();
    if (!q || match) return [];
    return markets.filter((m) => m.ticker.startsWith(q)).slice(0, 4);
  }, [ticker, markets, match]);

  const level = Number(price);
  const canAdd = Boolean(match) && Number.isFinite(level) && level > 0;

  const submit = () => {
    if (!canAdd || !match) return;
    addAlert(match.ticker, direction, level);
    setTicker("");
    setPrice("");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAllRead();
        }}
        aria-label={unread ? `Alerts, ${unread} triggered` : "Alerts"}
        aria-expanded={open}
        className="relative p-2 bg-[#1B1E24] border border-[#232730] rounded-xl text-gray-400 hover:text-white transition"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#F43F5E] text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[320px] bg-[#14161B] border border-[#232730] rounded-xl overflow-hidden shadow-xl shadow-black/50 z-50">
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-[#232730]">
            <span className="text-[11px] font-semibold text-white">Price alerts</span>
            {triggered.length > 0 && (
              <button
                onClick={clearTriggered}
                className="text-[10px] text-gray-500 hover:text-white transition"
              >
                Clear triggered
              </button>
            )}
          </div>

          {/* new alert */}
          <div className="p-3.5 border-b border-[#232730] space-y-2.5">
            <div className="relative">
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
                placeholder="Ticker, for example NVDA"
                className="w-full bg-[#1B1E24] border border-[#232730] rounded-lg px-3 py-2 text-[12px] text-white placeholder:text-gray-600 outline-none focus:border-[#10B981]/50 transition font-mono"
              />
              {suggestions.length > 0 && (
                <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-[#1B1E24] border border-[#232730] rounded-lg overflow-hidden">
                  {suggestions.map((m) => (
                    <button
                      key={m.ticker}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setTicker(m.ticker);
                      }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] hover:bg-[#232730] transition"
                    >
                      <span className="font-mono text-white">{m.ticker}</span>
                      <span className="font-mono text-gray-500">{usd(m.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <div className="grid grid-cols-2 gap-1 bg-[#1B1E24] border border-[#232730] rounded-lg p-0.5 flex-shrink-0">
                {(["above", "below"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDirection(d)}
                    className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold capitalize transition ${
                      direction === d ? "bg-[#10B981] text-black" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="0.00"
                inputMode="decimal"
                className="flex-1 min-w-0 bg-[#1B1E24] border border-[#232730] rounded-lg px-3 py-2 text-[12px] text-white placeholder:text-gray-600 outline-none focus:border-[#10B981]/50 transition font-mono"
              />
            </div>

            {match && (
              <div className="text-[10px] text-gray-500">
                {match.ticker} is {usd(match.price)} now
              </div>
            )}

            <button
              onClick={submit}
              disabled={!canAdd}
              className="w-full bg-[#10B981] hover:bg-[#0EA372] disabled:opacity-25 disabled:cursor-not-allowed text-black text-[11px] font-bold py-2 rounded-lg transition"
            >
              Add alert
            </button>
          </div>

          {/* the list */}
          <div className="max-h-[260px] overflow-y-auto">
            {alerts.length === 0 && (
              <p className="px-3.5 py-6 text-center text-[11px] text-gray-500">
                No alerts yet. Pick a market and a price, and this tells you when it gets there.
              </p>
            )}

            {triggered.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[#1F2228] last:border-0 bg-[#10B981]/[0.06]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-white">
                    <span className="font-mono font-semibold">{a.ticker}</span> went{" "}
                    {a.direction} {usd(a.price)}
                  </span>
                  <span className="block text-[10px] text-gray-500">
                    Hit {usd(a.triggeredPrice ?? 0)} · {ago(a.triggeredAt ?? 0, now)}
                  </span>
                </span>
                <button
                  onClick={() => removeAlert(a.id)}
                  aria-label="Remove alert"
                  className="text-gray-600 hover:text-red-400 transition p-1 flex-shrink-0"
                >
                  <Close size={12} />
                </button>
              </div>
            ))}

            {watching.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[#1F2228] last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-gray-300">
                    <span className="font-mono font-semibold text-white">{a.ticker}</span>{" "}
                    {a.direction} {usd(a.price)}
                  </span>
                  <span className="block text-[10px] text-gray-600">
                    {priceOf(a.ticker) ? `now ${usd(priceOf(a.ticker)!)}` : "watching"}
                  </span>
                </span>
                <button
                  onClick={() => removeAlert(a.id)}
                  aria-label="Remove alert"
                  className="text-gray-600 hover:text-red-400 transition p-1 flex-shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
