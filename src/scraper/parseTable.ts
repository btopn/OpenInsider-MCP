import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { Trade } from "../types.js";

type CheerioAPI = ReturnType<typeof cheerio.load>;

interface ColumnMap {
  filingDate: number;
  tradeDate: number;
  ticker: number;
  companyName: number | null;
  insiderName: number | null;
  industry: number | null;
  insiderCount: number | null;
  title: number | null;
  transactionType: number;
  price: number;
  quantity: number;
  sharesOwnedAfter: number;
  ownershipDelta: number;
  value: number;
}

export function parseTradesTable(html: string): Trade[] {
  const $ = cheerio.load(html);
  const table = $("table.tinytable").first();
  if (!table.length) return [];

  const columns = readColumnMap($, table);
  if (!columns) return [];

  const rows = table.find("tbody tr").toArray();
  return rows.map((row) => parseRow($, row, columns)).filter((t): t is Trade => t !== null);
}

function readColumnMap($: CheerioAPI, table: cheerio.Cheerio<AnyNode>): ColumnMap | null {
  const headers = table
    .find("thead th")
    .toArray()
    .map((th) => $(th).text().trim().toLowerCase().replace(/\s+/g, ""));
  const idx = (label: string) => {
    const i = headers.findIndex((h) => h === label);
    return i >= 0 ? i : null;
  };

  const filingDate = idx("filingdate");
  const tradeDate = idx("tradedate");
  const ticker = idx("ticker");
  const transactionType = idx("tradetype");
  const price = idx("price");
  const quantity = idx("qty");
  const value = idx("value");

  if (
    filingDate === null ||
    tradeDate === null ||
    ticker === null ||
    transactionType === null ||
    price === null ||
    quantity === null ||
    value === null
  ) {
    return null;
  }

  return {
    filingDate,
    tradeDate,
    ticker,
    companyName: idx("companyname"),
    insiderName: idx("insidername"),
    industry: idx("industry"),
    insiderCount: idx("ins"),
    title: idx("title"),
    transactionType,
    price,
    quantity,
    sharesOwnedAfter: idx("owned") ?? -1,
    ownershipDelta: idx("δown") ?? -1,
    value,
  };
}

function parseRow($: CheerioAPI, row: AnyNode, c: ColumnMap): Trade | null {
  const cells = $(row).find("td").toArray();
  if (cells.length === 0) return null;

  const cell = (i: number | null) => {
    if (i === null || i < 0 || i >= cells.length) return null;
    return $(cells[i]);
  };
  const text = (i: number | null) => cell(i)?.text().trim() ?? "";

  const filingCell = cell(c.filingDate);
  const filingDate = normalizeDate(filingCell?.text() ?? "");
  const formUrl = filingCell?.find("a").attr("href") ?? null;

  const tradeDate = normalizeDate(text(c.tradeDate));
  const ticker = text(c.ticker);
  if (!ticker) return null;

  const insiderCell = cell(c.insiderName);
  const insiderName = insiderCell?.text().trim() ?? "";
  const insiderCik = parseCikFromHref(insiderCell?.find("a").attr("href"));

  const trade: Trade = {
    filingDate,
    tradeDate,
    ticker,
    companyName: text(c.companyName),
    insiderName,
    insiderCik,
    title: text(c.title),
    transactionType: text(c.transactionType),
    price: parseMoney(text(c.price)),
    quantity: parseSignedNumber(text(c.quantity)),
    sharesOwnedAfter: parseNumber(text(c.sharesOwnedAfter)),
    ownershipDelta: parsePercent(text(c.ownershipDelta)),
    value: parseMoney(text(c.value)) ?? 0,
    formUrl: formUrl && !formUrl.startsWith("/") ? formUrl : null,
  };

  if (c.industry !== null) {
    const industry = text(c.industry);
    if (industry) trade.industry = industry;
  }
  if (c.insiderCount !== null) {
    const count = parseNumber(text(c.insiderCount));
    if (count !== null) trade.insiderCount = count;
  }

  return trade;
}

function normalizeDate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/);
  if (!m) return trimmed;
  return m[2] ? `${m[1]}T${m[2]}` : m[1];
}

function parseCikFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const m = href.match(/\/insider\/[^/]+\/(\d+)/);
  return m ? m[1] : null;
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[$,+\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,+\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseSignedNumber(raw: string): number {
  const n = parseNumber(raw);
  return n ?? 0;
}

function parsePercent(raw: string): number | null {
  const cleaned = raw.replace(/[%+\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
