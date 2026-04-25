import { fetchOpenInsider } from "../scraper/fetch.js";
import { parseTradesTable } from "../scraper/parseTable.js";
import type { ScreenFilters, Trade } from "../types.js";

export async function screen(filters: ScreenFilters = {}): Promise<Trade[]> {
  const path = `/screener?${buildScreenerQuery(filters)}`;
  const html = await fetchOpenInsider(path);
  let trades = parseTradesTable(html);
  trades = applyClientFilters(trades, filters);
  return trades;
}

function buildScreenerQuery(f: ScreenFilters): string {
  const params = new URLSearchParams();

  if (f.ticker) params.set("s", f.ticker.toUpperCase());
  if (f.insiderCik) params.set("o", f.insiderCik);
  if (f.daysBack !== undefined) params.set("daysago", String(f.daysBack));

  // Trade value range — OpenInsider expects values in thousands of dollars
  if (f.minTradeValue !== undefined) params.set("vl", String(Math.floor(f.minTradeValue / 1000)));
  if (f.maxTradeValue !== undefined) params.set("vh", String(Math.floor(f.maxTradeValue / 1000)));

  if (f.minPrice !== undefined) params.set("pl", String(f.minPrice));
  if (f.maxPrice !== undefined) params.set("ph", String(f.maxPrice));

  if (f.isCeo) params.set("isceo", "1");
  if (f.isCfo) params.set("iscfo", "1");
  if (f.isDirector) params.set("isdirector", "1");
  if (f.isOfficer) params.set("isofficer", "1");
  if (f.isTenPercentOwner) params.set("istenpercent", "1");

  if (f.excludeDerivativeRelated) params.set("excludeDerivRelated", "1");
  if (f.limit !== undefined) params.set("cnt", String(Math.min(1000, f.limit)));

  params.set("sortcol", "0");
  params.set("sortdir", "desc");

  return params.toString();
}

function applyClientFilters(trades: Trade[], f: ScreenFilters): Trade[] {
  const txCodes = f.transactionTypes;
  if (txCodes && txCodes.length > 0) {
    trades = trades.filter((t) => txCodes.some((code) => t.transactionType.startsWith(code)));
  }
  return trades;
}
