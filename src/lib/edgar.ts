/**
 * Insider and director dealings, read from SEC Form 4.
 *
 * An officer, director or ten-percent holder has to report a trade in their own
 * company within two business days, and those reports are public. This module
 * reads them and turns them into rows the application can show beside a price.
 *
 * Server only. The SEC requires a contact address in the User-Agent and sends
 * no CORS headers, so a browser cannot make these calls; everything here runs
 * inside a route handler. The row shape it produces lives in insider.ts, which
 * the browser can import without dragging this file along.
 */
import { FILERS, TICKER_BY_CIK, bareCik } from "./ciks";
import type { DealKind, InsiderDeal } from "./insider";

/**
 * The SEC's fair-access policy asks for a contact address so it can reach
 * whoever is responsible for the traffic. An anonymous request gets a 403.
 */
const UA = {
  "User-Agent": "DIVS Protocol valeinfralabs@gmail.com",
  "Accept-Encoding": "gzip, deflate",
};

/** Ten requests a second is the documented ceiling; this stays under it. */
const MIN_GAP_MS = 120;
let lastCall = 0;

async function sec(url: string, revalidate: number): Promise<Response> {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  return fetch(url, { headers: UA, next: { revalidate } });
}

/** The SEC's transaction codes, mapped onto what they mean for a holding. */
const KIND_BY_CODE: Record<string, DealKind> = {
  P: "buy", // open-market purchase
  S: "sell", // open-market sale
  A: "award", // grant or award from the issuer
  M: "exercise", // exercise or conversion of a derivative
  F: "tax", // shares surrendered to cover tax or the exercise price
  G: "gift",
  C: "exercise",
  X: "exercise",
  D: "other", // disposition back to the issuer
  J: "other", // the SEC's own catch-all, explained in a footnote
};

// --- XML ---------------------------------------------------------------------

/**
 * Officer titles are free text and arrive escaped, so "CFO & SVP" is filed as
 * "CFO &amp; SVP" and would otherwise be displayed that way.
 */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

const unescape = (s: string) =>
  s
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (e) => ENTITIES[e] ?? e)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

/**
 * Form 4 is a flat, fixed schema with no attributes worth reading and no
 * recursion, so it is matched directly rather than parsed. A full XML parser
 * would be a dependency and a cold-start cost for no gain here.
 */
const tag = (xml: string, name: string): string | undefined => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : undefined;
};

/**
 * A leaf element's text. Unescaping happens here rather than in `tag`, because
 * `tag` also returns blocks that get parsed again, and turning an escaped angle
 * bracket inside one into a real one would corrupt that second pass.
 */
const text = (xml: string, name: string): string | undefined => {
  const raw = tag(xml, name);
  return raw === undefined ? undefined : unescape(raw);
};

/** Most Form 4 fields wrap their content in a further <value> element. */
const value = (xml: string, name: string): string | undefined => {
  const block = tag(xml, name);
  if (block === undefined) return undefined;
  return tag(block, "value") ?? (block.includes("<") ? undefined : block);
};

const num = (xml: string, name: string): number => {
  const v = value(xml, name);
  const n = v === undefined ? NaN : Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const yes = (xml: string, name: string) => {
  const v = tag(xml, name)?.toLowerCase();
  return v === "true" || v === "1";
};

/** EDGAR stores many names in capitals. Lower-casing them wholesale is worse. */
function tidyName(raw: string): string {
  if (raw !== raw.toUpperCase()) return raw;
  return raw
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Llc|Lp|Inc|Ltd)\b/g, (s) => s.toUpperCase());
}

function describeRole(owner: string) {
  const isDirector = yes(owner, "isDirector");
  const isOfficer = yes(owner, "isOfficer");
  const isTenPercentOwner = yes(owner, "isTenPercentOwner");
  const title = text(owner, "officerTitle")?.trim();

  const parts: string[] = [];
  if (isOfficer) parts.push(title && title.length ? title : "Officer");
  if (isDirector) parts.push("Director");
  if (isTenPercentOwner) parts.push("10% owner");

  return {
    role: parts.length ? parts.join(", ") : "Insider",
    isDirector,
    isOfficer,
    isTenPercentOwner,
  };
}

