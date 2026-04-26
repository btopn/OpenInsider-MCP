import { cacheGet, cacheSet } from "./cache.js";

/**
 * Shared rate-paced HTTP fetcher used by all data sources (OpenInsider, SEC
 * EDGAR, FINRA). Each source supplies a `SourceConfig` with its own UA,
 * defaults, and rate-pace interval; per-call options can override defaults.
 */
export interface HttpFetchOptions {
  /** Skip the cache for this call. Default: cache enabled. */
  cache?: boolean;
  /** Override the source's default cache TTL. */
  ttlMs?: number;
  /** Override the source's default Accept header. */
  accept?: string;
  /**
   * HTTP statuses that resolve to `null` instead of throwing. Defaults to the
   * source's `defaultNullStatuses`. Used by FINRA where 403 = file missing.
   */
  nullStatuses?: number[];
}

export interface SourceConfig {
  /** Identifier used in error messages and as the rate-pace key. */
  name: string;
  /** Sent as the User-Agent header on every request. */
  userAgent: string;
  /** Default cache TTL in ms. Callers can override per-call via `ttlMs`. */
  defaultTtlMs: number;
  /** Default Accept header. Callers can override per-call via `accept`. */
  defaultAccept: string;
  /** Minimum ms between requests for this source (rate pacing). 0 = no pacing. */
  minIntervalMs?: number;
  /** Statuses resolved to null. Callers can override per-call via `nullStatuses`. */
  defaultNullStatuses?: number[];
}

class TransientError extends Error {}

// Per-source rate-pace state, keyed by source name so each source has
// independent throttling and crosstalk doesn't slow the others down.
const nextSlotByName = new Map<string, number>();

async function paceSlot(name: string, minIntervalMs: number): Promise<void> {
  if (minIntervalMs <= 0) return;
  const now = Date.now();
  const next = nextSlotByName.get(name) ?? 0;
  const wait = Math.max(0, next - now);
  nextSlotByName.set(name, Math.max(now, next) + minIntervalMs);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function doFetch(
  url: string,
  config: SourceConfig,
  options: HttpFetchOptions,
  asBinary: boolean,
): Promise<string | ArrayBuffer | null> {
  await paceSlot(config.name, config.minIntervalMs ?? 0);
  const accept = options.accept ?? config.defaultAccept;
  const res = await fetch(url, {
    headers: { "User-Agent": config.userAgent, Accept: accept },
  });

  if (res.status >= 500) {
    throw new TransientError(`${config.name} returned ${res.status} for ${url}`);
  }

  const nullStatuses = options.nullStatuses ?? config.defaultNullStatuses ?? [];
  if (nullStatuses.includes(res.status)) return null;

  if (!res.ok) {
    throw new Error(`${config.name} returned ${res.status} for ${url}`);
  }

  return asBinary ? await res.arrayBuffer() : await res.text();
}

async function fetchWithRetry(
  url: string,
  config: SourceConfig,
  options: HttpFetchOptions,
  asBinary: boolean,
): Promise<string | ArrayBuffer | null> {
  try {
    return await doFetch(url, config, options, asBinary);
  } catch (err) {
    if (err instanceof TransientError) {
      return await doFetch(url, config, options, asBinary);
    }
    throw err;
  }
}

/**
 * Fetch a URL as text with rate-pacing, caching, and retry-once-on-5xx.
 * Returns `null` only if the response status matches `nullStatuses`.
 */
export async function fetchHttp(
  url: string,
  config: SourceConfig,
  options: HttpFetchOptions = {},
): Promise<string | null> {
  const useCache = options.cache !== false;
  const ttl = options.ttlMs ?? config.defaultTtlMs;

  if (useCache) {
    const hit = cacheGet<string>(url);
    if (hit !== undefined) return hit;
  }

  const text = (await fetchWithRetry(url, config, options, false)) as string | null;
  if (text === null) return null;

  if (useCache) cacheSet(url, text, ttl);
  return text;
}

/**
 * Binary variant of `fetchHttp` for ZIP / octet-stream downloads.
 */
export async function fetchHttpBinary(
  url: string,
  config: SourceConfig,
  options: HttpFetchOptions = {},
): Promise<ArrayBuffer | null> {
  const useCache = options.cache !== false;
  const ttl = options.ttlMs ?? config.defaultTtlMs;

  if (useCache) {
    const hit = cacheGet<ArrayBuffer>(url);
    if (hit !== undefined) return hit;
  }

  const buf = (await fetchWithRetry(url, config, options, true)) as ArrayBuffer | null;
  if (buf === null) return null;

  if (useCache) cacheSet(url, buf, ttl);
  return buf;
}
