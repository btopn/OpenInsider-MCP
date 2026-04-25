import { describe, expect, it } from "vitest";
import { tickerToCik, _resetCikIndex } from "../src/edgar/cik.js";
import { getRecentFilings } from "../src/edgar/submissions.js";
import { fetchEdgar } from "../src/edgar/fetch.js";
import { recentSecFilings } from "../src/tools/recentSecFilings.js";

const liveSmoke = process.env.SMOKE === "1" ? describe : describe.skip;

liveSmoke("live SEC EDGAR smoke test (drift detector)", () => {
  it("ticker -> CIK lookup resolves AAPL to CIK 320193", async () => {
    _resetCikIndex();
    const ref = await tickerToCik("AAPL");
    expect(ref).not.toBeNull();
    expect(ref?.cikInt).toBe("320193");
    expect(ref?.cikPadded).toBe("0000320193");
  }, 30_000);

  it("getRecentFilings returns recent submissions for NVDA", async () => {
    const data = await getRecentFilings("NVDA");
    expect(data).not.toBeNull();
    expect(data!.filings.length).toBeGreaterThan(10);
    const firstWith8K = data!.filings.find((f) => f.form === "8-K");
    expect(firstWith8K).toBeDefined();
    expect(firstWith8K?.primaryDocUrl).toContain("sec.gov/Archives/edgar/data");
  }, 30_000);

  it("recent_sec_filings tool returns parseable 8-Ks for AAPL with item codes", async () => {
    const filings = await recentSecFilings({ ticker: "AAPL", daysBack: 365 });
    expect(filings.length).toBeGreaterThan(0);
    expect(filings[0].formType).toMatch(/^8-K/);
    expect(filings[0].itemCodes).toBeDefined();
  }, 30_000);

  it("can fetch a filing body via fetchEdgar", async () => {
    const data = await getRecentFilings("AAPL");
    expect(data).not.toBeNull();
    const filing = data!.filings.find((f) => f.form === "8-K");
    expect(filing).toBeDefined();
    const body = await fetchEdgar(filing!.primaryDocUrl, { accept: "text/html" });
    expect(body.length).toBeGreaterThan(100);
  }, 30_000);
});
