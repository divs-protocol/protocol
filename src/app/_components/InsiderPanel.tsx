"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { compact, num, useInsiderFeed, useTickerInsiders } from "@/lib/live";
import {
  CODE_MEANING,
  KIND_LABEL,
  isDiscretionary,
  kindTone,
  netFlow,
  type InsiderDeal,
} from "@/lib/insider";

/**
 * Insider and director dealings, from SEC Form 4.
 *
 * An officer, director or ten-percent holder has to report a trade in their own
 * company within two business days. The filings are public, so this is the one
 * panel in the application that says something about a company rather than
 * about its pool.
 *
 * The default view hides everything that was not a decision. A grant vesting on
 * schedule, an option exercise and shares handed back to cover the tax on one
 * are all filed on the same form as an open-market sale, and showing them
 * together makes every executive look like a seller.
 */

const EDGAR_SEARCH = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=4&CIK=";

/** Dates arrive as plain ISO days, so they are read as days rather than instants. */
function sinceLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const then = Date.UTC(y, m - 1, d);
  const days = Math.round((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

/**
 * One filed transaction.
 *
 * Two lines at every width rather than a column per field. A row carries a
 * name, a job title, a share count, a price, a value and a date, and six
 * columns of fixed width leave the name about one character on a phone.
 */
function Row({ deal, showTicker }: { deal: InsiderDeal; showTicker: boolean }) {
  return (
    <a
      href={deal.url}
      target="_blank"
      rel="noreferrer"
      className="group block px-4 py-2.5 border-b border-[#1F2228] last:border-0 hover:bg-[#14161B] transition"
    >
      <div className="flex items-center gap-2">
        {showTicker && (
          <span className="font-mono text-[11px] font-semibold text-white shrink-0">
            {deal.ticker}
          </span>
        )}
        <span className="text-[11px] text-white truncate flex-1 min-w-0">{deal.insider}</span>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${kindTone(deal.kind)}`}
          title={CODE_MEANING[deal.code] ?? `SEC code ${deal.code}`}
        >
          {KIND_LABEL[deal.kind]}
        </span>
        <ExternalLink className="w-3 h-3 text-gray-700 group-hover:text-[#10B981] shrink-0 transition" />
      </div>

      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="text-[10px] text-gray-500 truncate flex-1 min-w-0">{deal.role}</span>
        <span className="font-mono text-[10px] text-gray-300 shrink-0">
          {num(deal.shares)}
          {/* A grant has no price, which is not the same as a price of zero. */}
          {deal.price ? ` @ $${deal.price.toFixed(2)}` : ""}
        </span>
        <span className="font-mono text-[10px] text-gray-400 shrink-0 w-14 text-right">
          {deal.value ? compact(deal.value) : "—"}
        </span>
        <span className="text-[10px] text-gray-600 shrink-0 w-12 text-right">
          {sinceLabel(deal.date)}
        </span>
      </div>
    </a>
  );
}

function Flow({ deals }: { deals: InsiderDeal[] }) {
  const { bought, sold, net, buys, sells } = useMemo(() => netFlow(deals), [deals]);

  if (!buys && !sells) {
    return (
      <span className="text-[10px] text-gray-500">
        No open-market buying or selling in this window
      </span>
    );
  }

  const total = bought + sold;
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="flex-1 h-1.5 rounded-full bg-[#14161B] overflow-hidden flex min-w-[60px]">
        <span className="h-full bg-[#10B981]" style={{ width: `${(bought / total) * 100}%` }} />
        <span className="h-full bg-[#F43F5E]" style={{ width: `${(sold / total) * 100}%` }} />
      </span>
      <span className="font-mono text-[10px] text-gray-400 shrink-0 whitespace-nowrap">
        <span className={net >= 0 ? "text-[#10B981]" : "text-[#F43F5E]"}>
          {net >= 0 ? "+" : "-"}
          {compact(Math.abs(net))}
        </span>{" "}
        net · {buys} buy / {sells} sell
      </span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-[11px] text-gray-500">{children}</div>;
}

function Toggle({
  on,
  onChange,
  children,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`text-[10px] px-2 py-1 rounded-md border transition whitespace-nowrap shrink-0 ${
        on
          ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/25"
          : "bg-[#14161B] text-gray-400 border-[#232730] hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The cross-market feed, for the analytics page.
 */
export function InsiderFeedPanel() {
  const { feed, loading, error } = useInsiderFeed();
  const [onlyTrades, setOnlyTrades] = useState(true);

  const deals = useMemo(() => {
    const all = feed?.deals ?? [];
    return onlyTrades ? all.filter(isDiscretionary) : all;
  }, [feed, onlyTrades]);

  const shown = deals.slice(0, 40);

  return (
    <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#232730]">
        <div className="min-w-0">
          <span className="block text-[11px] font-semibold text-white">
            Insider and director dealings
          </span>
          <span className="block text-[10px] text-gray-500 truncate">
            SEC Form 4
            {feed ? ` · ${feed.filings} filings over the last ${feed.window}` : ""}
          </span>
        </div>
        <Toggle on={onlyTrades} onChange={setOnlyTrades}>
          {onlyTrades ? "Open-market" : "All"}
        </Toggle>
      </div>

      <div className="px-4 py-2.5 border-b border-[#232730]">
        <Flow deals={feed?.deals ?? []} />
      </div>

      {loading && <Empty>Reading EDGAR…</Empty>}
      {error && !loading && <Empty>{error}</Empty>}

      {!loading && !error && shown.length === 0 && (
        <Empty>
          No insider transactions were filed for the listed companies in this window.
        </Empty>
      )}

      {shown.length > 0 && (
        <div className="max-h-[420px] overflow-y-auto">
          {shown.map((d, i) => (
            <Row key={`${d.url}:${i}`} deal={d} showTicker />
          ))}
        </div>
      )}

      {deals.length > shown.length && (
        <div className="px-4 py-2 border-t border-[#232730] text-[10px] text-gray-600">
          Showing {shown.length} of {deals.length}
        </div>
      )}
    </div>
  );
}

/**
 * One company's dealings, for its market page.
 *
 * A missing filer is reported rather than rendered as an empty table: an ETF
 * has no officers, and that is an answer.
 */
export function TickerInsiderPanel({ ticker }: { ticker: string }) {
  const { data, loading, error } = useTickerInsiders(ticker);
  const [onlyTrades, setOnlyTrades] = useState(true);

  const deals = useMemo(() => {
    const all = data?.deals ?? [];
    return onlyTrades ? all.filter(isDiscretionary) : all;
  }, [data, onlyTrades]);

  return (
    <div className="bg-[#1B1E24] border border-[#232730] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#232730]">
        <div className="min-w-0">
          <span className="block text-[11px] font-semibold text-white">Insider dealings</span>
          <span className="block text-[10px] text-gray-500 truncate">
            {data?.issuer ? `${data.issuer} · SEC Form 4` : "SEC Form 4"}
          </span>
        </div>
        {!data?.unavailable && (
          <Toggle on={onlyTrades} onChange={setOnlyTrades}>
            {onlyTrades ? "Open-market" : "All"}
          </Toggle>
        )}
      </div>

      {!data?.unavailable && (
        <div className="px-4 py-2.5 border-b border-[#232730]">
          <Flow deals={data?.deals ?? []} />
        </div>
      )}

      {loading && <Empty>Reading EDGAR…</Empty>}
      {error && !loading && <Empty>{error}</Empty>}
      {data?.unavailable && <Empty>{data.unavailable}</Empty>}

      {!loading && !error && !data?.unavailable && deals.length === 0 && (
        <Empty>
          {onlyTrades
            ? "No open-market buying or selling in the most recent filings."
            : "No recent Form 4 filings."}
        </Empty>
      )}

      {deals.length > 0 && (
        <div className="max-h-[360px] overflow-y-auto">
          {deals.map((d, i) => (
            <Row key={`${d.url}:${i}`} deal={d} showTicker={false} />
          ))}
        </div>
      )}

      {data?.issuer && (
        <div className="px-4 py-2 border-t border-[#232730]">
          <a
            href={`${EDGAR_SEARCH}${ticker}`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-gray-500 hover:text-[#10B981] transition inline-flex items-center gap-1"
          >
            All filings on EDGAR
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      )}
    </div>
  );
}
