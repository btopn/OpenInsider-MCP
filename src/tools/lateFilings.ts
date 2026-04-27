import type { EdgarFiling } from "../types.js";
import { getRecentFilings } from "../edgar/submissions.js";
import { fetchEdgar } from "../edgar/fetch.js";
import { classifyNtReason } from "../edgar/parseFilingBody.js";

const NT_FORMS = new Set(["NT 10-K", "NT 10-Q", "NT 10-K/A", "NT 10-Q/A"]);

export interface LateFilingsArgs {
  ticker: string;
  daysBack?: number;
  limit?: number;
}

export async function lateFilings(args: LateFilingsArgs): Promise<EdgarFiling[]> {
  const daysBack = args.daysBack ?? 365;
  const limit = args.limit ?? 50;
  const data = await getRecentFilings(args.ticker);
  if (!data) return [];

  const cutoff = daysAgoIso(daysBack);
  const out: EdgarFiling[] = [];

  for (const f of data.filings) {
    if (out.length >= limit) break;
    if (!NT_FORMS.has(f.form)) continue;
    if (f.filingDate < cutoff) continue;

    let reasonText: string | null = null;
    let reasonCategory: EdgarFiling["reasonCategory"] = "unspecified";
    try {
      const body = await fetchEdgar(f.primaryDocUrl, {
        accept: "text/html",
      });
      const parsed = classifyNtReason(body);
      reasonText = parsed.reasonText;
      reasonCategory = parsed.reasonCategory;
    } catch {
      // fail-soft: keep the filing in results with null reason
    }

    out.push({
      ticker: data.ticker,
      cik: data.company.cikPadded,
      formType: f.form,
      filingDate: f.filingDate,
      acceptanceDateTime: f.acceptanceDateTime,
      accessionNumber: f.accessionNumber,
      primaryDocUrl: f.primaryDocUrl,
      reasonText,
      reasonCategory,
    });
  }

  return out;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
