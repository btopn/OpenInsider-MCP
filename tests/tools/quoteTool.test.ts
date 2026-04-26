import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/yahoo/quoteSummary.js", () => ({
  getQuote: vi.fn(),
}));

const { getQuote } = await import("../../src/yahoo/quoteSummary.js");
const { quote } = await import("../../src/tools/quote.js");

const mockQuote = (ticker: string) => ({
  ticker,
  exchange: "NMS",
  currency: "USD",
  timestamp: "2026-04-25T20:00:00Z",
  price: 100,
  previousClose: 99,
  dayOpen: 100,
  dayHigh: 101,
  dayLow: 99,
  fiftyTwoWeekHigh: 120,
  fiftyTwoWeekLow: 80,
  volume: 1000,
  averageVolume: 2000,
  bid: 100,
  ask: 100.01,
  marketCap: 1_000_000_000,
  beta: 1.2,
  trailingPE: 25,
  forwardPE: 22,
  trailingEps: 4,
  forwardEps: 4.5,
  dividendRate: 1,
  dividendYield: 0.01,
  exDividendDate: "2026-02-01",
  earningsDate: "2026-05-01",
});

beforeEach(() => {
  vi.mocked(getQuote).mockReset();
  vi.mocked(getQuote).mockImplementation(async (t: string) => mockQuote(t));
});

describe("quote tool", () => {
  it("uppercases the ticker before delegating", async () => {
    await quote({ ticker: "aapl" });
    expect(getQuote).toHaveBeenCalledWith("AAPL");
  });

  it("trims whitespace from the ticker", async () => {
    await quote({ ticker: "  nvda  " });
    expect(getQuote).toHaveBeenCalledWith("NVDA");
  });

  it("normalizes BRK.B to BRK-B (Yahoo's share-class convention)", async () => {
    await quote({ ticker: "BRK.B" });
    expect(getQuote).toHaveBeenCalledWith("BRK-B");
  });

  it("normalizes BRK/B to BRK-B as well", async () => {
    await quote({ ticker: "BRK/B" });
    expect(getQuote).toHaveBeenCalledWith("BRK-B");
  });

  it("throws on empty / whitespace-only ticker", async () => {
    await expect(quote({ ticker: "" })).rejects.toThrow(/required/);
    await expect(quote({ ticker: "   " })).rejects.toThrow(/required/);
  });

  it("rejects ticker with chars outside [A-Z0-9.-]", async () => {
    await expect(quote({ ticker: "AAPL; rm -rf /" })).rejects.toThrow(/invalid ticker/);
    await expect(quote({ ticker: "<script>" })).rejects.toThrow(/invalid ticker/);
    await expect(quote({ ticker: "AAPL ignore previous" })).rejects.toThrow(/invalid ticker/);
  });

  it("rejects ticker longer than 10 characters", async () => {
    await expect(quote({ ticker: "ABCDEFGHIJK" })).rejects.toThrow(/invalid ticker/);
  });

  it("returns the underlying Quote unchanged", async () => {
    const q = await quote({ ticker: "msft" });
    expect(q.ticker).toBe("MSFT");
    expect(q.price).toBe(100);
    expect(q.dividendYield).toBe(0.01);
  });
});
