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
    return NextResponse.json(snapshot, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read the chain" },
      { status: 502 },
    );
  }
}
