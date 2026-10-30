export interface DashboardCacheEntry<T> {
  value: T;
  updatedAt: number;
}

interface StoredEntry<T> extends DashboardCacheEntry<T> {
  expiresAt: number;
}

export const DASHBOARD_CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 64;

/** Bounded, process-local cache for dashboard snapshots; never writes to storage. */
export class DashboardMemoryCache {
  private readonly entries = new Map<string, StoredEntry<unknown>>();
  private identity: string | null = null;
  private revision = 0;

  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES, ttlMs = DASHBOARD_CACHE_TTL_MS) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  get generation(): number {
    return this.revision;
  }

  setIdentity(identity: string | null): void {
    if (identity === this.identity) return;
    this.identity = identity;
    this.clear();
  }

  get<T>(key: string, now = Date.now()): DashboardCacheEntry<T> | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return { value: entry.value as T, updatedAt: entry.updatedAt };
  }

  set<T>(key: string, value: T, expectedGeneration = this.revision, now = Date.now()): boolean {
    if (expectedGeneration !== this.revision || this.maxEntries <= 0 || this.ttlMs <= 0) return false;

    this.entries.delete(key);
    this.entries.set(key, { value, updatedAt: now, expiresAt: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return true;
  }

  clear(): void {
    this.entries.clear();
    this.revision += 1;
  }

  get size(): number {
    return this.entries.size;
  }
}

export interface DashboardIdentity {
  id?: string | null;
  role?: string | null;
  companyId?: string | null;
}

export function dashboardIdentityKey(identity: DashboardIdentity): string {
  return JSON.stringify([
    identity.id ?? 'guest',
    identity.role ?? 'GUEST',
    identity.companyId ?? null,
  ]);
}

export function dashboardDataKey(scope: string, resource: string, params?: unknown): string {
  return JSON.stringify([scope, resource, params ?? null]);
}

export const dashboardMemoryCache = new DashboardMemoryCache();

/** A scheduled poll may skip while work is active; only lifecycle cleanup aborts it. */
const ABORTED_DASHBOARD_SIGNAL = (() => {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
})();

/** Cancels a resource's prior request when its identity/filter key changes. */
export class DashboardRequestSignals {
  private readonly controllers = new Map<string, { key: string; controller: AbortController }>();
  private active = true;

  signal(resource: string, key: string): AbortSignal {
    if (!this.active) return ABORTED_DASHBOARD_SIGNAL;

    const current = this.controllers.get(resource);
    if (current?.key === key && !current.controller.signal.aborted) return current.controller.signal;

    current?.controller.abort();
    const controller = new AbortController();
    this.controllers.set(resource, { key, controller });
    return controller.signal;
  }

  activate(): void {
    this.active = true;
  }

  dispose(): void {
    this.active = false;
    this.abortAll();
  }

  abortAll(): void {
    this.controllers.forEach(({ controller }) => controller.abort());
    this.controllers.clear();
  }
}

export class SingleFlightRequest {
  private active: AbortController | null = null;

  begin(): AbortController | null {
    if (this.active && !this.active.signal.aborted) return null;
    const controller = new AbortController();
    this.active = controller;
    return controller;
  }

  finish(controller: AbortController): void {
    if (this.active === controller) this.active = null;
  }

  abort(): void {
    this.active?.abort();
    this.active = null;
  }

  get isActive(): boolean {
    return this.active !== null && !this.active.signal.aborted;
  }
}
