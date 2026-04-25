import { fetchOpenInsider } from "../scraper/fetch.js";
import { parseTradesTable } from "../scraper/parseTable.js";
import type { Trade } from "../types.js";
import { filterByDays } from "./filterByDays.js";

export type TransactionFilter = "all" | "buys" | "sells";

export interface LatestTradesArgs {
  daysBack?: number;
  transactionType?: TransactionFilter;
}

export async function latestTrades(args: LatestTradesArgs = {}): Promise<Trade[]> {
  const html = await fetchOpenInsider("/latest-insider-trading");
  let trades = parseTradesTable(html);
  trades = filterByDays(trades, args.daysBack);
  const filter = args.transactionType ?? "all";
  if (filter === "buys") {
    trades = trades.filter((t) => t.transactionType.startsWith("P"));
  } else if (filter === "sells") {
    trades = trades.filter((t) => t.transactionType.startsWith("S"));
  }
  return trades;
}
