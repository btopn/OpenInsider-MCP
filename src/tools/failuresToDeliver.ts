import { getFailuresToDeliver, type FtdRow } from "../finra/parseFtd.js";

export interface FailuresToDeliverArgs {
  ticker: string;
  periodsBack?: number;
}

export async function failuresToDeliver(args: FailuresToDeliverArgs): Promise<FtdRow[]> {
  const periodsBack = args.periodsBack ?? 4;
  return await getFailuresToDeliver(args.ticker, periodsBack);
}
