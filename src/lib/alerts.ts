"use client";

import { useSyncExternalStore } from "react";

/**
 * Price alerts.
 *
 * The one notification this application can honestly offer today. Nothing is
 * deployed, so there are no fills, stakes or claims to report; what does exist
 * is a live price for ninety-eight markets, polled every fifteen seconds. An
 * alert watches one of those for a level and says so when it is crossed.
 *
 * Alerts live in the browser, not on a server. Nobody is asked for an email,
 * nothing is stored against a wallet, and clearing site data clears them. That
 * is the honest trade for a feature that needs no account.
 */

export type Alert = {
  id: string;
  ticker: string;
  /** Fire when the price rises to this, or when it falls to it. */
  direction: "above" | "below";
  price: number;
  createdAt: number;
  /** When it fired. Undefined while still watching. */
  triggeredAt?: number;
  /** The price it actually fired at, which is rarely exactly the level. */
  triggeredPrice?: number;
  /** Cleared when the person has seen it. */
  unread?: boolean;
};

const KEY = "divs.alerts.v1";

/**
 * A tiny store rather than component state.
 *
 * `useSyncExternalStore` is what keeps the server render and the first client
 * render in agreement: the server snapshot is always empty, the client reads
 * storage, and React handles the handover without a hydration mismatch and
 * without setting state inside an effect.
 */
let alerts: Alert[] = [];
let loaded = false;
const listeners = new Set<() => void>();

/** Storage throws in a private window and can come back empty; neither is fatal. */
function read(): Alert[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Alert[]) : [];
  } catch {
    return [];
  }
}

function write(next: Alert[]) {
  alerts = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* the list still works for this session */
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  if (!loaded) {
    loaded = true;
    alerts = read();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => alerts;

/**
 * The server has no storage, so it always renders none.
 *
 * This has to be the same array every call. Returning a fresh `[]` makes React
 * see a new snapshot on every render and warn that it will loop.
 */
const NONE: Alert[] = [];
const getServerSnapshot = () => NONE;

export function useAlerts() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function addAlert(ticker: string, direction: "above" | "below", price: number) {
  write([
    {
      id: `${ticker}-${direction}-${price}-${Date.now()}`,
      ticker,
      direction,
      price,
      createdAt: Date.now(),
    },
    ...alerts,
  ]);
}

export const removeAlert = (id: string) => write(alerts.filter((a) => a.id !== id));

export const clearTriggered = () => write(alerts.filter((a) => !a.triggeredAt));

/** Marks everything read without deleting it, for opening the panel. */
export function markAllRead() {
  if (!alerts.some((a) => a.unread)) return;
  write(alerts.map((a) => (a.unread ? { ...a, unread: false } : a)));
}

/**
 * Fires any alert whose level the price has reached.
 *
 * Only ever promotes watching to triggered, so calling it on every poll is
 * safe: once an alert has fired it is skipped, and a run that changes nothing
 * writes nothing and notifies nobody.
 */
export function evaluate(priceOf: (ticker: string) => number | undefined) {
  let changed = false;

  const next = alerts.map((a) => {
    if (a.triggeredAt) return a;
    const price = priceOf(a.ticker);
    if (!price) return a;

    const hit = a.direction === "above" ? price >= a.price : price <= a.price;
    if (!hit) return a;

    changed = true;
    return { ...a, triggeredAt: Date.now(), triggeredPrice: price, unread: true };
  });

  if (changed) write(next);
}
