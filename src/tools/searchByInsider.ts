import { fetchOpenInsider } from "../scraper/fetch.js";
import { parseTradesTable } from "../scraper/parseTable.js";
import type { Trade } from "../types.js";
import { filterByDays } from "./filterByDays.js";

export interface SearchByInsiderArgs {
  cik: string;
  daysBack?: number;
}

export async function searchByInsider(args: SearchByInsiderArgs): Promise<Trade[]> {
  const cik = args.cik.trim().replace(/^0+/, "");
  if (!cik || !/^\d+$/.test(cik)) {
    throw new Error("cik must be the numeric SEC CIK of the insider");
  }
  const html = await fetchOpenInsider(`/insider/x/${cik}`);
  return filterByDays(parseTradesTable(html), args.daysBack);
}
