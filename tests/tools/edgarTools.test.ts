import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

vi.mock("../../src/edgar/submissions.js", () => ({
  getRecentFilings: vi.fn(),
  buildPrimaryDocUrl: vi.fn(
    (cikInt: string, accNo: string, doc: string) => `https://example.com/${cikInt}/${accNo}/${doc}`,
  ),
}));
vi.mock("../../src/edgar/fetch.js", () => ({
  fetchEdgar: vi.fn(),
}));

const { getRecentFilings } = await import("../../src/edgar/submissions.js");
const { fetchEdgar } = await import("../../src/edgar/fetch.js");
const { recentSecFilings } = await import("../../src/tools/recentSecFilings.js");
const { lateFilings } = await import("../../src/tools/lateFilings.js");
const { activistFilings } = await import("../../src/tools/activistFilings.js");
const { dilutionFilings } = await import("../../src/tools/dilutionFilings.js");

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/edgar");
const fixture = (name: string) => readFileSync(resolve(fixturesDir, name), "utf8");

const mockCompany = { cikInt: "320193", cikPadded: "0000320193", title: "Apple Inc." };

interface FormSpec {
  form: string;
  filingDate: string;
  items?: string[];
}

function makeRecentFilings(forms: FormSpec[]) {
  return {
    ticker: "AAPL",
    company: mockCompany,
    companyName: "Apple Inc.",
    filings: forms.map((f, i) => ({
      accessionNumber: `0000320193-26-${String(i).padStart(6, "0")}`,
      filingDate: f.filingDate,
      acceptanceDateTime: `${f.filingDate}T16:00:00.000Z`,
      form: f.form,
      primaryDocument: `doc${i}.htm`,
      primaryDocUrl: `https://example.com/320193/00032019326${i}/doc${i}.htm`,
      items: f.items ?? [],
    })),
  };
}

// Use dates a few days ago so all fixtures pass any reasonable daysBack window.
const recentDate = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
};

beforeEach(() => {
  vi.mocked(getRecentFilings).mockReset();
  vi.mocked(fetchEdgar).mockReset();
});

describe("recentSecFilings", () => {
  it("returns only 8-K and 8-K/A forms", async () => {
    vi.mocked(getRecentFilings).mockResolvedValue(
      makeRecentFilings([
        { form: "8-K", filingDate: recentDate(2), items: ["2.02", "9.01"] },
        { form: "10-Q", filingDate: recentDate(3) },
        { form: "SC 13D", filingDate: recentDate(4) },
        { form: "8-K/A", filingDate: recentDate(5) },
      ]),
    );
    const result = await recentSecFilings({ ticker: "AAPL", daysBack: 365 });
    expect(result.length).toBe(2);
    expect(result.every((f) => f.formType === "8-K" || f.formType === "8-K/A")).toBe(true);
  });

  it("filters by itemCodes when provided", async () => {
    vi.mocked(getRecentFilings).mockResolvedValue(
      makeRecentFilings([
        { form: "8-K", filingDate: recentDate(1), items: ["2.02", "9.01"] },
        { form: "8-K", filingDate: recentDate(2), items: ["5.02"] },
        { form: "8-K", filingDate: recentDate(3), items: ["1.02"] },
      ]),
    );
    const result = await recentSecFilings({
      ticker: "AAPL",
      daysBack: 365,
      itemCodes: ["5.02"],
    });
    expect(result.length).toBe(1);
    expect(result[0].itemCodes).toContain("5.02");
  });

  it("returns empty array when ticker is not in EDGAR", async () => {
    vi.mocked(getRecentFilings).mockResolvedValue(null);
    const result = await recentSecFilings({ ticker: "UNKNOWN" });
    expect(result).toEqual([]);
  });
});

