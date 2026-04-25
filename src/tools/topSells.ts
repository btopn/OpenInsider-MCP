import { fetchOpenInsider } from "../scraper/fetch.js";
import { parseTradesTable } from "../scraper/parseTable.js";
import type { Trade, TopPeriod } from "../types.js";

export interface TopSellsArgs {
  period: TopPeriod;
}

export async function topSells(args: TopSellsArgs): Promise<Trade[]> {
  const path = `/top-insider-sales-of-the-${args.period}`;
  const html = await fetchOpenInsider(path);
  return parseTradesTable(html);
}
