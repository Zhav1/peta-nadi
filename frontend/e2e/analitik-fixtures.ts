// Shared hermetic mocks for Analitik (analytics section) E2E.
// Mirrors laporan-fixtures: single /api/ branch handler, GET-only data,
// never touches live Render. No backend changes.

import type { Page } from '@playwright/test';

export const ANALITIK_COMMODITIES = ['beras', 'cabai_merah', 'bawang_merah', 'minyak_goreng'] as const;

function isoDay(offsetDaysAgo: number): string {
  const d = new Date(Date.now() - offsetDaysAgo * 86400_000);
  return d.toISOString();
}

/** Deterministic per-commodity series: same timestamps, distinct slopes/offsets. */
export function priceItems(commodity: string, count: number) {
  const idx = ANALITIK_COMMODITIES.indexOf(commodity as (typeof ANALITIK_COMMODITIES)[number]);
  const base = 10000 + Math.max(idx, 0) * 1500;
  const items = [];
  for (let i = 0; i < count; i++) {
    const jitter = ((i * 37 + Math.max(idx, 0) * 101) % 7) * 13;
    items.push({
      time: isoDay(count - i),
      commodity,
      region: 'north_sumatra',
      price_idr: Math.round(base + i * (90 + Math.max(idx, 0) * 23) + jitter),
      source: 'PIHPS',
      metadata: {},
    });
  }
  return items;
}

interface MockAnalitikOptions {
  /** Points per commodity when NO region filter is set (aggregate path). */
  fullPoints?: number;
  /** Points per commodity when a region filter IS set (thin-filter path). */
  thinPoints?: number;
  /** Spike list returned by /commodities/spikes. */
  spikes?: () => unknown[];
  /** Records-total source: prices limit=100 returns this many items. Defaults to fullPoints. */
  recordsTotal?: number;
}

const RECENT_ISO = new Date(Date.now() - 2 * 3600_000).toISOString();

/** Auth-only hermetic shim for legacy live-backend specs (m7 gate, heatmap
 * gate): poses as DISPATCHER so the guest hard-block on #nav-reports does
 * not trip the tab cycle. All non-auth /api/ traffic stays live. */
export async function mockDispatcherAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'regression-gate-token');
    } catch {
      /* ignore */
    }
  });
  const profile = {
    id: 'regression-dispatcher-1',
    company_id: 'pos_logistik',
    org_name: 'PT Samudera Logistik Sumatra',
    name: 'Regression Gate',
    email: 'regression@e2e.test',
    role: 'DISPATCHER',
    permissions: ['fleet:read', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read', 'scenarios:run'],
    is_offline_guest: false,
  };
  await page.route(/\/api\/v1\/auth\/(me|session)/, async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) }),
  );
}

/** Hermetic /api/ handler for analytics specs. Authenticated as DISPATCHER by default. */
export async function mockAnalitikApi(page: Page, opts: MockAnalitikOptions = {}): Promise<void> {
  const fullPoints = opts.fullPoints ?? 20;
  const thinPoints = opts.thinPoints ?? 5;
  await page.addInitScript(() => {
    try {
      localStorage.setItem('prehub_auth_token', 'analitik-e2e-token');
    } catch {
      /* ignore */
    }
  });
  const profile = {
    id: 'analitik-dispatcher-1',
    company_id: 'pos_logistik',
    org_name: 'PT Samudera Logistik Sumatra',
    name: 'Analitik E2E',
    email: 'analitik@e2e.test',
    role: 'DISPATCHER',
    permissions: ['fleet:read', 'heatmap:read', 'prices:read', 'reports:read', 'audit:read', 'scenarios:run'],
    is_offline_guest: false,
  };
  await page.route(/\/api\//, async (route) => {
    const req = route.request();
    const url = req.url();
    const ok = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/api/v1/auth/me')) return ok(profile);
    if (url.includes('/api/v1/auth/session')) return ok(profile);
    if (url.includes('/api/v1/commodities/prices')) {
      const u = new URL(url);
      const commodity = u.searchParams.get('commodity') ?? 'beras';
      const region = u.searchParams.get('region');
      const limit = Number(u.searchParams.get('limit') ?? '0');
      // recordsTotal probe (spike guard) always uses limit=100.
      if (limit === 100 && opts.recordsTotal != null) {
        return ok({ items: priceItems(commodity, opts.recordsTotal), total: opts.recordsTotal });
      }
      const count = region ? thinPoints : fullPoints;
      const items = priceItems(commodity, Math.min(count, limit || count));
      return ok({ items, total: items.length });
    }
    if (url.includes('/api/v1/commodities/spikes')) {
      const spikes = opts.spikes ? opts.spikes() : [];
      return ok({ spikes, total: (spikes as unknown[]).length });
    }
    if (url.includes('/api/v1/weather/spatial-polygons')) {
      return ok({ type: 'FeatureCollection', features: [] });
    }
    if (url.includes('/api/v1/fire/hotspots')) {
      return ok({ hotspots: [], total: 0, status: 'ok' });
    }
    if (url.includes('/api/v1/bnpb/events')) {
      return ok({ events: [], total: 0, status: 'ok', updated_at: RECENT_ISO });
    }
    if (url.includes('/api/v1/approvals')) return ok({ items: [], total: 0 });
    if (url.includes('/api/v1/erp/summary')) return ok({ status: 'ok', totals: {}, trips: [], per_company: [] });
    if (url.includes('/health/sources')) return ok({ sources: [] });
    return ok({ status: 'ok', items: [], total: 0, sources: [] });
  });
}
