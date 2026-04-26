import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  parseShortInterestFile,
  reportDateToIso,
  recentSettlementDates,
} from "../../src/finra/parseShortInterest.js";
import { parseRegShoFile, recentBusinessDays } from "../../src/finra/parseRegSho.js";
import {
  parseFtdFile,
  parseThresholdFile,
  recentBiMonthlyDates,
} from "../../src/finra/parseFtd.js";

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/finra");

function fixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf8");
}

describe("parseShortInterestFile", () => {
  it("parses a pipe-delimited bi-monthly SI file and indexes by symbol", () => {
    const map = parseShortInterestFile(fixture("short_interest.txt"));
    const aapl = map.get("AAPL");
    expect(aapl).toBeDefined();
    expect(aapl?.sharesShort).toBe(110000000);
    expect(aapl?.prevSharesShort).toBe(115000000);
    expect(aapl?.daysToCover).toBe(2.0);
  });

  it("indexes multiple tickers", () => {
    const map = parseShortInterestFile(fixture("short_interest.txt"));
    expect(map.has("NVDA")).toBe(true);
    expect(map.has("MSFT")).toBe(true);
    expect(map.has("GME")).toBe(true);
  });

  it("throws when required columns are missing", () => {
    expect(() => parseShortInterestFile("Foo|Bar|Baz\n1|2|3")).toThrow();
  });
});

describe("reportDateToIso", () => {
  it("converts YYYYMMDD to YYYY-MM-DD", () => {
    expect(reportDateToIso("20240115")).toBe("2024-01-15");
  });

  it("returns input unchanged if not 8 chars", () => {
    expect(reportDateToIso("2024-01-15")).toBe("2024-01-15");
  });
});

describe("recentSettlementDates", () => {
  it("returns N distinct bi-monthly dates in YYYYMMDD form, descending", () => {
    const dates = recentSettlementDates(new Date(2024, 3, 10), 4);
    expect(dates.length).toBe(4);
    expect(new Set(dates).size).toBe(4);
    for (const d of dates) {
      expect(d).toMatch(/^\d{8}$/);
    }
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] <= dates[i - 1]).toBe(true);
    }
  });
});

describe("parseRegShoFile", () => {
  it("parses a pipe-delimited daily Reg SHO file", () => {
    const map = parseRegShoFile(fixture("regsho_daily.txt"));
    const aapl = map.get("AAPL");
    expect(aapl).toBeDefined();
    expect(aapl?.shortVolume).toBe(5000000);
    expect(aapl?.totalVolume).toBe(15000000);
  });

  it("indexes multiple tickers", () => {
    const map = parseRegShoFile(fixture("regsho_daily.txt"));
    expect(map.has("NVDA")).toBe(true);
    expect(map.has("MSFT")).toBe(true);
  });
});

describe("recentBusinessDays", () => {
  it("returns N distinct business days in YYYYMMDD form", () => {
    const dates = recentBusinessDays(new Date(2024, 3, 10), 5);
    expect(dates.length).toBe(5);
    expect(new Set(dates).size).toBe(5);
    for (const d of dates) {
      expect(d).toMatch(/^\d{8}$/);
    }
  });
});

describe("parseFtdFile", () => {
  it("parses pipe-delimited FTD records, allowing multiple per ticker", () => {
    const rows = parseFtdFile(fixture("sec_ftd.txt"));
    const aaplRows = rows.filter((r) => r.symbol === "AAPL");
    expect(aaplRows.length).toBe(2);
    expect(aaplRows[0].quantityFails).toBe(125000);
    expect(aaplRows[1].quantityFails).toBe(75000);
  });

  it("captures price field when present", () => {
    const rows = parseFtdFile(fixture("sec_ftd.txt"));
    const nvda = rows.find((r) => r.symbol === "NVDA");
    expect(nvda?.price).toBe(550.0);
  });
});

describe("parseThresholdFile", () => {
  it("returns a set of symbols on the threshold list (pipe-delimited)", () => {
    const set = parseThresholdFile(fixture("threshold_list.txt"));
    expect(set.has("AAPL")).toBe(true);
    expect(set.has("GME")).toBe(true);
    expect(set.has("AMC")).toBe(true);
  });

  it("ignores junk lines that don't look like ticker symbols", () => {
    const set = parseThresholdFile("Symbol|Foo\nNOTATICKERTOOLONG|x\nGOOD|y");
    expect(set.has("GOOD")).toBe(true);
    expect(set.has("NOTATICKERTOOLONG")).toBe(false);
  });

  it("handles whitespace-delimited fallback for NYSE-style files", () => {
    const set = parseThresholdFile("Symbol Name\nAAPL APPLE INC\nMSFT MICROSOFT CORP");
    expect(set.has("AAPL")).toBe(true);
    expect(set.has("MSFT")).toBe(true);
  });
});

describe("recentBiMonthlyDates", () => {
  it("returns the requested count in descending order", () => {
    const dates = recentBiMonthlyDates(new Date(2024, 3, 10), 3);
    expect(dates.length).toBe(3);
    for (const d of dates) {
      expect(d).toMatch(/^\d{8}$/);
    }
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] <= dates[i - 1]).toBe(true);
    }
  });
});
