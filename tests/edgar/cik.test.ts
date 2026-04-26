import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

vi.mock("../../src/edgar/fetch.js", () => ({
  fetchEdgar: vi.fn(),
}));

const { fetchEdgar } = await import("../../src/edgar/fetch.js");
const { tickerToCik, _resetCikIndex } = await import("../../src/edgar/cik.js");

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/edgar");
const fixtureJson = readFileSync(resolve(fixturesDir, "company_tickers.json"), "utf8");

describe("tickerToCik", () => {
  beforeEach(() => {
    _resetCikIndex();
    vi.mocked(fetchEdgar).mockReset();
    vi.mocked(fetchEdgar).mockResolvedValue(fixtureJson);
  });

  it("looks up a known ticker", async () => {
    const result = await tickerToCik("AAPL");
    expect(result).not.toBeNull();
    expect(result?.cikInt).toBe("320193");
    expect(result?.cikPadded).toBe("0000320193");
    expect(result?.title).toBe("Apple Inc.");
  });

  it("returns null for an unknown ticker", async () => {
    const result = await tickerToCik("NONEXISTENT");
    expect(result).toBeNull();
  });

  it("is case-insensitive on ticker input", async () => {
    const result = await tickerToCik("aapl");
    expect(result?.cikInt).toBe("320193");
  });

  it("zero-pads CIKs correctly even for short integers", async () => {
    const result = await tickerToCik("AAPL");
    expect(result?.cikPadded.length).toBe(10);
    expect(result?.cikPadded.startsWith("0")).toBe(true);
  });
});
