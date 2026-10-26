'use client';

import React, { useMemo, useState } from 'react';
import {
  Truck,
  Ship,
  Plane,
  Radio,
  PlusCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import type { FleetVehicle } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/base-ui/table';

export interface TenantFleetRosterProps {
  /** All assets owned by the signed-in dispatcher's perusahaan (live + projected). */
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
  if (modality === 'maritime') return <Ship className="w-3.5 h-3.5 text-slate-400" />;
  if (modality === 'air') return <Plane className="w-3.5 h-3.5 text-slate-400" />;
  return <Truck className="w-3.5 h-3.5 text-slate-400" />;
}

/**
 * Fleet roster for dispatcher sessions (perusahaan-scoped).
 *
 * The map only draws live assets. This list is the honest inventory
 * of everything the dispatcher actually onboarded, including estimated
 * units that are waiting for a hardware fix — those open in inspection mode
 * with no badge text and are never drawn as ambient mock corridors.
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
    <div className="absolute left-3 bottom-3 z-30 w-[300px] max-w-[calc(100vw-1.5rem)] pointer-events-auto animate-[rosterSlideIn_220ms_ease-out]">
      <div className="rounded-xl border border-white/10 bg-[#0c1017] text-slate-100 overflow-hidden shadow-2xl">
        <style>{`@keyframes rosterSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        <button
          type="button"
          onClick={() => setIsCollapsed((v) => !v)}
          className="w-full cursor-pointer flex items-center justify-between px-3 py-2 border-b border-white/10"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-slate-200">
            <Radio className="w-3.5 h-3.5 text-[#00f0ff]" />
            Armada Perusahaan
            <span className="px-1.5 py-0.5 rounded text-xs tabular-nums text-slate-300">
              {sorted.length}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {liveCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-slate-300 tabular-nums"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{liveCount}</span>
            )}
            {estimatedCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-slate-400 tabular-nums"><span className="w-1.5 h-1.5 rounded-full bg-slate-500" />{estimatedCount}</span>
            )}
            {isCollapsed ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </span>
        </button>

        {!isCollapsed && (
          <div>
            {isLoading && sorted.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Memuat armada perusahaan…
              </div>
            )}

            {!isLoading && !isTenantScoped && (
              <div className="px-3 py-2.5 text-xs text-slate-300 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Sesi Dispatcher tidak memiliki klaim <code className="font-mono">company_id</code>. Armada
                  tidak dapat ditampilkan sampai perusahaan Anda ditetapkan.
                </span>
              </div>
            )}

            {!isLoading && isTenantScoped && sorted.length === 0 && (
              <div className="px-3 py-2.5 space-y-2">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Belum ada armada terdaftar untuk perusahaan{' '}
                  <span className="font-mono text-slate-200">{companyId}</span>.
                </p>
                {error && <p className="text-xs text-slate-400">{error}</p>}
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  className="w-full cursor-pointer flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white text-[#080d14] text-xs font-medium hover:bg-slate-200 transition"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Tambah armada
                </button>
              </div>
            )}

            {sorted.length > 0 && (
              <div className="max-h-[184px] overflow-y-auto no-scrollbar">
                <Table className="w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-9 bg-[#0c1017] font-medium">Unit</TableHead>
                      <TableHead className="h-9 bg-[#0c1017] text-right font-medium">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((v) => {
                      const isSelected = selectedVehicleId === v.vehicle_id;
                      return (
                        <TableRow
                          key={v.vehicle_id}
                          data-state={isSelected ? 'selected' : undefined}
                          onClick={() => onSelectVehicle(v)}
                          className="hover:bg-white/5 cursor-pointer data-[state=selected]:bg-white/5"
                        >
                          <TableCell className="py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {modalityIcon(v.modality)}
                              <span className="min-w-0">
                                <span className="block text-xs text-slate-100 truncate">{v.name || v.vehicle_id}</span>
                                <span className="block text-xs tabular-nums text-slate-500 truncate">
                                  {v.vehicle_id}
                                  {typeof v.speed_kmh === 'number' && v.tracking_mode === 'LIVE_GPS'
                                    ? ` · ${Math.round(v.speed_kmh)} km/j`
                                    : ''}
                                </span>
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex items-center justify-end gap-1.5 text-xs text-slate-400">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-400" />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {sorted.length > 0 && (
              <div className="px-2 py-2 border-t border-white/10">
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
          </div>
        )}
      </div>
    </div>
  );
}
