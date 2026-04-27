import { fetchEdgar } from "./fetch.js";

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
 * SEC XBRL concept tags to try, in order, for common-shares-outstanding.
 * dei: is the cover-page tag (preferred, recently filed). us-gaap: is the
 * financial-statement tag, used by many issuers that don't file the dei
 * cover-page concept (e.g., APPN). If both miss, return null.
 */
const SHARES_OUTSTANDING_TAGS = [
  "dei/EntityCommonStockSharesOutstanding",
  "us-gaap/CommonStockSharesOutstanding",
] as const;

/**
 * Get the most recent reported common-shares-outstanding for a CIK, sourced
 * from SEC XBRL company-concept data. Tries the dei cover-page tag first,
 * then falls back to the us-gaap statement tag. Returns null when:
 *   - the company doesn't file XBRL at all (rare for US-listed equities)
 *   - neither concept tag is reported (uncommon)
 *   - any network/parse error occurs (fail-soft)
 *
 * Used to compute SI / SO ratio (commonly conflated with "% of float" in
 * retail data feeds; true public float requires restricted-share data not
 * available via free SEC data).
 */
export async function getLatestSharesOutstanding(cikPadded: string): Promise<number | null> {
  for (const tag of SHARES_OUTSTANDING_TAGS) {
    const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cikPadded}/${tag}.json`;
    try {
      const json = await fetchEdgar(url);
      const data = JSON.parse(json) as CompanyConceptResponse;
      const shares = data.units?.shares;
      if (!shares || shares.length === 0) continue;

      // Pick the entry with the latest `filed` date; fall back to latest `end`
      let latest = shares[0];
      for (const entry of shares) {
        const a = entry.filed ?? entry.end;
        const b = latest.filed ?? latest.end;
        if (a > b) latest = entry;
      }

      if (typeof latest.val === "number" && isFinite(latest.val)) return latest.val;
    } catch {
      // 404 or parse failure — try the next tag
    }
  }
  return null;
}
