import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  htmlToText,
  classifyNtReason,
  extractItem4Purpose,
  parseS3ShelfDetails,
  parse13DDetails,
} from "../../src/edgar/parseFilingBody.js";

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/edgar");

function fixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf8");
}

describe("htmlToText", () => {
  it("strips HTML tags and collapses whitespace", () => {
    const text = htmlToText("<div>Hello\n\n  <span>world</span></div>");
    expect(text).toBe("Hello world");
  });

  it("removes script and style content", () => {
    const text = htmlToText("<body>Visible<script>hidden</script></body>");
    expect(text).toBe("Visible");
  });
});

describe("classifyNtReason", () => {
  it("classifies an accounting-reason NT body as 'accounting' or 'multiple'", () => {
    const result = classifyNtReason(fixture("NT_10Q_accounting.htm"));
    // Body mentions both accounting (restatement, audit, internal control,
    // material weakness, revenue recognition, irregularity) AND ERP/transition
    // — 'multiple' is acceptable, but accounting must dominate.
    expect(["accounting", "multiple"]).toContain(result.reasonCategory);
    expect(result.reasonText).toBeTruthy();
  });

  it("classifies a benign-reason NT body as 'corporate'", () => {
    const result = classifyNtReason(fixture("NT_10Q_benign.htm"));
    expect(result.reasonCategory).toBe("corporate");
    expect(result.reasonText).toBeTruthy();
  });

  it("returns 'unspecified' for empty body", () => {
    const result = classifyNtReason("<html><body></body></html>");
    expect(result.reasonCategory).toBe("unspecified");
  });
});

describe("extractItem4Purpose", () => {
  it("returns the excerpt after the Item 4 heading", () => {
    const excerpt = extractItem4Purpose(fixture("13D_body.htm"));
    expect(excerpt).toBeTruthy();
    expect(excerpt).toMatch(/Reporting Persons/i);
  });

  it("returns null when no Item 4 heading is present", () => {
    expect(extractItem4Purpose("<html><body>nothing here</body></html>")).toBeNull();
  });
});

describe("parse13DDetails", () => {
  it("extracts filer name, pct owned, and Item 4 purpose from a 13D body", () => {
    const result = parse13DDetails(fixture("13D_body.htm"));
    expect(result.filerName).toContain("Acme Capital");
    expect(result.pctOwned).toBe(7.4);
    expect(result.purposeExcerpt).toBeTruthy();
    expect(result.purposeExcerpt).toMatch(/strategic alternatives/i);
  });

  it("returns nulls when the body lacks the 13D structure", () => {
    const result = parse13DDetails("<html><body>nothing structured</body></html>");
    expect(result.filerName).toBeNull();
    expect(result.pctOwned).toBeNull();
    expect(result.purposeExcerpt).toBeNull();
  });
});

describe("parseS3ShelfDetails", () => {
  it("parses aggregate offering price and use-of-proceeds from S-3 body", () => {
    const result = parseS3ShelfDetails(fixture("S3_body.htm"));
    expect(result.shelfAmount).toBe(250000000);
    expect(result.useOfProceedsExcerpt).toMatch(/general corporate purposes/i);
  });

  it("returns null for both fields when body lacks the expected sections", () => {
    const result = parseS3ShelfDetails("<html><body><p>Some other content.</p></body></html>");
    expect(result.shelfAmount).toBeNull();
    expect(result.useOfProceedsExcerpt).toBeNull();
  });
});
