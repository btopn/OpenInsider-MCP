# OpenInsider MCP

[![npm version](https://img.shields.io/npm/v/openinsider-mcp.svg)](https://www.npmjs.com/package/openinsider-mcp)
[![npm downloads](https://img.shields.io/npm/dm/openinsider-mcp.svg)](https://www.npmjs.com/package/openinsider-mcp)
[![CI](https://github.com/btopn/OpenInsider-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/btopn/OpenInsider-MCP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy_Me_a_Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/btopn)

An [MCP](https://modelcontextprotocol.io) server that exposes 16 free-data investment-research signals to any MCP-compatible LLM client — Form 4 insider trades, SEC corporate-event filings, FINRA / SEC short data, and live Yahoo Finance quotes. Drop it into your MCP client (Cursor, Claude Desktop, VS Code, Claude Code, Codex, etc.) and your LLM can query these signals directly during long research sessions, without burning context on web browsing.

The server exposes 16 tools across four free public data sources: **OpenInsider** (Form 4 insider trades), **SEC EDGAR** (8-K material events, late-filing notices, 13D activist filings, S-3 / 424B5 dilution), **FINRA / SEC** (short interest, daily short volume, failures-to-deliver), and **Yahoo Finance** (live quote: price, valuation, dividend, earnings calendar).

The server is positioned as a pure data layer: no scoring, no compositing, no editorialization. Each tool returns clean, well-typed observations with citations and gotchas baked into the tool descriptions. The orchestrator LLM decides what is significant.

**What it won't do:** recommend buys / sells, combine signals into a score, run scheduled jobs, or persist anything between sessions. The MCP gives your LLM raw observations; you and the LLM reason from there.

> Be polite. This scrapes a free public site and uses public SEC / FINRA / Yahoo endpoints. The server identifies itself with a `User-Agent` (override via `OPENINSIDER_MCP_UA` env var) and caches every response in memory for 5 minutes (60 seconds for Yahoo Finance quotes, which are time-sensitive). Repeated queries in a research session don't re-fetch.

## Install

OpenInsider MCP is a stdio server distributed on npm — pick your client below.

[![Install in Cursor](https://img.shields.io/badge/Install-Cursor-000?logo=cursor&logoColor=white)](cursor://anysphere.cursor-deeplink/mcp/install?name=openinsider&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm9wZW5pbnNpZGVyLW1jcCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/Install-VS%20Code-007ACC?logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=openinsider&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22openinsider-mcp%22%5D%7D)

<details>
<summary><b>Claude Code (CLI)</b></summary>

```sh
claude mcp add openinsider -- npx -y openinsider-mcp
```
</details>

<details>
<summary><b>Claude Desktop</b></summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop after saving.
</details>

<details>
<summary><b>Codex CLI (OpenAI)</b></summary>

```sh
codex mcp add openinsider -- npx -y openinsider-mcp
```

Or edit `~/.codex/config.toml` directly:

```toml
[mcp_servers.openinsider]
command = "npx"
args = ["-y", "openinsider-mcp"]
```
</details>

<details>
<summary><b>Other MCP clients (Windsurf, Cline, Continue, Zed, …)</b></summary>

Most clients share the same generic stdio config — paste this into your client's MCP config (path varies by client; check their docs):

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
</details>

That's it — `npx` fetches and runs the server on demand.

**Quick start.** Once installed, ask your LLM something like *"What's recent insider activity at NVDA?"* — it calls `search_by_ticker` and returns the last 90 days of Form 4 filings. Follow up with *"Why did Mark Stevens sell on March 20?"* and your LLM pulls the relevant 8-K via `recent_sec_filings`. The in-memory cache makes follow-ups instant.

## How to talk to it

You don't call these tools directly — your LLM does, based on what you ask. Representative prompts:

**Single-source:**
- *"What's recent insider activity at NVDA?"* → `search_by_ticker`
- *"Are there any notable cluster buys this week?"* → `cluster_buys`
- *"What happened with NVDA recently?"* → `recent_sec_filings` (8-K item codes)
- *"Is BIOX raising money?"* → `dilution_filings` (S-3 / 424B5 takedowns)
- *"How heavily is GME shorted? Is short interest rising?"* → `short_interest` (with delta and `pctOfFloat`)
- *"Is shorting picking up on TICKER lately?"* → `daily_short_volume` (daily flow, not standing position)
- *"What's AAPL trading at right now?"* → `get_quote` (price + valuation + dividend in one call)

**Multi-tool** (the LLM composes these automatically):
- *"Is TICKER a short squeeze setup?"* → `short_interest` + `failures_to_deliver` + `search_by_ticker`
- *"Why did TICKER drop today?"* → `recent_sec_filings` + `dilution_filings` + `search_by_ticker`
- *"How does TICKER's valuation compare to its insider activity?"* → `get_quote` (P/E, market cap) + `search_by_ticker` (recent insider buys/sells)

The more specific the question, the better the tool selection. See the [Quick reference](#quick-reference-which-tool-answers-what) table below for the full mapping.

## Quick reference: which tool answers what?

| Question | Tool | Output type |
|---|---|---|
| Insider trades for one company | `search_by_ticker` | `Trade[]` |
| One insider's trades across companies | `search_by_insider` | `Trade[]` |
| Market-wide insider firehose | `latest_trades` | `Trade[]` |
| Biggest insider buys/sells per period | `top_buys`, `top_sells` | `Trade[]` |
| Multiple insiders buying same name | `cluster_buys` | `Trade[]` (with `industry`, `insiderCount`) |
| Officer buys ≥$25k | `officer_buys` | `Trade[]` |
| Custom multi-filter screener | `screen` | `Trade[]` |
| Recent 8-K material events | `recent_sec_filings` | `EdgarFiling[]` |
| NT-10K / NT-10Q late-filing notices | `late_filings` | `EdgarFiling[]` |
| Schedule 13D activist filings | `activist_filings` | `EdgarFiling[]` |
| S-3 / 424B5 dilution / shelf takedowns | `dilution_filings` | `EdgarFiling[]` |
| Bi-monthly short interest snapshot + delta + % of shares | `short_interest` | `ShortSnapshot[]` |
| Daily short-sale flow (different from above!) | `daily_short_volume` | `{date, shortVolume, totalVolume, shortRatio}[]` |
| SEC failures-to-deliver + Reg SHO threshold list | `failures_to_deliver` | `{date, ftdShares, ftdValue, onThresholdList}[]` |
| Live stock quote (price, valuation, dividend, earnings) | `get_quote` | `Quote` |

## Tool reference

Each tool returns JSON with a typed payload. OpenInsider tools return `{ count, trades: Trade[] }`; SEC EDGAR tools return `{ count, filings: EdgarFiling[] }`; FINRA / SEC short-data tools return `{ count, snapshots: ShortSnapshot[] }` or `{ count, rows: ... }` depending on cadence; Yahoo Finance returns a single `Quote` object (no array, no `count`). See [output types](#trade-object) below for the exact field shapes.

### OpenInsider — Form 4 insider trades

#### `search_by_ticker`

All insider trades for one company.

| Param | Type | Required | Notes |
|---|---|---|---|
| `ticker` | string | yes | Stock symbol, e.g. `"NVDA"`. Case-insensitive. |
| `daysBack` | int | no | Only return trades filed within the last N days. |

**Example call:**
```json
{ "ticker": "NVDA", "daysBack": 90 }
```

#### `search_by_insider`

All trades by a specific insider across all companies, identified by their SEC CIK.

| Param | Type | Required | Notes |
|---|---|---|---|
| `cik` | string | yes | Numeric SEC CIK of the insider. See [Finding a CIK](#finding-a-cik) below. |
| `daysBack` | int | no | Filter by filing date. |

**Example call:**
```json
{ "cik": "1214156", "daysBack": 365 }
```

#### `latest_trades`

Most recent insider filings across the whole market — the live firehose.

| Param | Type | Notes |
|---|---|---|
| `daysBack` | int (optional) | |
| `transactionType` | `"all"` \| `"buys"` \| `"sells"` (optional) | `"buys"` keeps only `P-` rows, `"sells"` keeps `S-` rows. |

**Use when:** you want a market-wide pulse. Pair with `daysBack: 1` to see what was filed today.

#### `top_buys`

Largest insider purchases by dollar value over a fixed window.

| Param | Type | Notes |
|---|---|---|
| `period` | `"day"` \| `"week"` \| `"month"` \| `"quarter"` \| `"year"` | Required. |

**Example call:**
```json
{ "period": "week" }
```

#### `top_sells`

Largest insider sales by dollar value over a fixed window. Same `period` argument as `top_buys`.

> Note: most large sales are routine 10b5-1 plans or option exercises. The signal in `top_sells` is usually pattern (multiple insiders, late filings) more than absolute size. `cluster_buys` has historically been the higher-signal page.

#### `cluster_buys`

Companies where multiple insiders bought stock in a short window. The strongest open-market signal on OpenInsider.

| Param | Type | Notes |
|---|---|---|
| `daysBack` | int (optional) | |

Trades returned by this tool include two extra fields: `industry` (SIC industry name) and `insiderCount` (how many insiders are clustered).

#### `officer_buys`

Recent purchases of ≥$25k by company officers (CEO, CFO, COO, etc.). Filters out 10%-owner buys, which are often institutional and lower-signal.

| Param | Type | Notes |
|---|---|---|
| `daysBack` | int (optional) | |

#### `screen`

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

### SEC EDGAR — corporate event filings

These four tools are ticker-scoped and source from the SEC EDGAR submissions API plus filing-body parsing. They return `EdgarFiling[]`.

#### `recent_sec_filings`

Recent 8-K material event filings for a ticker, with parsed item codes (e.g. 1.02 contract terminated, 4.02 restatement, 5.02 officer change, 2.06 impairment).

| Param | Type | Notes |
|---|---|---|
| `ticker` | string | yes |
| `daysBack` | int (optional) | default 30 |
| `itemCodes` | string[] (optional) | filter to specific 8-K items, e.g. `["4.02", "5.02"]` |

#### `late_filings`

NT-10K / NT-10Q late filing notices, with parsed reason text and a heuristic category (`accounting` / `corporate` / `multiple` / `unspecified`). Accounting reasons are the strongest bearish variant.

| Param | Type | Notes |
|---|---|---|
| `ticker` | string | yes |
| `daysBack` | int (optional) | default 365 |

#### `activist_filings`

Schedule 13D activist filings (initial + amendments). Returns filer name, ownership pct, and Item 4 'Purpose of Transaction' excerpt when parseable.

| Param | Type | Notes |
|---|---|---|
| `ticker` | string | yes |
| `daysBack` | int (optional) | default 365 |
| `includeAmendments` | bool (optional) | default true |

#### `dilution_filings`

S-3 shelf registrations and 424B5 takedowns, with parsed shelf amount and use-of-proceeds excerpt.

| Param | Type | Notes |
|---|---|---|
| `ticker` | string | yes |
| `daysBack` | int (optional) | default 365 |

### FINRA / SEC — short interest, volume, FTD

These three tools are ticker-scoped and source from FINRA's CDN plus SEC bi-monthly FTD files.

#### `short_interest`

FINRA bi-monthly short interest snapshots with delta vs prior period. Returns `ShortSnapshot[]`.

| Param | Type | Notes |
|---|---|---|
| `ticker` | string | yes |
| `periodsBack` | int (optional) | default 6 (~3 months of bi-monthly periods) |

> Bi-monthly cadence: settlement on 15th + last business day, published ~7 business days later — most recent snapshot may lag spot price by 1-2 weeks.

#### `daily_short_volume`

FINRA Reg SHO daily short-sale volume — daily flow (not standing position; for that, use `short_interest`). Aggregated across CNMS, FNRA, FNYX, FNQC venues. Returns `{date, shortVolume, totalVolume, shortRatio}[]`.

| Param | Type | Notes |
|---|---|---|
| `ticker` | string | yes |
| `daysBack` | int (optional) | default 30 |

#### `failures_to_deliver`

SEC failures-to-deliver per bi-monthly period plus current Reg SHO threshold-list flag (>10K shares + >0.5% of TSO failed for 5 consecutive settlement days). Returns `{date, ftdShares, ftdValue, onThresholdList}[]`.

| Param | Type | Notes |
|---|---|---|
| `ticker` | string | yes |
| `periodsBack` | int (optional) | default 4 (~2 months) |

> ETF FTDs are largely market-maker operational; post-T+1 settlement (May 2024) aggregate FTD volumes have decreased. Interpret with caution.

### Yahoo Finance — live stock quote

Single tool, single round-trip per ticker. Sourced by scraping the structured JSON Yahoo embeds in its public HTML quote page (the same page your browser loads at `finance.yahoo.com/quote/<TICKER>/`). No api keys, no auth, no third-party brokers — direct fetch from your machine to Yahoo's web frontend.

#### `get_quote`

Live stock quote for a ticker — price, previous close, 52-week range, today's volume + 3-month average volume, market cap, beta, trailing/forward P/E, dividend yield, ex-dividend date, next earnings date, currency, exchange, ISO timestamp.

| Param | Type | Required | Notes |
|---|---|---|---|
| `ticker` | string | yes | Stock ticker, e.g. `"AAPL"`, `"BRK.B"` (normalized to `"BRK-B"`). Case-insensitive. Must match `/^[A-Z0-9.\-]{1,10}$/` after normalization; tickers with other characters are rejected. |

**Example call:**
```json
{ "ticker": "AAPL" }
```

The tool throws a clean `ticker not found` error for tickers that don't resolve, and a generic `Yahoo Finance: error response for <ticker>` when Yahoo returns an error (Yahoo's verbatim error text is intentionally not passed through, as a prompt-injection defense in an LLM tool surface).

## Trade object

OpenInsider tools return `{ count, trades: Trade[] }`. Key fields: `filingDate` / `tradeDate` (ISO), `ticker`, `insiderName`, `insiderCik`, `title`, `transactionType` (SEC code + label like `"P - Purchase"`), `price`, `quantity` (signed), `value` (signed), `formUrl`. `cluster_buys` adds `industry` + `insiderCount`.

<details>
<summary>Full Trade type definition</summary>

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

</details>

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

In practice, when you ask your LLM something like *"Has Tim Cook sold any AAPL recently?"*, it will look up the CIK on the web and then call `search_by_insider` itself — you don't need to do this manually.

## EdgarFiling object

The 4 EDGAR-sourced tools return `{ count, filings: EdgarFiling[] }`. Common fields: `ticker`, `cik` (zero-padded), `formType`, `filingDate`, `accessionNumber`, `primaryDocUrl`. Each tool also populates form-specific optional fields (`itemCodes` for 8-K, `reasonCategory` for NT, `filerName` / `pctOwned` / `purposeExcerpt` for 13D, `shelfAmount` / `useOfProceedsExcerpt` for S-3).

<details>
<summary>Full EdgarFiling type definition</summary>

```ts
{
  ticker:                string;
  cik:                   string;          // 10-digit zero-padded
  formType:              string;          // "8-K", "13D", "NT-10Q", "S-3", etc.
  filingDate:            string;          // ISO YYYY-MM-DD
  acceptanceDateTime:    string;
  accessionNumber:       string;          // canonical "0000XXXXXX-YY-NNNNNN"
  primaryDocUrl:         string;          // direct link to the filing body
  // Form-specific (optional, populated by the relevant tool):
  itemCodes?:            string[];        // 8-K item codes
  reasonText?:           string | null;   // NT-10K/Q narrative excerpt
  reasonCategory?:       "accounting" | "corporate" | "multiple" | "unspecified";
  filerName?:            string;          // 13D
  pctOwned?:             number | null;   // 13D, % of class
  purposeExcerpt?:       string | null;   // 13D Item 4
  isAmendment?:          boolean;         // 13D, S-3
  shelfAmount?:          number | null;   // S-3, dollars
  useOfProceedsExcerpt?: string | null;   // S-3
}
```

</details>

**Sample output** — `recent_sec_filings ticker=NVDA daysBack=180`:

```json
[
  {
    "ticker": "NVDA",
    "cik": "0001045810",
    "formType": "8-K",
    "filingDate": "2026-03-06",
    "acceptanceDateTime": "2026-03-06T16:11:25.000Z",
    "accessionNumber": "0001045810-26-000024",
    "primaryDocUrl": "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000024/nvda-20260302.htm",
    "itemCodes": ["5.02", "9.01"]
  }
]
```

## ShortSnapshot object

`short_interest` returns `{ count, snapshots: ShortSnapshot[] }` — fields: `ticker`, `reportDate`, `sharesShort`, `pctOfFloat` (via SEC XBRL), `daysToCover`, optional `delta` block. `daily_short_volume` returns `{ count, rows: { date, shortVolume, totalVolume, shortRatio }[] }`. `failures_to_deliver` returns `{ count, rows: { date, ftdShares, ftdValue, onThresholdList }[] }`.

<details>
<summary>Full ShortSnapshot type definition</summary>

```ts
{
  ticker:        string;
  reportDate:    string;          // ISO YYYY-MM-DD
  sharesShort:   number;
  pctOfFloat:    number | null;   // sharesShort / sharesOutstanding via SEC XBRL (dei:EntityCommonStockSharesOutstanding); null when the company has no XBRL filings
  daysToCover:   number | null;
  delta?: {                       // present for entries that have a prior period
    sharesShortDelta: number;
    pctDelta:         number;     // decimal, e.g. 0.12 = +12%
  };
}
```

</details>

**Sample output** — `short_interest ticker=NVDA periodsBack=2`:

```json
[
  {
    "ticker": "NVDA",
    "reportDate": "2026-03-31",
    "sharesShort": 280872588,
    "pctOfFloat": 0.01156,
    "daysToCover": 1.51,
    "delta": {
      "sharesShortDelta": 32531716,
      "pctDelta": 0.131
    }
  },
  {
    "ticker": "NVDA",
    "reportDate": "2026-02-27",
    "sharesShort": 248340872,
    "pctOfFloat": 0.01022,
    "daysToCover": 1.31
  }
]
```

## Quote object

`get_quote` returns a single `Quote` object directly (no array, no `count` wrapper). Always populated: identity (`ticker`, `currency`, `timestamp`, `dataAsOf`, `marketState`), `price`, `previousClose`, 52-week range, `volume`. `timestamp` is the time of the last actual tick (Yahoo's `regularMarketTime`); `dataAsOf` is when the MCP assembled the response — comparing the two reveals tick lag for illiquid securities or sessions outside regular hours. `marketState` is one of `regular | pre | post | prepre | postpost | closed`. Nullable in cases where the metric doesn't apply: `exchange` (null if Yahoo returned an unexpected exchange code), `averageVolume` (null for illiquid issues without a 3-month average), `marketCap` / `beta` / `trailingPE` / `forwardPE` (null for ETFs and instruments where N/A), `dividendYield` / `exDividendDate` (null for non-dividend payers), `earningsDate` (null when no upcoming consensus).

<details>
<summary>Full Quote type definition</summary>

```ts
{
  ticker:           string;
  exchange:         string | null;
  currency:         string;            // ISO-4217, e.g. "USD" — local for foreign tickers
  timestamp:        string;            // ISO 8601 of regularMarketTime — last actual tick
  dataAsOf:         string;            // ISO 8601 of when the MCP assembled this object
  marketState:      string;            // regular | pre | post | prepre | postpost | closed

  price:            number;
  previousClose:    number;

  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow:  number;

  volume:           number;            // today's regular-session volume (shares)
  averageVolume:    number | null;     // 3-month average; null for illiquid issues

  marketCap:        number | null;
  beta:             number | null;     // 5y monthly
  trailingPE:       number | null;
  forwardPE:        number | null;

  dividendYield:    number | null;     // decimal (0.0042 = 0.42%); null for non-payers
  exDividendDate:   string | null;     // ISO YYYY-MM-DD; null for non-payers

  earningsDate:     string | null;     // ISO YYYY-MM-DD; null when no upcoming consensus
}
```

</details>

## Tips & gotchas

- **`daysBack` filters by *filing* date, not *trade* date.** Insiders have up to 2 business days to file (sometimes longer when they file late). For "what trades happened in the last week," use `daysBack: 14` to be safe.
- **Filing-vs-trade-date gap is itself a signal.** A large gap (especially weeks or months) often means a late filing — historically correlated with insider behavior worth a closer look. Both dates are in every trade row.
- **Pure `P-Purchase` rows are the highest signal.** `S-Sale+OE` ("sale on option exercise") is mostly mechanical and dominates the sales firehose.
- **The `value` field is signed.** Negative for sales, positive for buys. When summing portfolios, this gives you net flow for free.
- **Cluster buys page returns `industry` and `insiderCount`.** These don't appear in the standard `Trade` shape — they're optional fields specific to that tool.
- **`top_sells` is mostly noise.** For real sell-side signal, use `screen` with `transactionTypes: ["S"]` plus role filters (e.g., `isCeo: true`) and a dollar threshold.
- **Cache is per-process and per-URL.** Repeat queries in the same MCP client session are instant. Restart the server (close your MCP client) to bust it, or wait for the 5-minute TTL (60 seconds for Yahoo Finance quotes).
- **Tool returns empty?** Widen `daysBack`, confirm the ticker exists in SEC EDGAR (some OTC names don't), or check timing — FINRA bi-monthly files lag ~7 business days after settlement, so the most recent period may not be published yet.
- **`short_interest` is bi-monthly with a publication lag.** FINRA settles on the 15th + last business day of each month and publishes ~7 business days later. The most recent snapshot may lag spot price by 1–2 weeks.
- **`daily_short_volume` ≠ `short_interest`.** The first is daily *flow* (shares sold short that day, summed across CNMS/FNRA/FNYX/FNQC venues); the second is a standing *position* snapshot. Numbers are not directly comparable — they measure different things.
- **`pctOfFloat` is `sharesShort / sharesOutstanding` from SEC XBRL.** Commonly conflated with "public float" in retail data feeds; true public float requires restricted-share data not available via free SEC data. Returns `null` when the company doesn't file XBRL or uses a non-standard tag.
- **8-K item codes are populated from the SEC submissions API metadata** (no body fetch needed). The most useful items: `1.02` contract terminated, `2.02` earnings, `2.06` impairment, `4.01` auditor changed, `4.02` non-reliance / restatement, `5.02` officer/director departure or appointment.
- **NT-10K/Q reason classification is a keyword heuristic.** "Accounting" reasons (restatement, audit, internal control, material weakness) are the strongest bearish variant per Bartov-DeFond-Konchitchki (2017). "Corporate" reasons (CFO transition, ERP migration) are common and weaker.
- **Activist 13D filings include amendments by default.** Pass `includeAmendments: false` to get only the initial filing — that's the highest-impact event-day per the Brav-Jiang-Partnoy-Thomas literature.
- **S-3 vs 424B5.** S-3 = the shelf authorization itself (lower immediate impact); 424B5 = the actual sale off that shelf (higher impact, often −3% announcement reaction per Loughran-Ritter). Small-cap biotech S-3 takedowns are frequently pre-PDUFA capital raises — interpret in context.
- **ETF FTDs are largely operational.** Authorized-participant create/redeem flows generate failures that aren't directional. Post-T+1 settlement (May 2024), aggregate FTD volumes have decreased materially.
- **Reg SHO threshold-list inclusion** = >10K shares AND >0.5% of TSO failed for 5 consecutive settlement days. Stratmann-Welborn (2016) document negative drift on inclusion.
- **EDGAR tools cap at `limit: 50` filings by default.** `recent_sec_filings`, `late_filings`, `activist_filings`, and `dilution_filings` each accept a `limit` arg. Body-fetching tools (`late_filings` / `activist_filings` / `dilution_filings`) fetch one filing body per result — banks and other very-active 424B-prospectus filers can have hundreds of dilution filings per year and would exceed the MCP client's request timeout if all bodies were fetched. If you set `limit` higher than what's available, the tool just returns what's there (no padding, no error).
- **`get_quote` returns `dividendYield` as a decimal, not a percent.** `0.0042` means 0.42%, matching Yahoo's wire format. Multiply by 100 if you want to display it as "0.42%".
- **ETFs typically have null `trailingPE` / `forwardPE`** — those metrics don't apply to fund structures. Many ETFs still expose `dividendYield`.
- **`get_quote` `timestamp` is the last actual tick — not "now".** For illiquid securities (low daily volume, after-hours, weekends, halted) it can be hours or days behind wall clock. To detect this, compare `timestamp` to `dataAsOf` (when the MCP served the object) and check `marketState` (`regular` means the session is open, so a large gap there is the "this just hasn't traded recently" case; `closed` / `pre` / `post` explain expected gaps).
- **`get_quote` is hardened against prompt injection through the response.** Every string field surfaced to the LLM is validated: `ticker` comes from the validated input (never from Yahoo's response), `exchange` must match `/^[A-Z0-9_-]{1,12}$/` or returns `null`, `currency` must be a 3-letter ISO-4217 code or the call throws, `marketState` must match a known enum or the call throws, dates are constrained to `YYYY-MM-DD`, and numerics must be finite. Yahoo's own error text is never passed through verbatim. Numeric fields can't carry text instructions; the only strings reachable from a Yahoo response are tightly-bounded short codes.

## Develop

```sh
git clone https://github.com/btopn/OpenInsider-MCP
cd openinsider-mcp
npm install
npm run build
npm test                 # unit tests against checked-in fixtures (offline)
SMOKE=1 npm test         # live tests against OpenInsider, SEC EDGAR, FINRA
node dist/index.js       # run the MCP server on stdio
```

To exercise the server interactively, use the official MCP inspector:

```sh
npx @modelcontextprotocol/inspector node dist/index.js
```

For a one-shot dump of representative output from every tool against a known ticker (useful for verifying a deployment or eyeballing what each tool returns):

```sh
npm run build
node scripts/exercise-tools.mjs NVDA   # or any ticker
```

For targeted queries against a specific tool (full output, no truncation; pipe through `jq` for date or field filtering):

```sh
node scripts/run-tool.mjs <tool-name> [key=value ...]

# Examples:
node scripts/run-tool.mjs search_by_ticker ticker=NVDA daysBack=7 \
  | jq '.[] | select(.tradeDate == "2026-04-22")'

node scripts/run-tool.mjs daily_short_volume ticker=GME daysBack=10

node scripts/run-tool.mjs recent_sec_filings ticker=AAPL daysBack=730 itemCodes=5.02 \
  | jq '.[] | {filingDate, primaryDocUrl}'

node scripts/run-tool.mjs short_interest ticker=NVDA periodsBack=6 > nvda_si.json
```

Status messages go to stderr; tool output goes to stdout.

To identify your deployment to SEC EDGAR with your own contact info (polite practice), set the `OPENINSIDER_MCP_UA` env var:

```sh
OPENINSIDER_MCP_UA="my-app 1.0 me@example.com" node dist/index.js
```

## Notes & non-goals

- Cache is in-memory and per-process. The server has no database and no scheduled polling — each tool call fetches the relevant page or file on demand and caches by URL for 5 minutes (60 seconds for Yahoo Finance quotes).
- This is not a Form 4 ingestion pipeline. The OpenInsider tools scrape the rendered tables from openinsider.com rather than parsing SEC Form 4 XML directly. The SEC EDGAR tools use the public submissions API + filing-body parsing for the form types they cover (8-K, NT-10K/Q, 13D, S-3 / 424B5).
- HTML, file formats, and CDN paths can change. If a tool starts failing, run `SMOKE=1 npm test` to confirm whether the parser, URL pattern, or upstream availability is the problem, then open an issue or PR.

## License

MIT

## Star history

<a href="https://www.star-history.com/#btopn/OpenInsider-MCP&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=btopn/OpenInsider-MCP&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=btopn/OpenInsider-MCP&type=Date" />
    <img alt="OpenInsider-MCP star history" src="https://api.star-history.com/svg?repos=btopn/OpenInsider-MCP&type=Date" />
  </picture>
</a>
