import { cacheGet, cacheSet } from "../cache.js";

const USER_AGENT = "openinsider-mcp/0.2.0 (+https://github.com/btopn/OpenInsider-MCP)";
const MIN_INTERVAL_MS = 110;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

let nextSlot = 0;

async function paceSlot(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export interface EdgarFetchOptions {
  cache?: boolean;
  ttlMs?: number;
  accept?: string;
}

export async function fetchEdgar(url: string, options: EdgarFetchOptions = {}): Promise<string> {
  const useCache = options.cache !== false;
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const accept = options.accept ?? "application/json";

  if (useCache) {
    const hit = cacheGet<string>(url);
    if (hit !== undefined) return hit;
  }

  const text = await fetchWithRetry(url, accept);

  if (useCache) {
    cacheSet(url, text, ttl);
  }

  return text;
}

async function fetchWithRetry(url: string, accept: string): Promise<string> {
  try {
    return await doFetch(url, accept);
  } catch (err) {
    if (err instanceof TransientError) {
      return await doFetch(url, accept);
    }
    throw err;
  }
}

async function doFetch(url: string, accept: string): Promise<string> {
  await paceSlot();
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: accept },
  });

  if (res.status >= 500) {
    throw new TransientError(`SEC EDGAR returned ${res.status} for ${url}`);
  }
  if (!res.ok) {
    throw new Error(`SEC EDGAR returned ${res.status} for ${url}`);
  }

  return await res.text();
}

class TransientError extends Error {}
