import type { ShortSnapshot } from "../types.js";
import { getShortInterestSnapshots } from "../finra/parseShortInterest.js";

export interface ShortInterestArgs {
  ticker: string;
  periodsBack?: number;
}

export async function shortInterest(args: ShortInterestArgs): Promise<ShortSnapshot[]> {
  const periodsBack = args.periodsBack ?? 6;
  return await getShortInterestSnapshots(args.ticker, periodsBack);
}
