import { fetchHttp, type SourceConfig } from "../http.js";

const BASE_URL = "http://openinsider.com";

const CONFIG: SourceConfig = {
  name: "OpenInsider",
  userAgent:
    process.env.OPENINSIDER_MCP_UA ?? "openinsider-mcp 0.2.0 contact@example.com",
  defaultTtlMs: 5 * 60 * 1000,
  defaultAccept: "text/html",
};

export interface FetchOptions {
  cache?: boolean;
}

export async function fetchOpenInsider(path: string, options: FetchOptions = {}): Promise<string> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  // CONFIG has no nullStatuses, so fetchHttp resolves to a string (or throws).
  return (await fetchHttp(url, CONFIG, options))!;
}

export { clearCache } from "../cache.js";
