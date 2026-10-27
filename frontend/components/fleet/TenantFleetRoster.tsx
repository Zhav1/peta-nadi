'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Truck,
  Ship,
  Plane,
  Radio,
  PlusCircle,
  ChevronUp,
  AlertTriangle,
  Loader2,
  X,
  MapPin,
  Crosshair,
  ShieldAlert,
  Route,
} from 'lucide-react';
import type { FleetVehicle, TravelRecord } from '@/lib/types';
import { getVehicleFix, isTenantAsset } from '@/lib/fleetScope';
import { api } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/base-ui/table';
import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog';

export interface VehicleHazardExposure {
  hazardType?: string;
  distanceKm?: number;
  policy?: string;
}

export interface TenantFleetRosterProps {
  isOpen: boolean;
  onClose: () => void;
  /** All assets owned by the signed-in dispatcher's perusahaan (live + projected). */
  vehicles: FleetVehicle[];
  /** Strictly live-GPS tenant assets. Kept separate so the header can state both numbers. */
  liveVehicles: FleetVehicle[];
  isLoading?: boolean;
  error?: string | null;
  /** False when the dispatcher JWT carries no company_id claim. */
  isTenantScoped: boolean;
  companyId?: string | null;
  /** Active disruption exposure keyed by vehicle_id (only when a DSS assessment exists). */
  hazardByVehicleId?: Record<string, VehicleHazardExposure>;
  /** Optional: focus the unit on the map (closes the drawer first). */
  onFocusVehicle?: (vehicle: FleetVehicle) => void;
  onOpenOnboarding: () => void;
}

type SortKey = 'name' | 'status';
type SortDirection = 'asc' | 'desc';

const MODALITY_LABEL: Record<string, string> = {
  truck: 'truk',
  maritime: 'kapal',
  air: 'udara',
};

const STATUS_RANK: Record<string, number> = {
  rerouting: 0,
  delayed: 0,
  moving: 1,
  anchored: 2,
};

function modalityIcon(modality: FleetVehicle['modality']) {
  if (modality === 'maritime') return <Ship className="w-3.5 h-3.5 text-slate-400" />;
  if (modality === 'air') return <Plane className="w-3.5 h-3.5 text-slate-400" />;
  return <Truck className="w-3.5 h-3.5 text-slate-400" />;
}

function provenanceLabel(vehicle: FleetVehicle): 'live' | 'estimasi rute' {
  return vehicle.tracking_mode === 'LIVE_GPS' ? 'live' : 'estimasi rute';
}

function statusLabel(vehicle: FleetVehicle): string {
  const status = String(vehicle.status || '');
  if (status === 'moving') return 'bergerak';
  if (status === 'anchored') return 'berhenti';
  if (status === 'rerouting' || status === 'delayed') return 'terganggu';
  return status || 'tidak diketahui';
}

/** Relative age of the last hardware ping. Never invented when the server omits it. */
export function gpsAgeLabel(vehicle: FleetVehicle): string {
  if (vehicle.tracking_mode !== 'LIVE_GPS') return 'estimasi';
  const seconds = vehicle.last_ping_seconds_ago;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} dtk lalu`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} mnt lalu`;
  return `${(seconds / 3600).toFixed(1)} jam lalu`;
}

function identifier(vehicle: FleetVehicle): string {
  return vehicle.license_plate || vehicle.vin || vehicle.mmsi || vehicle.icao24 || vehicle.vehicle_id;
}

function corridorLabel(vehicle: FleetVehicle): string | null {
  if (vehicle.origin && vehicle.destination) return `${vehicle.origin} → ${vehicle.destination}`;
  if (vehicle.origin) return `dari ${vehicle.origin}`;
  if (vehicle.destination) return `menuju ${vehicle.destination}`;
  return null;
}

function formatCoordinate(value: number): string {
  return value.toFixed(4);
}

function isSameLocalDay(iso: string | undefined, reference: Date): boolean {
  if (!iso) return false;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  return (
    parsed.getFullYear() === reference.getFullYear() &&
    parsed.getMonth() === reference.getMonth() &&
    parsed.getDate() === reference.getDate()
  );
}

/**
 * Fleet roster for dispatcher sessions (perusahaan-scoped) — right-side drawer.
 *
 * The map draws live assets only. The drawer is the honest inventory of
 * everything the dispatcher onboarded, including projected units waiting for a
 * hardware fix. Every number is labelled: `{total} unit · {live} live GPS`, and
 * units with no coordinates are counted explicitly instead of being pinned to a
 * fabricated map point.
 */
