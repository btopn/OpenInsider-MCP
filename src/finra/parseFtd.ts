import AdmZip from "adm-zip";
import { fetchFinra, fetchFinraBinary } from "./fetch.js";

const FTD_TTL_MS = 24 * 60 * 60 * 1000;
const THRESHOLD_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * SEC failures-to-deliver bi-monthly file URL.
 * Accepts either YYYYMMDD (auto-converted by half: day<=15 -> 'a', else 'b')
 * or a literal YYYYMM[ab] period key.
 *
 * Verified pattern (2026-04): files ship as ZIP archives containing a single
 * pipe-delimited text file with the same name minus extension.
 */
export function buildFtdUrl(periodKey: string): string {
  let key = periodKey;
  if (/^\d{8}$/.test(periodKey)) {
    const yyyymm = periodKey.slice(0, 6);
    const day = parseInt(periodKey.slice(6, 8), 10);
    key = yyyymm + (day <= 15 ? "a" : "b");
  }
  return `https://www.sec.gov/files/data/fails-deliver-data/cnsfails${key}.zip`;
}

/**
 * Reg SHO Threshold List URLs. Two sources (NYSE + Nasdaq); we merge into a
 * unified set of tickers that are currently on either threshold list.
 *
 * TODO(deployment): URL formats may have changed; verify on first live use.
 */
export function buildThresholdUrls(dateYYYYMMDD: string): { nasdaq: string; nyse: string } {
  return {
    nasdaq: `https://www.nasdaqtrader.com/dynamic/symdir/regsho/nasdaqth${dateYYYYMMDD}.txt`,
    nyse: `https://www.nyse.com/api/regulatory/threshold-securities/download?selectedDate=${dateYYYYMMDD}`,
  };
}

export interface RawFtdRow {
  settlementDate: string;
  cusip: string;
  symbol: string;
  quantityFails: number;
  description: string;
  price: number | null;
}

export function parseFtdFile(text: string): RawFtdRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: RawFtdRow[] = [];
  if (lines.length < 2) return rows;

  const header = lines[0].split("|").map((s) => s.trim());
  const idx = {
    date: header.findIndex((h) => /^settlement\s*date$/i.test(h) || /^date$/i.test(h)),
    cusip: header.findIndex((h) => /^cusip$/i.test(h)),
    symbol: header.findIndex((h) => /^symbol$/i.test(h)),
    quantity: header.findIndex(
      (h) => /quantity.*fail/i.test(h) || /^qty\s*fails?$/i.test(h) || /^quantity$/i.test(h),
    ),
    description: header.findIndex((h) => /description/i.test(h)),
    price: header.findIndex((h) => /^price$/i.test(h)),
  };

  if (idx.symbol < 0 || idx.quantity < 0) {
    throw new Error("SEC FTD file header missing required columns (symbol, quantity)");
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("|");
    const symbol = (cols[idx.symbol] ?? "").trim().toUpperCase();
    if (!symbol) continue;

    rows.push({
      settlementDate: idx.date >= 0 ? (cols[idx.date] ?? "").trim() : "",
      cusip: idx.cusip >= 0 ? (cols[idx.cusip] ?? "").trim() : "",
      symbol,
      quantityFails: parseIntField(cols[idx.quantity]),
      description: idx.description >= 0 ? (cols[idx.description] ?? "").trim() : "",
      price: idx.price >= 0 ? parseFloatField(cols[idx.price]) : null,
    });
  }

  return rows;
}

