import { NextResponse } from "next/server";
import { cached } from "@/lib/chain";
import { TTL_MS, loadMarketsSnapshot } from "@/lib/snapshot";

/**
 * The market index, computed on the server.
 *
 * One read of every pool plus one pass over their swaps, reduced to seventeen
 * rows. The snapshot itself lives in lib/snapshot so the server can build it at
 * startup rather than making the first visitor wait for it.
 */

export const dynamic = "force-dynamic";

export type { MarketRow, MarketsSnapshot } from "@/lib/snapshot";

export async function GET() {
  try {
    const snapshot = await cached("markets", TTL_MS, loadMarketsSnapshot);
    /*
     * On a long-lived server the in-memory cache above does the work. On
     * serverless each instance is short-lived and starts empty, so the same
     * stale-while-revalidate behaviour is asked of the CDN, where it is shared
     * across every visitor and survives instance churn.
     */
    return NextResponse.json(snapshot, {
      headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read the chain" },
      { status: 502 },
    );
  }
}
