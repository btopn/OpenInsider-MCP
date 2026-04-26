# Changelog

All notable changes to `openinsider-mcp` are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0]

### Added

Seven new ticker-scoped MCP tools across two new free public data sources, taking total tool count from 8 to 15.

**SEC EDGAR (4 tools)** — sourced from the SEC submissions API plus filing-body parsing:
- `recent_sec_filings` — recent 8-K material event filings with parsed item codes (e.g. 1.02 contract terminated, 4.02 restatement, 5.02 officer change). Filterable by `itemCodes`.
- `late_filings` — Form NT-10K / NT-10Q late-filing notices, with parsed reason text and a heuristic category (`accounting` / `corporate` / `multiple` / `unspecified`).
- `activist_filings` — Schedule 13D activist filings (initial + amendments) with filer name, ownership pct, and Item 4 'Purpose of Transaction' excerpt.
- `dilution_filings` — S-3 shelf registrations and 424B5 takedowns with parsed shelf amount and use-of-proceeds excerpt.

**FINRA / SEC short data (3 tools)**:
- `short_interest` — bi-monthly FINRA short-interest snapshots with delta vs prior period. `pctOfFloat` populated via SEC XBRL `dei:EntityCommonStockSharesOutstanding`.
- `daily_short_volume` — daily Reg SHO short-sale volume aggregated across CNMS / FNRA / FNYX / FNQC venues (daily flow, not standing position).
- `failures_to_deliver` — bi-monthly SEC FTD plus current Reg SHO threshold-list flag.

**New shared types** (`src/types.ts`): `EdgarFiling`, `ShortSnapshot`. Each tool returns its own typed payload (`trades`, `filings`, `snapshots`, or `rows`) under a `count + payload` JSON envelope.

**New shared cache module** (`src/cache.ts`): TTL'd in-memory `Map` shared across all sources. Per-source TTLs: 5 min for OpenInsider + EDGAR submissions, 24h for SEC filing bodies and FINRA bi-monthly files, 6h for daily files.

**Repository-side scripts** for verification:
- `scripts/exercise-tools.mjs <ticker>` — one-shot dump of representative output from every tool.
- `scripts/run-tool.mjs <tool-name> [key=value ...]` — targeted single-tool query with full output to stdout (status to stderr; pipe to `jq` / file).

**Smoke test files** (`tests/smoke.edgar.live.test.ts`, `tests/smoke.finra.live.test.ts`) gated behind `SMOKE=1`, covering CIK lookup, submissions API, filing-body fetch, FINRA bi-monthly SI, daily Reg SHO, SEC FTD ZIP extraction, and Reg SHO threshold-list URLs (NYSE + Nasdaq).

### Changed

- **User-Agent** now defaults to `openinsider-mcp 0.2.0 contact@example.com` (SEC's bot detection rejects the slash/parens form). Override per-deployment via the `OPENINSIDER_MCP_UA` env var.
- **`src/scraper/fetch.ts`** refactored to use the shared `src/cache.ts` module; `clearCache` is re-exported so existing test imports keep working.
- **`jsonResult` helper in `src/index.ts`** generalized to `jsonResult<T>(items: T[], key: string = "trades")` so new tools can pass their own envelope key.
- **README** restructured: tool reference grouped by data source instead of changelog-style version splits; added quick-reference table, sample outputs, and project-as-data-layer framing; type definitions collapsed behind `<details>` to lighten first-load reading.

### Changed

- **EDGAR tools now accept a `limit` arg (default 50).** `recent_sec_filings`, `late_filings`, `activist_filings`, and `dilution_filings` each cap the number of filings returned (and bodies fetched, for the three that parse bodies). The default protects against MCP-client request-timeout failures on very-active filers — JPM, for example, files dozens of 424B prospectus supplements per year and previously timed out on `dilution_filings`. Callers can raise `limit` arbitrarily; the tool returns whatever's available up to that ceiling.

### Fixed

- **`pctOfFloat` now falls back to `us-gaap:CommonStockSharesOutstanding`** when the cover-page `dei:EntityCommonStockSharesOutstanding` tag isn't filed. Discovered via APPN, which doesn't file the dei tag at all (404) but reports under us-gaap with 74M shares as of 2025-12-31. Fix in `src/edgar/companyFacts.ts` tries dei first then us-gaap; null only when both miss.
- **NYSE threshold-list URL** in `buildThresholdUrls` now passes ISO `YYYY-MM-DD` (NYSE's API rejected `YYYYMMDD` with HTTP 400 "Type mismatch error: Expected type LocalDate"). Nasdaq still uses `YYYYMMDD`.
- **FINRA SI URL pattern** updated to verified `cdn.finra.org/equity/otcmarket/biweekly/shrt{YYYYMMDD}.csv` with current camelCase column names (`symbolCode`, `currentShortPositionQuantity`, etc).
- **SEC FTD ZIP handling** — files ship as `cnsfails{YYYYMM}{a|b}.zip` rather than text; added `adm-zip` dependency and binary fetch path.
- **FINRA 403-as-missing** — FINRA's CloudFront serves 403 (not 404) for non-existent files; `return404AsNull` now treats both as "file missing" so the tool can probe recent dates without throwing.

### Internal

- Per-source rate limiting: ~9 req/sec for SEC EDGAR (within their documented 10 rps limit); 100ms minimum interval for FINRA.
- All filing-body parsers fail soft: when a parse heuristic doesn't match, the affected fields return `null` and the rest of the data flows through.

## [0.1.0]

Initial release. 8 tools wrapping openinsider.com Form 4 insider trading data:
`search_by_ticker`, `search_by_insider`, `latest_trades`, `top_buys`, `top_sells`, `cluster_buys`, `officer_buys`, `screen`.
