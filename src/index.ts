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
import type { Trade } from "./types.js";

const server = new McpServer({ name: "openinsider-mcp", version: "0.1.0" });

const periodSchema = z.enum(["day", "week", "month", "quarter", "year"]);
const txFilterSchema = z.enum(["all", "buys", "sells"]);

function jsonResult(trades: Trade[]) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ count: trades.length, trades }, null, 2),
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("openinsider-mcp failed to start:", err);
  process.exit(1);
});
