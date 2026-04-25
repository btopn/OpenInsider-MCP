import { fetchEdgar } from "./fetch.js";

const COMPANY_FACTS_TTL_MS = 24 * 60 * 60 * 1000;

interface CompanyConceptResponse {
  cik?: number;
  taxonomy?: string;
  tag?: string;
  units?: {
    shares?: Array<{
      end: string;
      val: number;
      accn?: string;
      fy?: number;
      fp?: string;
      form?: string;
      filed?: string;
    }>;
  };
}

/**
 * Get the most recent reported common-shares-outstanding for a ticker, sourced
 * from SEC XBRL company-concept data (dei:EntityCommonStockSharesOutstanding).
 * Returns null when:
 *   - the company doesn't file XBRL (rare for US-listed equities)
 *   - the concept isn't reported under this tag (some filers use alternate tags)
 *   - any network/parse error occurs (fail-soft)
 *
 * Used to compute SI / SO ratio (commonly conflated with "% of float" in
 * retail data feeds; true public float requires a restricted-share source not
 * available via free SEC data).
 */
export async function getLatestSharesOutstanding(cikPadded: string): Promise<number | null> {
  const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cikPadded}/dei/EntityCommonStockSharesOutstanding.json`;
  try {
    const json = await fetchEdgar(url, { ttlMs: COMPANY_FACTS_TTL_MS });
    const data = JSON.parse(json) as CompanyConceptResponse;
    const shares = data.units?.shares;
    if (!shares || shares.length === 0) return null;

    // Pick the entry with the latest `filed` date; fall back to latest `end`
    let latest = shares[0];
    for (const entry of shares) {
      const a = entry.filed ?? entry.end;
      const b = latest.filed ?? latest.end;
      if (a > b) latest = entry;
    }

    return typeof latest.val === "number" && isFinite(latest.val) ? latest.val : null;
  } catch {
    return null;
  }
}
