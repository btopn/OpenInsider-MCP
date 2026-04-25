import type { EdgarFiling } from "../types.js";
import { getRecentFilings } from "../edgar/submissions.js";
import { fetchEdgar } from "../edgar/fetch.js";
import { parse13DDetails } from "../edgar/parseFilingBody.js";

const FILING_BODY_TTL_MS = 24 * 60 * 60 * 1000;

export interface ActivistFilingsArgs {
  ticker: string;
  daysBack?: number;
  includeAmendments?: boolean;
}

export async function activistFilings(args: ActivistFilingsArgs): Promise<EdgarFiling[]> {
  const daysBack = args.daysBack ?? 365;
  const includeAmendments = args.includeAmendments !== false;
  const data = await getRecentFilings(args.ticker);
  if (!data) return [];

  const cutoff = daysAgoIso(daysBack);
  const out: EdgarFiling[] = [];

  for (const f of data.filings) {
    const isAmendment = f.form === "SC 13D/A";
    const isInitial = f.form === "SC 13D";
    if (!isAmendment && !isInitial) continue;
    if (isAmendment && !includeAmendments) continue;
    if (f.filingDate < cutoff) continue;

    let filerName: string | undefined;
    let pctOwned: number | null = null;
    let purposeExcerpt: string | null = null;
    try {
      const body = await fetchEdgar(f.primaryDocUrl, {
        accept: "text/html",
        ttlMs: FILING_BODY_TTL_MS,
      });
      const parsed = parse13DDetails(body);
      filerName = parsed.filerName ?? undefined;
      pctOwned = parsed.pctOwned;
      purposeExcerpt = parsed.purposeExcerpt;
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
      filerName,
      pctOwned,
      purposeExcerpt,
      isAmendment,
    });
  }

  return out;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
