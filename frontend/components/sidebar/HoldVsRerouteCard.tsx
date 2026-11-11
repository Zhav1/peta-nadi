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
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  ShieldAlert,
} from 'lucide-react';
import type { HoldVsRerouteEconomics, RouteRecommendation } from '@/lib/types';

interface HoldVsRerouteCardProps {
  economics: HoldVsRerouteEconomics;
  onApplyTactical?: (action: 'HOLD' | 'REROUTE') => void;
  selectedAction?: 'HOLD' | 'REROUTE' | 'CONTINUE';
  route?: RouteRecommendation | null;
  activeRoute?: RouteRecommendation | null;
  rerouteCandidate?: RouteRecommendation | null;
  single_chokepoint?: boolean;
  single_chokepoint_note?: string;
  /** SPEC #9: proven impacted trip (rit) — HOLD copy/CTAs render only then. */
  hasProvenImpactedTrip?: boolean;
}

export function HoldVsRerouteCard({
  economics,
  onApplyTactical,
  selectedAction,
  route,
  activeRoute,
  rerouteCandidate,
  single_chokepoint,
  single_chokepoint_note,
  /** Default true: standalone/modal usages keep the existing affordances. */
  hasProvenImpactedTrip = true,
}: HoldVsRerouteCardProps) {
  const isSingleChokepoint = Boolean(
    single_chokepoint ??
    route?.single_chokepoint ??
    activeRoute?.single_chokepoint ??
    rerouteCandidate?.single_chokepoint ??
    economics.single_chokepoint
  );

  const chokepointNote =
    single_chokepoint_note ||
    route?.single_chokepoint_note ||
    activeRoute?.single_chokepoint_note ||
    rerouteCandidate?.single_chokepoint_note ||
    economics.single_chokepoint_note ||
    'Koridor Pegunungan Tunggal: Tidak tersedia jalan alternatif bebas bencana dalam radius 80 km. Rute melintasi zona perkiraan risiko BMKG (Precautionary Risk) — disarankan pertimbangkan penahanan muatan (Hold Staging) atau konfirmasi satgas lapangan sebelum melintas.';

  const isHoldRecommended = isSingleChokepoint || economics.recommended_action === 'HOLD';
  const effectiveAction: 'HOLD' | 'REROUTE' = isSingleChokepoint ? 'HOLD' : economics.recommended_action;
  // SPEC #9: without a proven impacted trip the card is informational only —
  // the HOLD recommendation copy and the Terapkan CTA stay hidden.
  const hasActions = hasProvenImpactedTrip;

  const money = (value?: number | null) =>
    typeof value === 'number' && Number.isFinite(value)
      ? `Rp ${Math.round(value).toLocaleString('id-ID')}`
      : 'Belum tersedia';

  const number = (value?: number | null, suffix = '') =>
    typeof value === 'number' && Number.isFinite(value)
      ? `${value.toLocaleString('id-ID', { maximumFractionDigits: 1 })}${suffix}`
      : 'Belum tersedia';

  return (
    <div className="border-t border-[#1c2432] pt-3 bg-transparent flex flex-col gap-3">
      {/* Phase 182-01: Single Chokepoint Warning Banner */}
      {isSingleChokepoint && (
        <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-orange-500/15 border border-amber-500/40 backdrop-blur-md shadow-lg shadow-amber-950/20 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-amber-500/25 text-amber-300 border border-amber-400/50 shadow-sm">
              <span>⚠️ KORIDOR PEGUNUNGAN TUNGGAL</span>
            </span>
            <span className="text-[11px] font-mono uppercase tracking-wider text-amber-300 font-bold px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30">
              Prioritas: Hold Staging
            </span>
          </div>
          <p className="text-xs text-amber-100/95 leading-relaxed font-sans">
            {chokepointNote}
          </p>
          <div className="flex items-center gap-2 pt-1 border-t border-amber-500/20 text-xs text-amber-300 font-mono">
            <PauseCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold">
              Rekomendasi Operasional: Penahanan muatan (Hold Staging) lebih dianjurkan dibanding memaksakan jalan melintasi zona bencana.
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-100 font-sans">
              Analisis Ekonomi: Reroute vs. Tahan Muatan
            </h4>
            <p className="text-xs text-slate-400 font-mono">
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
          <span>
            {hasActions
              ? `Saran: ${isSingleChokepoint ? 'Tahan (Prioritas)' : effectiveAction === 'HOLD' ? 'Tahan' : 'Alih'}`
              : 'Saran: — (belum ada trip terdampak terverifikasi)'}
          </span>
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
              {!hasActions
                ? 'Analisis informasional — belum ada trip (rit) terdampak terverifikasi.'
                : isSingleChokepoint
                ? 'Strategi Prioritas: Tahan Armada di Depo Penyangga (Koridor Tunggal)'
                : isHoldRecommended
                ? 'Strategi Optimal: Tahan Armada di Depo Penyangga'
                : 'Strategi Optimal: Lakukan Pengalihan Rute (Reroute)'}
            </span>
            <p className="text-xs text-slate-300 leading-normal">
              {isSingleChokepoint
                ? `Tidak tersedia rute alternatif bebas bencana dalam radius 80 km. Menahan armada di ${economics.hold_depot_name} (~${economics.estimated_clearance_hours} jam) memitigasi bahaya bencana langsung hingga rute dinyatakan aman oleh satgas.`
                : economics.rationale_id}
            </p>
          </div>
        </div>
      </div>

      {/* Side-by-Side Cost Comparison Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        {/* Reroute Column */}
        <div
          className={`p-2.5 rounded-lg border transition-all ${
            isSingleChokepoint
              ? 'border-amber-500/30 bg-amber-950/10'
              : !isHoldRecommended
              ? 'border-emerald-500/40 bg-transparent'
              : 'bg-transparent border-[#1c2432]'
          }`}
        >
          <div className="flex items-center justify-between text-slate-300 mb-1">
            <span className="flex items-center gap-1 text-xs text-slate-300">
              <RotateCcw className="w-3 h-3 text-cyan-400" /> Opsi Reroute
            </span>
            {isSingleChokepoint ? (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                Berisiko BMKG
              </span>
            ) : !isHoldRecommended && (
              <span className="text-xs px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                Efisien
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-white tabular-nums mb-1.5">
            Rp {economics.reroute_total_cost_idr.toLocaleString('id-ID')}
          </div>
          <div className="space-y-1 text-xs text-slate-400 border-t border-white/5 pt-1.5">
            <div className="flex justify-between gap-2">
              <span>BBM (Pertamina):</span>
              <span className="text-slate-200 font-medium text-right">
                {money(economics.reroute_fuel_cost_idr)}
                {typeof economics.reroute_fuel_liters === 'number' && (
                  <span className="block text-xs text-slate-500">
                    {number(economics.reroute_fuel_liters, ' L')}
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Tarif Tol BPJT:</span>
              <span className="text-slate-200 font-medium text-right">
                {money(economics.reroute_toll_cost_idr)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Uang Lembur Supir:</span>
              <span className="text-slate-200 font-medium text-right">
                {money(economics.reroute_labor_cost_idr)}
              </span>
            </div>
            {typeof economics.reroute_distance_km === 'number' && (
              <div className="flex justify-between gap-2">
                <span>Jarak Detour:</span>
                <span className="text-slate-200 font-medium text-right">
                  {number(economics.reroute_distance_km, ' km')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Hold in Buffer Depot Column */}
        <div
          className={`p-2.5 rounded-lg border transition-all ${
            isHoldRecommended
              ? isSingleChokepoint
                ? 'border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/30'
                : 'border-amber-500/40 bg-transparent'
              : 'bg-transparent border-[#1c2432]'
          }`}
        >
          <div className="flex items-center justify-between text-slate-300 mb-1">
            <span className="flex items-center gap-1 text-xs text-slate-300">
              <Building2 className="w-3 h-3 text-amber-400" /> Tahan di Depo
            </span>
            {hasActions && isHoldRecommended && (
              <span className="text-xs px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                {isSingleChokepoint ? 'Sangat Dianjurkan' : 'Efisien'}
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-white tabular-nums mb-1.5">
            Rp {economics.hold_total_cost_idr.toLocaleString('id-ID')}
          </div>
          <div className="space-y-1 text-xs text-slate-400 border-t border-white/5 pt-1.5">
            <div className="flex justify-between gap-2">
              <span>Depo Aman:</span>
              <span className="text-amber-200 font-medium truncate max-w-[90px]" title={economics.hold_depot_name}>
                {economics.hold_depot_name}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Est. Buka Jalur:</span>
              <span className="text-slate-200 font-medium">~{economics.estimated_clearance_hours} Jam</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Biaya Depo:</span>
              <span className="text-slate-200 font-medium text-right">{money(economics.hold_depot_cost_idr)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Reefer &amp; Genset:</span>
              <span className="text-slate-200 font-medium text-right">{money(economics.hold_reefer_cost_idr)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Susut Muatan:</span>
              <span className="text-slate-200 font-medium text-right">{money(economics.hold_spoilage_idr)}</span>
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

      {/* Tactical Quick Action Trigger — SPEC #9: only on a proven impacted trip. */}
      {onApplyTactical && hasActions && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onApplyTactical(effectiveAction)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 shadow-sm ${
              isHoldRecommended
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {isSingleChokepoint
                ? 'Terapkan Tahan Armada (Hold Staging)'
                : `Terapkan ${effectiveAction === 'HOLD' ? 'Tahan' : 'Alih'}`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export type HoldVsRerouteEconomicsCardProps = HoldVsRerouteCardProps;
