import type { Quote } from "../types.js";
import { getQuote } from "../yahoo/quoteSummary.js";

export interface QuoteArgs {
  ticker: string;
}

// Strict validation of the normalized ticker. After uppercasing and replacing
// dots/slashes with dashes, the ticker should be 1-10 characters of A-Z, 0-9,
// dot, or dash only. This blocks any URL / prompt-injection path through the
// ticker argument and matches what every public US/global symbol looks like.
const TICKER_RE = /^[A-Z0-9.\-]{1,10}$/;

export async function quote(args: QuoteArgs): Promise<Quote> {
  const raw = (args.ticker ?? "").trim();
  if (!raw) throw new Error("ticker is required");
  // Yahoo uses dash for share-class separators (BRK-B, not BRK.B / BRK/B).
  const normalized = raw.toUpperCase().replace(/[/.]/g, "-");
  if (!TICKER_RE.test(normalized)) {
    throw new Error(`invalid ticker: ${JSON.stringify(raw)}`);
  }
  return await getQuote(normalized);
}
