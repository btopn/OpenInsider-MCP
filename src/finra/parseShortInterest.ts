import type { ShortSnapshot } from "../types.js";
import { fetchFinra } from "./fetch.js";

const SI_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * FINRA bi-monthly short interest file URL.
 *
 * TODO(deployment): verify URL format on first live use. FINRA's CDN paths
 * shift occasionally; if 404, re-discover from
 * finra.org/finra-data/browse-catalog/equity-short-interest and update.
 */
export function buildShortInterestUrl(reportDateYYYYMMDD: string): string {
  return `https://cdn.finra.org/equity/regsho/monthly/SHRT${reportDateYYYYMMDD}.txt`;
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
 * Header columns are matched by regex so minor field-name changes don't break parsing.
 */
export function parseShortInterestFile(text: string): Map<string, RawShortInterestRow> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const map = new Map<string, RawShortInterestRow>();
  if (lines.length < 2) return map;

  const headerCols = lines[0].split("|").map((s) => s.trim());
  const findCol = (re: RegExp) => headerCols.findIndex((h) => re.test(h));

  const idx = {
    settlementDate: findCol(/settlement\s*date/i),
    symbol: headerCols.findIndex(
      (h) => /^symbol$/i.test(h) || (/symbol\b/i.test(h) && !/code|cusip/i.test(h)),
    ),
    current: findCol(/current.*short/i),
    previous: findCol(/previous.*short/i),
    avgVol: findCol(/average\s+daily\s+volume/i),
    dtc: findCol(/days\s+to\s+cover/i),
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

export function reportDateToIso(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function lastBusinessDayOfMonth(year: number, monthZeroIdx: number): Date {
  // Date(y, m+1, 0) is the last calendar day of month m
  const last = new Date(year, monthZeroIdx + 1, 0);
  while (last.getDay() === 0 || last.getDay() === 6) {
    last.setDate(last.getDate() - 1);
  }
  return last;
}

/**
 * Generate the most recent N bi-monthly settlement dates ending on or before `now`.
 * Bi-monthly cadence: 15th of each month + last business day of each month.
 * Files are typically published ~7 business days after settlement, so callers
 * should expect the most recent date in the returned array to potentially 404
 * (use return404AsNull on the fetch).
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
 */
export async function getShortInterestSnapshots(
  ticker: string,
  periodsBack: number,
  now: Date = new Date(),
): Promise<ShortSnapshot[]> {
  const upperTicker = ticker.toUpperCase();
  // Fetch one extra period so the oldest returned snapshot still has a prior
  // for delta computation. Most recent date may not be published yet (404).
  const dates = recentSettlementDates(now, periodsBack + 1);

  const snapshots: ShortSnapshot[] = [];
  for (const dateStr of dates) {
    const url = buildShortInterestUrl(dateStr);
    const text = await fetchFinra(url, { ttlMs: SI_TTL_MS, return404AsNull: true });
    if (text === null) continue;

    const map = parseShortInterestFile(text);
    const row = map.get(upperTicker);
    if (!row) continue;

    snapshots.push({
      ticker: upperTicker,
      reportDate: reportDateToIso(row.settlementDate || dateStr),
      sharesShort: row.sharesShort,
      pctOfFloat: null, // requires shares outstanding from another source
      daysToCover: row.daysToCover,
    });
  }

  // Snapshots are in descending date order (most recent first); compute delta
  // by comparing each entry to the next-older one.
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

  // Drop the extra oldest entry we fetched only to compute the previous delta
  return withDelta.slice(0, periodsBack);
}
