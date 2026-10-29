'use client';

/**
 * Unit D — public-first last-good cache.
 *
 * `prehub.news.v1` and `prehub.weather.v1` in `localStorage`, 2 h TTL, public
 * data only (fleet/ERP/auth are never cached). Versioned envelope so a schema
 * change can bump the key version and discard older entries. SSR-guarded:
 * every access is a no-op outside the browser.
 */

export const PUBLIC_NEWS_CACHE_KEY = 'prehub.news.v1';
export const PUBLIC_WEATHER_CACHE_KEY = 'prehub.weather.v1';
export const PUBLIC_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const PUBLIC_CACHE_VERSION = 1;

interface PublicCacheEnvelope<T> {
  v: number;
  at: number;
  data: T;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Read a versioned cache entry. Returns `null` when absent, expired,
 * unparseable, or written by an older envelope version — never throws.
 */
export function readPublicCache<T>(key: string, maxAgeMs: number = PUBLIC_CACHE_TTL_MS): T | null {
  const store = storage();
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PublicCacheEnvelope<T>> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.v !== PUBLIC_CACHE_VERSION) return null;
    if (typeof parsed.at !== 'number' || !Number.isFinite(parsed.at)) return null;
    if (Date.now() - parsed.at > maxAgeMs) return null;
    if (parsed.data == null) return null;
    return parsed.data as T;
  } catch {
    return null;
  }
}

/** Write a versioned cache entry. Never throws; no-op outside the browser. */
export function writePublicCache<T>(key: string, data: T): void {
  const store = storage();
  if (!store) return;
  const envelope: PublicCacheEnvelope<T> = { v: PUBLIC_CACHE_VERSION, at: Date.now(), data };
  try {
    store.setItem(key, JSON.stringify(envelope));
  } catch {
    // Quota or privacy mode: the live fetch stays the source of truth.
  }
}
