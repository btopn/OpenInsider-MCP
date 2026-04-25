import { fetchOpenInsider } from "../scraper/fetch.js";
import { parseTradesTable } from "../scraper/parseTable.js";
import type { Trade } from "../types.js";
import { filterByDays } from "./filterByDays.js";

export interface SearchByTickerArgs {
  ticker: string;
  daysBack?: number;
}

export async function searchByTicker(args: SearchByTickerArgs): Promise<Trade[]> {
  const ticker = args.ticker.trim().toUpperCase();
  if (!ticker) throw new Error("ticker is required");
  const html = await fetchOpenInsider(`/screener?s=${encodeURIComponent(ticker)}`);
  return filterByDays(parseTradesTable(html), args.daysBack);
}
