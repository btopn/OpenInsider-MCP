import { cacheGet, cacheSet } from "../cache.js";

const USER_AGENT = "openinsider-mcp/0.2.0 (+https://github.com/btopn/OpenInsider-MCP)";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 250;

let nextSlot = 0;

async function paceSlot(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export interface FinraFetchOptions {
  cache?: boolean;
  ttlMs?: number;
  // If true, return null on 404 instead of throwing. Useful when probing
  // for files that may not yet be published (e.g. recent settlement dates).
  return404AsNull?: boolean;
}

export async function fetchFinra(url: string, options: FinraFetchOptions = {}): Promise<string | null> {
  const useCache = options.cache !== false;
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;

  if (useCache) {
    const hit = cacheGet<string>(url);
    if (hit !== undefined) return hit;
  }

  const text = await fetchWithRetry(url, options.return404AsNull === true);
  if (text === null) return null;

  if (useCache) {
    cacheSet(url, text, ttl);
  }

  return text;
}

async function fetchWithRetry(url: string, return404AsNull: boolean): Promise<string | null> {
  try {
    return await doFetch(url, return404AsNull);
  } catch (err) {
    if (err instanceof TransientError) {
      return await doFetch(url, return404AsNull);
    }
    throw err;
  }
}

async function doFetch(url: string, return404AsNull: boolean): Promise<string | null> {
  await paceSlot();
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/plain, */*" },
  });

  if (res.status >= 500) {
    throw new TransientError(`${url} returned ${res.status}`);
  }
  if (res.status === 404) {
    if (return404AsNull) return null;
    throw new Error(
      `${url} returned 404 — endpoint may have changed; needs re-verification`,
    );
  }
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }

  return await res.text();
}

class TransientError extends Error {}
