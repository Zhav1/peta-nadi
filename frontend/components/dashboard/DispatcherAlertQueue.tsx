'use client';

import React from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  ArrowRight, 
  Truck, 
  Clock, 
  DollarSign, 
  CheckCircle2, 
  ChevronRight,
  Sparkles,
  X
} from 'lucide-react';
import type { ImpactedVehicleAssessment, DisruptionImpactResponse } from '@/lib/types';

interface DispatcherAlertQueueProps {
  impactData: DisruptionImpactResponse | null;
  selectedVehicleId: string | null;
  onSelectVehicle: (assessment: ImpactedVehicleAssessment) => void;
  onDismiss?: () => void;
}

export function DispatcherAlertQueue({
  impactData,
  selectedVehicleId,
  onSelectVehicle,
  onDismiss,
}: DispatcherAlertQueueProps) {
  if (!impactData || !impactData.impacted_assessments || impactData.impacted_assessments.length === 0) {
    return null;
  }

  const formatIDR = (val: number) => {
    if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(1)} M`;
    if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)} Jt`;
    return `Rp ${val.toLocaleString('id-ID')}`;
  };

  const criticalCount = impactData.critical_spoilage_count;
  const totalValueAtRisk = impactData.total_value_at_risk_idr;

  return (
    <div className="absolute top-16 left-4 sm:left-32 lg:left-[340px] right-4 sm:right-16 z-30 pointer-events-auto max-w-4xl animate-in slide-in-from-top-3 duration-200">
      <div className="bg-[#0c1017]/95 backdrop-blur-md border border-rose-500/30 rounded-lg shadow-2xl p-3 text-slate-200">
        {/* Header Ribbon */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1c2432]">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-rose-950/80 border border-rose-500/40 text-rose-400">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                  DISPATCHER ALERT QUEUE
                </span>
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-500/40 font-bold">
                  {criticalCount} ARMADA KRITIS
                </span>
                <span className="text-xs font-mono text-slate-400 hidden sm:inline">
                  • Total Muatan Terancam: {formatIDR(totalValueAtRisk)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-sans text-slate-400 hidden md:inline">
              Sistem Pendukung Keputusan (DSS) Pangan
            </span>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Tutup Antrean Peringatan"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Impacted Fleet Cards Strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto no-scrollbar">
          {impactData.impacted_assessments.map((item) => {
            const isSelected = selectedVehicleId === item.vehicle_id;
            const isCritical = item.delayed_spoilage_prob > 0.5;

            return (
              <div
                key={item.vehicle_id}
                onClick={() => onSelectVehicle(item)}
                className={`p-2.5 rounded border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-cyan-950/40 border-cyan-400/80 shadow-md'
                    : isCritical
                      ? 'bg-[#121822] hover:bg-rose-950/20 border-rose-500/30 hover:border-rose-400/60'
                      : 'bg-[#121822] hover:bg-slate-800/60 border-[#1c2432]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Truck className={`w-3.5 h-3.5 shrink-0 ${isCritical ? 'text-rose-400' : 'text-cyan-400'}`} />
                    <span className="text-xs font-mono font-bold text-white">
                      {item.vehicle_id}
                    </span>
                    <span className="text-xs font-mono text-slate-400 truncate max-w-[110px]">
                      ({item.license_plate})
                    </span>
                  </div>

                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
                    item.recommended_action === 'REROUTE_IMMEDIATE'
                      ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-900 text-slate-300 border border-slate-700'
                  }`}>
                    {item.recommended_action === 'REROUTE_IMMEDIATE' ? 'REROUTE' : item.recommended_action}
                  </span>
                </div>

                {/* Cargo & Risk Details */}
                <div className="mt-1.5 flex items-center justify-between text-xs font-sans text-slate-300">
                  <span className="font-semibold text-slate-200">
                    {item.cargo_tonnage}T {item.commodity_key.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-rose-400 font-bold">
                    Risiko Rusak {(item.delayed_spoilage_prob * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Economic Value & Recommendation CTA */}
                <div className="mt-2 pt-1.5 border-t border-[#1c2432] flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    Potensi Susut: <strong className="text-rose-300">{formatIDR(item.at_risk_spoilage_idr)}</strong>
                  </span>
                  
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectVehicle(item);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-sans font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    <span>Mitigasi Rute</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
