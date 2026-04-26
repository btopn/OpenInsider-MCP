#!/usr/bin/env node
// Capture Yahoo Finance fixtures for the offline parser tests.
//
// Usage:
//   npm run build
//   node scripts/capture-yahoo-fixtures.mjs
//
// Writes pretty-printed JSON to tests/fixtures/yahoo/. Re-run when smoke tests
// flag a Yahoo response-shape change. Pure Node — no jq, curl, or python needed.
//
// We grab quoteSummary by scraping the embedded JSON from Yahoo's HTML quote
// page (same approach src/yahoo/quoteSummary.ts uses at runtime). The HTML
// page is what real browsers load — far less aggressively bot-defended than
// the api host.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { YAHOO_USER_AGENT } from "../dist/yahoo/fetch.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../tests/fixtures/yahoo");

const QUOTE_PAGE_BASE = "https://finance.yahoo.com/quote";

// The parser only reads from these four modules. Yahoo's HTML embeds ~25
// modules total (recommendationTrend, summaryProfile, esgScores, etc.) but
// they're dead weight in our fixtures — never touched by parseQuoteSummary.
// Filter before writing so test fixtures stay readable and the repo stays slim.
const KEPT_MODULES = ["price", "summaryDetail", "defaultKeyStatistics", "calendarEvents"];

function trimToUsedModules(json) {
  const result = json?.quoteSummary?.result?.[0];
  if (!result) return json;
  const trimmed = {};
  for (const m of KEPT_MODULES) {
    if (m in result) trimmed[m] = result[m];
  }
  return {
    quoteSummary: {
      result: [trimmed],
      error: json.quoteSummary.error ?? null,
    },
  };
}

const SCRIPT_TAG_RE =
  /<script[^>]*type="application\/json"[^>]*data-sveltekit-fetched[^>]*data-url="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g;

function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
}

async function fetchQuoteSummaryJson(ticker) {
  const url = `${QUOTE_PAGE_BASE}/${encodeURIComponent(ticker)}/`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": YAHOO_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`quote page ${ticker} returned ${res.status}`);
  const html = await res.text();

  const tickerPath = `/quoteSummary/${ticker}?`;
  SCRIPT_TAG_RE.lastIndex = 0;
  let m;
  while ((m = SCRIPT_TAG_RE.exec(html)) !== null) {
    const dataUrl = decodeEntities(m[1]);
    if (
      dataUrl.includes(tickerPath) &&
      dataUrl.includes("summaryDetail") &&
      dataUrl.includes("defaultKeyStatistics")
    ) {
      const outer = JSON.parse(m[2]);
      return JSON.parse(outer.body);
    }
  }
  throw new Error(`no embedded quoteSummary for ${ticker}`);
}

async function write(name, json) {
  const trimmed = trimToUsedModules(json);
  const path = resolve(outDir, name);
  await writeFile(path, JSON.stringify(trimmed, null, 2) + "\n", "utf8");
  process.stderr.write(`wrote ${path}\n`);
}

const aapl = await fetchQuoteSummaryJson("AAPL");
await write("quote_AAPL.json", aapl);

// Non-dividend payer for the "dividend fields are null" assertion.
// AMZN has been a canonical non-payer for the full life of the stock.
// (GOOGL was the prior choice but Alphabet initiated a dividend in 2024.)
const amzn = await fetchQuoteSummaryJson("AMZN");
await write("quote_AMZN.json", amzn);

process.stderr.write("done.\n");
