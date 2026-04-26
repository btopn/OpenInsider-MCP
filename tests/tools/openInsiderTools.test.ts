import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

vi.mock("../../src/scraper/fetch.js", () => ({
  fetchOpenInsider: vi.fn(),
}));

const { fetchOpenInsider } = await import("../../src/scraper/fetch.js");
const { searchByTicker } = await import("../../src/tools/searchByTicker.js");
const { searchByInsider } = await import("../../src/tools/searchByInsider.js");
const { latestTrades } = await import("../../src/tools/latestTrades.js");
const { topBuys } = await import("../../src/tools/topBuys.js");
const { topSells } = await import("../../src/tools/topSells.js");
const { clusterBuys } = await import("../../src/tools/clusterBuys.js");
const { officerBuys } = await import("../../src/tools/officerBuys.js");
const { screen } = await import("../../src/tools/screen.js");

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const fixture = (name: string) => readFileSync(resolve(fixturesDir, name), "utf8");

beforeEach(() => {
  vi.mocked(fetchOpenInsider).mockReset();
});

describe("searchByTicker", () => {
  it("uppercases and URL-encodes the ticker into the screener path", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("ticker_NVDA.html"));
    await searchByTicker({ ticker: "nvda" });
    expect(fetchOpenInsider).toHaveBeenCalledWith(expect.stringContaining("s=NVDA"));
  });

  it("throws on empty / whitespace-only ticker", async () => {
    await expect(searchByTicker({ ticker: "  " })).rejects.toThrow(/required/);
  });

  it("applies daysBack filter when provided", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("ticker_NVDA.html"));
    const all = await searchByTicker({ ticker: "NVDA" });
    const recent = await searchByTicker({ ticker: "NVDA", daysBack: 1 });
    expect(recent.length).toBeLessThanOrEqual(all.length);
  });
});

describe("searchByInsider", () => {
  it("strips leading zeros from CIK and builds /insider/x/{cik} path", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("insider_by_cik.html"));
    await searchByInsider({ cik: "0001214156" });
    expect(fetchOpenInsider).toHaveBeenCalledWith("/insider/x/1214156");
  });

  it("throws on non-numeric CIK", async () => {
    await expect(searchByInsider({ cik: "AAPL" })).rejects.toThrow(/numeric/i);
  });
});

describe("latestTrades", () => {
  it("filters to buys (transactionType startsWith P) when transactionType=buys", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("latest.html"));
    const trades = await latestTrades({ transactionType: "buys" });
    expect(trades.every((t) => t.transactionType.startsWith("P"))).toBe(true);
  });

  it("filters to sells (transactionType startsWith S) when transactionType=sells", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("latest.html"));
    const trades = await latestTrades({ transactionType: "sells" });
    expect(trades.every((t) => t.transactionType.startsWith("S"))).toBe(true);
  });

  it("returns all trades when transactionType is omitted or 'all'", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("latest.html"));
    const all = await latestTrades({});
    const allExplicit = await latestTrades({ transactionType: "all" });
    expect(all.length).toBe(allExplicit.length);
    expect(all.length).toBeGreaterThan(0);
  });
});

describe("topBuys / topSells", () => {
  it("topBuys hits the period-specific purchases path", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("top_buys_week.html"));
    await topBuys({ period: "week" });
    expect(fetchOpenInsider).toHaveBeenCalledWith("/top-insider-purchases-of-the-week");
  });

  it("topSells hits the period-specific sales path", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("top_sells_week.html"));
    await topSells({ period: "month" });
    expect(fetchOpenInsider).toHaveBeenCalledWith("/top-insider-sales-of-the-month");
  });
});

describe("clusterBuys / officerBuys", () => {
  it("clusterBuys hits /latest-cluster-buys", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("cluster_buys.html"));
    await clusterBuys({});
    expect(fetchOpenInsider).toHaveBeenCalledWith("/latest-cluster-buys");
  });

  it("officerBuys hits /latest-officer-purchases-25k", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("officer_buys.html"));
    await officerBuys({});
    expect(fetchOpenInsider).toHaveBeenCalledWith("/latest-officer-purchases-25k");
  });
});

describe("screen", () => {
  it("converts trade-value range from dollars to thousands in URL params", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("latest.html"));
    await screen({ minTradeValue: 500_000, maxTradeValue: 5_000_000 });
    const path = vi.mocked(fetchOpenInsider).mock.calls[0]?.[0] ?? "";
    expect(path).toContain("vl=500");
    expect(path).toContain("vh=5000");
  });

  it("sets role filters as separate '1' params", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("latest.html"));
    await screen({ isCeo: true, isCfo: true });
    const path = vi.mocked(fetchOpenInsider).mock.calls[0]?.[0] ?? "";
    expect(path).toContain("isceo=1");
    expect(path).toContain("iscfo=1");
  });

  it("applies transactionTypes filter client-side via startsWith on first char", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("latest.html"));
    const purchases = await screen({ transactionTypes: ["P"] });
    expect(purchases.every((t) => t.transactionType.startsWith("P"))).toBe(true);
  });

  it("caps the limit param at 1000 even if a higher value is requested", async () => {
    vi.mocked(fetchOpenInsider).mockResolvedValue(fixture("latest.html"));
    await screen({ limit: 5000 });
    const path = vi.mocked(fetchOpenInsider).mock.calls[0]?.[0] ?? "";
    expect(path).toContain("cnt=1000");
  });
});
