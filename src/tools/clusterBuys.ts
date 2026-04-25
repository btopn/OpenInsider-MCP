import { fetchOpenInsider } from "../scraper/fetch.js";
import { parseTradesTable } from "../scraper/parseTable.js";
import type { Trade } from "../types.js";
import { filterByDays } from "./filterByDays.js";

export interface ClusterBuysArgs {
  daysBack?: number;
}

export async function clusterBuys(args: ClusterBuysArgs = {}): Promise<Trade[]> {
  const html = await fetchOpenInsider("/latest-cluster-buys");
  return filterByDays(parseTradesTable(html), args.daysBack);
}
