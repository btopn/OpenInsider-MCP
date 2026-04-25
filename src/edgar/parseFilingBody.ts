import * as cheerio from "cheerio";

const ACCOUNTING_KEYWORDS =
  /(restatement|audit|internal\s+control|material\s+weakness|GAAP|revenue\s+recognition|irregularit)/i;
const CORPORATE_KEYWORDS = /(transition|departure|succession|ERP\b|migration|conversion)/i;

export type ReasonCategory = "accounting" | "corporate" | "multiple" | "unspecified";

export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
}

export function classifyNtReason(html: string): {
  reasonText: string | null;
  reasonCategory: ReasonCategory;
} {
  const bodyText = htmlToText(html);

  // Prefer Part III window if present (the narrative section); else scan whole body
  const partIIIMatch = bodyText.match(/Part\s+III[\s\S]{0,3000}/i);
  const window = partIIIMatch ? partIIIMatch[0] : bodyText;

  const accountingHit = ACCOUNTING_KEYWORDS.test(window);
  const corporateHit = CORPORATE_KEYWORDS.test(window);

  let reasonCategory: ReasonCategory;
  if (accountingHit && corporateHit) reasonCategory = "multiple";
  else if (accountingHit) reasonCategory = "accounting";
  else if (corporateHit) reasonCategory = "corporate";
  else reasonCategory = "unspecified";

  const reasonText = window.length > 0 ? window.slice(0, 300).trim() : null;

  return { reasonText, reasonCategory };
}

export function extractItem4Purpose(html: string): string | null {
  const bodyText = htmlToText(html);
  const match = bodyText.match(
    /Item\s+4\.?\s+Purpose(?:\s+of\s+(?:the\s+)?Transaction)?\.?[\s:]*([\s\S]{0,800})/i,
  );
  if (!match) return null;
  const excerpt = match[1].trim().slice(0, 500);
  return excerpt || null;
}

export function parseS3ShelfDetails(html: string): {
  shelfAmount: number | null;
  useOfProceedsExcerpt: string | null;
} {
  const bodyText = htmlToText(html);

  // Best-effort: dollar amount near "aggregate offering price"
  const aggMatch = bodyText.match(
    /aggregate\s+offering\s+price[^$]{0,300}\$\s*([\d,.]+)\s*(million|billion|thousand)?/i,
  );
  let shelfAmount: number | null = null;
  if (aggMatch) {
    const num = parseFloat(aggMatch[1].replace(/,/g, ""));
    const unit = (aggMatch[2] ?? "").toLowerCase();
    const multiplier =
      unit === "billion" ? 1e9 : unit === "million" ? 1e6 : unit === "thousand" ? 1e3 : 1;
    shelfAmount = isFinite(num) ? num * multiplier : null;
  }

  const useMatch = bodyText.match(/Use\s+of\s+Proceeds[\s:]*([\s\S]{0,800})/i);
  const useOfProceedsExcerpt = useMatch ? useMatch[1].trim().slice(0, 500) : null;

  return { shelfAmount, useOfProceedsExcerpt };
}
