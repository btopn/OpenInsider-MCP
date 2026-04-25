# openinsider-mcp

[![npm version](https://img.shields.io/npm/v/openinsider-mcp.svg)](https://www.npmjs.com/package/openinsider-mcp)
[![npm downloads](https://img.shields.io/npm/dm/openinsider-mcp.svg)](https://www.npmjs.com/package/openinsider-mcp)
[![CI](https://github.com/btopn/OpenInsider-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/btopn/OpenInsider-MCP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An [MCP](https://modelcontextprotocol.io) server that exposes [OpenInsider.com](http://openinsider.com) — SEC Form 4 insider trading data — to Claude. Drop it into your Claude config and Claude can query insider activity directly during long research sessions, without burning context on web browsing.

OpenInsider already aggregates SEC Form 4 filings, computes ownership deltas, and detects cluster buys. This server is a thin shim over their public pages, normalizes the result to JSON, and exposes 8 tools.

> Be polite. This scrapes a free public site. The server identifies itself with a `User-Agent` and keeps a 5-minute in-memory cache so repeated queries in a research session don't re-fetch.

## Install

Add to your Claude Desktop / Claude Code config:

```json
{
  "mcpServers": {
    "openinsider": {
      "command": "npx",
      "args": ["-y", "openinsider-mcp"]
    }
  }
}
```

That's it — `npx` fetches and runs the server on demand.

## How to talk to it

You don't call these tools directly — Claude does, based on what you ask. Some prompts that exercise the server well:

- *"What's recent insider activity at NVDA?"* → `search_by_ticker`
- *"Are there any notable cluster buys this week?"* → `cluster_buys`
- *"Show me CEO purchases over $500k in the last 30 days."* → `screen` with role + value filters
- *"Has Jensen Huang sold any NVDA recently?"* → web-lookup CIK, then `search_by_insider`
- *"What are the biggest insider sales this quarter, and which companies have multiple insiders selling?"* → `top_sells` + `cluster_buys` (Claude composes them)

The more specific the question, the better the tool selection. For long research tasks (e.g., "research these 5 small-cap energy names and flag any with concerning insider activity"), Claude will fan out across multiple tools and the in-memory cache keeps repeat queries instant.

## Tool reference

All tools return `{ count, trades: Trade[] }`. The `Trade` shape is documented in [Trade object](#trade-object) below.

### `search_by_ticker`

All insider trades for one company.

| Param | Type | Required | Notes |
|---|---|---|---|
| `ticker` | string | yes | Stock symbol, e.g. `"NVDA"`. Case-insensitive. |
| `daysBack` | int | no | Only return trades filed within the last N days. |

**Example call:**
```json
{ "ticker": "NVDA", "daysBack": 90 }
```

### `search_by_insider`

All trades by a specific insider across all companies, identified by their SEC CIK.

| Param | Type | Required | Notes |
|---|---|---|---|
| `cik` | string | yes | Numeric SEC CIK of the insider. See [Finding a CIK](#finding-a-cik) below. |
| `daysBack` | int | no | Filter by filing date. |

**Example call:**
```json
{ "cik": "1214156", "daysBack": 365 }
```

### `latest_trades`

Most recent insider filings across the whole market — the live firehose.

| Param | Type | Notes |
|---|---|---|
| `daysBack` | int (optional) | |
| `transactionType` | `"all"` \| `"buys"` \| `"sells"` (optional) | `"buys"` keeps only `P-` rows, `"sells"` keeps `S-` rows. |

**Use when:** you want a market-wide pulse. Pair with `daysBack: 1` to see what was filed today.

### `top_buys`

Largest insider purchases by dollar value over a fixed window.

| Param | Type | Notes |
|---|---|---|
| `period` | `"day"` \| `"week"` \| `"month"` \| `"quarter"` \| `"year"` | Required. |

**Example call:**
```json
{ "period": "week" }
```

### `top_sells`

Largest insider sales by dollar value over a fixed window. Same `period` argument as `top_buys`.

> Note: most large sales are routine 10b5-1 plans or option exercises. The signal in `top_sells` is usually pattern (multiple insiders, late filings) more than absolute size. `cluster_buys` has historically been the higher-signal page.

### `cluster_buys`

Companies where multiple insiders bought stock in a short window. The strongest open-market signal on OpenInsider.

| Param | Type | Notes |
|---|---|---|
| `daysBack` | int (optional) | |

Trades returned by this tool include two extra fields: `industry` (SIC industry name) and `insiderCount` (how many insiders are clustered).

### `officer_buys`

Recent purchases of ≥$25k by company officers (CEO, CFO, COO, etc.). Filters out 10%-owner buys, which are often institutional and lower-signal.

| Param | Type | Notes |
|---|---|---|
| `daysBack` | int (optional) | |

### `screen`

Generic OpenInsider screener with flexible filters. Use this when none of the named tools fit.

| Param | Type | Notes |
|---|---|---|
| `ticker` | string | Filter to one symbol. |
| `insiderCik` | string | Filter to one insider by CIK. |
| `daysBack` | int | |
| `transactionTypes` | `Array<"P"\|"S"\|"A"\|"D"\|"M">` | Applied client-side after fetch. See [transaction codes](#transaction-codes). |
| `minTradeValue` / `maxTradeValue` | number (USD) | Trade value range. |
| `minPrice` / `maxPrice` | number (USD) | Per-share price range. |
| `isCeo`, `isCfo`, `isDirector`, `isOfficer`, `isTenPercentOwner` | boolean | Role filters. |
| `excludeDerivativeRelated` | boolean | Hide option-exercise / award-related rows. |
| `limit` | int | Max rows (capped at 1000). |

**Example call** — CEO open-market buys over $500k in the last 30 days:
```json
{
  "isCeo": true,
  "transactionTypes": ["P"],
  "minTradeValue": 500000,
  "daysBack": 30
}
```

## Trade object

```ts
{
  filingDate:        string;          // ISO 8601, with time, e.g. "2026-04-24T21:35:59"
  tradeDate:         string;          // ISO 8601 date, e.g. "2026-04-22"
  ticker:            string;
  companyName:       string;
  insiderName:       string;
  insiderCik:        string | null;   // SEC CIK of the insider, when present
  title:             string;          // role(s), e.g. "CEO", "Dir", "10%", "CEO, Pres"
  transactionType:   string;          // SEC code + label, e.g. "P - Purchase", "S - Sale+OE"
  price:             number | null;   // $/share, null on award/grant rows
  quantity:          number;          // signed: positive = acquired, negative = disposed
  sharesOwnedAfter:  number | null;
  ownershipDelta:    number | null;   // % change in stake, signed (e.g. -10 means -10%)
  value:             number;          // signed dollar value (matches quantity sign)
  formUrl:           string | null;   // direct link to the SEC Form 4 XML
  industry?:         string;          // cluster_buys only
  insiderCount?:     number;          // cluster_buys only — how many insiders clustered
}
```

### Transaction codes

The `transactionType` string is the SEC's two-character code plus its label. Common ones:

| Code | Meaning | Signal |
|---|---|---|
| `P` | Open-market purchase | Strongest bullish signal — insider used real cash. |
| `S` | Open-market sale | Sell signal, but often diluted by 10b5-1 plans. |
| `S - Sale+OE` | Sale tied to an option exercise | Mostly mechanical; weaker signal than a clean `S`. |
| `A` | Grant / award | Compensation, not a trade. Ignore for sentiment. |
| `M` | Option exercise (no open-market component) | Mechanical. |
| `F` | Tax withholding | Mechanical. |
| `D` | Disposition (non-open-market) | Usually a transfer, not a trade. |

When filtering for "real" buying or selling activity, prefer `P` and unqualified `S`.

### Finding a CIK

`search_by_insider` needs a numeric SEC CIK (Central Index Key). Two easy ways:

1. **Search SEC EDGAR**: <https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=4>. Type the person's name, copy the 10-digit CIK from the result.
2. **Click through OpenInsider**: any name in `latest_trades` or `cluster_buys` results includes `insiderCik` directly. Pull a few trades, grab the CIK, then call `search_by_insider`.

In practice, when you ask Claude something like *"Has Tim Cook sold any AAPL recently?"*, Claude will look up the CIK on the web and then call `search_by_insider` itself — you don't need to do this manually.

## Tips & gotchas

- **`daysBack` filters by *filing* date, not *trade* date.** Insiders have up to 2 business days to file (sometimes longer when they file late). For "what trades happened in the last week," use `daysBack: 14` to be safe.
- **Filing-vs-trade-date gap is itself a signal.** A large gap (especially weeks or months) often means a late filing — historically correlated with insider behavior worth a closer look. Both dates are in every trade row.
- **Pure `P-Purchase` rows are the highest signal.** `S-Sale+OE` ("sale on option exercise") is mostly mechanical and dominates the sales firehose.
- **The `value` field is signed.** Negative for sales, positive for buys. When summing portfolios, this gives you net flow for free.
- **Cluster buys page returns `industry` and `insiderCount`.** These don't appear in the standard `Trade` shape — they're optional fields specific to that tool.
- **`top_sells` is mostly noise.** For real sell-side signal, use `screen` with `transactionTypes: ["S"]` plus role filters (e.g., `isCeo: true`) and a dollar threshold.
- **Cache is per-process and per-URL.** Repeat queries in the same Claude session are instant. Restart the server (close Claude) to bust it, or wait 5 minutes.

## Develop

```sh
git clone https://github.com/btopn/OpenInsider-MCP
cd openinsider-mcp
npm install
npm run build
npm test                 # unit tests against checked-in HTML fixtures
SMOKE=1 npm test         # live test against the real OpenInsider site
node dist/index.js       # run the MCP server on stdio
```

To exercise the server interactively, use the official MCP inspector:

```sh
npx @modelcontextprotocol/inspector node dist/index.js
```

## Notes & non-goals

- Cache is in-memory and per-process. The server has no database and no scheduled polling — each tool call fetches the relevant OpenInsider page on demand.
- This is not a Form 4 ingestion pipeline. It does not parse SEC EDGAR XML. If OpenInsider is down, this server returns errors.
- HTML can change. If a tool starts failing, run `SMOKE=1 npm test` to confirm the parser is the problem, then open an issue or PR.

## License

MIT
