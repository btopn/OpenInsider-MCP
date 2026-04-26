#!/usr/bin/env node
// Exercise every v0.2.0 MCP tool against a known ticker and dump representative
// output. Run after `npm run build`.
//
// Usage:
//   node scripts/exercise-tools.mjs [TICKER]
//
// Default ticker is NVDA. For tools that need a CIK (search_by_insider) we
// hardcode Tim Cook (CIK 1214156).

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

const TICKER = (process.argv[2] ?? "NVDA").toUpperCase();
const INSIDER_CIK = "1214156"; // Tim Cook

function summarize(result, maxItems = 2) {
  if (Array.isArray(result)) {
    return {
      count: result.length,
      sample: result.slice(0, maxItems),
    };
  }
  return result;
}

async function exercise(name, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    console.log(`\n========== ${name}  (${elapsed}ms) ==========`);
    console.log(JSON.stringify(summarize(result), null, 2));
  } catch (err) {
    console.error(`\n========== ${name}  FAILED ==========`);
    console.error(err.message ?? err);
  }
}

console.log(`Exercising all 15 MCP tools. Ticker = ${TICKER}, insiderCik = ${INSIDER_CIK}`);

// --- v0.1.0 OpenInsider tools ---
await exercise("search_by_ticker", () => searchByTicker({ ticker: TICKER, daysBack: 365 }));
await exercise("search_by_insider", () => searchByInsider({ cik: INSIDER_CIK, daysBack: 365 }));
await exercise("latest_trades", () => latestTrades({ daysBack: 1, transactionType: "buys" }));
await exercise("top_buys", () => topBuys({ period: "week" }));
await exercise("top_sells", () => topSells({ period: "week" }));
await exercise("cluster_buys", () => clusterBuys({ daysBack: 30 }));
await exercise("officer_buys", () => officerBuys({ daysBack: 30 }));
await exercise("screen", () =>
  screen({ ticker: TICKER, transactionTypes: ["P"], daysBack: 730 }),
);

// --- v0.2.0 SEC EDGAR tools ---
await exercise("recent_sec_filings", () => recentSecFilings({ ticker: TICKER, daysBack: 180 }));
await exercise("late_filings", () => lateFilings({ ticker: TICKER, daysBack: 1095 }));
await exercise("activist_filings", () => activistFilings({ ticker: TICKER, daysBack: 1825 }));
await exercise("dilution_filings", () => dilutionFilings({ ticker: TICKER, daysBack: 365 }));

// --- v0.2.0 FINRA / SEC short data tools ---
await exercise("short_interest", () => shortInterest({ ticker: TICKER, periodsBack: 4 }));
await exercise("daily_short_volume", () => dailyShortVolume({ ticker: TICKER, daysBack: 5 }));
await exercise("failures_to_deliver", () => failuresToDeliver({ ticker: TICKER, periodsBack: 2 }));

console.log("\nDone.");
