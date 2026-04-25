import type { EdgarFiling } from "../types.js";
import { getRecentFilings } from "../edgar/submissions.js";
import { fetchEdgar } from "../edgar/fetch.js";
import { parseS3ShelfDetails } from "../edgar/parseFilingBody.js";

const FILING_BODY_TTL_MS = 24 * 60 * 60 * 1000;
const DILUTION_FORMS = new Set(["S-3", "S-3/A", "S-3ASR", "424B5", "424B2", "424B3"]);

export interface DilutionFilingsArgs {
  ticker: string;
  daysBack?: number;
}

export async function dilutionFilings(args: DilutionFilingsArgs): Promise<EdgarFiling[]> {
  const daysBack = args.daysBack ?? 365;
  const data = await getRecentFilings(args.ticker);
  if (!data) return [];

  const cutoff = daysAgoIso(daysBack);
  const out: EdgarFiling[] = [];

  for (const f of data.filings) {
    if (!DILUTION_FORMS.has(f.form)) continue;
    if (f.filingDate < cutoff) continue;

    let shelfAmount: number | null = null;
    let useOfProceedsExcerpt: string | null = null;
    try {
      const body = await fetchEdgar(f.primaryDocUrl, {
        accept: "text/html",
        ttlMs: FILING_BODY_TTL_MS,
      });
      const parsed = parseS3ShelfDetails(body);
      shelfAmount = parsed.shelfAmount;
      useOfProceedsExcerpt = parsed.useOfProceedsExcerpt;
    } catch {
      // fail-soft
    }

    out.push({
      ticker: data.ticker,
      cik: data.company.cikPadded,
      formType: f.form,
      filingDate: f.filingDate,
      acceptanceDateTime: f.acceptanceDateTime,
      accessionNumber: f.accessionNumber,
      primaryDocUrl: f.primaryDocUrl,
      shelfAmount,
      useOfProceedsExcerpt,
    });
  }

  return out;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
