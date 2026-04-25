#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { searchByTicker } from "./tools/searchByTicker.js";
import { searchByInsider } from "./tools/searchByInsider.js";
import { latestTrades } from "./tools/latestTrades.js";
import { topBuys } from "./tools/topBuys.js";
import { topSells } from "./tools/topSells.js";
import { clusterBuys } from "./tools/clusterBuys.js";
import { officerBuys } from "./tools/officerBuys.js";
import { screen } from "./tools/screen.js";
import { recentSecFilings } from "./tools/recentSecFilings.js";
import { lateFilings } from "./tools/lateFilings.js";
import { activistFilings } from "./tools/activistFilings.js";
import { dilutionFilings } from "./tools/dilutionFilings.js";
import { shortInterest } from "./tools/shortInterest.js";
import { dailyShortVolume } from "./tools/dailyShortVolume.js";
import { failuresToDeliver } from "./tools/failuresToDeliver.js";

const server = new McpServer({ name: "openinsider-mcp", version: "0.2.0" });

const periodSchema = z.enum(["day", "week", "month", "quarter", "year"]);
const txFilterSchema = z.enum(["all", "buys", "sells"]);

function jsonResult<T>(items: T[], key: string = "trades") {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ count: items.length, [key]: items }, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown, toolName: string, url?: string) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: `${toolName} failed${url ? ` (url=${url})` : ""}: ${msg}`,
      },
    ],
  };
}

// --- Existing OpenInsider Form 4 tools (unchanged from v0.1.0) ---

server.tool(
  "search_by_ticker",
  "Get insider trades for a specific stock ticker, sourced from openinsider.com.",
  {
    ticker: z.string().describe("Stock ticker symbol, e.g. NVDA, AAPL"),
    daysBack: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Only return trades filed within the last N days. Default: no filter."),
  },
  async (args) => {
    try {
      return jsonResult(await searchByTicker(args));
    } catch (err) {
      return errorResult(err, "search_by_ticker");
    }
  },
);

server.tool(
  "search_by_insider",
  "Get all trades by a specific insider, identified by their SEC CIK number. Find a CIK by searching for the person on sec.gov.",
  {
    cik: z.string().describe("Numeric SEC CIK of the insider, e.g. '1214156' for Tim Cook"),
    daysBack: z.number().int().positive().optional(),
  },
  async (args) => {
    try {
      return jsonResult(await searchByInsider(args));
    } catch (err) {
      return errorResult(err, "search_by_insider");
    }
  },
);

server.tool(
  "latest_trades",
  "Get the most recent insider trading filings across the entire market.",
  {
    daysBack: z.number().int().positive().optional(),
    transactionType: txFilterSchema.optional().describe("Filter to 'buys' (P), 'sells' (S), or 'all'."),
  },
  async (args) => {
    try {
      return jsonResult(await latestTrades(args));
    } catch (err) {
      return errorResult(err, "latest_trades");
    }
  },
);

server.tool(
  "top_buys",
  "Get the top insider purchases (by trade value) for a given period.",
  { period: periodSchema },
  async (args) => {
    try {
      return jsonResult(await topBuys(args));
    } catch (err) {
      return errorResult(err, "top_buys");
    }
  },
);

server.tool(
  "top_sells",
  "Get the top insider sales (by trade value) for a given period.",
  { period: periodSchema },
  async (args) => {
    try {
      return jsonResult(await topSells(args));
    } catch (err) {
      return errorResult(err, "top_sells");
    }
  },
);

server.tool(
  "cluster_buys",
  "Get recent cluster buys: companies where multiple insiders have bought stock in a short window.",
  { daysBack: z.number().int().positive().optional() },
  async (args) => {
    try {
      return jsonResult(await clusterBuys(args));
    } catch (err) {
      return errorResult(err, "cluster_buys");
    }
  },
);

server.tool(
  "officer_buys",
  "Get recent insider purchases of $25k+ by company officers (CEO, CFO, etc.).",
  { daysBack: z.number().int().positive().optional() },
  async (args) => {
    try {
      return jsonResult(await officerBuys(args));
    } catch (err) {
      return errorResult(err, "officer_buys");
    }
  },
);

