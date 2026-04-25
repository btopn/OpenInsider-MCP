import { fetchOpenInsider } from "../scraper/fetch.js";
import { parseTradesTable } from "../scraper/parseTable.js";
import type { Trade } from "../types.js";
import { filterByDays } from "./filterByDays.js";

export interface OfficerBuysArgs {
  daysBack?: number;
}

export async function officerBuys(args: OfficerBuysArgs = {}): Promise<Trade[]> {
  const html = await fetchOpenInsider("/latest-officer-purchases-25k");
  return filterByDays(parseTradesTable(html), args.daysBack);
}