export function parseThresholdFile(text: string): Set<string> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const set = new Set<string>();
  if (lines.length === 0) return set;

  const hasPipe = lines[0].includes("|");
  const splitter: RegExp = hasPipe ? /\|/ : /[\s,]+/;

  let symbolIdx = -1;
  let dataStart = 0;
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    const cols = lines[i].split(splitter).map((s) => s.trim());
    const sIdx = cols.findIndex((c) => /^symbol$/i.test(c));
    if (sIdx >= 0) {
      symbolIdx = sIdx;
      dataStart = i + 1;
      break;
    }
  }
  if (symbolIdx < 0) {
    symbolIdx = 0;
    dataStart = 0;
  }

  for (let i = dataStart; i < lines.length; i++) {
    const cols = lines[i].split(splitter);
    const sym = (cols[symbolIdx] ?? "").trim().toUpperCase();
    if (sym && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym)) {
      set.add(sym);
    }
  }

  return set;
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

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function toIso(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function lastBusinessDayOfMonth(year: number, monthZeroIdx: number): Date {
  const last = new Date(year, monthZeroIdx + 1, 0);
  while (last.getDay() === 0 || last.getDay() === 6) {
    last.setDate(last.getDate() - 1);
  }
  return last;
}

export function recentBiMonthlyDates(now: Date, count: number): string[] {
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

export interface FtdRow {
  date: string;
  ftdShares: number;
  ftdValue: number;
  onThresholdList: boolean;
}

async function getCurrentThresholdSet(now: Date = new Date()): Promise<Set<string>> {
  const dateStr = toYYYYMMDD(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const urls = buildThresholdUrls(dateStr);

  const merged = new Set<string>();
  for (const url of [urls.nasdaq, urls.nyse]) {
    try {
      const text = await fetchFinra(url, { ttlMs: THRESHOLD_TTL_MS, return404AsNull: true });
      if (text === null) continue;
      for (const sym of parseThresholdFile(text)) {
        merged.add(sym);
      }
    } catch {
      // fail-soft: threshold list is supplementary; an outage shouldn't block FTD data
    }
  }
  return merged;
}

/**
 * Extract the single text entry from a SEC FTD ZIP archive. Returns null if
 * the ZIP is empty or unreadable.
 */
function extractFtdText(buffer: ArrayBuffer): string | null {
  try {
    const zip = new AdmZip(Buffer.from(buffer));
    const entries = zip.getEntries();
    if (entries.length === 0) return null;
    return entries[0].getData().toString("utf-8");
  } catch {
    return null;
  }
}

/**
 * Fetch one ticker's failures-to-deliver across the most recent N bi-monthly
 * SEC FTD files, plus its current threshold-list status. FTD shares + value
 * are summed per period (each SEC FTD file may have multiple rows per ticker
 * for different settlement dates within the period).
 */
export async function getFailuresToDeliver(
  ticker: string,
  periodsBack: number,
  now: Date = new Date(),
): Promise<FtdRow[]> {
  const upperTicker = ticker.toUpperCase();
  const dates = recentBiMonthlyDates(now, periodsBack);
  const thresholdSet = await getCurrentThresholdSet(now);
  const onThresholdList = thresholdSet.has(upperTicker);

  // Map YYYYMMDD dates to unique YYYYMM[ab] period keys (each half-month
  // file aggregates multiple settlement dates).
  const periodKeys = new Set<string>();
  for (const d of dates) {
    const yyyymm = d.slice(0, 6);
    const day = parseInt(d.slice(6, 8), 10);
    periodKeys.add(yyyymm + (day <= 15 ? "a" : "b"));
  }

  const rows: FtdRow[] = [];
  for (const periodKey of periodKeys) {
    const url = buildFtdUrl(periodKey);
    const buf = await fetchFinraBinary(url, { ttlMs: FTD_TTL_MS, return404AsNull: true });
    if (buf === null) continue;
    const text = extractFtdText(buf);
    if (text === null) continue;

    const allRows = parseFtdFile(text);
    let totalShares = 0;
    let totalValue = 0;
    let anyHit = false;
    let mostRecentSettlement = "";

    for (const r of allRows) {
      if (r.symbol !== upperTicker) continue;
      anyHit = true;
      totalShares += r.quantityFails;
      if (r.price !== null) totalValue += r.quantityFails * r.price;
      if (r.settlementDate > mostRecentSettlement) mostRecentSettlement = r.settlementDate;
    }

    if (anyHit) {
      // Period date for the row: most recent settlement within the half-month
      // (or the period midpoint if settlement dates weren't captured).
      const periodDate = mostRecentSettlement
        ? toIso(mostRecentSettlement)
        : `${periodKey.slice(0, 4)}-${periodKey.slice(4, 6)}-${periodKey.endsWith("a") ? "15" : "28"}`;
      rows.push({
        date: periodDate,
        ftdShares: totalShares,
        ftdValue: totalValue,
        onThresholdList,
      });
    }
  }

  // Sort descending by date
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows;
}
