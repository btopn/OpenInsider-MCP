import { describe, expect, it } from "vitest";
import { quote } from "../src/tools/quote.js";
import { clearCache } from "../src/cache.js";

const liveSmoke = process.env.SMOKE === "1" ? describe : describe.skip;

liveSmoke("live Yahoo Finance smoke test (drift detector)", () => {
  it("AAPL returns shape with always-populated fields present", async () => {
    clearCache();
    const before = Date.now();
    const q = await quote({ ticker: "AAPL" });
    const after = Date.now();

    expect(q.ticker).toBe("AAPL");
    expect(q.currency).toBe("USD");
    expect(q.exchange).not.toBeNull();
    expect(q.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    expect(typeof q.price).toBe("number");
    expect(q.price).toBeGreaterThan(0);
    expect(q.fiftyTwoWeekHigh).toBeGreaterThanOrEqual(q.fiftyTwoWeekLow);
    expect(typeof q.volume).toBe("number");
    expect(q.volume).toBeGreaterThanOrEqual(0);

    // Drift detector: marketState should always be one of the canonical values.
    // If Yahoo introduces a new state ("HALTED" etc.), this fails and we update
    // the parser's allow-list deliberately rather than silently null-ing it.
    expect(q.marketState).toMatch(/^(regular|pre|post|prepre|postpost|closed)$/);

    // dataAsOf reflects when the parser produced this object — should bracket
    // the call wall-clock window. Allow 5 minutes of slack for slow networks.
    expect(q.dataAsOf).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const dataAsOfMs = new Date(q.dataAsOf).getTime();
    expect(dataAsOfMs).toBeGreaterThanOrEqual(before - 5 * 60 * 1000);
    expect(dataAsOfMs).toBeLessThanOrEqual(after + 5 * 60 * 1000);
  }, 30_000);

  it("AMZN dividend fields are nullable (parser handles either shape)", async () => {
    clearCache();
    const q = await quote({ ticker: "AMZN" });
    // Yahoo can return either null (current state — non-payer) or populated
    // values (if Amazon ever initiates a dividend, like Alphabet did in 2024).
    // Both shapes are valid; we just assert the parser accepts what's there.
    expect(q.dividendYield === null || typeof q.dividendYield === "number").toBe(true);
    expect(
      q.exDividendDate === null ||
        (typeof q.exDividendDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.exDividendDate)),
    ).toBe(true);
  }, 30_000);

  it("BRK.B normalizes to BRK-B and resolves", async () => {
    clearCache();
    const q = await quote({ ticker: "BRK.B" });
    expect(q.ticker).toBe("BRK-B");
    expect(typeof q.price).toBe("number");
    expect(q.price).toBeGreaterThan(0);
  }, 30_000);

  it("not-found ticker throws a clean error", async () => {
    clearCache();
    await expect(quote({ ticker: "ZZZQ" })).rejects.toThrow(/not found/i);
  }, 30_000);
});