describe("lateFilings", () => {
  it("returns only NT-10K / NT-10Q forms (and amendments)", async () => {
    vi.mocked(getRecentFilings).mockResolvedValue(
      makeRecentFilings([
        { form: "NT 10-Q", filingDate: recentDate(2) },
        { form: "10-K", filingDate: recentDate(3) },
        { form: "NT 10-K", filingDate: recentDate(4) },
        { form: "8-K", filingDate: recentDate(5) },
      ]),
    );
    vi.mocked(fetchEdgar).mockResolvedValue(fixture("NT_10Q_accounting.htm"));
    const result = await lateFilings({ ticker: "AAPL", daysBack: 365 });
    expect(result.length).toBe(2);
    expect(result.every((f) => f.formType.startsWith("NT"))).toBe(true);
  });

  it("populates reasonCategory from the body classifier", async () => {
    vi.mocked(getRecentFilings).mockResolvedValue(
      makeRecentFilings([{ form: "NT 10-Q", filingDate: recentDate(2) }]),
    );
    vi.mocked(fetchEdgar).mockResolvedValue(fixture("NT_10Q_accounting.htm"));
    const result = await lateFilings({ ticker: "AAPL", daysBack: 365 });
    // The fixture contains both accounting AND corporate keywords -> "multiple" or "accounting"
    expect(["accounting", "multiple"]).toContain(result[0].reasonCategory);
  });

  it("fail-softs on body fetch error: filing returned with null reasonText, unspecified category", async () => {
    vi.mocked(getRecentFilings).mockResolvedValue(
      makeRecentFilings([{ form: "NT 10-Q", filingDate: recentDate(2) }]),
    );
    vi.mocked(fetchEdgar).mockRejectedValue(new Error("network fail"));
    const result = await lateFilings({ ticker: "AAPL", daysBack: 365 });
    expect(result.length).toBe(1);
    expect(result[0].reasonText).toBeNull();
    expect(result[0].reasonCategory).toBe("unspecified");
  });
});

describe("activistFilings", () => {
  it("returns SC 13D and SC 13D/A by default", async () => {
    vi.mocked(getRecentFilings).mockResolvedValue(
      makeRecentFilings([
        { form: "SC 13D", filingDate: recentDate(2) },
        { form: "SC 13G", filingDate: recentDate(3) },
        { form: "SC 13D/A", filingDate: recentDate(4) },
      ]),
    );
    vi.mocked(fetchEdgar).mockResolvedValue(fixture("13D_body.htm"));
    const result = await activistFilings({ ticker: "AAPL", daysBack: 365 });
    expect(result.length).toBe(2);
    expect(result.every((f) => f.formType.includes("13D"))).toBe(true);
  });

  it("excludes amendments when includeAmendments=false", async () => {
    vi.mocked(getRecentFilings).mockResolvedValue(
      makeRecentFilings([
        { form: "SC 13D", filingDate: recentDate(2) },
        { form: "SC 13D/A", filingDate: recentDate(3) },
      ]),
    );
    vi.mocked(fetchEdgar).mockResolvedValue(fixture("13D_body.htm"));
    const result = await activistFilings({
      ticker: "AAPL",
      daysBack: 365,
      includeAmendments: false,
    });
    expect(result.length).toBe(1);
    expect(result[0].formType).toBe("SC 13D");
    expect(result[0].isAmendment).toBe(false);
  });

  it("populates filerName, pctOwned, purposeExcerpt from body parser", async () => {
    vi.mocked(getRecentFilings).mockResolvedValue(
      makeRecentFilings([{ form: "SC 13D", filingDate: recentDate(2) }]),
    );
    vi.mocked(fetchEdgar).mockResolvedValue(fixture("13D_body.htm"));
    const result = await activistFilings({ ticker: "AAPL", daysBack: 365 });
    expect(result[0].filerName).toContain("Acme");
    expect(result[0].pctOwned).toBe(7.4);
    expect(result[0].purposeExcerpt).toMatch(/strategic alternatives/i);
  });
});

describe("dilutionFilings", () => {
  it("returns only dilution-related forms (S-3 family + 424B family)", async () => {
    vi.mocked(getRecentFilings).mockResolvedValue(
      makeRecentFilings([
        { form: "S-3", filingDate: recentDate(2) },
        { form: "S-1", filingDate: recentDate(3) },
        { form: "424B5", filingDate: recentDate(4) },
        { form: "424B2", filingDate: recentDate(5) },
        { form: "10-K", filingDate: recentDate(6) },
      ]),
    );
    vi.mocked(fetchEdgar).mockResolvedValue(fixture("S3_body.htm"));
    const result = await dilutionFilings({ ticker: "AAPL", daysBack: 365 });
    expect(result.length).toBe(3);
    expect(
      result.every((f) => f.formType === "S-3" || f.formType.startsWith("424B")),
    ).toBe(true);
  });

  it("populates shelfAmount and useOfProceedsExcerpt from body parser", async () => {
    vi.mocked(getRecentFilings).mockResolvedValue(
      makeRecentFilings([{ form: "S-3", filingDate: recentDate(2) }]),
    );
    vi.mocked(fetchEdgar).mockResolvedValue(fixture("S3_body.htm"));
    const result = await dilutionFilings({ ticker: "AAPL", daysBack: 365 });
    expect(result[0].shelfAmount).toBe(250_000_000);
    expect(result[0].useOfProceedsExcerpt).toMatch(/general corporate purposes/i);
  });
});
