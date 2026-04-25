interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit || hit.expiresAt <= Date.now()) {
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearCache(): void {
  cache.clear();
}
