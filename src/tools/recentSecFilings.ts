import type { EdgarFiling } from "../types.js";
import { getRecentFilings } from "../edgar/submissions.js";

export interface RecentSecFilingsArgs {
  ticker: string;
  daysBack?: number;
  itemCodes?: string[];
  limit?: number;
}

export async function recentSecFilings(args: RecentSecFilingsArgs): Promise<EdgarFiling[]> {
  const daysBack = args.daysBack ?? 30;
  const limit = args.limit ?? 50;
  const data = await getRecentFilings(args.ticker);
  if (!data) return [];

  const cutoff = daysAgoIso(daysBack);
  const itemFilter = args.itemCodes?.map((c) => c.trim()).filter(Boolean);

  const out: EdgarFiling[] = [];
  for (const f of data.filings) {
    if (out.length >= limit) break;
    if (f.form !== "8-K" && f.form !== "8-K/A") continue;
    if (f.filingDate < cutoff) continue;
    if (itemFilter && itemFilter.length > 0) {
      const overlap = f.items.some((it) => itemFilter.includes(it));
      if (!overlap) continue;
    }
    out.push({
      ticker: data.ticker,
      cik: data.company.cikPadded,
      formType: f.form,
      filingDate: f.filingDate,
      acceptanceDateTime: f.acceptanceDateTime,
      accessionNumber: f.accessionNumber,
      primaryDocUrl: f.primaryDocUrl,
      itemCodes: f.items,
    });
  }
  return out;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
