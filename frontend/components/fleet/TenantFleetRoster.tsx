'use client';

import React, { useMemo, useState } from 'react';
import {
  Truck,
  Ship,
  Plane,
  Radio,
  Navigation,
  PlusCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import type { FleetVehicle } from '@/lib/types';

export interface TenantFleetRosterProps {
  /** All assets owned by the signed-in dispatcher's tenant (live + projected). */
  vehicles: FleetVehicle[];
  isLoading?: boolean;
  error?: string | null;
  /** False when the dispatcher JWT carries no company_id claim. */
  isTenantScoped: boolean;
  companyId?: string | null;
  selectedVehicleId?: string | null;
  onSelectVehicle: (vehicle: FleetVehicle) => void;
  onOpenOnboarding: () => void;
}

function modalityIcon(modality: FleetVehicle['modality']) {
  if (modality === 'maritime') return <Ship className="w-3.5 h-3.5 text-sky-400" />;
  if (modality === 'air') return <Plane className="w-3.5 h-3.5 text-purple-400" />;
  return <Truck className="w-3.5 h-3.5 text-emerald-400" />;
}

/**
 * Tenant-only fleet roster for DISPATCHER sessions.
 *
 * The map only draws LIVE_GPS tenant assets. This list is the honest inventory
 * of everything the dispatcher actually onboarded, including ROUTE_ESTIMATED
 * units that are waiting for a hardware GPS fix — those open in inspection mode
 * with a PROYEKSI badge instead of ever being drawn as ambient mock corridors.
 */
export function TenantFleetRoster({
  vehicles,
  isLoading = false,
  error = null,
  isTenantScoped,
  companyId,
  selectedVehicleId = null,
  onSelectVehicle,
  onOpenOnboarding,
}: TenantFleetRosterProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const sorted = useMemo(() => {
    const rank = (v: FleetVehicle) => (v.tracking_mode === 'LIVE_GPS' ? 0 : 1);
    return [...vehicles].sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      return (a.name || a.vehicle_id).localeCompare(b.name || b.vehicle_id);
    });
  }, [vehicles]);

  const liveCount = sorted.filter((v) => v.tracking_mode === 'LIVE_GPS').length;
  const estimatedCount = sorted.length - liveCount;

  return (
    <div className="absolute left-3 bottom-3 z-30 w-[300px] max-w-[calc(100vw-1.5rem)] pointer-events-auto">
      <div className="rounded-lg border border-[#1c2432] bg-[#0c1017]/95 backdrop-blur-md shadow-xl text-slate-100">
        <button
          type="button"
          onClick={() => setIsCollapsed((v) => !v)}
          className="w-full cursor-pointer flex items-center justify-between px-3 py-2 border-b border-[#1c2432]"
        >
          <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-200">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            Armada Tenant
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-slate-300 tabular-nums">
              {sorted.length}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {liveCount > 0 && (
              <span className="text-[10px] font-mono text-emerald-300 tabular-nums">{liveCount} LIVE</span>
            )}
            {estimatedCount > 0 && (
              <span className="text-[10px] font-mono text-amber-300 tabular-nums">
                {estimatedCount} PROYEKSI
              </span>
            )}
            {isCollapsed ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </span>
        </button>

        {!isCollapsed && (
          <div className="p-2 space-y-1.5">
            {isLoading && sorted.length === 0 && (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Memuat armada tenant…
              </div>
            )}

            {!isLoading && !isTenantScoped && (
              <div className="px-2 py-2.5 text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Sesi DISPATCHER tidak memiliki klaim <code className="font-mono">company_id</code>. Armada
                  tidak dapat ditampilkan sampai tenant Anda ditetapkan.
                </span>
              </div>
            )}

            {!isLoading && isTenantScoped && sorted.length === 0 && (
              <div className="px-2 py-2.5 space-y-2">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Belum ada armada terdaftar untuk tenant{' '}
                  <span className="font-mono text-cyan-300">{companyId}</span>.
                </p>
                {error && <p className="text-[11px] text-rose-300">{error}</p>}
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  className="w-full cursor-pointer flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white text-[#080d14] text-xs font-semibold hover:bg-slate-200 transition"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Onboard Armada
                </button>
              </div>
            )}

            {sorted.length > 0 && (
              <div className="max-h-[184px] overflow-y-auto no-scrollbar space-y-1">
                {sorted.map((v) => {
                  const isEstimated = v.tracking_mode === 'ROUTE_ESTIMATED';
                  const isSelected = selectedVehicleId === v.vehicle_id;
                  return (
                    <button
                      key={v.vehicle_id}
                      type="button"
                      onClick={() => onSelectVehicle(v)}
                      className={`w-full cursor-pointer text-left px-2 py-1.5 rounded-md border transition flex items-center gap-2 ${
                        isSelected
                          ? 'border-cyan-400/60 bg-cyan-500/10'
                          : 'border-transparent hover:border-[#1c2432] hover:bg-white/5'
                      }`}
                    >
                      {modalityIcon(v.modality)}
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-slate-100 truncate">{v.name || v.vehicle_id}</span>
                        <span className="block text-[10px] font-mono text-slate-500 truncate">
                          {v.vehicle_id}
                          {typeof v.speed_kmh === 'number' && v.tracking_mode === 'LIVE_GPS'
                            ? ` · ${Math.round(v.speed_kmh)} km/j`
                            : ''}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                          isEstimated
                            ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                            : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {isEstimated ? (
                          <span className="flex items-center gap-0.5">
                            <Navigation className="w-2.5 h-2.5" />
                            PROYEKSI
                          </span>
                        ) : (
                          'LIVE GPS'
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {sorted.length > 0 && (
              <button
                type="button"
                onClick={onOpenOnboarding}
                className="w-full cursor-pointer flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-white/10 bg-white/5 text-slate-200 text-[11px] font-medium hover:bg-white/10 transition"
              >
                <PlusCircle className="w-3 h-3" />
                Tambah Armada
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
