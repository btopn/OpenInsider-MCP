import { fetchHttp, type SourceConfig } from "../http.js";

// SEC's bot detection requires a User-Agent in the "Name email@domain" form
// (the slash/parens form returns 403). Override via OPENINSIDER_MCP_UA env var
// to identify your deployment to SEC; the default works but using your own
// contact info is the polite practice.
const CONFIG: SourceConfig = {
  name: "SEC EDGAR",
  userAgent:
    process.env.OPENINSIDER_MCP_UA ?? "openinsider-mcp 0.2.0 contact@example.com",
  defaultTtlMs: 5 * 60 * 1000,
  defaultAccept: "application/json",
  minIntervalMs: 110, // ~9 req/sec, safely under SEC's documented 10 rps limit
};

export interface EdgarFetchOptions {
  cache?: boolean;
  ttlMs?: number;
  accept?: string;
}

export async function fetchEdgar(url: string, options: EdgarFetchOptions = {}): Promise<string> {
  return (await fetchHttp(url, CONFIG, options))!;
}
