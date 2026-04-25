import type { Trade } from "../types.js";

export function filterByDays(trades: Trade[], daysBack: number | undefined): Trade[] {
  if (daysBack === undefined || daysBack <= 0) return trades;
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  return trades.filter((t) => {
    const d = Date.parse(t.filingDate);
    return Number.isFinite(d) ? d >= cutoff : true;
  });
}
