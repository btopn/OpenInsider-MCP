#!/usr/bin/env node
// Run a single MCP tool with supplied args and dump the full JSON result.
// Status output goes to stderr; tool result JSON goes to stdout, so you can
// pipe to jq/grep/file freely.
//
// Usage:
//   node scripts/run-tool.mjs <tool-name> [key=value ...]
//
// Examples:
//   node scripts/run-tool.mjs search_by_ticker ticker=NVDA daysBack=30
//   node scripts/run-tool.mjs search_by_ticker ticker=NVDA daysBack=7 | jq '.[] | select(.tradeDate == "2026-04-22")'
//   node scripts/run-tool.mjs daily_short_volume ticker=GME daysBack=10 > gme_short.json
//   node scripts/run-tool.mjs recent_sec_filings ticker=AAPL itemCodes=4.02,5.02 daysBack=365
//   node scripts/run-tool.mjs screen ticker=NVDA transactionTypes=P,S daysBack=30 isCeo=true

import { searchByTicker } from "../dist/tools/searchByTicker.js";
import { searchByInsider } from "../dist/tools/searchByInsider.js";
import { latestTrades } from "../dist/tools/latestTrades.js";
import { topBuys } from "../dist/tools/topBuys.js";
import { topSells } from "../dist/tools/topSells.js";
import { clusterBuys } from "../dist/tools/clusterBuys.js";
import { officerBuys } from "../dist/tools/officerBuys.js";
import { screen } from "../dist/tools/screen.js";
import { recentSecFilings } from "../dist/tools/recentSecFilings.js";
import { lateFilings } from "../dist/tools/lateFilings.js";
import { activistFilings } from "../dist/tools/activistFilings.js";
import { dilutionFilings } from "../dist/tools/dilutionFilings.js";
import { shortInterest } from "../dist/tools/shortInterest.js";
import { dailyShortVolume } from "../dist/tools/dailyShortVolume.js";
import { failuresToDeliver } from "../dist/tools/failuresToDeliver.js";
import { quote } from "../dist/tools/quote.js";

const REGISTRY = {
  search_by_ticker: searchByTicker,
  search_by_insider: searchByInsider,
  latest_trades: latestTrades,
  top_buys: topBuys,
  top_sells: topSells,
  cluster_buys: clusterBuys,
  officer_buys: officerBuys,
  screen,
  recent_sec_filings: recentSecFilings,
  late_filings: lateFilings,
  activist_filings: activistFilings,
  dilution_filings: dilutionFilings,
  short_interest: shortInterest,
  daily_short_volume: dailyShortVolume,
  failures_to_deliver: failuresToDeliver,
  get_quote: quote,
};

// Known string fields that should never be number-coerced (CIKs and tickers
// are conceptually strings even when all-digits).
const STRING_FIELDS = new Set(["ticker", "cik", "insiderCik"]);
// Known array-of-string fields that should always be split on comma even
// when given a single value (so itemCodes=5.02 becomes ["5.02"], not [5.02]).
const STRING_ARRAY_FIELDS = new Set(["itemCodes", "transactionTypes"]);

function coerce(key, value) {
  if (STRING_ARRAY_FIELDS.has(key)) {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (STRING_FIELDS.has(key)) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (value === "undefined") return undefined;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function usage(extra) {
  if (extra) process.stderr.write(`${extra}\n\n`);
  process.stderr.write(
    `Usage: node scripts/run-tool.mjs <tool-name> [key=value ...]\n\n` +
      `Available tools:\n  ${Object.keys(REGISTRY).join("\n  ")}\n\n` +
      `Args are coerced: numbers, true/false/null, comma-separated -> array.\n` +
      `Tip: pipe stdout through jq for date/field filtering.\n`,
  );
  process.exit(extra ? 1 : 0);
}

const [, , toolName, ...rest] = process.argv;
if (!toolName || toolName === "--help" || toolName === "-h") usage();
if (!REGISTRY[toolName]) usage(`Unknown tool: ${toolName}`);

const args = {};
for (const pair of rest) {
  const eqIdx = pair.indexOf("=");
  if (eqIdx < 0) usage(`Bad arg: ${pair} (expected key=value)`);
  const key = pair.slice(0, eqIdx);
  args[key] = coerce(key, pair.slice(eqIdx + 1));
}

process.stderr.write(`> ${toolName}(${JSON.stringify(args)})\n`);
const start = Date.now();
try {
  const result = await REGISTRY[toolName](args);
  const count = Array.isArray(result) ? result.length : 1;
  process.stderr.write(`  ${Date.now() - start}ms, ${count} item${count === 1 ? "" : "s"}\n`);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} catch (err) {
  process.stderr.write(`  FAILED: ${err.message ?? err}\n`);
  process.exit(1);
}
