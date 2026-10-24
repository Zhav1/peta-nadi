'use client';

import React from 'react';
import {
  ShieldAlert,
  ChevronRight,
  X
} from 'lucide-react';
import type { ImpactedVehicleAssessment, DisruptionImpactResponse } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/base-ui/table';

import { resolveAlertQueueClasses } from './mapDockLayout';

interface DispatcherAlertQueueProps {
  impactData: DisruptionImpactResponse | null;
  selectedVehicleId: string | null;
  onSelectVehicle: (assessment: ImpactedVehicleAssessment) => void;
  onDismiss?: () => void;
  isCrisisDrawerOpen?: boolean;
}

function policyLabel(policy: string): string {
  if (policy === 'REROUTE') return 'Alih';
  if (policy === 'HOLD') return 'Tahan';
  return 'Lanjut';
}

export function DispatcherAlertQueue({
  impactData,
  selectedVehicleId,
  onSelectVehicle,
  onDismiss,
  isCrisisDrawerOpen = false,
}: DispatcherAlertQueueProps) {
  if (!impactData || !impactData.impacted_vehicles || impactData.impacted_vehicles.length === 0) {
    return null;
  }

  const formatIDR = (val: number) => {
    if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(1)} M`;
    if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)} Jt`;
    return `Rp ${val.toLocaleString('id-ID')}`;
  };

  const criticalCount = impactData.critical_count;
  const totalValueAtRisk = impactData.impacted_vehicles.reduce(
    (sum, item) => sum + item.cargo_value_idr,
    0
  );

  return (
    <div className={resolveAlertQueueClasses({ isCrisisDrawerOpen })}>
      <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden text-slate-200">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="text-xs font-medium text-white">
              Peringatan
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400 tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              {criticalCount} kritis
            </span>
            <span className="text-xs text-slate-500 hidden sm:inline tabular-nums">
              Muatan {formatIDR(totalValueAtRisk)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
                title="Tutup peringatan"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="h-11 bg-[#0c1017] font-medium">Kendaraan</TableHead>
                <TableHead className="h-11 bg-[#0c1017] font-medium">Kebijakan</TableHead>
                <TableHead className="h-11 bg-[#0c1017] font-medium">Muatan</TableHead>
                <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Risiko</TableHead>
                <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Susut</TableHead>
                <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Hemat</TableHead>
                <TableHead className="h-11 bg-[#0c1017] font-medium"><span className="sr-only">Aksi</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {impactData.impacted_vehicles.map((item) => {
                const isSelected = selectedVehicleId === item.vehicle_id;
                const isCritical = item.optimal_policy === 'REROUTE' || item.late_arrival_risk_pct >= 70;

                return (
                  <TableRow
                    key={item.vehicle_id}
                    data-state={isSelected ? 'selected' : undefined}
                    onClick={() => onSelectVehicle(item)}
                    className="hover:bg-white/5 cursor-pointer data-[state=selected]:bg-white/5"
                  >
                    <TableCell className="py-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isCritical && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />}
                        <span className="text-xs font-medium text-white tabular-nums">
                          {item.vehicle_id}
                        </span>
                        <span className="text-xs text-slate-400 truncate">
                          {item.vehicle_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-xs text-slate-300">{policyLabel(item.optimal_policy)}</span>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="text-xs text-slate-300 tabular-nums">
                        {item.cargo_tonnage}T {item.commodity_key.replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-right text-xs text-slate-300 tabular-nums">
                        {item.late_arrival_risk_pct.toFixed(0)}%
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-right text-xs text-slate-300 tabular-nums">
                        {formatIDR(item.spoilage_loss_idr)}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-right text-xs text-slate-300 tabular-nums">
                        {formatIDR(item.net_savings_idr)}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectVehicle(item);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white cursor-pointer shrink-0"
                      >
                        <span>Mitigasi</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
