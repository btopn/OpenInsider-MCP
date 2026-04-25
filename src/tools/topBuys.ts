import { fetchOpenInsider } from "../scraper/fetch.js";
import { parseTradesTable } from "../scraper/parseTable.js";
import type { Trade, TopPeriod } from "../types.js";

export interface TopBuysArgs {
  period: TopPeriod;
}

export async function topBuys(args: TopBuysArgs): Promise<Trade[]> {
  const path = `/top-insider-purchases-of-the-${args.period}`;
  const html = await fetchOpenInsider(path);
  return parseTradesTable(html);
}
