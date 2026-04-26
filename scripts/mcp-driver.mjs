#!/usr/bin/env node
// Drive every registered tool through the real MCP JSON-RPC protocol
// via the official @modelcontextprotocol/sdk Client. This is the same
// path Claude Desktop / Claude Code use to talk to the server, so a
// pass here means the tools are wired end-to-end (Zod validation, MCP
// envelope, stdio transport — not just the tool functions in isolation).
//
// Usage:
//   npm run build
//   node scripts/mcp-driver.mjs APPN

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const TICKER = (process.argv[2] ?? "NVDA").toUpperCase();
const INSIDER_CIK = "1214156";

const INVOCATIONS = [
  // OpenInsider Form 4 tools
  ["search_by_ticker", { ticker: TICKER, daysBack: 365 }],
  ["search_by_insider", { cik: INSIDER_CIK, daysBack: 365 }],
  ["latest_trades", { daysBack: 1, transactionType: "buys" }],
  ["top_buys", { period: "week" }],
  ["top_sells", { period: "week" }],
  ["cluster_buys", { daysBack: 30 }],
  ["officer_buys", { daysBack: 30 }],
  ["screen", { ticker: TICKER, transactionTypes: ["P"], daysBack: 730 }],
  // SEC EDGAR tools
  ["recent_sec_filings", { ticker: TICKER, daysBack: 365 }],
  ["late_filings", { ticker: TICKER, daysBack: 1095 }],
  ["activist_filings", { ticker: TICKER, daysBack: 1825 }],
  ["dilution_filings", { ticker: TICKER, daysBack: 730 }],
  // FINRA / SEC short data tools
  ["short_interest", { ticker: TICKER, periodsBack: 4 }],
  ["daily_short_volume", { ticker: TICKER, daysBack: 5 }],
  ["failures_to_deliver", { ticker: TICKER, periodsBack: 2 }],
];

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
});
const client = new Client(
  { name: "mcp-driver", version: "1.0.0" },
  { capabilities: {} },
);
await client.connect(transport);

const list = await client.listTools();
console.log(`MCP server registered ${list.tools.length} tools.`);
console.log(`Driving ${INVOCATIONS.length} tool calls against ticker ${TICKER}...\n`);

let pass = 0;
let fail = 0;

for (const [name, args] of INVOCATIONS) {
  const start = Date.now();
  try {
    const result = await client.callTool({ name, arguments: args });
    const elapsed = Date.now() - start;
    const text = result.content?.[0]?.text ?? "";
    if (result.isError) {
      console.log(`✗ ${name.padEnd(22)} (${String(elapsed).padStart(5)}ms)  ERROR: ${text}`);
      fail++;
      continue;
    }
    const parsed = JSON.parse(text);
    const count = parsed.count ?? 0;
    const payloadKey = Object.keys(parsed).find((k) => k !== "count") ?? "items";
    console.log(`✓ ${name.padEnd(22)} (${String(elapsed).padStart(5)}ms)  count=${count}`);
    if (count > 0) {
      const first = parsed[payloadKey][0];
      const json = JSON.stringify(first);
      const preview = json.length > 240 ? json.slice(0, 240) + " …" : json;
      console.log(`    sample: ${preview}`);
    }
    pass++;
  } catch (err) {
    console.log(`✗ ${name.padEnd(22)}  EXCEPTION: ${err.message ?? err}`);
    fail++;
  }
}

console.log(`\n${pass}/${pass + fail} tool calls succeeded.`);
await client.close();
process.exit(fail > 0 ? 1 : 0);
