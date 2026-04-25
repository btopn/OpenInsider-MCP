import { cacheGet, cacheSet } from "../cache.js";

// Email-format UA matches SEC's expected style and is also accepted by FINRA's
// CDN. Override via OPENINSIDER_MCP_UA env var to identify your deployment.
const USER_AGENT =
  process.env.OPENINSIDER_MCP_UA ?? "openinsider-mcp 0.2.0 contact@example.com";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 100;

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
  // If true, return null on 404 OR 403 instead of throwing. FINRA's CloudFront
  // serves 403 (not 404) for non-existent objects, so we treat both as
  // "file missing" — useful when probing for files that may not yet be
  // published (e.g. recent settlement dates that aren't out for ~7 business
  // days). Real UA-block 403s would manifest as every URL returning null,
  // which the smoke tests catch.
  return404AsNull?: boolean;
}

export async function fetchFinra(url: string, options: FinraFetchOptions = {}): Promise<string | null> {
  const useCache = options.cache !== false;
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;

  if (useCache) {
    const hit = cacheGet<string>(url);
    if (hit !== undefined) return hit;
  }

  const text = await fetchTextWithRetry(url, options.return404AsNull === true);
  if (text === null) return null;

  if (useCache) {
    cacheSet(url, text, ttl);
  }

  return text;
}

/**
 * Binary variant for ZIP / octet-stream downloads (used for SEC FTD files,
 * which ship as cnsfails{YYYYMM}{a|b}.zip).
 */
export async function fetchFinraBinary(
  url: string,
  options: FinraFetchOptions = {},
): Promise<ArrayBuffer | null> {
  const useCache = options.cache !== false;
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;

  if (useCache) {
    const hit = cacheGet<ArrayBuffer>(url);
    if (hit !== undefined) return hit;
  }

  const buf = await fetchBinaryWithRetry(url, options.return404AsNull === true);
  if (buf === null) return null;

  if (useCache) {
    cacheSet(url, buf, ttl);
  }

  return buf;
}

async function fetchTextWithRetry(url: string, return404AsNull: boolean): Promise<string | null> {
  try {
    return await doTextFetch(url, return404AsNull);
  } catch (err) {
    if (err instanceof TransientError) {
      return await doTextFetch(url, return404AsNull);
    }
    throw err;
  }
}

async function fetchBinaryWithRetry(
  url: string,
  return404AsNull: boolean,
): Promise<ArrayBuffer | null> {
  try {
    return await doBinaryFetch(url, return404AsNull);
  } catch (err) {
    if (err instanceof TransientError) {
      return await doBinaryFetch(url, return404AsNull);
    }
    throw err;
  }
}

async function doTextFetch(url: string, return404AsNull: boolean): Promise<string | null> {
  await paceSlot();
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/plain, */*" },
  });

  if (res.status >= 500) {
    throw new TransientError(`${url} returned ${res.status}`);
  }
  if (res.status === 404 || res.status === 403) {
    if (return404AsNull) return null;
    throw new Error(
      `${url} returned ${res.status} — endpoint may have changed; needs re-verification`,
    );
  }
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }

  return await res.text();
}

async function doBinaryFetch(url: string, return404AsNull: boolean): Promise<ArrayBuffer | null> {
  await paceSlot();
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/zip, application/octet-stream, */*",
    },
  });

  if (res.status >= 500) {
    throw new TransientError(`${url} returned ${res.status}`);
  }
  if (res.status === 404 || res.status === 403) {
    if (return404AsNull) return null;
    throw new Error(
      `${url} returned ${res.status} — endpoint may have changed; needs re-verification`,
    );
  }
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }

  return await res.arrayBuffer();
}

class TransientError extends Error {}
