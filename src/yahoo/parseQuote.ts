import type { Quote } from "../types.js";

// Yahoo wraps numerics as { raw: number, fmt: string, longFmt?: string }, but
// some scalar fields are bare strings or bare numbers. Always read .raw if
// present; reject anything that isn't a finite number.
function pickRaw(node: unknown): number | null {
  if (node == null) return null;
  if (typeof node === "number") return Number.isFinite(node) ? node : null;
  if (typeof node === "object" && node && "raw" in (node as Record<string, unknown>)) {
    const v = (node as { raw: unknown }).raw;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return null;
}

// Date helper. Prefer .fmt when it's already YYYY-MM-DD (avoids tz drift).
// Strict regex check is itself a prompt-injection defense — only well-formed
// dates pass through; anything else falls through to the unix conversion which
// produces an ISO date or null.
function pickRawDate(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "object" && node) {
    const fmt = (node as { fmt?: unknown }).fmt;
    if (typeof fmt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fmt)) return fmt;
  }
  const raw = pickRaw(node);
  if (raw == null) return null;
  return new Date(raw * 1000).toISOString().slice(0, 10);
}

function unixToIso(unixSec: number | null): string {
  if (unixSec == null) throw new Error("Yahoo Finance: missing regularMarketTime");
  return new Date(unixSec * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function nonZero(n: number | null): number | null {
  return n === 0 ? null : n;
}

// Prompt-injection defenses. Every string field surfaced to the LLM must come
// from one of these gates. Anything that doesn't match the expected pattern
// becomes null (or, for currency, throws — currency is critical to interpret
// the price correctly).
const EXCHANGE_RE = /^[A-Z0-9_-]{1,12}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const MARKET_STATE_VALUES = new Set([
  "regular",
  "pre",
  "post",
  "prepre",
  "postpost",
  "closed",
]);

function cleanExchange(node: unknown): string | null {
  return typeof node === "string" && EXCHANGE_RE.test(node) ? node : null;
}

function cleanCurrency(node: unknown, ticker: string): string {
  if (typeof node === "string" && CURRENCY_RE.test(node)) return node;
  throw new YahooMalformedResponseError(
    `Yahoo Finance: invalid or missing currency for ${ticker}`,
  );
}

function cleanMarketState(node: unknown, ticker: string): string {
  if (typeof node === "string") {
    const lower = node.toLowerCase();
    if (MARKET_STATE_VALUES.has(lower)) return lower;
  }
  throw new YahooMalformedResponseError(
    `Yahoo Finance: invalid or missing marketState for ${ticker}`,
  );
}

export class YahooNotFoundError extends Error {}
export class YahooMalformedResponseError extends Error {}

export function parseQuoteSummary(json: unknown, ticker: string): Quote {
  const root = (json as {
    quoteSummary?: { result?: unknown[]; error?: { description?: string; code?: string } | null };
  }).quoteSummary;
  if (!root) {
    throw new YahooMalformedResponseError(
      `Yahoo Finance: missing quoteSummary envelope for ${ticker}`,
    );
  }
  if (root.error) {
    const code = root.error.code ?? "Unknown";
    if (code === "Not Found" || /not\s+found/i.test(root.error.description ?? "")) {
      throw new YahooNotFoundError(`ticker not found: ${ticker}`);
    }
    // Don't pass Yahoo's error.description through to the LLM verbatim — it's
    // attacker-controlled (in principle) and can carry text. Surface only the
    // ticker and a generic phrase.
    throw new Error(`Yahoo Finance: error response for ${ticker}`);
  }
  const result = root.result?.[0] as Record<string, Record<string, unknown>> | undefined;
  if (!result) {
    throw new YahooMalformedResponseError(`Yahoo Finance: empty result for ${ticker}`);
  }

  const price = result.price ?? {};
  const summary = result.summaryDetail ?? {};
  const stats = result.defaultKeyStatistics ?? {};
  const calendar = result.calendarEvents ?? {};

  const regularMarketTime = pickRaw(price.regularMarketTime);
  const currentPrice = pickRaw(price.regularMarketPrice);
  if (currentPrice == null) {
    throw new YahooMalformedResponseError(`Yahoo Finance: missing regularMarketPrice for ${ticker}`);
  }

  const earningsBlock = (calendar.earnings ?? {}) as { earningsDate?: unknown[] };
  const firstEarnings = earningsBlock.earningsDate?.[0];

  return {
    // Use the validated input ticker rather than trusting price.symbol —
    // defense against any string-injection vector through Yahoo's response.
    ticker,
    exchange: cleanExchange(price.exchange),
    currency: cleanCurrency(price.currency, ticker),
    timestamp: unixToIso(regularMarketTime),
    dataAsOf: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    marketState: cleanMarketState(price.marketState, ticker),

    price: currentPrice,
    previousClose: required(pickRaw(summary.regularMarketPreviousClose) ?? pickRaw(price.regularMarketPreviousClose), "previousClose", ticker),

    fiftyTwoWeekHigh: required(pickRaw(summary.fiftyTwoWeekHigh), "fiftyTwoWeekHigh", ticker),
    fiftyTwoWeekLow: required(pickRaw(summary.fiftyTwoWeekLow), "fiftyTwoWeekLow", ticker),

    volume: required(pickRaw(summary.regularMarketVolume) ?? pickRaw(price.regularMarketVolume), "volume", ticker),
    averageVolume: pickRaw(summary.averageVolume) ?? pickRaw(summary.averageDailyVolume3Month),

    marketCap: nonZero(pickRaw(price.marketCap) ?? pickRaw(summary.marketCap)),
    beta: pickRaw(summary.beta) ?? pickRaw(stats.beta),
    trailingPE: pickRaw(summary.trailingPE),
    forwardPE: pickRaw(summary.forwardPE) ?? pickRaw(stats.forwardPE),

    dividendYield: pickRaw(summary.dividendYield),
    exDividendDate: pickRawDate(summary.exDividendDate),

    earningsDate: pickRawDate(firstEarnings),
  };
}

function required(value: number | null, name: string, ticker: string): number {
  if (value == null) {
    throw new YahooMalformedResponseError(`Yahoo Finance: missing ${name} for ${ticker}`);
  }
  return value;
}
