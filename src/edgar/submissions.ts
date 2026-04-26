import { fetchEdgar } from "./fetch.js";
import { tickerToCik, type CompanyRef } from "./cik.js";

const SUBMISSIONS_TTL_MS = 5 * 60 * 1000;

export interface SubmissionRecord {
  accessionNumber: string;
  filingDate: string;
  acceptanceDateTime: string;
  form: string;
  primaryDocument: string;
  primaryDocUrl: string;
  items: string[];
}

export interface RecentFilings {
  ticker: string;
  company: CompanyRef;
  companyName: string;
  filings: SubmissionRecord[];
}

interface SubmissionsResponse {
  cik: string;
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      acceptanceDateTime: string[];
      form: string[];
      primaryDocument: string[];
      items: string[];
    };
  };
}

export async function getRecentFilings(ticker: string): Promise<RecentFilings | null> {
  const company = await tickerToCik(ticker);
  if (!company) return null;

  const url = `https://data.sec.gov/submissions/CIK${company.cikPadded}.json`;
  const json = await fetchEdgar(url, { ttlMs: SUBMISSIONS_TTL_MS });
  const data = JSON.parse(json) as SubmissionsResponse;

  const r = data.filings.recent;
  const filings: SubmissionRecord[] = [];

  for (let i = 0; i < r.accessionNumber.length; i++) {
    const accessionNumber = r.accessionNumber[i];
    const primaryDocument = r.primaryDocument[i];
    const itemsRaw = r.items[i] ?? "";
    const items = itemsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    filings.push({
      accessionNumber,
      filingDate: r.filingDate[i],
      acceptanceDateTime: r.acceptanceDateTime[i],
      form: r.form[i],
      primaryDocument,
      primaryDocUrl: buildPrimaryDocUrl(company.cikInt, accessionNumber, primaryDocument),
      items,
    });
  }

  return {
    ticker: ticker.toUpperCase(),
    company,
    companyName: data.name,
    filings,
  };
}

export function buildPrimaryDocUrl(
  cikInt: string,
  accessionNumber: string,
  primaryDocument: string,
): string {
  const accNoDashes = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDashes}/${primaryDocument}`;
}
