import {
  createUnknownPublicSnapshot,
  normalizePublicSnapshot,
  PUBLIC_DASHBOARD_SNAPSHOT_KEY,
} from '@/lib/publicSnapshot';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

const SNAPSHOT_TIMEOUT_MS = 1800;
const PUBLIC_CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=60';
const UNKNOWN_CACHE_CONTROL = 'no-store';

function jsonResponse(
  body: unknown,
  status: number,
  cacheControl: string,
  snapshotState: string,
): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': cacheControl,
      'X-Public-Snapshot-State': snapshotState,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function timestampIsStale(computedAt: string | null): boolean {
  if (!computedAt) return false;
  const stamp = Date.parse(computedAt);
  return !Number.isFinite(stamp) || Date.now() - stamp > 10 * 60_000;
}

export async function GET(): Promise<Response> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return jsonResponse(createUnknownPublicSnapshot(), 503, UNKNOWN_CACHE_CONTROL, 'configuration_unknown');
  }

  const endpoint = new URL('/rest/v1/public_dashboard_snapshots', supabaseUrl);
  endpoint.searchParams.set('select', 'snapshot_key,schema_version,computed_at,payload');
  endpoint.searchParams.set('snapshot_key', `eq.${PUBLIC_DASHBOARD_SNAPSHOT_KEY}`);
  endpoint.searchParams.set('limit', '1');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
      cache: 'force-cache',
      next: { revalidate: 30 },
    });
    if (!response.ok) {
      return jsonResponse(createUnknownPublicSnapshot(), 503, UNKNOWN_CACHE_CONTROL, 'upstream_unknown');
    }
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return jsonResponse(createUnknownPublicSnapshot(), 200, PUBLIC_CACHE_CONTROL, 'missing');
    }
    const row = rows[0] as Record<string, unknown>;
    const payload = row.payload && typeof row.payload === 'object'
      ? row.payload as Record<string, unknown>
      : {};
    const snapshot = normalizePublicSnapshot({
      ...payload,
      schema_version: row.schema_version,
      snapshot_key: row.snapshot_key,
      computed_at: row.computed_at,
    });
    if (snapshot.computed_at === null) {
      return jsonResponse(createUnknownPublicSnapshot(), 503, UNKNOWN_CACHE_CONTROL, 'invalid');
    }
    snapshot.stale = snapshot.stale || timestampIsStale(snapshot.computed_at);
    return jsonResponse(snapshot, 200, PUBLIC_CACHE_CONTROL, snapshot.stale ? 'stale' : 'ok');
  } catch {
    return jsonResponse(createUnknownPublicSnapshot(), 503, UNKNOWN_CACHE_CONTROL, 'upstream_unknown');
  } finally {
    clearTimeout(timeout);
  }
}
