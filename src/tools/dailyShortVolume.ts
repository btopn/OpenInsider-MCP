import { getDailyShortVolume, type DailyShortVolumeRow } from "../finra/parseRegSho.js";

export interface DailyShortVolumeArgs {
  ticker: string;
  daysBack?: number;
}

export async function dailyShortVolume(
  args: DailyShortVolumeArgs,
): Promise<DailyShortVolumeRow[]> {
  const daysBack = args.daysBack ?? 30;
  return await getDailyShortVolume(args.ticker, daysBack);
}
