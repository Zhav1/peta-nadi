'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { FleetVehicle } from '@/lib/types';
import { api, getBaseUrl, getAuthToken } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { isLiveTracked, selectTenantVehicles } from '@/lib/fleetScope';
import { corridorSnappingService } from '@/lib/corridorSnappingService';
import { SingleFlightRequest } from '@/lib/dashboardMemoryCache';
import { isDocumentVisible, subscribeVisibility } from '@/lib/visibility';

export { isLiveTracked, isTenantAsset } from '@/lib/fleetScope';

const FALLBACK_FLEET: FleetVehicle[] = [];

export interface UseFleetVehiclesOptions {
  enableSimulationFallback?: boolean;
  /**
   * Bootstrap seed (`sections.fleet.data.vehicles`). Tenant-scoped by the backend,
   * so a DISPATCHER never receives another tenant's fleet. Skips the first
   * network fetch; the 10 s sync keeps it live afterwards.
   */
  initialVehicles?: FleetVehicle[] | null;
  /** False while the bootstrap snapshot is still loading (M8 phase 163b). */
  enabled?: boolean;
}

/**
 * Builds the fleet query string. Tenant scoping is passed explicitly so a
 * dispatcher request always carries the JWT company_id claim.
 */
function buildFleetQuery(modality?: string, company_id?: string, include_geometry: boolean = false): string {
  const sp = new URLSearchParams();
  if (modality && modality !== 'all') sp.append('modality', modality);
  if (company_id) sp.append('company_id', company_id);
  sp.append('include_geometry', String(include_geometry));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

async function fetchFleetFromPublicSnapshot(signal?: AbortSignal): Promise<FleetVehicle[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    const res = await fetch('/api/public/dashboard', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const fleetSection = json?.sections?.fleet;
    if (fleetSection && fleetSection.data && Array.isArray(fleetSection.data.vehicles)) {
      return fleetSection.data.vehicles as FleetVehicle[];
    }
    if (fleetSection && Array.isArray(fleetSection.data)) {
      return fleetSection.data as FleetVehicle[];
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

async function fetchFleetWithFallback(
  modality?: string,
  companyId?: string,
  signal?: AbortSignal
): Promise<FleetVehicle[]> {
  // Edge snapshot first: avoid calling sleeping Render backend directly for public macro awareness
  if (!companyId) {
    const publicVehicles = await fetchFleetFromPublicSnapshot(signal);
    if (publicVehicles !== null && publicVehicles.length > 0) {
      if (modality && modality !== 'all') {
        return publicVehicles.filter((v) => v.modality === modality);
      }
      return publicVehicles;
    }
  }

  try {
    const res = await api.fleet.vehicles(modality, companyId, false, signal);
    if (res.vehicles && Array.isArray(res.vehicles)) {
      return res.vehicles;
    }
    return [];
  } catch (err: unknown) {
    if (signal?.aborted) throw err;
    if (typeof window !== 'undefined') {
      try {
        // Same-origin/direct retry must keep the tenant scope: getBaseUrl() is the
        // single source of truth for the API host (no hardcoded Render URL), and
        // the bearer token keeps the server-side company_id claim intact.
        const qs = buildFleetQuery(modality, companyId, false);
        const token = getAuthToken();
        const controller = new AbortController();
        const forwardAbort = () => controller.abort();
        if (signal) {
          if (signal.aborted) controller.abort();
          else signal.addEventListener('abort', forwardAbort, { once: true });
        }
        // Tight 2500ms timeout so Render sleep never hangs the browser UI
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        try {
          const directRes = await fetch(
            `${getBaseUrl()}/api/v1/fleet/vehicles${qs}`,
            {
              signal: controller.signal,
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            }
          );
          if (directRes.ok) {
            const data = await directRes.json();
            if (data.vehicles && Array.isArray(data.vehicles)) {
              return data.vehicles;
            }
          }
        } finally {
          clearTimeout(timeoutId);
          signal?.removeEventListener('abort', forwardAbort);
        }
      } catch {
        // Direct retry failed or timed out, bubble original error
      }
    }
    throw err;
  }
}

export function useFleetVehicles(
  modality?: string,
  options?: UseFleetVehiclesOptions
) {
  const { user, role } = useAuth();
  const isDispatcher = role === 'DISPATCHER';
  // Dispatchers are strictly tenant-scoped to their JWT claim; regulators and
  // guests keep the macro situational-awareness view.
  const claimCompanyId = user?.company_id;
  const effectiveCompanyId = isDispatcher ? claimCompanyId : undefined;
  const isTenantScoped = isDispatcher && Boolean(effectiveCompanyId);
  const identityKey = JSON.stringify([user?.id ?? 'guest', role, user?.company_id ?? null, modality ?? null]);

  const enabled = options?.enabled ?? true;
  const seededVehicles = Array.isArray(options?.initialVehicles) ? options.initialVehicles : null;
  const hasSeed = seededVehicles !== null;

  const [isSimulationMode, setIsSimulationMode] = useState<boolean>(
    options?.enableSimulationFallback ?? true
  );
  const [rawVehicles, setRawVehicles] = useState<FleetVehicle[]>(seededVehicles ?? []);
  const [isLoading, setIsLoading] = useState(!hasSeed);
  const [error, setError] = useState<string | null>(null);

  const requestGateRef = useRef(new SingleFlightRequest());
  const identityKeyRef = useRef(identityKey);
  identityKeyRef.current = identityKey;
  const hasSeedRef = useRef<boolean>(hasSeed);
  hasSeedRef.current = hasSeed;

  // 90-second sliding TTL vehicle cache to prevent vessel count drops during partial polling
  const vehicleCacheRef = useRef<Map<string, { vehicle: FleetVehicle; timestamp: number }>>(new Map());

  // Cache entries and visible assets must not survive an identity/company switch.
  const previousIdentityKeyRef = useRef(identityKey);
  const refreshAfterIdentityChangeRef = useRef(false);
  useEffect(() => {
    if (previousIdentityKeyRef.current === identityKey) {
      return;
    }
    previousIdentityKeyRef.current = identityKey;
    refreshAfterIdentityChangeRef.current = true;
    vehicleCacheRef.current.clear();
    setRawVehicles([]);
    setIsLoading(true);
    setError(null);
  }, [identityKey]);

  const mergeWithCache = (incoming: FleetVehicle[]): FleetVehicle[] => {
    const now = Date.now();
    const cache = vehicleCacheRef.current;
    for (const v of incoming) {
      if (v.vehicle_id) {
        cache.set(v.vehicle_id, { vehicle: v, timestamp: now });
      }
    }
    const merged: FleetVehicle[] = [];
    cache.forEach((entry, id) => {
      if (now - entry.timestamp <= 90_000) {
        merged.push(entry.vehicle);
      } else {
        cache.delete(id);
      }
    });
    return merged;
  };

  // Seed arriving after mount (bootstrap resolves after the first render).
  useEffect(() => {
    if (!seededVehicles) return;
    const seededMerge = mergeWithCache(seededVehicles);
    setRawVehicles((prev) => (prev.length > 0 ? prev : seededMerge));
    setError(null);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seededVehicles]);

  const fetchFleet = useCallback(async () => {
    const controller = requestGateRef.current.begin();
    if (!controller) return;
    try {
      const vehicles = await fetchFleetWithFallback(modality, effectiveCompanyId, controller.signal);
      if (controller.signal.aborted || identityKeyRef.current !== identityKey) return;
      const merged = mergeWithCache(vehicles);
      if (merged.length > 0) {
        setRawVehicles(merged);
        setError(null);
      } else {
        // Retain existing cached vehicles instead of clearing rawVehicles to empty
        const cached = mergeWithCache([]);
        setRawVehicles((prev) => (cached.length > 0 ? cached : prev.length > 0 ? prev : []));
      }
    } catch (err: unknown) {
      if (controller.signal.aborted || identityKeyRef.current !== identityKey) return;
      // PRESERVE previous live units from 90s cache across transient network/cold-start errors!
      const cached = mergeWithCache([]);
      setRawVehicles((prev) => (cached.length > 0 ? cached : prev.length > 0 ? prev : []));
      setError(err instanceof Error ? err.message : 'Gagal memuat telemetri armada');
    } finally {
      requestGateRef.current.finish(controller);
      if (!controller.signal.aborted && identityKeyRef.current === identityKey) setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modality, effectiveCompanyId, identityKey]);

  useEffect(() => {
    if (!enabled) return;
    const requestGate = requestGateRef.current;
    let isMounted = true;

    async function initialFetch() {
      const controller = requestGate.begin();
      if (!controller) return;
      let lastErr: unknown = null;
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (!isMounted || controller.signal.aborted || identityKeyRef.current !== identityKey) return;
          try {
            const vehicles = await fetchFleetWithFallback(modality, effectiveCompanyId, controller.signal);
            if (isMounted && !controller.signal.aborted && identityKeyRef.current === identityKey) {
              const merged = mergeWithCache(vehicles);
              if (merged.length > 0) {
                setRawVehicles(merged);
                setError(null);
              } else {
                // Retain existing cached vehicles instead of clearing rawVehicles to empty
                const cached = mergeWithCache([]);
                setRawVehicles((prev) => (cached.length > 0 ? cached : prev.length > 0 ? prev : []));
              }
              setIsLoading(false);
              return;
            }
          } catch (err: unknown) {
            lastErr = err;
            if (attempt < 2) {
              const backoffMs = attempt === 0 ? 1500 : 3000;
              await new Promise((r) => setTimeout(r, backoffMs));
            }
          }
        }

        if (isMounted && !controller.signal.aborted && identityKeyRef.current === identityKey) {
          // Retain any cached vehicles if available, otherwise fallback handles display
          const cached = mergeWithCache([]);
          setRawVehicles((prev) => (cached.length > 0 ? cached : prev.length > 0 ? prev : []));
          setError(lastErr instanceof Error ? lastErr.message : 'Gagal memuat telemetri armada');
          setIsLoading(false);
        }
      } finally {
        requestGate.finish(controller);
      }
    }

    // Seeded by the bootstrap snapshot: no duplicate mount request, the 10 s
    // sync takes over immediately. Identity changes need a fresh read even when
    // the prior identity had seeded the hook.
    const identityChanged = refreshAfterIdentityChangeRef.current;
    refreshAfterIdentityChangeRef.current = false;
    if (!hasSeedRef.current || identityChanged) void initialFetch();

    const tick = () => {
      if (!isDocumentVisible()) return;
      void fetchFleet();
    };
    const interval = setInterval(tick, 10000); // 10s sync
    const unsubscribe = subscribeVisibility((visible) => {
      if (visible) tick();
    });

    return () => {
      isMounted = false;
      clearInterval(interval);
      unsubscribe();
      requestGate.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modality, effectiveCompanyId, isDispatcher, enabled, identityKey]);

  // Evaluate whether a vehicle has an active hardware transponder or live GPS ping
  const isTransponderActive = (v: FleetVehicle): boolean => {
    // Allow aircraft to pass isTransponderActive
    const isPlane =
      (v as any).type === 'plane' ||
      (v as any).vehicle_type === 'AIR_CARGO' ||
      (v as any).id?.startsWith('AIR-') ||
      (v as any).vehicle_id?.startsWith('AIR-') ||
      v.telemetry_source === 'SUMATRA_AIR_CORRIDOR';
    if (isPlane) {
      return true;
    }

    // Exclude synthetic dead-reckoning and estimated routes from live hardware transponder mode
    if (
      v.tracking_mode === 'ROUTE_ESTIMATED' ||
      v.signal_status === 'SIMULATION_CACHE' ||
      v.telemetry_source === 'ROUTE_ESTIMATED'
    ) {
      return false;
    }
    if (v.tracking_mode === 'LIVE_GPS') return true;
    if (v.signal_status === 'LIVE_STREAM') return true;
    const liveSources = [
      'AIS_LIVE',
      'ADSB_LIVE',
      'OPENSKY_NETWORK',
      'PELINDO_SUMATRA_RADAR',
      'LIVE_GPS',
      'TMS_GPS_WEBHOOK',
      'CUSTOM_DISPATCHER',
      'SUMATRA_AIR_CORRIDOR',
    ];
    if (v.telemetry_source && liveSources.includes(v.telemetry_source)) return true;
    if (Boolean(v.mmsi || v.icao24)) return true;
    return false;
  };

  // --- Tenant scoping -------------------------------------------------------
  // Dispatcher roster honesty: tenantVehicles stays strictly tenant-scoped.
  // Trucks must never leak across tenants, so the roster never fills with
  // FALLBACK_FLEET trucks. Maritime/air are public AIS/ADS-B situational
  // awareness (pre-Phase-81 behavior): they ride along in the map/pills as
  // non-tenant vessels, never counted as Perusahaan Live GPS.
  const tenantVehicles: FleetVehicle[] = isDispatcher
    ? selectTenantVehicles(rawVehicles, effectiveCompanyId)
    : rawVehicles;

  // Tenant assets split by tracking fidelity. The map draws LIVE_GPS only;
  // ROUTE_ESTIMATED rows stay discoverable in the roster only, no badge, but are
  // never drawn as orange corridor lines by default.
  const liveTenantVehicles = tenantVehicles.filter(isLiveTracked);
  const estimatedTenantVehicles = tenantVehicles.filter(
    (v) => v.tracking_mode === 'ROUTE_ESTIMATED'
  );

  // Situational vessels: maritime/air from the backend macro feed that do not
  // belong to this tenant (is_tenant_asset === false). Trucks are excluded by
  // construction — no cross-tenant live GPS leak. No claim => honest empty
  // (never backfill vessels for a claim-less session).
  const situationalVessels: FleetVehicle[] =
    isDispatcher && effectiveCompanyId
      ? rawVehicles.filter(
          (v) =>
            (v.modality === 'maritime' || v.modality === 'air') &&
            (v as any).is_tenant_asset !== true &&
            !tenantVehicles.some((t) => t.vehicle_id === v.vehicle_id)
        )
      : [];

  // Honest vessel fallback: never synthesize fake fallback vessels or aircraft in client hook
  const fallbackVessels: FleetVehicle[] = [];

  // Dispatcher map/pills = live tenant trucks + live tenant vessels + public
  // situational vessels + vessel fallback. Perusahaan Live GPS badge stays
  // liveTenantVehicles only (see DashboardClient).
  const dispatcherCombinedVehicles: FleetVehicle[] = [
    ...liveTenantVehicles,
    ...situationalVessels,
    ...fallbackVessels,
  ];

  const baseVehicles: FleetVehicle[] = isDispatcher
    ? tenantVehicles
    : (modality && modality !== 'all' ? rawVehicles.filter((v) => v.modality === modality) : rawVehicles);

  const customVehicles = baseVehicles.filter(
    (v) =>
      v.telemetry_source === 'CUSTOM_DISPATCHER' ||
      v.telemetry_source === 'TMS_GPS_WEBHOOK' ||
      (v as any).is_custom === true
  );

  // When isSimulationMode is true: "Semua Armada Live & Rute Terestimasikan" (all active multimodal units)
  // When isSimulationMode is false: "Hanya Transponder & GPS Aktif"
  // STILL keeps AIS_LIVE, ADSB_LIVE, OPENSKY_NETWORK, PELINDO_SUMATRA_RADAR, LIVE_GPS, TMS_GPS_WEBHOOK, and CUSTOM_DISPATCHER visible - NEVER an empty []!
  // Dispatchers never get this toggle: their view is always the combined
  // live-tenant + situational-vessel slice (trucks tenant-scoped).
  const transponderSource = isDispatcher ? dispatcherCombinedVehicles : baseVehicles;
  const transponderOnlyVehicles = transponderSource.filter(isTransponderActive);
  const vehicles: FleetVehicle[] = isDispatcher
    ? dispatcherCombinedVehicles
    : isSimulationMode
      ? baseVehicles
      : (transponderOnlyVehicles.length > 0 ? transponderOnlyVehicles : baseVehicles);

  return {
    vehicles,
    isLoading,
    error,
    refetch: fetchFleet,
    customCount: customVehicles.length,
    activeTransponderCount: transponderOnlyVehicles.length,
    totalCount: baseVehicles.length,
    isSimulationMode: isDispatcher ? false : isSimulationMode,
    setIsSimulationMode,
    // Tenant/diagnostics surface for honest empty states + roster
    isDispatcher,
    isTenantScoped,
    companyId: effectiveCompanyId ?? null,
    tenantVehicles: isDispatcher ? tenantVehicles : baseVehicles,
    liveTenantVehicles,
    estimatedTenantVehicles,
    tenantAssetCount: isDispatcher ? tenantVehicles.length : baseVehicles.length,
    hasTenantAssets: isDispatcher ? tenantVehicles.length > 0 : baseVehicles.length > 0,
    canToggleSimulation: !isDispatcher,
  };
}
