'use client';

import React from 'react';
import {
  DollarSign,
  Clock,
  MapPin,
  PauseCircle,
  RotateCcw,
  CheckCircle2,
  Building2,
  Fuel,
  AlertCircle,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import type { HoldVsRerouteEconomics } from '@/lib/types';

interface HoldVsRerouteCardProps {
  economics: HoldVsRerouteEconomics;
  onApplyTactical?: (action: 'HOLD' | 'REROUTE') => void;
  selectedAction?: 'HOLD' | 'REROUTE' | 'CONTINUE';
}

export function HoldVsRerouteCard({
  economics,
  onApplyTactical,
  selectedAction,
}: HoldVsRerouteEconomicsCardProps) {
  const isHoldRecommended = economics.recommended_action === 'HOLD';

  return (
    <div className="bg-[#0c1017]/90 backdrop-blur-md border border-white/10 rounded-xl p-3.5 shadow-lg flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider font-sans">
              Analisis Ekonomi: Reroute vs. Tahan Muatan
            </h4>
            <p className="text-[11px] text-slate-400 font-mono">
              Perbandingan Biaya Total Logistik & Mitigasi Risiko PIHPS
            </p>
          </div>
        </div>

        {/* Recommendation Badge */}
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold font-mono border ${
            isHoldRecommended
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          }`}
        >
          {isHoldRecommended ? (
            <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span>REKOMENDASI: {economics.recommended_action}</span>
        </span>
      </div>

      {/* Rationale Banner */}
      <div
        className={`p-2.5 rounded-lg border text-xs font-mono leading-relaxed ${
          isHoldRecommended
            ? 'bg-amber-950/20 border-amber-500/20 text-amber-200/90'
            : 'bg-emerald-950/20 border-emerald-500/20 text-emerald-200/90'
        }`}
      >
        <div className="flex items-start gap-2">
          <AlertCircle
            className={`w-4 h-4 shrink-0 mt-0.5 ${
              isHoldRecommended ? 'text-amber-400' : 'text-emerald-400'
            }`}
          />
          <div>
            <span className="font-bold block mb-0.5">
              {isHoldRecommended
                ? 'Strategi Optimal: Tahan Armada di Depo Penyangga'
                : 'Strategi Optimal: Lakukan Pengalihan Rute (Reroute)'}
            </span>
            <p className="text-[11px] text-slate-300 leading-normal">
              {economics.rationale_id}
            </p>
          </div>
        </div>
      </div>

      {/* Side-by-Side Cost Comparison Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        {/* Reroute Column */}
        <div
          className={`p-2.5 rounded-lg border transition-all ${
            !isHoldRecommended
              ? 'bg-emerald-950/30 border-emerald-500/40 ring-1 ring-emerald-500/30'
              : 'bg-[#121822] border-[#1c2432]'
          }`}
        >
          <div className="flex items-center justify-between text-slate-300 mb-1">
            <span className="flex items-center gap-1 font-semibold text-[11px] uppercase">
              <RotateCcw className="w-3 h-3 text-cyan-400" /> Opsi Reroute
            </span>
            {!isHoldRecommended && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                Efisien
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-white tabular-nums mb-1.5">
            Rp {economics.reroute_total_cost_idr.toLocaleString('id-ID')}
          </div>
          <div className="space-y-1 text-[11px] text-slate-400 border-t border-white/5 pt-1.5">
            <div className="flex justify-between">
              <span>BBM & Maint:</span>
              <span className="text-slate-200 font-medium">Rp 6.800/km</span>
            </div>
            <div className="flex justify-between">
              <span>Tarif Tol Tambahan:</span>
              <span className="text-slate-200 font-medium">Rp 85.000</span>
            </div>
            <div className="flex justify-between">
              <span>Uang Lembur Supir:</span>
              <span className="text-slate-200 font-medium">Rp 40.000/jam</span>
            </div>
          </div>
        </div>

        {/* Hold in Buffer Depot Column */}
        <div
          className={`p-2.5 rounded-lg border transition-all ${
            isHoldRecommended
              ? 'bg-amber-950/30 border-amber-500/40 ring-1 ring-amber-500/30'
              : 'bg-[#121822] border-[#1c2432]'
          }`}
        >
          <div className="flex items-center justify-between text-slate-300 mb-1">
            <span className="flex items-center gap-1 font-semibold text-[11px] uppercase">
              <Building2 className="w-3 h-3 text-amber-400" /> Tahan di Depo
            </span>
            {isHoldRecommended && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                Efisien
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-white tabular-nums mb-1.5">
            Rp {economics.hold_total_cost_idr.toLocaleString('id-ID')}
          </div>
          <div className="space-y-1 text-[11px] text-slate-400 border-t border-white/5 pt-1.5">
            <div className="flex justify-between">
              <span>Depo Aman:</span>
              <span className="text-amber-200 font-medium truncate max-w-[90px]" title={economics.hold_depot_name}>
                {economics.hold_depot_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Est. Buka Jalur:</span>
              <span className="text-slate-200 font-medium">~{economics.estimated_clearance_hours} Jam</span>
            </div>
            <div className="flex justify-between">
              <span>Reefer & Demurrage:</span>
              <span className="text-slate-200 font-medium">Rp 170k/jam</span>
            </div>
          </div>
        </div>
      </div>

      {/* Net Delta Savings Box */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-mono">
        <span className="text-slate-400 flex items-center gap-1.5">
          <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
          <span>Penghematan Bersih Keputusan:</span>
        </span>
        <span className="font-bold text-emerald-400 text-sm tabular-nums">
          Rp {economics.net_savings_idr.toLocaleString('id-ID')}
        </span>
      </div>

      {/* Tactical Quick Action Trigger */}
      {onApplyTactical && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onApplyTactical(economics.recommended_action)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 shadow-sm ${
              isHoldRecommended
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Terapkan Opsi {economics.recommended_action}</span>
          </button>
        </div>
      )}
    </div>
  );
}
type HoldVsRerouteEconomicsCardProps = HoldVsRerouteCardProps;
