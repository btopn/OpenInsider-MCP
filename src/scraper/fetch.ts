const BASE_URL = "http://openinsider.com";
const CACHE_TTL_MS = 5 * 60 * 1000;
const USER_AGENT = "openinsider-mcp/0.1.0 (+https://github.com/btopn/openinsider-mcp)";

interface CacheEntry {
  html: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export interface FetchOptions {
  cache?: boolean;
}

export async function fetchOpenInsider(path: string, options: FetchOptions = {}): Promise<string> {
  const useCache = options.cache !== false;
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;

  if (useCache) {
    const hit = cache.get(url);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.html;
    }
  }

  const html = await fetchWithRetry(url);

  if (useCache) {
    cache.set(url, { html, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return html;
}

async function fetchWithRetry(url: string): Promise<string> {
  try {
    return await doFetch(url);
  } catch (err) {
    if (err instanceof TransientError) {
      return await doFetch(url);
    }
    throw err;
  }
}

async function doFetch(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });

  if (res.status >= 500) {
    throw new TransientError(`OpenInsider returned ${res.status} for ${url}`);
  }
  if (!res.ok) {
    throw new Error(`OpenInsider returned ${res.status} for ${url}`);
  }

  return await res.text();
}

class TransientError extends Error {}

export function clearCache(): void {
  cache.clear();
}
