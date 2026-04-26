import { describe, it, expect, vi, beforeEach } from "vitest";
import AdmZip from "adm-zip";

vi.mock("../../src/finra/fetch.js", () => ({
  fetchFinra: vi.fn(),
  fetchFinraBinary: vi.fn(),
}));
vi.mock("../../src/edgar/cik.js", () => ({
  tickerToCik: vi.fn(),
  _resetCikIndex: vi.fn(),
}));
vi.mock("../../src/edgar/companyFacts.js", () => ({
  getLatestSharesOutstanding: vi.fn(),
}));

const { fetchFinra, fetchFinraBinary } = await import("../../src/finra/fetch.js");
const { tickerToCik } = await import("../../src/edgar/cik.js");
const { getLatestSharesOutstanding } = await import("../../src/edgar/companyFacts.js");
const { shortInterest } = await import("../../src/tools/shortInterest.js");
const { dailyShortVolume } = await import("../../src/tools/dailyShortVolume.js");
const { failuresToDeliver } = await import("../../src/tools/failuresToDeliver.js");

beforeEach(() => {
  vi.mocked(fetchFinra).mockReset();
  vi.mocked(fetchFinraBinary).mockReset();
  vi.mocked(tickerToCik).mockReset();
  vi.mocked(getLatestSharesOutstanding).mockReset();
});

// --- short_interest ---

const SI_HEADER =
  "accountingYearMonthNumber|symbolCode|issueName|issuerServicesGroupExchangeCode|marketClassCode|currentShortPositionQuantity|previousShortPositionQuantity|stockSplitFlag|averageDailyVolumeQuantity|daysToCoverQuantity|revisionFlag|changePercent|changePreviousNumber|settlementDate";

function makeSiFile(date: string, sharesShort: number, prev = 0): string {
  const ymd = date.replace(/-/g, "");
  return `${SI_HEADER}\n${ymd}|AAPL|APPLE INC|A|NASDAQ|${sharesShort}|${prev}||1000000|2.0||0|0|${date}`;
}

describe("shortInterest", () => {
  it("populates pctOfFloat as sharesShort / sharesOutstanding when SEC XBRL returns SO", async () => {
    vi.mocked(tickerToCik).mockResolvedValue({
      cikInt: "320193",
      cikPadded: "0000320193",
      title: "Apple Inc.",
    });
    vi.mocked(getLatestSharesOutstanding).mockResolvedValue(1_000_000_000);
    vi.mocked(fetchFinra)
      .mockResolvedValueOnce(makeSiFile("2026-04-15", 50_000_000))
      .mockResolvedValue(null);

    const result = await shortInterest({ ticker: "AAPL", periodsBack: 1 });
    expect(result.length).toBe(1);
    expect(result[0].pctOfFloat).toBeCloseTo(0.05, 4);
  });

  it("sets pctOfFloat to null when SEC XBRL returns null (fail-soft)", async () => {
    vi.mocked(tickerToCik).mockResolvedValue({
      cikInt: "320193",
      cikPadded: "0000320193",
      title: "Apple Inc.",
    });
    vi.mocked(getLatestSharesOutstanding).mockResolvedValue(null);
    vi.mocked(fetchFinra)
      .mockResolvedValueOnce(makeSiFile("2026-04-15", 50_000_000))
      .mockResolvedValue(null);

    const result = await shortInterest({ ticker: "AAPL", periodsBack: 1 });
    expect(result[0].pctOfFloat).toBeNull();
  });

  it("computes delta vs prior period for entries that have a prior", async () => {
    vi.mocked(tickerToCik).mockResolvedValue({
      cikInt: "320193",
      cikPadded: "0000320193",
      title: "Apple Inc.",
    });
    vi.mocked(getLatestSharesOutstanding).mockResolvedValue(1_000_000_000);
    // Most recent first; periodsBack=2 fetches 3 dates internally to enable delta
    vi.mocked(fetchFinra)
      .mockResolvedValueOnce(makeSiFile("2026-04-15", 55_000_000))
      .mockResolvedValueOnce(makeSiFile("2026-03-31", 50_000_000))
      .mockResolvedValueOnce(makeSiFile("2026-03-15", 40_000_000))
      .mockResolvedValue(null);

    const result = await shortInterest({ ticker: "AAPL", periodsBack: 2 });
    expect(result.length).toBe(2);
    expect(result[0].delta?.sharesShortDelta).toBe(5_000_000);
    expect(result[0].delta?.pctDelta).toBeCloseTo(0.1, 4);
  });
});

// --- daily_short_volume ---

const REGSHO_HEADER = "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market";

function makeRegShoFile(date: string, shortVol: number, totalVol: number): string {
  return `${REGSHO_HEADER}\n${date.replace(/-/g, "")}|AAPL|${shortVol}|0|${totalVol}|N`;
}