/**
 * Turns one Form 4 into a row per reported transaction.
 *
 * Only Table I is read. Table II holds derivatives - options and restricted
 * units - and a grant of something that converts later is not a trade in the
 * stock.
 */
export function parseForm4(xml: string, ticker: string, filed: string, url: string): InsiderDeal[] {
  const issuerBlock = tag(xml, "issuer") ?? "";
  const issuer = text(issuerBlock, "issuerName") ?? FILERS[ticker]?.issuer ?? ticker;

  const ownerBlock = tag(xml, "reportingOwner") ?? "";
  const insiderRaw = text(tag(ownerBlock, "reportingOwnerId") ?? "", "rptOwnerName") ?? "Unknown";
  const relationship = tag(ownerBlock, "reportingOwnerRelationship") ?? "";
  const { role, isDirector, isOfficer, isTenPercentOwner } = describeRole(relationship);

  const table = tag(xml, "nonDerivativeTable");
  if (!table) return [];

  const deals: InsiderDeal[] = [];
  for (const m of table.matchAll(
    /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g,
  )) {
    const t = m[1];
    const coding = tag(t, "transactionCoding") ?? "";
    const code = tag(coding, "transactionCode")?.trim() ?? "";
    const shares = num(t, "transactionShares");
    if (shares <= 0) continue;

    const price = num(t, "transactionPricePerShare");
    const date = value(t, "transactionDate") ?? filed;

    // An unrecognised code becomes "other" rather than being guessed at from
    // the acquired-or-disposed flag. Only P and S feed the net-flow figure, and
    // a code the SEC did not define as an open-market trade should not inflate
    // it just because shares moved out.
    const kind = KIND_BY_CODE[code] ?? "other";

    deals.push({
      ticker,
      issuer,
      insider: tidyName(insiderRaw),
      role,
      isDirector,
      isOfficer,
      isTenPercentOwner,
      date,
      filed,
      code,
      kind,
      shares,
      price,
      value: shares * price,
      sharesAfter: num(t, "sharesOwnedFollowingTransaction"),
      url,
    });
  }
  return deals;
}

// --- fetching ----------------------------------------------------------------

const HOUR = 3600;

type FilingRef = { ticker: string; accession: string; filed: string };

/** The archive path EDGAR serves a filing's documents from. */
function archive(cik: string, accession: string) {
  return `https://www.sec.gov/Archives/edgar/data/${bareCik(cik)}/${accession.replace(/-/g, "")}`;
}

/**
 * Every filing is also published as one text file holding all of its documents.
 *
 * That is what gets fetched, rather than the XML on its own, because the
 * document is not reliably named. NVIDIA files `wk-form4_1789160684.xml`,
 * others file `form4.xml`, and the daily index gives no name at all - so
 * guessing one silently drops most of the feed. The combined file is always at
 * a path derived from the accession number, and a Form 4 runs a few kilobytes.
 */
const submissionText = (cik: string, accession: string) =>
  `https://www.sec.gov/Archives/edgar/data/${bareCik(cik)}/${accession}.txt`;

/**
 * Recent Form 4 filings for one company.
 *
 * The submissions feed carries roughly the last thousand filings of every type,
 * so the form filter happens here rather than in the request.
 */
export async function filingsForTicker(ticker: string, limit = 40): Promise<FilingRef[]> {
  const filer = FILERS[ticker];
  if (!filer) return [];

  const res = await sec(`https://data.sec.gov/submissions/CIK${filer.cik}.json`, HOUR);
  if (!res.ok) return [];

  const json = (await res.json()) as { filings?: { recent?: Record<string, string[]> } };
  const recent = json.filings?.recent;
  if (!recent?.form) return [];

  const out: FilingRef[] = [];
  for (let i = 0; i < recent.form.length && out.length < limit; i++) {
    if (recent.form[i] !== "4") continue;
    out.push({ ticker, accession: recent.accessionNumber[i], filed: recent.filingDate[i] });
  }
  return out;
}

