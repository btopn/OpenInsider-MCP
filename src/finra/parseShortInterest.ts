import type { ShortSnapshot } from "../types.js";
import { fetchFinra } from "./fetch.js";
import { tickerToCik } from "../edgar/cik.js";
import { getLatestSharesOutstanding } from "../edgar/companyFacts.js";

/**
 * FINRA bi-monthly short interest file URL.
 * Verified pattern (2026-04): pipe-delimited despite the .csv extension,
 * camelCase column names. Files publish ~7 business days after settlement.
 */
export function buildShortInterestUrl(reportDateYYYYMMDD: string): string {
  return `https://cdn.finra.org/equity/otcmarket/biweekly/shrt${reportDateYYYYMMDD}.csv`;
}

export interface RawShortInterestRow {
  symbol: string;
  settlementDate: string;
  sharesShort: number;
  prevSharesShort: number;
  avgDailyVolume: number | null;
  daysToCover: number | null;
}

/**
 * Parse a FINRA bi-monthly short interest file (whole-market, pipe-delimited).
 * Header columns are matched by regex to tolerate both the legacy "Symbol|...|
 * Current Shares Short Quantity" form and the current "symbolCode|...|
 * currentShortPositionQuantity" camelCase form.
 */
export function parseShortInterestFile(text: string): Map<string, RawShortInterestRow> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const map = new Map<string, RawShortInterestRow>();
  if (lines.length < 2) return map;

  const headerCols = lines[0].split("|").map((s) => s.trim());
  const findCol = (re: RegExp) => headerCols.findIndex((h) => re.test(h));

  // Symbol column: prefer exact "symbol" (legacy format), fall back to any
  // column containing "symbol" (current "symbolCode" form).
  let symbolIdx = headerCols.findIndex((h) => /^symbol$/i.test(h));
  if (symbolIdx < 0) {
    symbolIdx = headerCols.findIndex((h) => /symbol/i.test(h));
  }

  const idx = {
    settlementDate: findCol(/settlement\s*date/i),
    symbol: symbolIdx,
    current: findCol(/current.*short/i),
    previous: findCol(/previous.*short/i),
    avgVol: findCol(/average\s*daily\s*volume/i),
    dtc: findCol(/days\s*to\s*cover/i),
  };

  if (idx.symbol < 0 || idx.current < 0) {
    throw new Error(
      "FINRA short interest file header missing required columns (symbol, current shares short)",
    );
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("|");
    const symbol = (cols[idx.symbol] ?? "").trim().toUpperCase();
    if (!symbol) continue;

    map.set(symbol, {
      symbol,
      settlementDate: idx.settlementDate >= 0 ? (cols[idx.settlementDate] ?? "").trim() : "",
      sharesShort: parseIntField(cols[idx.current]),
      prevSharesShort: idx.previous >= 0 ? parseIntField(cols[idx.previous]) : 0,
      avgDailyVolume: idx.avgVol >= 0 ? parseIntField(cols[idx.avgVol]) || null : null,
      daysToCover: idx.dtc >= 0 ? parseFloatField(cols[idx.dtc]) : null,
    });
  }

  return map;
}

function parseIntField(s: string | undefined): number {
  if (!s) return 0;
  return parseInt(s.replace(/,/g, ""), 10) || 0;
}

function parseFloatField(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/,/g, ""));
  return isFinite(n) ? n : null;
}

/**
 * Convert YYYYMMDD or YYYY-MM-DD to ISO YYYY-MM-DD. Pass-through for
 * already-ISO inputs (the current FINRA file format reports settlementDate
 * as YYYY-MM-DD directly).
 */
export function reportDateToIso(date: string): string {
  if (date.length === 10 && date[4] === "-" && date[7] === "-") return date;
  if (date.length !== 8) return date;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function lastBusinessDayOfMonth(year: number, monthZeroIdx: number): Date {
  const last = new Date(year, monthZeroIdx + 1, 0);
  while (last.getDay() === 0 || last.getDay() === 6) {
    last.setDate(last.getDate() - 1);
  }
  return last;
}

/**
 * Generate the most recent N bi-monthly settlement dates ending on or before `now`.
 */
export function recentSettlementDates(now: Date, count: number): string[] {
  const dates: Date[] = [];
  let year = now.getFullYear();
  let month = now.getMonth();

  for (let i = 0; i < count * 2 + 4 && dates.length < count + 2; i++) {
    const fifteenth = new Date(year, month, 15);
    const lastBiz = lastBusinessDayOfMonth(year, month);
    if (lastBiz <= now) dates.push(lastBiz);
    if (fifteenth <= now) dates.push(fifteenth);
    month--;
    if (month < 0) {
      month = 11;
      year--;
    }
  }

  dates.sort((a, b) => b.getTime() - a.getTime());
  return dates.slice(0, count).map(toYYYYMMDD);
}

/**
 * Fetch one ticker's short-interest snapshots for the most recent N bi-monthly
 * settlement dates, with delta vs prior period for each entry that has a prior.
 *
 * pctOfFloat is computed as `sharesShort / sharesOutstanding` using the latest
 * SEC XBRL `dei:EntityCommonStockSharesOutstanding` fact for the ticker. This
 * is the standard SI/SO ratio (commonly conflated with "% of float" — true
 * public float requires restricted-share data not available via free SEC data).
 * Returns null when the company has no XBRL filings or the lookup fails.
 */
export async function getShortInterestSnapshots(
  ticker: string,
  periodsBack: number,
  now: Date = new Date(),
): Promise<ShortSnapshot[]> {
  const upperTicker = ticker.toUpperCase();

  // Look up shares outstanding once per ticker (best-effort; null on failure).
  let sharesOutstanding: number | null = null;
  try {
    const company = await tickerToCik(upperTicker);
    if (company) {
      sharesOutstanding = await getLatestSharesOutstanding(company.cikPadded);
    }
  } catch {
    // fail-soft: pctOfFloat stays null
  }

  // Fetch one extra period so the oldest returned snapshot still has a prior
  // for delta computation. Most recent date may not be published yet (404).
  const dates = recentSettlementDates(now, periodsBack + 1);

  const snapshots: ShortSnapshot[] = [];
  for (const dateStr of dates) {
    const url = buildShortInterestUrl(dateStr);
    const text = await fetchFinra(url, { return404AsNull: true });
    if (text === null) continue;

    const map = parseShortInterestFile(text);
    const row = map.get(upperTicker);
    if (!row) continue;

    const pctOfFloat =
      sharesOutstanding && sharesOutstanding > 0 && row.sharesShort > 0
        ? row.sharesShort / sharesOutstanding
        : null;

    snapshots.push({
      ticker: upperTicker,
      reportDate: reportDateToIso(row.settlementDate || dateStr),
      sharesShort: row.sharesShort,
      pctOfFloat,
      daysToCover: row.daysToCover,
    });
  }

  // Compute delta by comparing each entry to the next-older one.
  const withDelta: ShortSnapshot[] = [];
  for (let i = 0; i < snapshots.length; i++) {
    const cur = snapshots[i];
    const prior = snapshots[i + 1];
    if (prior && prior.sharesShort > 0) {
      withDelta.push({
        ...cur,
        delta: {
          sharesShortDelta: cur.sharesShort - prior.sharesShort,
          pctDelta: (cur.sharesShort - prior.sharesShort) / prior.sharesShort,
        },
      });
    } else {
      withDelta.push(cur);
    }
  }

  return withDelta.slice(0, periodsBack);
}
