import { fetchFinra } from "./fetch.js";

// Major venues whose Reg SHO daily files we aggregate. CNMS = Nasdaq Carteret,
// FNRA = FINRA OTC, FNYX = NYSE OTC, FNQC = Nasdaq OTC. Per-venue fragmentation
// is not useful to the orchestrator; we sum short volume + total volume across
// all venues per date.
const VENUES = ["CNMS", "FNRA", "FNYX", "FNQC"] as const;

/**
 * FINRA Reg SHO daily short-sale volume file URL for a given venue and date.
 */
export function buildRegShoUrl(venue: string, dateYYYYMMDD: string): string {
  return `https://cdn.finra.org/equity/regsho/daily/${venue}shvol${dateYYYYMMDD}.txt`;
}

export interface RawRegShoRow {
  date: string;
  symbol: string;
  shortVolume: number;
  shortExemptVolume: number;
  totalVolume: number;
}

export function parseRegShoFile(text: string): Map<string, RawRegShoRow> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const map = new Map<string, RawRegShoRow>();
  if (lines.length < 2) return map;

  const header = lines[0].split("|").map((s) => s.trim());
  const idx = {
    date: header.findIndex((h) => /^date$/i.test(h)),
    symbol: header.findIndex((h) => /^symbol$/i.test(h)),
    short: header.findIndex((h) => /^short\s*volume$/i.test(h) || /^shortvolume$/i.test(h)),
    shortExempt: header.findIndex((h) => /short\s*exempt/i.test(h)),
    total: header.findIndex((h) => /^total\s*volume$/i.test(h) || /^totalvolume$/i.test(h)),
  };

  if (idx.symbol < 0 || idx.short < 0 || idx.total < 0) {
    throw new Error("FINRA Reg SHO daily file header missing required columns");
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("|");
    const symbol = (cols[idx.symbol] ?? "").trim().toUpperCase();
    if (!symbol) continue;

    map.set(symbol, {
      date: idx.date >= 0 ? (cols[idx.date] ?? "").trim() : "",
      symbol,
      shortVolume: parseIntField(cols[idx.short]),
      shortExemptVolume: idx.shortExempt >= 0 ? parseIntField(cols[idx.shortExempt]) : 0,
      totalVolume: parseIntField(cols[idx.total]),
    });
  }

  return map;
}

function parseIntField(s: string | undefined): number {
  if (!s) return 0;
  return parseInt(s.replace(/,/g, ""), 10) || 0;
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

/**
 * Generate the most recent N business days ending yesterday (Reg SHO daily
 * files are typically published next business day).
 */
export function recentBusinessDays(now: Date, count: number): string[] {
  const dates: string[] = [];
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cur.setDate(cur.getDate() - 1);

  while (dates.length < count) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) {
      dates.push(toYYYYMMDD(cur));
    }
    cur.setDate(cur.getDate() - 1);
  }

  return dates;
}

export interface DailyShortVolumeRow {
  date: string;
  shortVolume: number;
  totalVolume: number;
  shortRatio: number;
}

/**
 * Fetch one ticker's daily short-sale volume for the most recent N business
 * days, aggregating across all venues by SUMMING short volume and total volume,
 * then computing the ratio from the sums.
 */
export async function getDailyShortVolume(
  ticker: string,
  daysBack: number,
  now: Date = new Date(),
): Promise<DailyShortVolumeRow[]> {
  const upperTicker = ticker.toUpperCase();
  const dates = recentBusinessDays(now, daysBack);
  const rows: DailyShortVolumeRow[] = [];

  for (const dateStr of dates) {
    const venueResults = await Promise.all(
      VENUES.map((venue) => fetchVenueRow(venue, dateStr, upperTicker)),
    );

    let aggShort = 0;
    let aggTotal = 0;
    let anyHit = false;
    for (const row of venueResults) {
      if (!row) continue;
      aggShort += row.shortVolume;
      aggTotal += row.totalVolume;
      anyHit = true;
    }

    if (anyHit && aggTotal > 0) {
      rows.push({
        date: toIso(dateStr),
        shortVolume: aggShort,
        totalVolume: aggTotal,
        shortRatio: aggShort / aggTotal,
      });
    }
  }

  return rows;
}

async function fetchVenueRow(
  venue: string,
  dateStr: string,
  ticker: string,
): Promise<RawRegShoRow | null> {
  const url = buildRegShoUrl(venue, dateStr);
  const text = await fetchFinra(url, { return404AsNull: true });
  if (text === null) return null;
  const map = parseRegShoFile(text);
  return map.get(ticker) ?? null;
}
