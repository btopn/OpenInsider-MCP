import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTradesTable } from "../src/scraper/parseTable.js";

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");

describe("parseTradesTable", () => {
  it("parses the latest-insider-trading screen", () => {
    const trades = parseTradesTable(fixture("latest.html"));
    expect(trades.length).toBeGreaterThan(50);
    const t = trades[0];
    expect(t.filingDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(t.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t.ticker).toMatch(/^[A-Z.]+$/);
    expect(typeof t.companyName).toBe("string");
    expect(t.companyName.length).toBeGreaterThan(0);
    expect(typeof t.insiderName).toBe("string");
    expect(t.insiderCik).toMatch(/^\d+$/);
    expect(t.formUrl).toContain("sec.gov");
    expect(typeof t.transactionType).toBe("string");
    expect(t.transactionType.length).toBeGreaterThan(0);
  });

  it("parses signed quantities and values correctly", () => {
    const trades = parseTradesTable(fixture("latest.html"));
    const sale = trades.find((t) => t.transactionType.startsWith("S"));
    const buy = trades.find((t) => t.transactionType.startsWith("P"));
    expect(sale).toBeDefined();
    expect(buy).toBeDefined();
    if (sale) {
      expect(sale.quantity).toBeLessThan(0);
      expect(sale.value).toBeLessThan(0);
    }
    if (buy) {
      expect(buy.quantity).toBeGreaterThan(0);
      expect(buy.value).toBeGreaterThan(0);
    }
  });

  it("parses ownership delta as signed percent", () => {
    const trades = parseTradesTable(fixture("latest.html"));
    const withDelta = trades.filter((t) => t.ownershipDelta !== null);
    expect(withDelta.length).toBeGreaterThan(0);
    for (const t of withDelta) {
      expect(typeof t.ownershipDelta).toBe("number");
      expect(Number.isFinite(t.ownershipDelta!)).toBe(true);
    }
  });

  it("parses ticker-specific screener", () => {
    const trades = parseTradesTable(fixture("ticker_NVDA.html"));
    expect(trades.length).toBeGreaterThan(0);
    expect(trades.every((t) => t.ticker === "NVDA")).toBe(true);
  });

  it("parses insider-by-CIK page", () => {
    const trades = parseTradesTable(fixture("insider_by_cik.html"));
    expect(trades.length).toBeGreaterThan(0);
    const ciks = new Set(trades.map((t) => t.insiderCik));
    expect(ciks.size).toBe(1);
    expect(ciks.has("1214156")).toBe(true);
  });

  it("parses cluster buys page", () => {
    const trades = parseTradesTable(fixture("cluster_buys.html"));
    expect(trades.length).toBeGreaterThan(50);
  });

  it("parses officer buys page", () => {
    const trades = parseTradesTable(fixture("officer_buys.html"));
    expect(trades.length).toBeGreaterThan(50);
    const buys = trades.filter((t) => t.transactionType.startsWith("P"));
    expect(buys.length).toBeGreaterThan(0);
  });

  it("parses top buys / top sells weekly screens", () => {
    const buys = parseTradesTable(fixture("top_buys_week.html"));
    const sells = parseTradesTable(fixture("top_sells_week.html"));
    expect(buys.length).toBeGreaterThan(0);
    expect(sells.length).toBeGreaterThan(0);
  });

  it("returns an empty array on a 404 / non-table page", () => {
    const html = "<html><body>not found</body></html>";
    expect(parseTradesTable(html)).toEqual([]);
  });
});
