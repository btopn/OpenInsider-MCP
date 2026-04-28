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

export interface EdgarFiling {
  ticker: string;
  cik: string;
  formType: string;
  filingDate: string;
  acceptanceDateTime: string;
  accessionNumber: string;
  primaryDocUrl: string;
  itemCodes?: string[];
  reasonText?: string | null;
  reasonCategory?: "accounting" | "corporate" | "multiple" | "unspecified";
  filerName?: string;
  pctOwned?: number | null;
  purposeExcerpt?: string | null;
  isAmendment?: boolean;
  shelfAmount?: number | null;
  useOfProceedsExcerpt?: string | null;
}

export interface ShortSnapshot {
  ticker: string;
  reportDate: string;
  sharesShort: number;
  pctOfFloat: number | null;
  daysToCover: number | null;
  delta?: {
    sharesShortDelta: number;
    pctDelta: number;
  };
}

export interface Quote {
  ticker:           string;
  exchange:         string | null;
  currency:         string;
  timestamp:        string;          // ISO 8601 of regularMarketTime — last actual tick, can lag wall clock for illiquid issues or outside regular hours
  dataAsOf:         string;          // ISO 8601 of when this object was assembled by the MCP (use vs. timestamp to detect tick lag)
  marketState:      string;          // regular | pre | post | prepre | postpost | closed

  price:            number;
  previousClose:    number;

  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow:  number;

  volume:           number;
  averageVolume:    number | null;   // 3-month average; null for illiquid issues

  // Null for ETFs and instruments where the metric doesn't apply.
  marketCap:        number | null;
  beta:             number | null;
  trailingPE:       number | null;
  forwardPE:        number | null;

  // Null for non-dividend-paying stocks.
  dividendYield:    number | null;   // decimal (0.0042 = 0.42%)
  exDividendDate:   string | null;   // ISO YYYY-MM-DD

  earningsDate:     string | null;   // ISO YYYY-MM-DD; null when no upcoming consensus
}
