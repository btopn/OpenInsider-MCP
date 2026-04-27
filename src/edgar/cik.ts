import { fetchEdgar } from "./fetch.js";

const TICKER_INDEX_URL = "https://www.sec.gov/files/company_tickers.json";

export interface CompanyRef {
  cikInt: string;
  cikPadded: string;
  title: string;
}

interface CompanyTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

let cikIndex: Map<string, CompanyRef> | null = null;

async function loadCikIndex(): Promise<Map<string, CompanyRef>> {
  if (cikIndex) return cikIndex;

  const json = await fetchEdgar(TICKER_INDEX_URL);
  const data = JSON.parse(json) as Record<string, CompanyTickerEntry>;

  const map = new Map<string, CompanyRef>();
  for (const entry of Object.values(data)) {
    if (!entry?.ticker) continue;
    const cikInt = String(entry.cik_str);
    map.set(entry.ticker.toUpperCase(), {
      cikInt,
      cikPadded: cikInt.padStart(10, "0"),
      title: entry.title,
    });
  }

  cikIndex = map;
  return map;
}

export async function tickerToCik(ticker: string): Promise<CompanyRef | null> {
  const idx = await loadCikIndex();
  return idx.get(ticker.toUpperCase()) ?? null;
}

export function _resetCikIndex(): void {
  cikIndex = null;
}