export function TenantFleetRoster({
  isOpen,
  onClose,
  vehicles,
  liveVehicles,
  isLoading = false,
  error = null,
  isTenantScoped,
  companyId,
  hazardByVehicleId,
  onFocusVehicle,
  onOpenOnboarding,
}: TenantFleetRosterProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [trips, setTrips] = useState<TravelRecord[]>([]);
  const [tripsState, setTripsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [tripsFor, setTripsFor] = useState<string | null>(null);

  // Tenant isolation guard: rows only exist for the authenticated claim.
  const scopedVehicles = useMemo(
    () => (isTenantScoped ? vehicles.filter((v) => isTenantAsset(v, companyId)) : []),
    [vehicles, isTenantScoped, companyId],
  );

  const liveCount = useMemo(() => {
    if (!isTenantScoped) return 0;
    const scopedIds = new Set(scopedVehicles.map((v) => v.vehicle_id));
    return liveVehicles.filter((v) => scopedIds.has(v.vehicle_id)).length;
  }, [liveVehicles, scopedVehicles, isTenantScoped]);

  const unknownLocationCount = useMemo(
    () => scopedVehicles.filter((v) => !getVehicleFix(v)).length,
    [scopedVehicles],
  );

  const sorted = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...scopedVehicles].sort((a, b) => {
      if (sortKey === 'name') {
        return (a.name || a.vehicle_id).localeCompare(b.name || b.vehicle_id) * direction;
      }
      const rankA = STATUS_RANK[String(a.status)] ?? 3;
      const rankB = STATUS_RANK[String(b.status)] ?? 3;
      if (rankA !== rankB) return (rankA - rankB) * direction;
      return (a.name || a.vehicle_id).localeCompare(b.name || b.vehicle_id);
    });
  }, [scopedVehicles, sortKey, sortDirection]);

  const selectedVehicle = useMemo(
    () => scopedVehicles.find((v) => v.vehicle_id === selectedVehicleId) ?? null,
    [scopedVehicles, selectedVehicleId],
  );

  // Drawer close resets transient selection + trip cache.
  useEffect(() => {
    if (isOpen) return;
    setSelectedVehicleId(null);
    setTrips([]);
    setTripsState('idle');
    setTripsFor(null);
  }, [isOpen]);

  // Selected unit disappearing from the roster (restricted role switch / refresh).
  useEffect(() => {
    if (selectedVehicleId && !scopedVehicles.some((v) => v.vehicle_id === selectedVehicleId)) {
      setSelectedVehicleId(null);
    }
  }, [scopedVehicles, selectedVehicleId]);

  // Today's rits reuse the existing travel ledger endpoint. Never invent a route:
  // non-truck modalities have no rit row, and a failed read is reported as such.
  useEffect(() => {
    if (!isOpen || !selectedVehicle) return;
    if (selectedVehicle.modality !== 'truck') {
      setTrips([]);
      setTripsState('idle');
      setTripsFor(null);
      return;
    }
    let cancelled = false;
    setTripsState('loading');
    setTripsFor(selectedVehicle.vehicle_id);
    setTrips([]);
    api.fleet
      .listTravels({ truck_id: selectedVehicle.vehicle_id, limit: 20 })
      .then((res) => {
        if (cancelled) return;
        const today = new Date();
        const rows = (res?.items ?? []).filter((item) =>
          isSameLocalDay(item.created_at || item.updated_at, today),
        );
        setTrips(rows);
        setTripsState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setTrips([]);
        setTripsState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedVehicle]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDirection === 'asc' ? '↑' : '↓') : '');

  const handleFocus = (vehicle: FleetVehicle) => {
    if (!onFocusVehicle) return;
    onClose();
    onFocusVehicle(vehicle);
  };

  const hazard = selectedVehicle ? hazardByVehicleId?.[selectedVehicle.vehicle_id] : undefined;
  const fix = selectedVehicle ? getVehicleFix(selectedVehicle) : null;

  return (
    <BaseAlertDialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop
          data-slot="armada-drawer-backdrop"
          className="fixed inset-0 z-[95] bg-[#080d14]/80"
        />
        <BaseAlertDialog.Popup
          data-testid="armada-drawer"
          data-slot="armada-drawer-content"
          aria-label="Armada Perusahaan"
          className="fixed top-0 right-0 bottom-0 z-[100] w-full max-w-2xl bg-[#0c1017] border-l border-white/10 shadow-2xl flex flex-col text-xs text-slate-200 tabular-nums outline-none"
        >
          {/* Header — both numbers stated, never one unlabelled badge. */}
          <div className="p-4 border-b border-white/10 flex items-start justify-between gap-3 bg-[#0c1017]">
            <div className="flex items-start gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                <Radio className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <BaseAlertDialog.Title className="text-sm font-bold text-white">
                  Armada Perusahaan
                </BaseAlertDialog.Title>
                <p className="text-xs text-slate-400 truncate" title={companyId ?? undefined}>
                  {companyId ? `Perusahaan ${companyId}` : 'Sesi tanpa klaim perusahaan'}
                </p>
                {isTenantScoped && (
                  <p className="text-xs text-slate-300 mt-1" data-testid="armada-counts">
                    {scopedVehicles.length} unit · {liveCount} live GPS
                  </p>
                )}
                {isTenantScoped && unknownLocationCount > 0 && (
                  <p className="text-xs text-amber-300/90 mt-0.5" data-testid="armada-unknown-location-count">
                    {unknownLocationCount} unit tanpa lokasi
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup panel Armada Perusahaan"
              className="cursor-pointer p-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading && scopedVehicles.length === 0 && (
              <div className="flex items-center gap-2 px-4 py-4 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Memuat armada perusahaan…
              </div>
            )}

            {!isLoading && !isTenantScoped && (
              <div className="px-4 py-4 text-xs text-slate-300 flex items-start gap-2" data-testid="armada-tenant-claim-notice">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-300" />
                <span>
                  Sesi Dispatcher tidak memiliki klaim <code className="font-mono">company_id</code>. Armada
                  tidak dapat ditampilkan sampai perusahaan Anda ditetapkan.
                </span>
              </div>
            )}

            {!isLoading && isTenantScoped && scopedVehicles.length === 0 && (
              <div className="px-4 py-4 space-y-2">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Belum ada armada terdaftar untuk perusahaan{' '}
                  <span className="font-mono text-slate-200">{companyId}</span>.
                </p>
                {error && <p className="text-xs text-slate-400">{error}</p>}
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  className="cursor-pointer flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white text-[#080d14] text-xs font-medium hover:bg-slate-200 transition"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Tambah armada
                </button>
              </div>
            )}

            {isTenantScoped && sorted.length > 0 && (
              <div className="border-b border-white/10">
                <Table className="w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-9 bg-[#0c1017] font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort('name')}
                          className="cursor-pointer flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white"
                          aria-label="Urutkan berdasarkan nama unit"
                        >
                          Unit <span aria-hidden="true">{sortIndicator('name')}</span>
                        </button>
                      </TableHead>
                      <TableHead className="h-9 bg-[#0c1017] font-medium">Plat / ID</TableHead>
                      <TableHead className="h-9 bg-[#0c1017] font-medium">Modalitas</TableHead>
                      <TableHead className="h-9 bg-[#0c1017] font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort('status')}
                          className="cursor-pointer flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white"
                          aria-label="Urutkan berdasarkan status"
                        >
                          Status <span aria-hidden="true">{sortIndicator('status')}</span>
                        </button>
                      </TableHead>
                      <TableHead className="h-9 bg-[#0c1017] font-medium">GPS terakhir</TableHead>
                      <TableHead className="h-9 bg-[#0c1017] font-medium">Provenance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((v) => {
                      const isSelected = selectedVehicleId === v.vehicle_id;
                      const provenance = provenanceLabel(v);
                      return (
                        <TableRow
                          key={v.vehicle_id}
                          data-testid={`armada-row-${v.vehicle_id}`}
                          data-state={isSelected ? 'selected' : undefined}
                          onClick={() => setSelectedVehicleId(v.vehicle_id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedVehicleId(v.vehicle_id);
                            }
                          }}
                          tabIndex={0}
                          className="hover:bg-white/5 cursor-pointer data-[state=selected]:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                        >
                          <TableCell className="py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {modalityIcon(v.modality)}
                              <span className="min-w-0">
                                <span className="block text-xs text-slate-100 truncate">{v.name || v.vehicle_id}</span>
                                <span className="block text-xs tabular-nums text-slate-500 truncate">
                                  {v.speed_kmh ? `${Math.round(v.speed_kmh)} km/j` : 'kecepatan tidak diketahui'}
                                </span>
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2 font-mono text-xs text-slate-300">
                            {identifier(v)}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-slate-300">
                            {MODALITY_LABEL[v.modality] ?? v.modality}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-slate-300">
                            {statusLabel(v)}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-slate-400">
                            {gpsAgeLabel(v)}
                          </TableCell>
                          <TableCell className="py-2">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs ${
                                provenance === 'live' ? 'text-emerald-300' : 'text-slate-400'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  provenance === 'live' ? 'bg-emerald-400' : 'bg-slate-500'
                                }`}
                              />
                              {provenance}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Per-vehicle detail — inside the drawer, never a new route. */}
            {selectedVehicle && (
              <section
                aria-label={`Detail ${selectedVehicle.name || selectedVehicle.vehicle_id}`}
                data-testid="armada-detail"
                className="p-4 space-y-3 border-b border-white/10 bg-[#080d14]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">
                      {selectedVehicle.name || selectedVehicle.vehicle_id}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {MODALITY_LABEL[selectedVehicle.modality] ?? selectedVehicle.modality} ·{' '}
                      {provenanceLabel(selectedVehicle)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {onFocusVehicle && (
                      <button
                        type="button"
                        onClick={() => handleFocus(selectedVehicle)}
                        className="cursor-pointer flex items-center gap-1 px-2 py-1 rounded-md border border-white/10 hover:bg-white/5 text-xs text-slate-300"
                        title="Fokus unit ini di peta"
                      >
                        <Crosshair className="w-3 h-3" />
                        Peta
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedVehicleId(null)}
                      aria-label="Tutup detail unit"
                      className="cursor-pointer p-1 rounded-md border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-white/10 bg-[#0c1017] p-2">
                    <dt className="text-slate-500">Plat / ID</dt>
                    <dd className="text-slate-100 font-mono mt-0.5 break-all">{identifier(selectedVehicle)}</dd>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#0c1017] p-2">
                    <dt className="text-slate-500">Pengemudi</dt>
                    <dd className="text-slate-100 mt-0.5">
                      {selectedVehicle.driver_name || 'Belum ada pengemudi'}
                      {selectedVehicle.driver_phone && (
                        <span className="block text-slate-400 font-mono">{selectedVehicle.driver_phone}</span>
                      )}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#0c1017] p-2">
                    <dt className="text-slate-500">Status</dt>
                    <dd className="text-slate-100 mt-0.5">{statusLabel(selectedVehicle)}</dd>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#0c1017] p-2">
                    <dt className="text-slate-500">Provenance</dt>
                    <dd className={`mt-0.5 ${provenanceLabel(selectedVehicle) === 'live' ? 'text-emerald-300' : 'text-slate-300'}`}>
                      {provenanceLabel(selectedVehicle)}
                    </dd>
                  </div>
                </dl>

                <div className="rounded-lg border border-white/10 bg-[#0c1017] p-2 space-y-1">
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Route className="w-3 h-3" />
                    Koridor / segmen
                  </p>
                  <p className="text-xs text-slate-100">
                    {corridorLabel(selectedVehicle) ?? 'Koridor belum tersedia'}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#0c1017] p-2 space-y-1">
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    Koordinat terakhir
                  </p>
                  {fix ? (
                    <p className="text-xs text-slate-100 font-mono">
                      {formatCoordinate(fix[1])}, {formatCoordinate(fix[0])}
                      <span className="text-slate-400 font-sans"> · {gpsAgeLabel(selectedVehicle)}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-amber-300/90" data-testid="armada-detail-no-location">
                      Lokasi belum tersedia
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-white/10 bg-[#0c1017] p-2 space-y-1">
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <ShieldAlert className="w-3 h-3" />
                    Paparan bahaya
                  </p>
                  {hazard ? (
                    <p className="text-xs text-amber-200">
                      {hazard.hazardType ?? 'Disrupsi aktif'}
                      {typeof hazard.distanceKm === 'number' && ` · ${hazard.distanceKm.toFixed(1)} km`}
                      {hazard.policy && ` · rekomendasi ${hazard.policy}`}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400">Tidak ada paparan bahaya aktif.</p>
                  )}
                </div>

                <div className="rounded-lg border border-white/10 bg-[#0c1017] p-2 space-y-1">
                  <p className="text-xs text-slate-500">Rit hari ini</p>
                  {selectedVehicle.modality !== 'truck' && (
                    <p className="text-xs text-slate-400">Rit hanya dicatat untuk armada truk.</p>
                  )}
                  {selectedVehicle.modality === 'truck' && tripsFor !== selectedVehicle.vehicle_id && tripsState !== 'error' && (
                    <p className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Memuat rit…
                    </p>
                  )}
                  {selectedVehicle.modality === 'truck' && tripsState === 'error' && tripsFor === selectedVehicle.vehicle_id && (
                    <p className="text-xs text-slate-400">Data rit tidak tersedia saat ini.</p>
                  )}
                  {selectedVehicle.modality === 'truck' && tripsState === 'ready' && tripsFor === selectedVehicle.vehicle_id && (
                    trips.length > 0 ? (
                      <ul className="space-y-1">
                        {trips.slice(0, 3).map((trip) => (
                          <li key={trip.id} className="text-xs text-slate-300 flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate">
                              {trip.origin_name} → {trip.destination_name}
                            </span>
                            <span className="text-slate-500 shrink-0">{trip.status}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400">Belum ada rit tercatat hari ini.</p>
                    )
                  )}
                </div>
              </section>
            )}
          </div>

          {isTenantScoped && (
            <div className="p-3 border-t border-white/10 bg-[#0c1017]">
              <button
                type="button"
                onClick={onOpenOnboarding}
                className="w-full cursor-pointer flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-slate-200 text-xs font-medium hover:bg-white/5 transition"
              >
                <PlusCircle className="w-3 h-3" />
                Tambah armada
              </button>
            </div>
          )}
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}
