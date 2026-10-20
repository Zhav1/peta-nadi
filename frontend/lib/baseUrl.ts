/**
 * Single source of truth for the backend base URL (browser + server).
 *
 * SPEC: Gazetteer-first, backend is peta-nadi.onrender.com. Every client path
 * (fetch, SSE, WebSocket-derived URLs, proxy) must resolve through here so a
 * stale or malformed NEXT_PUBLIC_API_URL cannot silently break map search,
 * corridor telemetry, or fleet autocomplete again.
 */

/** Canonical production backend. */
export const PRODUCTION_API_BASE_URL = 'https://peta-nadi.onrender.com';

/** Hosts that have been decommissioned; pointing at them yields 404/CORS failures. */
const DEAD_API_HOSTS = ['prehub-backend.onrender.com'];

/**
 * Normalizes an env-supplied API base URL.
 *
 * Returns null when the value is unusable so callers fall back to a known-good
 * base instead of issuing requests against a broken one. Handles the failures
 * seen in production envs: surrounding whitespace, pasted quotes, a missing
 * scheme (`peta-nadi.onrender.com`), a trailing slash (`https://host/` →
 * `//api/...` → 404), and the dead prehub-backend host.
 */
export function sanitizeBaseUrl(raw?: string | null): string | null {
  if (!raw) return null;

  let value = raw.trim();
  // Env dashboards sometimes keep the surrounding quotes from a copy/paste.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (!value) return null;

  if (!/^https?:\/\//i.test(value)) {
    // Accept scheme-less host[:port][/path]; reject anything else (relative
    // paths, `//host`, ws://, ...) because it would resolve against the Vercel
    // origin and return HTML/404 instead of JSON.
    if (!/^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(value)) return null;
    value = `https://${value}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (DEAD_API_HOSTS.some((host) => parsed.hostname.toLowerCase() === host)) return null;

  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${path}`;
}

export function getBaseUrl(): string {
  const envBase = sanitizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  if (envBase) return envBase;

  if (
    typeof window !== 'undefined' &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname)
  ) {
    return PRODUCTION_API_BASE_URL;
  }
  return 'http://localhost:8000';
}

/** Hostnames that only resolve on a dev machine. */
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'];

/** True when the current runtime is a local dev machine (not a deployed origin). */
function isLocalEnvironment(): boolean {
  if (typeof window !== 'undefined') {
    return LOCAL_HOSTNAMES.includes(window.location.hostname);
  }
  return process.env.NODE_ENV !== 'production';
}

/**
 * Normalizes an env-supplied WebSocket base URL (`NEXT_PUBLIC_WS_URL`).
 *
 * Accepts `ws://`, `wss://`, `http://`, `https://` or a scheme-less host, and
 * returns null when unusable so the caller derives the base from getBaseUrl().
 * A localhost override is rejected outside local development — the failure mode
 * this prevents is a deployed bundle shipping `ws://localhost:8000`, which in a
 * browser means "connect to the visitor's own machine" and never succeeds.
 */
export function sanitizeWsUrl(raw?: string | null): string | null {
  if (!raw) return null;

  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (!value) return null;

  const scheme = value.match(/^(wss?|https?):\/\//i)?.[1].toLowerCase();
  if (scheme) {
    if (scheme === 'http') value = `ws://${value.slice('http://'.length)}`;
    else if (scheme === 'https') value = `wss://${value.slice('https://'.length)}`;
  } else {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(value)) return null;
    value = `ws://${value}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') return null;
  if (DEAD_API_HOSTS.some((host) => parsed.hostname.toLowerCase() === host)) return null;
  if (LOCAL_HOSTNAMES.includes(parsed.hostname.toLowerCase()) && !isLocalEnvironment()) {
    return null;
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.protocol}//${parsed.host}${path}`;
}

/**
 * WebSocket origin for the same backend as getBaseUrl(), derived as
 * `https -> wss` / `http -> ws` with no trailing slash.
 *
 * `NEXT_PUBLIC_WS_URL` may override it, but only with a value that survives
 * sanitizeWsUrl(). Never falls through to a bare localhost in production: if the
 * override is unusable we take the canonical host from getBaseUrl().
 */
export function getWsBaseUrl(): string {
  const override = sanitizeWsUrl(process.env.NEXT_PUBLIC_WS_URL);
  if (override) return override;

  const base = getBaseUrl().replace(/\/+$/, '');
  if (/^https:/i.test(base)) return `wss:${base.slice('https:'.length)}`;
  if (/^http:/i.test(base)) return `ws:${base.slice('http:'.length)}`;
  return base;
}
