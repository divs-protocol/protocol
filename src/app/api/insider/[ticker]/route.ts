import { NextResponse } from "next/server";
import { cached } from "@/lib/chain";
import { FILERS } from "@/lib/ciks";
import { dealsForTicker } from "@/lib/edgar";
import type { TickerInsiders } from "@/lib/insider";

/**
 * One company's insider dealings, for the market page.
 *
 * A ticker with no filer is not an error. ETFs have no officers to report, and
 * a foreign issuer reports on 6-K rather than Form 4, so the honest answer is
 * an empty list with a reason attached.
 */

export const revalidate = 3600;

const FILINGS = 12;

export async function GET(_request: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = raw.toUpperCase();
  const filer = FILERS[ticker];

  if (!filer) {
    return NextResponse.json(
      {
        ticker,
        issuer: null,
        deals: [],
        unavailable: "No SEC filer is registered for this ticker, so there are no Form 4 filings.",
      } satisfies TickerInsiders,
      { headers: { "cache-control": "public, s-maxage=86400" } },
    );
  }

  try {
    const result = await cached<TickerInsiders>(`insider:${ticker}`, 3_600_000, async () => ({
      ticker,
      issuer: filer.issuer,
      deals: await dealsForTicker(ticker, FILINGS),
    }));

    return NextResponse.json(result, {
      headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read EDGAR" },
      { status: 502 },
    );
  }
}
