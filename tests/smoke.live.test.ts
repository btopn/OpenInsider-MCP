import { describe, expect, it } from "vitest";
import { latestTrades } from "../src/tools/latestTrades.js";
import { searchByTicker } from "../src/tools/searchByTicker.js";
import { clusterBuys } from "../src/tools/clusterBuys.js";

const liveSmoke = process.env.SMOKE === "1" ? describe : describe.skip;

liveSmoke("live OpenInsider smoke test (drift detector)", () => {
  it("latest_trades returns parseable rows from the live site", async () => {
    const trades = await latestTrades({});
    expect(trades.length).toBeGreaterThan(10);
    const t = trades[0];
    expect(t.ticker).toMatch(/^[A-Z.]+$/);
    expect(t.transactionType.length).toBeGreaterThan(0);
  }, 20_000);

  it("search_by_ticker NVDA returns NVDA trades", async () => {
    const trades = await searchByTicker({ ticker: "NVDA" });
    expect(trades.length).toBeGreaterThan(0);
    expect(trades.every((t) => t.ticker === "NVDA")).toBe(true);
  }, 20_000);

  it("cluster_buys returns rows", async () => {
    const trades = await clusterBuys({});
    expect(trades.length).toBeGreaterThan(0);
  }, 20_000);
});
