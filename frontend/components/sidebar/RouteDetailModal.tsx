'use client';

import { useEffect, useState } from 'react';
import {
  X,
} from 'lucide-react';
import type {
  RouteDetailModalProps,
  RouteDecisionType,
  TacticalManeuver,
  BenchmarkReportResponse,
} from '@/lib/types';
import {
  calculateTotalTripCost,
  formatTripCostIDR,
  formatCompactIDR,
  isColdChain,
} from '@/lib/tripCostCalculator';
import { api } from '@/lib/api';
import { isForecastActive } from '@/hooks/useNewsVerification';
import { routeProvenanceLabel, routeProvenanceTitle } from '@/lib/routeProvenance';
// A route-detail / verification surface is not an urgent confirmation, so it
// renders as a plain modal dialog (`role="dialog"`), not `role="alertdialog"`.
// Focus trapping, Escape-to-close and scroll-lock still come from Base UI.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
} from '@/components/base-ui/dialog';
import { HoldVsRerouteCard } from './HoldVsRerouteCard';

type Decision = RouteDecisionType;

const CHECKLIST_ITEMS = [
  {
    id: 'visual',
    label: 'Rute bebas bahaya terverifikasi di peta',
  },
  {
    id: 'tradeoff',
    label: 'Trade-off waktu vs biaya dibaca',
  },
  {
    id: 'legs',
    label: 'Moda dan simpul alih tiap leg dikonfirmasi',
  },
  {
    id: 'notes',
    label: 'Catatan operator diisi untuk HOLD / OVERRIDE',
  },
] as const;

function formatIDR(val?: number | null): string {
  if (val == null) return 'Data tidak tersedia';
  if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(2)} M`;
  if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)} Jt`;
  return `Rp ${val.toLocaleString('id-ID')}`;
}

function formatDelay(minutes?: number | null): string {
  if (minutes == null) return 'Data tidak tersedia';
  if (minutes <= 0) return 'Tepat waktu';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `+${h} jam ${m} mnt` : `+${m} mnt`;
}

