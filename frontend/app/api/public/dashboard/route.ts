import { sanitizeBaseUrl } from '@/lib/baseUrl';
import {
  createUnknownPublicSnapshot,
  markPublicSnapshotStale,
  normalizePublicSnapshot,
  PUBLIC_DASHBOARD_SNAPSHOT_KEY,
  PublicDashboardSnapshotEnvelope,
} from '@/lib/publicSnapshot';
import type { DashboardBootstrapResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 15;

const SNAPSHOT_TIMEOUT_MS = 1800;
const PUBLIC_CACHE_CONTROL = 'public, s-maxage=15, stale-while-revalidate=45';
const UNKNOWN_CACHE_CONTROL = 'no-store';

interface SnapshotResult {
  body: unknown;
  status: number;
  cacheControl: string;
  snapshotState: string;
  version?: number;
}

let inflightPromise: Promise<SnapshotResult> | null = null;
let lastKnownGoodResult: SnapshotResult | null = null;

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

function buildEmptyHonestSnapshotEnvelope(
  reason: string,
  version: number = 1
): PublicDashboardSnapshotEnvelope {
  const nowIso = new Date().toISOString();
  return {
    schema_version: 1,
    snapshot_key: PUBLIC_DASHBOARD_SNAPSHOT_KEY,
    computed_at: null,
    stale: true,
    shadow_mode: true,
    role: 'GUEST',
    company_id: null,
    modality: null,
    version,
    reason: (reason as any) || 'degraded_live_fallback',
    source_freshness: {
      bmkg: null,
      open_meteo: null,
      firms: null,
      tomtom: null,
      bnpb: null,
    },
    coverage: {
      mainland_provinces: [
        'Aceh',
        'Sumatera Utara',
        'Sumatera Barat',
        'Riau',
        'Jambi',
        'Sumatera Selatan',
        'Bengkulu',
        'Lampung',
      ],
      province_coverage_status: 'degraded',
      road_coverage_status: 'degraded',
    },
    sections: {
      incidents: {
        status: 'ok',
        data: [] as any,
      },
      news: {
        status: 'ok',
        data: [] as any,
      },
      news_market_regime: {
        status: 'unknown',
        data: null,
      },
      fire_hotspots: {
        status: 'ok',
        data: {
          count: 0,
          total: 0,
          capped: false,
          status: 'empty',
          reason: null,
          hotspots: [],
          source: 'nasa-firms-api',
          window_hours: 24,
          updated_at: nowIso,
        },
      },
      weather_summary: {
        status: 'unknown',
        data: null,
      },
      weather_spatial_polygons: {
        status: 'ok',
        data: {
          type: 'FeatureCollection',
          features: [],
        } as any,
      },
      weather_advisory_polygons: {
        status: 'ok',
        data: {
          type: 'FeatureCollection',
          features: [],
        } as any,
      },
      corridor_context: {
        status: 'unknown',
        data: null,
      },
      corridor_contexts: {
        status: 'unknown',
        data: [],
      },
      traffic_flow_segments: {
        status: 'ok',
        data: [] as any,
      },
      disaster_reports: {
        status: 'ok',
        data: [] as any,
      },
      official_warnings: {
        status: 'ok',
        data: [] as any,
      },
      fleet: {
        status: 'ok',
        data: {
          vehicles: [],
          count: 0,
        } as any,
      },
      source_health: {
        status: 'ok',
        data: {
          bmkg_radar: { status: 'DEGRADED', last_success_at: null, age_seconds: null, ttl_seconds: 600 },
          bmkg_cap: { status: 'DEGRADED', last_success_at: null, age_seconds: null, ttl_seconds: 600 },
          firms: { status: 'DEGRADED', last_success_at: null, age_seconds: null, ttl_seconds: 900 },
          tomtom: { status: 'DEGRADED', last_success_at: null, age_seconds: null, ttl_seconds: 300 },
          petabencana: { status: 'DOWN', last_success_at: null, age_seconds: null, ttl_seconds: 900 },
          openmeteo: { status: 'DEGRADED', last_success_at: null, age_seconds: null, ttl_seconds: 900 },
          aisstream: { status: 'DEGRADED', last_success_at: null, age_seconds: null, ttl_seconds: 300 },
          adsb: { status: 'DEGRADED', last_success_at: null, age_seconds: null, ttl_seconds: 300 },
          sources: [
            { name: 'BMKG Radar & Early Warning', status: 'degraded' as const, last_seen: null },
            { name: 'NASA FIRMS Hotspots', status: 'degraded' as const, last_seen: null },
            { name: 'TomTom Traffic Flow', status: 'degraded' as const, last_seen: null },
            { name: 'BNPB / BPBD Disaster Feeds', status: 'down' as const, last_seen: null },
          ],
        } as any,
      },
    },
  };
}

async function fetchFromBackendBootstrap(timeoutMs: number): Promise<DashboardBootstrapResponse | null> {
  const backendBase =
    sanitizeBaseUrl(process.env.API_PROXY_TARGET) ||
    sanitizeBaseUrl(process.env.NEXT_PUBLIC_API_URL) ||
    'http://localhost:8000';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${backendBase}/api/v1/dashboard/bootstrap?sections=public`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return normalizePublicSnapshot(json);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function executeGetSnapshot(): Promise<SnapshotResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    const backendData = await fetchFromBackendBootstrap(1200);
    if (backendData && backendData.computed_at) {
      const version = typeof (backendData as any).version === 'number' ? (backendData as any).version : 1;
      (backendData as any).version = version;
      return {
        body: backendData,
        status: 200,
        cacheControl: PUBLIC_CACHE_CONTROL,
        snapshotState: backendData.stale ? 'stale' : 'ok',
        version,
      };
    }
    const envelope = buildEmptyHonestSnapshotEnvelope('missing_supabase_env');
    return {
      body: envelope,
      status: 200,
      cacheControl: PUBLIC_CACHE_CONTROL,
      snapshotState: 'degraded',
      version: envelope.version,
    };
  }

  const endpoint = new URL('/rest/v1/public_dashboard_snapshots', supabaseUrl);
  endpoint.searchParams.set('select', 'snapshot_key,schema_version,computed_at,payload,version');
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
      next: { revalidate: 15 },
    });

    if (response.ok) {
      const rows: unknown = await response.json();
      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0] as Record<string, unknown>;
        const payload = row.payload && typeof row.payload === 'object'
          ? row.payload as Record<string, unknown>
          : {};
        const version = typeof payload.version === 'number'
          ? payload.version
          : (typeof row.version === 'number' ? row.version : 1);

        const snapshot = normalizePublicSnapshot({
          ...payload,
          schema_version: row.schema_version,
          snapshot_key: row.snapshot_key,
          computed_at: row.computed_at,
          version,
        });
        snapshot.version = version;

        if (snapshot.computed_at !== null) {
          snapshot.stale = snapshot.stale || timestampIsStale(snapshot.computed_at);
          return {
            body: snapshot,
            status: 200,
            cacheControl: PUBLIC_CACHE_CONTROL,
            snapshotState: snapshot.stale ? 'stale' : 'ok',
            version,
          };
        }
      }
    }

    // Supabase did not return a valid computed_at row; try backend bootstrap with tight 1200ms timeout
    const backendData = await fetchFromBackendBootstrap(1200);
    if (backendData && backendData.computed_at) {
      const version = typeof (backendData as any).version === 'number' ? (backendData as any).version : 1;
      (backendData as any).version = version;
      return {
        body: backendData,
        status: 200,
        cacheControl: PUBLIC_CACHE_CONTROL,
        snapshotState: backendData.stale ? 'stale' : 'ok',
        version,
      };
    }

    if (lastKnownGoodResult) {
      const staleBody = markPublicSnapshotStale(lastKnownGoodResult.body as DashboardBootstrapResponse);
      return {
        ...lastKnownGoodResult,
        body: staleBody,
        snapshotState: 'stale',
      };
    }

    const fallbackEnvelope = buildEmptyHonestSnapshotEnvelope('supabase_and_backend_unreachable');
    return {
      body: fallbackEnvelope,
      status: 200,
      cacheControl: PUBLIC_CACHE_CONTROL,
      snapshotState: 'degraded',
      version: fallbackEnvelope.version,
    };
  } catch {
    if (lastKnownGoodResult) {
      const staleBody = markPublicSnapshotStale(lastKnownGoodResult.body as DashboardBootstrapResponse);
      return {
        ...lastKnownGoodResult,
        body: staleBody,
        snapshotState: 'stale',
      };
    }
    const fallbackEnvelope = buildEmptyHonestSnapshotEnvelope('snapshot_fetch_exception');
    return {
      body: fallbackEnvelope,
      status: 200,
      cacheControl: PUBLIC_CACHE_CONTROL,
      snapshotState: 'degraded',
      version: fallbackEnvelope.version,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const vParam = url.searchParams.get('v');
  const requestedVersion = vParam ? parseInt(vParam, 10) : NaN;

  const currentCachedVersion = typeof (lastKnownGoodResult?.body as any)?.version === 'number'
    ? (lastKnownGoodResult?.body as any).version
    : (lastKnownGoodResult?.version ?? 0);

  const bypassCache = Number.isFinite(requestedVersion) && requestedVersion > currentCachedVersion;

  if (!bypassCache && inflightPromise) {
    const res = await inflightPromise;
    return jsonResponse(res.body, res.status, res.cacheControl, res.snapshotState);
  }

  if (!bypassCache && lastKnownGoodResult && !timestampIsStale((lastKnownGoodResult.body as any)?.computed_at)) {
    return jsonResponse(
      lastKnownGoodResult.body,
      lastKnownGoodResult.status,
      lastKnownGoodResult.cacheControl,
      lastKnownGoodResult.snapshotState,
    );
  }

  inflightPromise = executeGetSnapshot();
  try {
    const res = await inflightPromise;
    lastKnownGoodResult = res;
    return jsonResponse(res.body, res.status, res.cacheControl, res.snapshotState);
  } finally {
    inflightPromise = null;
  }
}
