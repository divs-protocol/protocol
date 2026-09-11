/**
 * Server startup.
 *
 * The market snapshot takes a few seconds of chain to build, and with
 * stale-while-revalidate only the first caller ever waits for it. Building it
 * at boot means that caller is the server itself rather than whoever opens the
 * page first.
 *
 * Failures here are deliberately swallowed: a chain that is unreachable at
 * startup must not stop the app from serving, and the route will try again on
 * the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { cached } = await import("@/lib/chain");
  const { loadMarketsSnapshot } = await import("@/lib/snapshot");

  cached("markets", 15_000, loadMarketsSnapshot).catch(() => {});
}