export function RouteDetailModal({
  route,
  crisis,
  open,
  onClose,
  role,
  mode,
  onAction,
  isActing,
  corridorIsFallback = false,
  onOpenEvaluation,
}: RouteDetailModalProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [previewPolicy, setPreviewPolicy] = useState<TacticalManeuver>('REROUTE');
  const [benchmark, setBenchmark] = useState<BenchmarkReportResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.evaluation.getBenchmark()
      .then((res) => { if (!cancelled && res) setBenchmark(res); })
      .catch(() => { if (!cancelled) setBenchmark(null); });
    return () => { cancelled = true; };
  }, [open ]);

  // Honest benchmark headline: live API values or explicit "Belum dihitung".
  const benchPrecision = benchmark?.metrics?.precision ?? null;
  const benchRecall = benchmark?.metrics?.recall ?? null;
  const benchBrier = benchmark?.calibration?.brier_score ?? null;
  const benchN = benchmark?.total_scenarios ?? null;
  const benchSummary = benchPrecision !== null && benchRecall !== null && benchBrier !== null
    ? `${(benchPrecision * 100).toFixed(1)}% Presisi, ${(benchRecall * 100).toFixed(1)}% Sensitivitas, ${benchBrier.toFixed(2)} Brier`
    : 'Belum dihitung';
  const benchShort = benchPrecision !== null
    ? `Presisi ${(benchPrecision * 100).toFixed(1)}%`
    : 'Belum dihitung';

  useEffect(() => {
    if (open) {
      setChecked({});
      setNotes('');
      setPreviewPolicy(
        route.corridor_type === 'hold_staging' ? 'HOLD' : 'REROUTE'
      );
    }
  }, [open, route.corridor_type]);

  // Synchronize checklist item 4 with active notes input
  useEffect(() => {
    if (notes.trim().length > 0) {
      setChecked((prev) => (prev.notes ? prev : { ...prev, notes: true }));
    }
  }, [notes]);

  /* Escape-to-close and focus trapping are provided by the Dialog block (Root onOpenChange + Popup). */

  /* Dialog visibility is controlled by the Dialog open prop (Watermelon block pattern). */

  const isSandbox = mode === 'sandbox' || role === 'GUEST';
  const allChecked = CHECKLIST_ITEMS.every(
    (c) => checked[c.id] || (c.id === 'notes' && notes.trim().length > 0)
  );

  // Evidence gate: approve/override need a grounded route or crisis evidence.
  // HOLD stays allowed (safe action, ledger-recorded).
  const crisisEvidence =
    !!crisis &&
    ((crisis.news_attributions?.length ?? 0) > 0 ||
      (crisis.verified_news_citations?.length ?? 0) > 0 ||
      !!crisis.evidence?.osint_text?.trim() ||
      !!crisis.validated);
  const routeProof =
    !!route.safety_status ||
    !!route.dasar_risiko ||
    !!route.dampak ||
    !!route.tradeoff_analysis ||
    !!route.hedging;
  const hasEvidence = crisisEvidence || routeProof;

  // Forecast info-only: every decision CTA stays disabled — pantau saja.
  const isForecast = !!crisis && isForecastActive(crisis.forecast_tag, crisis.forecast_valid_until);
  const canApprove = !isForecast && !isSandbox && allChecked && !isActing && role !== 'REGULATOR' && hasEvidence;
  const canHold = !isForecast && !isSandbox && allChecked && !isActing && notes.trim().length > 0;
  const canOverride = !isForecast && !isSandbox && allChecked && !isActing && notes.trim().length > 0 && role !== 'REGULATOR' && hasEvidence;

  const passability =
    crisis?.impact_profile?.passability ??
    (route.is_compromised ? 'BLOCKED' : 'CAUTION');
  const hazardLabel =
    crisis?.custom_hazard_label || crisis?.title || crisis?.type || 'Gangguan koridor';
  const hazardRadius =
    crisis?.radius_km ?? crisis?.affected_locations?.[0]?.radius_km;

  const congestionLevels =
    route.congestion_segments && route.congestion_segments.length > 0
      ? route.congestion_segments.map((s) => s.level).join(', ')
      : null;

  const newsLinks = crisis?.verified_news_citations ?? [];
  const deadLinks = newsLinks.filter((n) => n.link_alive === 'dead').length;

  const activePolicyBreakdown =
    previewPolicy === 'HOLD'
      ? route.hedging?.hold_policy
      : previewPolicy === 'CONTINUE'
      ? route.hedging?.continue_policy
      : (route.hedging?.reroute_policy ??
         (route.hedging?.optimal_policy === 'HOLD'
           ? route.hedging?.hold_policy
           : route.hedging?.optimal_policy === 'CONTINUE'
           ? route.hedging?.continue_policy
           : route.hedging?.reroute_policy));

  const reeferGensetCost = activePolicyBreakdown?.breakdown?.['reefer_genset_fuel'] ?? 0;

  const operationalCostBreakdown =
    route.operational_cost_breakdown ??
    calculateTotalTripCost({
      distanceKm: route.distance_km,
      durationMinutes: route.eta_minutes,
      commodity: isColdChain(route.hedging?.perishability_tier) ? 'ikan_segar' : undefined,
      tollCostIdr: 0,
    }).operational_cost_breakdown;

  const isBaseline = route.corridor_type === 'land_primary';
  const detourAdditionalCost =
    route.hedging?.reroute_policy?.cost_idr ??
    route.hedging?.reroute_cost_idr ??
    (route.corridor_type === 'land_detour' ? route.economic_comparison?.reroute_total_cost_idr : undefined) ??
    route.tradeoff_analysis?.additional_cost_idr ??
    0;

  const totalTripCost = route.total_operational_cost_idr ?? operationalCostBreakdown.total_operational_cost_idr;

  const holdVsRerouteEconomics = route.economic_comparison;

  const toggleCheck = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleAction = (decision: RouteDecisionType, tacticalAction: TacticalManeuver) => {
    if (isForecast) return;
    if (isSandbox) return;
    if (role === 'REGULATOR' && decision !== 'HOLD') return;
    if (!allChecked) return;
    if ((decision === 'HOLD' || decision === 'OVERRIDE' || decision === 'REJECT') && !notes.trim()) return;
    // Evidence gate: only HOLD may pass without grounded evidence.
    if (decision !== 'HOLD' && !hasEvidence) return;
    void onAction(decision, tacticalAction, notes.trim() || undefined);
  };

  const title =
    route.route_name ||
    (route.corridor_type === 'land_primary'
      ? 'Koridor Darat Primer (Terdampak)'
      : route.corridor_type === 'land_detour'
        ? 'Koridor Darat Pengalihan Bebas Hambatan'
        : route.corridor_type === 'sea_intermodal'
          ? 'Koridor Intermoda Laut + Darat (Ro-Ro / Feeder)'
          : route.corridor_type === 'air_intermodal'
            ? 'Koridor Intermoda Udara + Darat (Cargo Air)'
            : route.corridor_type === 'hold_staging'
              ? 'Opsi Tahan di Depo Penyangga (Hold & Buffer)'
              : route.description.slice(0, 60));

  // Phase 170: same provenance vocabulary as the corridor cards, so the modal
  // can never present hub-graph or interpolated geometry as live road lines.
  const provenance = routeProvenanceLabel(route);

  return (
  <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
  <DialogContent
    // Accessible name = purpose + the visible corridor title (label-in-name). It is
    // set explicitly because a base-ui <Dialog.Title> would own aria-labelledby and
    // the visible corridor name alone does not state what this surface is for.
    aria-label={`Detail rute dan verifikasi operator — ${title}`}
    className="max-w-2xl rounded-2xl border-white/10 bg-[#0c1017] p-0 shadow-2xl tabular-nums max-h-[90vh] overflow-y-auto"
  >
        <style>{`@keyframes wm-modal-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}.wm-modal-rise{animation:wm-modal-rise .22s ease both}`}</style>
        {/* Header */}
        <DialogHeader className="sticky top-0 bg-[#0c1017] border-b border-white/10 p-4 flex-row items-start justify-between gap-3 text-left">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-white/5 text-slate-200 border border-white/10">
                Detail rute
              </span>
              <span
                data-testid="route-provenance-modal"
                title={routeProvenanceTitle(provenance)}
                className={`text-xs font-mono px-2 py-0.5 rounded border ${
                  provenance === 'simulasi offline'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : provenance === 'koridor hub'
                    ? 'bg-white/5 text-slate-200 border-white/10'
                    : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                }`}
              >
                {provenance}
              </span>
            </div>
            <h2 className="text-sm font-bold text-white mt-1.5 leading-snug">
              {title}
            </h2>
            <DialogDescription className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {(route.distance_km ?? 0).toFixed(0)} km · {route.eta_minutes ?? 0} mnt · +{(route.fuel_increase_pct ?? 0).toFixed(0)}% BBM
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail rute"
            className="cursor-pointer p-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* Section 1: Risiko */}
          <section aria-label="Risiko" className="wm-modal-rise border border-white/10 rounded-xl bg-[#080d14] p-3 space-y-2">
            <h3 className="text-xs font-bold font-sans text-slate-100">
              <span>1. Risiko</span>
            </h3>
            <div className="text-xs font-mono space-y-1.5 text-slate-300">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Status keselamatan:</span>
                <span className="font-semibold text-cyan-300 text-right">{route.safety_status ?? 'Tidak tersedia'}</span>
              </div>
              {route.safety_tag && (
                <div className="p-2 rounded bg-[#0c1017] border border-white/10 text-slate-200">
                  {route.safety_tag}
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Kompromi zona bahaya:</span>
                <span className={route.is_compromised ? 'text-rose-400 font-bold' : 'text-slate-200 font-semibold'}>
                  {route.is_compromised ? 'TERDAMPAK' : 'BEBAS'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Passabilitas koridor:</span>
                <span className={passability === 'BLOCKED' ? 'font-bold text-rose-400' : passability === 'CAUTION' ? 'font-semibold text-amber-300' : 'font-semibold text-cyan-300'}>{passability}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Bahaya:</span>
                <span className="text-right">{hazardLabel}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Radius zona:</span>
                <span>{hazardRadius != null ? `${hazardRadius} km` : 'Data tidak tersedia'}</span>
              </div>
              {route.dasar_risiko && (
                <p className="text-xs font-sans text-slate-200 leading-relaxed pt-1 border-t border-white/5">
                  {route.dasar_risiko}
                </p>
              )}
            </div>
          </section>

          {/* Section 2: Dampak & Biaya */}
          <section aria-label="Dampak dan Biaya" className="wm-modal-rise border border-white/10 rounded-xl bg-[#080d14] p-3 space-y-2.5" style={{ animationDelay: '.05s' }}>
            <h3 className="text-xs font-bold font-sans text-slate-100">
              <span>2. Dampak &amp; Biaya</span>
            </h3>
            <div className="text-xs font-mono space-y-1.5 text-slate-300">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Deviasi waktu:</span>
                <span className="font-semibold text-cyan-300">
                  {route.tradeoff_analysis
                    ? formatDelay(route.tradeoff_analysis.time_delta_minutes)
                    : 'Data tidak tersedia'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Kongesti segmen:</span>
                <span>{congestionLevels ?? 'Data tidak tersedia'}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-400">Penghematan bersih (hedging):</span>
                {route.hedging ? (
                  <span className="font-semibold text-cyan-300 font-mono">
                    {formatIDR(route.hedging.net_savings_idr)}
                  </span>
                ) : (
                  <span className="text-slate-500 font-mono text-[11px] italic">Kargo belum dipilih</span>
                )}
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-400">Potensi susut (spoilage):</span>
                {route.hedging ? (
                  <span className="font-semibold text-rose-400 font-mono">
                    {formatIDR(route.hedging.spoilage_loss_idr)}
                  </span>
                ) : (
                  <span className="text-slate-500 font-mono text-[11px] italic">Kargo belum dipilih</span>
                )}
              </div>
              {reeferGensetCost > 0 && (
                <div className="flex justify-between items-center gap-2 p-2 rounded-lg bg-[#0c1017] border border-white/10 text-xs font-mono">
                  <span className="text-slate-400 font-sans font-medium">
                    Genset reefer ({previewPolicy}):
                  </span>
                  <span className="font-semibold text-cyan-300 font-mono">
                    {formatIDR(reeferGensetCost)}
                  </span>
                </div>
              )}
              {route.hedging?.optimal_policy && (
                <div className="flex justify-between items-center gap-2 text-xs font-mono pt-1">
                  <span className="text-slate-400">Kebijakan optimal:</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold font-mono border ${
                    route.hedging.optimal_policy === 'HOLD'
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : 'bg-white/5 text-slate-200 border-white/10'
                  }`}>
                    {route.hedging.optimal_policy}
                  </span>
                </div>
              )}
              {(activePolicyBreakdown?.explanation || route.hedging?.recommendation_reason) && (
                <p className="text-[11px] font-sans text-slate-300 leading-relaxed p-2 rounded bg-[#0c1017] border border-white/5">
                  {activePolicyBreakdown?.explanation || route.hedging?.recommendation_reason}
                </p>
              )}
              {route.dampak && (
                <p className="text-xs font-sans text-slate-200 leading-relaxed pt-1 border-t border-white/5">
                  {route.dampak}
                </p>
              )}
              {!route.tradeoff_analysis && !route.hedging && (
                <p className="text-xs text-slate-500 italic">
                  Data dampak kuantitatif belum tersedia. Kargo belum dipilih.
                </p>
              )}
            </div>

            {route.tradeoff_analysis && (
              <div className="grid grid-cols-2 gap-2 text-xs leading-relaxed">
                <div className="p-2 rounded-md bg-[#0c1017] border border-white/10">
                  <span className="block text-xs font-semibold text-slate-200 mb-1 font-sans">
                    Manfaat
                  </span>
                  <ul className="space-y-1 text-slate-300 font-sans">
                    {route.tradeoff_analysis.pros.map((pro, i) => (
                      <li key={i}><span className="text-slate-500">• </span>{pro}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-2 rounded-md bg-[#0c1017] border border-white/10">
                  <span className="block text-xs font-semibold text-slate-200 mb-1 font-sans">
                    Konsekuensi
                  </span>
                  <ul className="space-y-1 text-slate-300 font-sans">
                    {route.tradeoff_analysis.cons.map((con, i) => (
                      <li key={i}><span className="text-slate-500">• </span>{con}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Rincian Biaya Operasional Total */}
            <div className="p-3 rounded-lg bg-[#0c1017] border border-white/10 space-y-2 mt-2 font-mono">
              <div className="flex justify-between items-center pb-2 border-b border-white/10">
                <span className="text-xs font-sans font-semibold text-slate-200">
                  Total Estimasi Biaya Rit:
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-cyan-300 font-mono tabular-nums">
                    {formatTripCostIDR(totalTripCost)}
                  </span>
                  <span className="text-xs font-mono text-slate-500 tabular-nums">
                    ({formatCompactIDR(totalTripCost)})
                  </span>
                </div>
              </div>
              <div className="space-y-1 text-xs text-slate-300">
                {route.corridor_type === 'sea_intermodal' || route.corridor_type === 'air_intermodal' || route.corridor_type === 'hold_staging' ? (
                  <>
                    {route.tradeoff_analysis?.cost_breakdown_items?.map((item, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <span className="text-slate-400 font-sans">{item.label}:</span>
                        <span className="tabular-nums">Rp {item.amount_idr.toLocaleString('id-ID')}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 font-sans">BBM Biosolar (3,5 km/L):</span>
                      <span className="tabular-nums">Rp {operationalCostBreakdown.fuel_cost_idr.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 font-sans">Upah Supir Operasional:</span>
                      <span className="tabular-nums">Rp {operationalCostBreakdown.labor_cost_idr.toLocaleString('id-ID')}</span>
                    </div>
                    {operationalCostBreakdown.reefer_genset_cost_idr > 0 && (
                      <div className="flex justify-between gap-2">
                        <span className="font-sans text-slate-400">
                          Genset Reefer:
                        </span>
                        <span className="tabular-nums text-cyan-300">Rp {operationalCostBreakdown.reefer_genset_cost_idr.toLocaleString('id-ID')}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 font-sans">Tarif Tol BPJT:</span>
                      <span className="tabular-nums">
                        {operationalCostBreakdown.toll_cost_idr > 0
                          ? `Rp ${operationalCostBreakdown.toll_cost_idr.toLocaleString('id-ID')}`
                          : 'Rp 0 (Non-Tol)'}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div className="pt-2 border-t border-white/5 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-sans">
                  {route.corridor_type === 'sea_intermodal' || route.corridor_type === 'air_intermodal'
                    ? 'Tambahan Biaya Alih Antarmoda:'
                    : 'Tambahan Biaya Pengalihan:'}
                </span>
                <span className={detourAdditionalCost > 0 && !isBaseline ? "font-semibold text-cyan-300 tabular-nums" : "text-slate-400 tabular-nums"}>
                  {detourAdditionalCost > 0 && !isBaseline
                    ? `+Rp ${detourAdditionalCost.toLocaleString('id-ID')}`
                    : 'Rp 0 (Jalur Normal Acuan)'}
                </span>
              </div>
            </div>

            {/* Pratinjau Hold vs Reroute */}
            {holdVsRerouteEconomics ? (
              <HoldVsRerouteCard
                economics={holdVsRerouteEconomics}
                onApplyTactical={(action) => setPreviewPolicy(action)}
                selectedAction={previewPolicy === 'CONTINUE' ? 'CONTINUE' : previewPolicy}
              />
            ) : (
              <div className="p-2.5 rounded-xl bg-[#0c1017] border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold font-sans text-slate-200">
                    Pratinjau kebijakan (Hold vs Reroute)
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
                    Simulasi
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  {(['REROUTE', 'HOLD', 'CONTINUE'] as TacticalManeuver[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPreviewPolicy(t)}
                      className={`cursor-pointer py-1.5 px-2 rounded-lg border text-xs font-mono transition-all flex flex-col items-center justify-center gap-0.5 ${
                        previewPolicy === t
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold shadow-sm'
                          : 'bg-[#121822] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="text-[11px] font-semibold">{t}</span>
                      <span className="text-[9px] text-slate-400 font-sans">
                        {t === 'REROUTE' ? 'Pengalihan' : t === 'HOLD' ? 'Tahan Depo' : 'Jalur Asal'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Section 3: Verifikasi */}
          <section aria-label="Verifikasi" className="wm-modal-rise border border-white/10 rounded-xl bg-[#080d14] p-3 space-y-2.5" style={{ animationDelay: '.1s' }}>
            <h3 className="text-xs font-bold font-sans text-slate-100">
              <span>3. Verifikasi</span>
            </h3>
            <ul className="text-xs font-mono text-slate-300 space-y-1.5">
              <li className="flex justify-between gap-2">
                <span className="text-slate-400">Kepatuhan:</span>
                <span className="text-right">
                  {route.compliance
                    ? `${route.compliance.status} — ${route.compliance.summary}`
                    : 'Data tidak tersedia'}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-400">Data hedging:</span>
                <span>{route.hedging ? 'Tersedia' : 'Tidak tersedia'}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-400">Tautan berita:</span>
                <span>
                  {newsLinks.length === 0
                    ? 'Tidak ada rujukan'
                    : `${newsLinks.length} rujukan${deadLinks > 0 ? ` (${deadLinks} kedaluwarsa)` : ''}`}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-400">Konteks koridor:</span>
                <span>{corridorIsFallback ? 'CACHE/FALLBACK — telemetri basi' : 'Live'}</span>
              </li>
              {route.keterbatasan_data?.map((item, i) => (
                <li key={i} className="text-slate-400">• {item}</li>
              ))}
            </ul>

            {/* Provenance */}
            <div className="pt-2.5 border-t border-white/5 space-y-1.5">
              <span className="text-[10px] font-sans text-slate-400 font-bold uppercase tracking-wider block">
                Sumber data
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <div
                  className={`p-1.5 rounded border text-[10px] font-mono flex flex-col items-center text-center transition ${
                    corridorIsFallback
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  }`}
                  title={
                    corridorIsFallback
                      ? 'Fallback: data historis / simulasi ketika live TomTom API tidak tersedia'
                      : 'Live: Segment flow TomTom Traffic API realtime'
                  }
                >
                  <span className="font-bold">{corridorIsFallback ? '[SEED FALLBACK]' : '[LIVE TOMTOM]'}</span>
                  <span className="text-[9px] text-slate-400">Trafik Jalan</span>
                </div>
                <div
                  className="p-1.5 rounded border text-[10px] font-mono flex flex-col items-center text-center bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                  title="Live: Radar cuaca presipitasi BMKG 10 provinsi Sumatra + spatial fusion Open-Meteo NWP"
                >
                  <span className="font-bold">[BMKG RADAR]</span>
                  <span className="text-[9px] text-slate-400">Cuaca Ekstrem</span>
                </div>
                <div
                  className="p-1.5 rounded border text-[10px] font-mono flex flex-col items-center text-center bg-sky-500/10 border-sky-500/30 text-sky-300"
                  title="Live: AIS Stream satelit pelacakan posisi kapal kargo Selat Malaka, Selat Sunda, dan Pelabuhan Belawan"
                >
                  <span className="font-bold">[AIS STREAM]</span>
                  <span className="text-[9px] text-slate-400">Vessel Selat</span>
                </div>
                {onOpenEvaluation ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenEvaluation();
                    }}
                    className="cursor-pointer p-1.5 rounded border text-[10px] font-mono flex flex-col items-center text-center bg-purple-500/10 hover:bg-purple-500/25 border-purple-500/30 hover:border-purple-400/60 text-purple-300 transition"
                    title={`Buka Benchmark Empiris N=${benchN ?? '–'} Skenario Disrupsi Sumatra: ${benchSummary}`}
                  >
                    <span className="font-bold flex items-center gap-0.5">
                      [BENCHMARK N={benchN ?? '–'}]
                      <span className="text-[9px] text-purple-400">↗</span>
                    </span>
                    <span className="text-[9px] text-purple-400/80">{benchShort}</span>
                  </button>
                ) : (
                  <div
                    className="p-1.5 rounded border text-[10px] font-mono flex flex-col items-center text-center bg-purple-500/10 border-purple-500/30 text-purple-300"
                    title={`Benchmark Empiris N=${benchN ?? '–'} Skenario Disrupsi Sumatra: ${benchSummary}`}
                  >
                    <span className="font-bold">[BENCHMARK N={benchN ?? '–'}]</span>
                    <span className="text-[9px] text-slate-400">{benchShort}</span>
                  </div>
                )}
              </div>
            </div>

            {isForecast ? (
              <p className="text-xs font-sans text-cyan-100/80 leading-relaxed p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/40">
                Prakiraan waspada dini — belum terkonfirmasi sebagai bencana aktif. Waspada — pantau, belum perlu tindakan; tanpa pengalihan rute maupun penahanan armada.
              </p>
            ) : role === 'GUEST' ? (
              <p className="text-xs font-sans text-slate-400 leading-relaxed p-2.5 rounded-lg bg-[#0c1017] border border-white/10">
                Pratinjau read-only — masuk sebagai Dispatcher untuk verifikasi operator dan commit.
              </p>
            ) : (
              <>
            <div className="space-y-1.5 pt-1">
              {CHECKLIST_ITEMS.map((item) => {
                const isChecked = !!checked[item.id] || (item.id === 'notes' && notes.trim().length > 0);
                return (
                  <label
                    key={item.id}
                    className="flex items-start gap-2.5 p-2 rounded-lg bg-[#0c1017] border border-white/10 cursor-pointer hover:border-cyan-500/40 transition text-xs font-sans text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCheck(item.id)}
                      className="mt-0.5 w-4 h-4 accent-cyan-400 cursor-pointer"
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
            <div className="text-xs font-mono text-slate-400">
              {CHECKLIST_ITEMS.filter((item) => !!checked[item.id] || (item.id === 'notes' && notes.trim().length > 0)).length}/4 verifikasi selesai
            </div>

            {isSandbox ? (
              <p className="text-xs font-sans text-slate-400 leading-relaxed p-2.5 rounded-lg bg-[#0c1017] border border-white/10">
                Pratinjau read-only — tidak ada commit operasional pada peran ini.
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  <label htmlFor="operator-notes" className="text-[11px] font-sans font-medium text-slate-300 flex items-center justify-between">
                    <span>Catatan operator</span>
                    <span className="text-[10px] font-mono text-amber-400/90">*Wajib untuk HOLD &amp; OVERRIDE</span>
                  </label>
                  <textarea
                    id="operator-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Catatan operator: alasan penahanan depo / justifikasi rute asal (HOLD / OVERRIDE)..."
                    rows={2}
                    className="w-full bg-[#0c1017] border border-white/10 focus:border-cyan-500/50 rounded-lg p-2.5 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none transition-colors"
                  />
                </div>
                {!hasEvidence && (
                  <p className="text-xs font-mono text-amber-300/90 leading-relaxed">
                    Belum terverifikasi — rute simulasi/offline atau bukti belum tersedia. Approval dinonaktifkan, hanya TAHAN yang diizinkan.
                  </p>
                )}
                {/* Single CTA row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleAction('APPROVE', 'REROUTE')}
                    disabled={!canApprove}
                    aria-label={role === 'REGULATOR' ? 'SETUJUI [Khusus Dispatcher]' : 'SETUJUI'}
                    title={
                      role === 'REGULATOR'
                        ? 'Memerlukan peran Dispatcher [Khusus Dispatcher]'
                        : !hasEvidence
                        ? 'Belum terverifikasi — approval dinonaktifkan'
                        : !allChecked
                        ? 'Lengkapi 4/4 verifikasi checklist'
                        : 'Setujui pengalihan rute armada'
                    }
                    className="cursor-pointer py-2.5 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-[#080d14] text-xs font-sans font-bold flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-cyan-950/40"
                  >
                    <span>Setujui Pengalihan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction('HOLD', 'HOLD')}
                    disabled={!canHold}
                    aria-label="TAHAN"
                    title={
                      !notes.trim()
                        ? 'Wajib mengisi catatan operator untuk aksi HOLD'
                        : !allChecked
                        ? 'Lengkapi 4/4 verifikasi checklist'
                        : 'Tahan armada di buffer zone / depo'
                    }
                    className="cursor-pointer py-2.5 px-3 rounded-lg bg-amber-600/90 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-sans font-semibold flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-amber-950/40"
                  >
                    <span>Tahan Armada</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction('OVERRIDE', 'CONTINUE')}
                    disabled={!canOverride}
                    aria-label={role === 'REGULATOR' ? 'OVERRIDE [Khusus Dispatcher]' : 'OVERRIDE'}
                    title={
                      role === 'REGULATOR'
                        ? 'Memerlukan peran Dispatcher [Khusus Dispatcher]'
                        : !hasEvidence
                        ? 'Belum terverifikasi — approval dinonaktifkan'
                        : !notes.trim()
                        ? 'Wajib mengisi catatan operator untuk aksi OVERRIDE'
                        : !allChecked
                        ? 'Lengkapi 4/4 verifikasi checklist'
                        : 'Lanjut rute asal dengan justifikasi operator'
                    }
                    className="cursor-pointer py-2.5 px-3 rounded-lg bg-[#121822] hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-white/10 text-xs font-sans font-medium flex items-center justify-center gap-1.5 transition-all"
                  >
                    <span>Lanjut Jalur Asal</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isActing}
                  className="cursor-pointer w-full py-2 px-3 rounded-lg bg-transparent hover:bg-white/5 disabled:opacity-40 text-slate-400 hover:text-slate-200 text-xs font-sans transition-all text-center border border-white/5"
                >
                  Batal / Tutup
                </button>
                {!allChecked ? (
                  <p className="text-xs font-mono text-slate-500">
                    Lengkapi 4/4 verifikasi untuk mengaktifkan tombol keputusan.
                  </p>
                ) : !notes.trim() ? (
                  <p className="text-xs font-mono text-amber-400/80">
                    * Catatan wajib diisi jika memilih Tahan Armada atau Lanjut Jalur Asal.
                  </p>
                ) : null}
              </>
            )}
              </>
            )}
          </section>

          {/* Prinsip Operasional 20/80 */}
          <div className="p-3 rounded-xl bg-[#080d14] border border-white/10 text-[11px] font-sans text-slate-400 leading-relaxed space-y-1">
            <span className="font-semibold text-slate-200">
              <span>Prinsip Operasional 20/80</span>
            </span>
            <p>
              Rekomendasi rute sistem merupakan panduan digital awal; konfirmasi kondisi fisik lapangan dan kelas jalan tetap menjadi kewenangan Dispatcher.
            </p>
          </div>
        </div>
  </DialogContent>
  </Dialog>
   );
 }