server.tool(
  "screen",
  "Run a flexible OpenInsider screener query with custom filters (transaction type, role, value range, date range, etc.).",
  {
    ticker: z.string().optional(),
    insiderCik: z.string().optional(),
    daysBack: z.number().int().positive().optional(),
    transactionTypes: z
      .array(z.enum(["P", "S", "A", "D", "M"]))
      .optional()
      .describe("SEC transaction codes to include: P=Purchase, S=Sale, A=Award, D=Disposition, M=Option exercise."),
    minTradeValue: z.number().optional(),
    maxTradeValue: z.number().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    isCeo: z.boolean().optional(),
    isCfo: z.boolean().optional(),
    isDirector: z.boolean().optional(),
    isOfficer: z.boolean().optional(),
    isTenPercentOwner: z.boolean().optional(),
    excludeDerivativeRelated: z.boolean().optional(),
    limit: z.number().int().positive().optional(),
  },
  async (args) => {
    try {
      return jsonResult(await screen(args));
    } catch (err) {
      return errorResult(err, "screen");
    }
  },
);

// --- v0.2.0: SEC EDGAR signal tools ---

server.tool(
  "recent_sec_filings",
  `Recent SEC 8-K material event filings for a ticker, with parsed item codes. Common codes: 1.02=contract terminated, 2.02=earnings release, 2.06=material impairment, 4.01=auditor changed, 4.02=non-reliance/restatement, 5.02=officer/director departure or appointment, 8.01=other. Filter by \`itemCodes\`.

Use when:
- User asks 'what happened with TICKER' or 'why did TICKER move'
- Investigating a price gap or unexpected catalyst
- Looking specifically for restatements, impairments, or executive changes
- Cross-referencing insider trades with the corporate event timeline.`,
  {
    ticker: z.string().describe("Stock ticker, e.g. 'AAPL'"),
    daysBack: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Lookback window in days. Default 30."),
    itemCodes: z
      .array(z.string())
      .optional()
      .describe("Filter to specific 8-K item codes, e.g. ['4.02', '5.02']. Omit for all items."),
  },
  async (args) => {
    try {
      return jsonResult(await recentSecFilings(args), "filings");
    } catch (err) {
      return errorResult(err, "recent_sec_filings");
    }
  },
);

server.tool(
  "late_filings",
  `Form NT-10K / NT-10Q late-filing notices for a ticker, with parsed reason text and a heuristic category: accounting / corporate / multiple / unspecified. Accounting-reason NTs are the strongest bearish variant (Bartov-DeFond-Konchitchki 2017 found significant negative CAR). Benign reasons (CFO transition, ERP migration, weather) are common and weaker.

Use when:
- Diligencing a stock that has dropped or become volatile
- Pre-screening for accounting issues before earnings
- Cross-checking against SEC comment letters or restatement risk
- User asks 'is anything weird going on with TICKER'.`,
  {
    ticker: z.string().describe("Stock ticker, e.g. 'AAPL'"),
    daysBack: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Lookback window in days. Default 365."),
  },
  async (args) => {
    try {
      return jsonResult(await lateFilings(args), "filings");
    } catch (err) {
      return errorResult(err, "late_filings");
    }
  },
);

server.tool(
  "activist_filings",
  `Schedule 13D activist filings for a ticker — initial filings and amendments. 13D = active intent to influence (vs 13G = passive, excluded by default). Returns filer name, ownership pct, and Item 4 'Purpose of Transaction' excerpt when parseable. Brav-Jiang-Partnoy-Thomas (2008) documented mean +7% CAR around 13D events; magnitude has attenuated post-2008 but signal remains.

Use when:
- User asks 'who is accumulating TICKER' or 'is anyone activist on TICKER'
- Researching takeover, restructuring, or proxy-fight catalysts
- Looking at why a stock is moving on apparently no news
- Pass \`includeAmendments=false\` to find only initial activist events (highest-impact day).`,
  {
    ticker: z.string().describe("Stock ticker, e.g. 'AAPL'"),
    daysBack: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Lookback window in days. Default 365."),
    includeAmendments: z
      .boolean()
      .optional()
      .describe("Include SC 13D/A amendments. Default true."),
  },
  async (args) => {
    try {
      return jsonResult(await activistFilings(args), "filings");
    } catch (err) {
      return errorResult(err, "activist_filings");
    }
  },
);

