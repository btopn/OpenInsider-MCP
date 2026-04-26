import { describe, expect, it } from "vitest";
import { fetchFinra, fetchFinraBinary } from "../src/finra/fetch.js";
import {
  buildShortInterestUrl,
  getShortInterestSnapshots,
  recentSettlementDates,
} from "../src/finra/parseShortInterest.js";
import { buildRegShoUrl, recentBusinessDays } from "../src/finra/parseRegSho.js";
import { buildFtdUrl, buildThresholdUrls, recentBiMonthlyDates } from "../src/finra/parseFtd.js";

const liveSmoke = process.env.SMOKE === "1" ? describe : describe.skip;

/**
 * These tests probe the FINRA / SEC short-data URLs. URL formats are best-
 * guess and marked TODO(deployment) in source; if a test fails with 404,
 * re-discover the current path and update buildXxxUrl. The tests walk the
 * most recent few candidate dates because the very latest may not be
 * published yet.
 */
liveSmoke("live FINRA / SEC short data smoke test (URL drift detector)", () => {
  it("FINRA bi-monthly SI URL returns content for at least one recent date", async () => {
    const dates = recentSettlementDates(new Date(), 6);
    let succeeded = false;
    for (const dateStr of dates) {
      const url = buildShortInterestUrl(dateStr);
      const text = await fetchFinra(url, { return404AsNull: true });
      if (text !== null && text.length > 0) {
        succeeded = true;
        break;
      }
    }
    expect(
      succeeded,
      "No SI file found across the 6 most recent settlement dates. URL pattern may have changed.",
    ).toBe(true);
  }, 90_000);

  it("FINRA Reg SHO daily URL returns content for at least one recent business day", async () => {
    const dates = recentBusinessDays(new Date(), 6);
    let succeeded = false;
    for (const dateStr of dates) {
      const url = buildRegShoUrl("CNMS", dateStr);
      const text = await fetchFinra(url, { return404AsNull: true });
      if (text !== null && text.length > 0) {
        succeeded = true;
        break;
      }
    }
    expect(
      succeeded,
      "No Reg SHO daily file found across the 6 most recent business days. URL pattern may have changed.",
    ).toBe(true);
  }, 90_000);

  it("getShortInterestSnapshots populates pctOfFloat via SEC XBRL for AAPL", async () => {
    const snapshots = await getShortInterestSnapshots("AAPL", 4);
    expect(snapshots.length).toBeGreaterThan(0);
    const first = snapshots[0];
    expect(first.sharesShort).toBeGreaterThan(0);
    expect(first.pctOfFloat).not.toBeNull();
    expect(first.pctOfFloat!).toBeGreaterThan(0);
    expect(first.pctOfFloat!).toBeLessThan(1); // SI should be a small fraction of shares outstanding
  }, 120_000);

  it("Reg SHO threshold list URLs (Nasdaq + NYSE) return content for at least one recent business day", async () => {
    const dates = recentBusinessDays(new Date(), 5);
    let nasdaqOk = false;
    let nyseOk = false;
    for (const dateStr of dates) {
      const urls = buildThresholdUrls(dateStr);
      if (!nasdaqOk) {
        const text = await fetchFinra(urls.nasdaq, { return404AsNull: true });
        if (text !== null && text.length > 0) nasdaqOk = true;
      }
      if (!nyseOk) {
        const text = await fetchFinra(urls.nyse, { return404AsNull: true });
        if (text !== null && text.length > 0) nyseOk = true;
      }
      if (nasdaqOk && nyseOk) break;
    }
    expect(nasdaqOk, "Nasdaq threshold list URL appears to have changed").toBe(true);
    expect(nyseOk, "NYSE threshold list URL appears to have changed (note: NYSE wants ISO YYYY-MM-DD, not YYYYMMDD)").toBe(true);
  }, 90_000);

  it("SEC FTD URL returns ZIP content for at least one recent bi-monthly date", async () => {
    const dates = recentBiMonthlyDates(new Date(), 6);
    let succeeded = false;
    for (const dateStr of dates) {
      const url = buildFtdUrl(dateStr);
      const buf = await fetchFinraBinary(url, { return404AsNull: true });
      if (buf !== null && buf.byteLength > 100) {
        succeeded = true;
        break;
      }
    }
    expect(
      succeeded,
      "No SEC FTD file found across the 6 most recent settlement dates. URL pattern may have changed.",
    ).toBe(true);
  }, 90_000);
});
