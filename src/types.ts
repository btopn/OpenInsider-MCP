export interface Trade {
  filingDate: string;
  tradeDate: string;
  ticker: string;
  companyName: string;
  insiderName: string;
  insiderCik: string | null;
  title: string;
  transactionType: string;
  price: number | null;
  quantity: number;
  sharesOwnedAfter: number | null;
  ownershipDelta: number | null;
  value: number;
  formUrl: string | null;
  industry?: string;
  insiderCount?: number;
}

export type TopPeriod = "day" | "week" | "month" | "quarter" | "year";

export interface ScreenFilters {
  ticker?: string;
  insiderCik?: string;
  daysBack?: number;
  transactionTypes?: Array<"P" | "S" | "A" | "D" | "M">;
  minTradeValue?: number;
  maxTradeValue?: number;
  minPrice?: number;
  maxPrice?: number;
  isCeo?: boolean;
  isCfo?: boolean;
  isDirector?: boolean;
  isOfficer?: boolean;
  isTenPercentOwner?: boolean;
  excludeDerivativeRelated?: boolean;
  limit?: number;
}
