import { describe, expect, it } from "vitest";
import { filterByDays } from "../src/tools/filterByDays.js";
import type { Trade } from "../src/types.js";

const trade = (filingDate: string): Trade => ({
  filingDate,
  tradeDate: filingDate.slice(0, 10),
  ticker: "TEST",
  companyName: "Test Co",
  insiderName: "Test Insider",
  insiderCik: "1",
  title: "CEO",
  transactionType: "P - Purchase",
  price: 1,
  quantity: 1,
  sharesOwnedAfter: 1,
  ownershipDelta: 0,
  value: 1,
  formUrl: null,
});

describe("filterByDays", () => {
  it("returns input untouched when daysBack is undefined", () => {
    const trades = [trade("2020-01-01")];
    expect(filterByDays(trades, undefined)).toBe(trades);
  });

  it("filters out trades older than the cutoff", () => {
    const now = new Date();
    const recent = trade(now.toISOString().slice(0, 19));
    const old = trade("2000-01-01T00:00:00");
    const out = filterByDays([recent, old], 30);
    expect(out).toEqual([recent]);
  });

  it("keeps trades with unparseable dates rather than dropping them", () => {
    const weird = trade("not a date");
    expect(filterByDays([weird], 30)).toEqual([weird]);
  });
});
