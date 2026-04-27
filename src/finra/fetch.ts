import { fetchHttp, fetchHttpBinary, type SourceConfig } from "../http.js";

// Email-format UA matches SEC's expected style and is also accepted by FINRA's
// CDN. Override via OPENINSIDER_MCP_UA env var.
const CONFIG: SourceConfig = {
  name: "FINRA",
  userAgent:
    process.env.OPENINSIDER_MCP_UA ?? "openinsider-mcp 0.2.0 contact@example.com",
  defaultTtlMs: 5 * 60 * 1000,
  defaultAccept: "text/plain, */*",
  minIntervalMs: 100,
};

export interface FinraFetchOptions {
  cache?: boolean;
  // If true, return null on 404 OR 403 instead of throwing. FINRA's CloudFront
  // serves 403 (not 404) for non-existent objects, so we treat both as "file
  // missing" — useful when probing for files that may not yet be published
  // (e.g. recent settlement dates that aren't out for ~7 business days). Real
  // UA-block 403s would manifest as every URL returning null, which the smoke
  // tests catch.
  return404AsNull?: boolean;
}

export async function fetchFinra(
  url: string,
  options: FinraFetchOptions = {},
): Promise<string | null> {
  return await fetchHttp(url, CONFIG, {
    cache: options.cache,
    nullStatuses: options.return404AsNull ? [403, 404] : undefined,
  });
}

export async function fetchFinraBinary(
  url: string,
  options: FinraFetchOptions = {},
): Promise<ArrayBuffer | null> {
  return await fetchHttpBinary(url, CONFIG, {
    cache: options.cache,
    accept: "application/zip, application/octet-stream, */*",
    nullStatuses: options.return404AsNull ? [403, 404] : undefined,
  });
}