/** Fetches and parses one filing, returning nothing rather than throwing. */
async function loadFiling(ref: FilingRef): Promise<InsiderDeal[]> {
  const filer = FILERS[ref.ticker];
  if (!filer) return [];

  // A filing is amendable and its documents never change, so this can be held
  // far longer than the lists that point at it.
  const res = await sec(submissionText(filer.cik, ref.accession), HOUR * 24 * 7);
  if (!res.ok) return [];

  // The filing index is the landing page a person should get on click-through.
  // It is derived from the accession number, so it is always a real URL.
  const human = `${archive(filer.cik, ref.accession)}/${ref.accession}-index.htm`;

  try {
    const body = await res.text();
    // The combined file wraps the ownership XML in SGML headers and, for a
    // paper-equivalent filing, may not contain it at all.
    const xml = body.match(/<ownershipDocument>[\s\S]*?<\/ownershipDocument>/)?.[0];
    return xml ? parseForm4(xml, ref.ticker, ref.filed, human) : [];
  } catch {
    return [];
  }
}

/** Resolves `work` with at most `width` in flight, preserving input order. */
async function pool<T, R>(work: T[], width: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(work.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, work.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= work.length) return;
        out[i] = await run(work[i]);
      }
    }),
  );
  return out;
}

/** Every reported transaction for one ticker, newest first. */
export async function dealsForTicker(ticker: string, filings = 12): Promise<InsiderDeal[]> {
  const refs = await filingsForTicker(ticker, filings);
  const batches = await pool(refs, 6, loadFiling);
  return batches.flat().sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Dealings across every listed stock, newest first.
 *
 * Asking each of the eighty-five companies for its filing list would be
 * eighty-five requests before a single form is read. EDGAR publishes a daily
 * index of everything filed that day, so a handful of requests covers the whole
 * window instead, and only the filings belonging to a listed ticker are opened.
 */
export async function recentDeals(days = 5, cap = 60): Promise<InsiderDeal[]> {
  // The weekdays to cover. Nothing is filed at the weekend, so requesting those
  // days is pure latency for an empty answer.
  const stamps: string[] = [];
  for (let back = 0; stamps.length < days && back < days * 2; back++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - back);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    stamps.push(`${d.getUTCFullYear()}|${Math.floor(d.getUTCMonth() / 3) + 1}|${month}${day}`);
  }

  // Each index is close to a megabyte and takes about a second, so these run
  // together. Fetching them one after another was most of the cost of the feed.
  const pages = await pool(stamps, 5, async (stamp) => {
    const [y, q, md] = stamp.split("|");
    const res = await sec(
      `https://www.sec.gov/Archives/edgar/daily-index/${y}/QTR${q}/form.${y}${md}.idx`,
      HOUR,
    );
    // A day with no index yet is normal near the present, not an error.
    return res.ok ? res.text() : "";
  });

  const refs: FilingRef[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const line of page.split("\n")) {
      if (!line.startsWith("4 ")) continue;
      // Fixed-width columns: form, company, CIK, date filed, path.
      const cols = line.trim().split(/\s{2,}/);
      const path = cols[cols.length - 1];
      const cik = cols[cols.length - 3];
      if (!path?.endsWith(".txt") || !cik) continue;

      // A Form 4 is indexed once per filer, so the same filing appears under
      // both the company and the person. Only the company side is listed here.
      const ticker = TICKER_BY_CIK[cik.padStart(10, "0")];
      if (!ticker) continue;

      const accession = path.split("/").pop()!.replace(".txt", "");
      const key = `${ticker}:${accession}`;
      if (seen.has(key)) continue;
      seen.add(key);

      refs.push({ ticker, accession, filed: cols[cols.length - 2] });
    }
  }

  // Newest first before the cap, so a busy window drops the oldest filings
  // rather than whichever day happened to be read last.
  refs.sort((a, b) => b.filed.localeCompare(a.filed));

  const batches = await pool(refs.slice(0, cap), 8, loadFiling);
  return batches.flat().sort((a, b) => b.date.localeCompare(a.date) || b.value - a.value);
}
