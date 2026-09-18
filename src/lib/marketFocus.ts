/**
 * A ticker handed from one section to another across a client-side navigation.
 *
 * The market pages are not routes - Markets holds the open ticker in component
 * state and swaps in the token view - so a link from elsewhere has nowhere to
 * point. This is the handoff: the sender records a ticker, pushes the route,
 * and Markets takes it on mount.
 *
 * Module state rather than a query parameter on purpose. `useSearchParams` in a
 * statically generated page needs a Suspense boundary and opts the route out of
 * prerendering, which is a large amount of machinery for carrying one string
 * between two clicks. It is only ever set by a click after hydration, so the
 * server and the first client render always agree that it is empty.
 */

let pending: string | null = null;

export const focusMarket = (ticker: string) => {
  pending = ticker;
};

/** Reads and clears, so a later visit to Markets does not reopen the last pick. */
export const takeFocusedMarket = () => {
  const ticker = pending;
  pending = null;
  return ticker;
};
