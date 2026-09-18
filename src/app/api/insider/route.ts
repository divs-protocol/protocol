import { NextResponse } from "next/server";
import { cached } from "@/lib/chain";
import { recentDeals } from "@/lib/edgar";
import type { InsiderFeed } from "@/lib/insider";

/**
 * Insider and director dealings across every listed stock.
 *
 * Form 4 is filed within two business days of a trade, so the useful window is
 * days rather than minutes and the response is cached for an hour. The SEC asks
 * callers not to hammer it, and an uncached route would send a burst of
 * requests for every visitor.
 */

export const revalidate = 3600;

/**
 * A cold fill reads five daily indexes and up to sixty filings, which does not
 * fit the default ten seconds. The response is cached for an hour and served
 * stale while it refreshes, so the slow path runs in the background and nobody
 * waits on it.
 */
export const maxDuration = 60;

const DAYS = 5;
const CAP = 60;

export async function GET() {
  try {
    const feed = await cached<InsiderFeed>("insider:recent", 3_600_000, async () => {
      const deals = await recentDeals(DAYS, CAP);
      return {
        deals,
        filings: new Set(deals.map((d) => d.url)).size,
        window: `${DAYS} days`,
      };
    });

    return NextResponse.json(feed, {
      headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read EDGAR" },
      { status: 502 },
    );
  }
}
