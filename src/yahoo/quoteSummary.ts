import type { Quote } from "../types.js";
import { fetchYahoo } from "./fetch.js";
import {
  parseQuoteSummary,
  YahooNotFoundError,
  YahooMalformedResponseError,
} from "./parseQuote.js";

const QUOTE_PAGE_BASE = "https://finance.yahoo.com/quote";

// Yahoo's quote page server-side renders a SvelteKit app and embeds every
// pre-fetched JSON response in a <script type="application/json"
// data-sveltekit-fetched data-url="<api-url>"> tag. Among those is the
// quoteSummary v10 response with the modules we need.
//
// We use this single data path. The HTML page is what real browsers load — far
// less aggressively bot-defended than the api host. The capture-yahoo-fixtures
// script uses the exact same path to refresh test fixtures.
//
// Outer-tag content shape: { status, statusText, headers, body: "<json-string>" }
// The inner body string is the actual quoteSummary JSON our parser expects.
const SCRIPT_TAG_RE =
  /<script[^>]*type="application\/json"[^>]*data-sveltekit-fetched[^>]*data-url="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g;

function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
}

function findQuoteSummaryScript(html: string, ticker: string): string | null {
  const tickerPath = `/quoteSummary/${ticker}?`;
  SCRIPT_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_TAG_RE.exec(html)) !== null) {
    const url = decodeHtmlEntities(m[1]);
    if (
      url.includes(tickerPath) &&
      url.includes("summaryDetail") &&
      url.includes("defaultKeyStatistics")
    ) {
      return m[2];
    }
  }
  return null;
}

export async function getQuote(ticker: string): Promise<Quote> {
  const url = `${QUOTE_PAGE_BASE}/${encodeURIComponent(ticker)}/`;
  const html = await fetchYahoo(url, {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    headers: { "Accept-Language": "en-US,en;q=0.9" },
  });
  if (html == null) {
    throw new YahooNotFoundError(`ticker not found: ${ticker}`);
  }

  const scriptBody = findQuoteSummaryScript(html, ticker);
  if (scriptBody == null) {
    throw new YahooMalformedResponseError(
      `Yahoo Finance: no embedded quoteSummary script tag for ${ticker}`,
    );
  }

  let outer: unknown;
  try {
    outer = JSON.parse(scriptBody);
  } catch (err) {
    throw new YahooMalformedResponseError(
      `Yahoo Finance: outer script JSON unparseable for ${ticker}: ${(err as Error).message}`,
    );
  }
  const body = (outer as { body?: unknown }).body;
  if (typeof body !== "string") {
    throw new YahooMalformedResponseError(
      `Yahoo Finance: embedded script missing body for ${ticker}`,
    );
  }

  let inner: unknown;
  try {
    inner = JSON.parse(body);
  } catch (err) {
    throw new YahooMalformedResponseError(
      `Yahoo Finance: inner body JSON unparseable for ${ticker}: ${(err as Error).message}`,
    );
  }
  return parseQuoteSummary(inner, ticker);
}