server.tool(
  "dilution_filings",
  `S-3 shelf registrations and 424B5 takedowns for a ticker — both signal share issuance. S-3 = the shelf authorization itself (lower immediate impact); 424B5 = actual sale off the shelf (higher impact, often -3% announcement reaction per Loughran-Ritter). Returns parsed shelf amount and use-of-proceeds excerpt when extractable.

Use when:
- User asks 'is TICKER raising money' or 'why is TICKER weak today'
- Pre-earnings or pre-catalyst dilution-risk check
- Following up on a sudden price drop on heavy volume

Important context: small-cap biotech S-3 takedowns are frequently pre-PDUFA capital raises (interpret in biotech context); non-biotech 424B5s are more directly bearish.`,
  {
    ticker: z.string().describe("Stock ticker, e.g. 'AAPL'"),
    daysBack: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Lookback window in days. Default 365."),
  },
  async (args) => {
    try {
      return jsonResult(await dilutionFilings(args), "filings");
    } catch (err) {
      return errorResult(err, "dilution_filings");
    }
  },
);

// --- v0.2.0: FINRA / SEC short data tools ---

server.tool(
  "short_interest",
  `FINRA bi-monthly short-interest snapshots for a ticker, with delta vs prior period. Bi-monthly cadence: settlement on 15th and last business day, published ~7 business days later — the most recent snapshot may lag spot price by 1-2 weeks. Returns shares short, % of float, days-to-cover, and change vs prior period.

Use when:
- User asks 'is TICKER heavily shorted' or 'is short interest rising'
- Researching squeeze setups (high SI + low float + threshold listing) or contrarian entries
- Cross-referencing with insider buying — Wang-Lai (2023) found insider-buy + SI-spike combo predictive

Important: for daily short FLOW (not standing position), use \`daily_short_volume\` instead — different measurements.`,
  {
    ticker: z.string().describe("Stock ticker, e.g. 'AAPL'"),
    periodsBack: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Number of bi-monthly periods to return. Default 6 (~3 months)."),
  },
  async (args) => {
    try {
      return jsonResult(await shortInterest(args), "snapshots");
    } catch (err) {
      return errorResult(err, "short_interest");
    }
  },
);

server.tool(
  "daily_short_volume",
  `FINRA Reg SHO daily short-sale volume for a ticker — DAILY FLOW (shares sold short that day), distinct from \`short_interest\` which is the bi-monthly snapshot of total shares short outstanding. Returns date, short volume, total volume, and short ratio. ~1 business day delay.

Use when:
- User asks 'is shorting picking up on TICKER recently'
- Investigating short-term selling pressure or trend changes faster than bi-monthly SI cadence
- Diether-Lee-Werner (2009) documented predictive power for next 20-day returns

Critical: these numbers are NOT comparable to \`short_interest\` numbers; one is daily flow, the other is standing position.`,
  {
    ticker: z.string().describe("Stock ticker, e.g. 'AAPL'"),
    daysBack: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Lookback window in days. Default 30."),
  },
  async (args) => {
    try {
      return jsonResult(await dailyShortVolume(args), "rows");
    } catch (err) {
      return errorResult(err, "daily_short_volume");
    }
  },
);

server.tool(
  "failures_to_deliver",
  `SEC failures-to-deliver for a ticker, plus current Reg SHO threshold-list status. Threshold inclusion = >10,000 shares AND >0.5% of total shares outstanding failed for 5 consecutive settlement days. Stratmann-Welborn (2016) document negative drift on threshold-list addition. Returns FTD share count + dollar value per period and a boolean threshold flag.

Use when:
- User asks 'is TICKER on the threshold list' or 'is there delivery pressure'
- Investigating squeeze setups (high SI + threshold-list = stronger composite)
- Researching microcap stocks with unusual short-side activity

Caveats: ETF FTDs are largely market-maker operational (interpret cautiously); post-T+1 settlement (May 2024), aggregate FTD volumes have decreased materially.`,
  {
    ticker: z.string().describe("Stock ticker, e.g. 'AAPL'"),
    periodsBack: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Number of bi-monthly FTD periods to return. Default 4 (~2 months)."),
  },
  async (args) => {
    try {
      return jsonResult(await failuresToDeliver(args), "rows");
    } catch (err) {
      return errorResult(err, "failures_to_deliver");
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("openinsider-mcp failed to start:", err);
  process.exit(1);
});
