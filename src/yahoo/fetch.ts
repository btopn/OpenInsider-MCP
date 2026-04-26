import { fetchHttp, type SourceConfig, type HttpFetchOptions } from "../http.js";

// Yahoo fingerprints UAs at the edge — the SEC-style "name email" form gets
// challenged. Keep OPENINSIDER_MCP_UA as a project-wide override but default
// to a current Chrome-on-macOS string.
const CONFIG: SourceConfig = {
  name: "Yahoo Finance",
  userAgent:
    process.env.OPENINSIDER_MCP_UA ??
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  defaultTtlMs: 60 * 1000,
  defaultAccept: "application/json, text/plain, */*",
  minIntervalMs: 200,
  defaultNullStatuses: [404],
};

export const YAHOO_USER_AGENT = CONFIG.userAgent;

export async function fetchYahoo(url: string, options: HttpFetchOptions = {}): Promise<string | null> {
  return await fetchHttp(url, CONFIG, options);
}