describe("dailyShortVolume", () => {
  it("aggregates short volume + total volume by SUMMING across all 4 venues per date", async () => {
    // Every venue returns identical AAPL data for the day
    vi.mocked(fetchFinra).mockImplementation(async () => makeRegShoFile("2026-04-25", 1_000_000, 5_000_000));

    const result = await dailyShortVolume({ ticker: "AAPL", daysBack: 1 });
    expect(result.length).toBe(1);
    // 4 venues × 1M = 4M short; 4 × 5M = 20M total
    expect(result[0].shortVolume).toBe(4_000_000);
    expect(result[0].totalVolume).toBe(20_000_000);
    expect(result[0].shortRatio).toBeCloseTo(0.2, 4);
  });

  it("computes shortRatio from aggregated sums, not per-venue averages", async () => {
    let call = 0;
    vi.mocked(fetchFinra).mockImplementation(async () => {
      // Venue 1: 1M short / 4M total (ratio 0.25)
      // Venue 2: 1M short / 16M total (ratio 0.0625)
      // Venues 3-4: empty
      call++;
      if (call === 1) return makeRegShoFile("2026-04-25", 1_000_000, 4_000_000);
      if (call === 2) return makeRegShoFile("2026-04-25", 1_000_000, 16_000_000);
      return null;
    });

    const result = await dailyShortVolume({ ticker: "AAPL", daysBack: 1 });
    expect(result.length).toBe(1);
    // Aggregate: 2M / 20M = 0.10 (average of per-venue ratios would be 0.156)
    expect(result[0].shortRatio).toBeCloseTo(0.1, 4);
  });
});

// --- failures_to_deliver ---

const FTD_HEADER = "SETTLEMENT DATE|CUSIP|SYMBOL|QUANTITY (FAILS)|DESCRIPTION|PRICE";

function makeFtdZip(
  rows: Array<{ date: string; symbol: string; shares: number; price: number }>,
): ArrayBuffer {
  const lines = [FTD_HEADER];
  for (const r of rows) {
    lines.push(`${r.date}|037833100|${r.symbol}|${r.shares}|APPLE INC|${r.price}`);
  }
  const zip = new AdmZip();
  zip.addFile("cnsfails202604a", Buffer.from(lines.join("\n")));
  const nodeBuf = zip.toBuffer();
  const arrayBuf = new ArrayBuffer(nodeBuf.byteLength);
  new Uint8Array(arrayBuf).set(nodeBuf);
  return arrayBuf;
}

const NASDAQ_TH_HEADER = "Symbol|Security Name|Market Category|Reg SHO Threshold Flag|Rule 3210|Filler";

describe("failuresToDeliver", () => {
  it("sums FTD shares + value across multiple rows per ticker in one period", async () => {
    vi.mocked(fetchFinra).mockResolvedValue(null); // empty threshold list
    const zip = makeFtdZip([
      { date: "20260401", symbol: "AAPL", shares: 100_000, price: 200 },
      { date: "20260402", symbol: "NVDA", shares: 50_000, price: 500 }, // not AAPL
      { date: "20260403", symbol: "AAPL", shares: 50_000, price: 201 },
      { date: "20260404", symbol: "AAPL", shares: 25_000, price: 199 },
    ]);
    vi.mocked(fetchFinraBinary).mockResolvedValueOnce(zip).mockResolvedValue(null);

    const result = await failuresToDeliver({ ticker: "AAPL", periodsBack: 1 });
    expect(result.length).toBe(1);
    // 100K + 50K + 25K = 175K
    expect(result[0].ftdShares).toBe(175_000);
    // 100K*200 + 50K*201 + 25K*199 = 20M + 10.05M + 4.975M
    expect(result[0].ftdValue).toBeCloseTo(35_025_000, 0);
  });

  it("sets onThresholdList=true when ticker is in the merged Nasdaq + NYSE threshold set", async () => {
    vi.mocked(fetchFinra)
      .mockResolvedValueOnce(`${NASDAQ_TH_HEADER}\nAAPL|APPLE INC|S|Y|N|`)
      .mockResolvedValue(null);
    const zip = makeFtdZip([
      { date: "20260401", symbol: "AAPL", shares: 10_000, price: 200 },
    ]);
    vi.mocked(fetchFinraBinary).mockResolvedValueOnce(zip).mockResolvedValue(null);

    const result = await failuresToDeliver({ ticker: "AAPL", periodsBack: 1 });
    expect(result.length).toBe(1);
    expect(result[0].onThresholdList).toBe(true);
  });

  it("sets onThresholdList=false when ticker is not in threshold set", async () => {
    vi.mocked(fetchFinra).mockResolvedValue(null);
    const zip = makeFtdZip([
      { date: "20260401", symbol: "AAPL", shares: 10_000, price: 200 },
    ]);
    vi.mocked(fetchFinraBinary).mockResolvedValueOnce(zip).mockResolvedValue(null);

    const result = await failuresToDeliver({ ticker: "AAPL", periodsBack: 1 });
    expect(result[0].onThresholdList).toBe(false);
  });
});
