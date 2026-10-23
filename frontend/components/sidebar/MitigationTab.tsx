'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { normalizeRegion } from '@/lib/region';
import type { 
  CrisisState, 
  RouteRecommendation, 
  DecisionAction, 
  TacticalManeuver,
  ApprovalItem
} from '@/lib/types';
import { 
  AlertTriangle, 
  CheckCircle2, 
  MapPin, 
  Clock, 
  Fuel, 
  Truck, 
  Anchor, 
  Train, 
  Plane, 
  Waves, 
  TrendingUp,
  PauseCircle,
  SlidersHorizontal,
  Send,
  X,
  FileText,
  Scale,
  Shield,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { normalizeNewsPermalink } from '@/hooks/useNewsVerification';
import { SpoilageHedgingCard } from './SpoilageHedgingCard';
import { ComplianceInspectorCard } from './ComplianceInspectorCard';
import { HoldVsRerouteCard } from './HoldVsRerouteCard';

interface MitigationTabProps {
  crisis: CrisisState;
  activeRouteIdx: number | null;
  onSelectRoute: (idx: number) => void;
  onApproveSuccess?: (msg: string) => void;
  onCommitOperationalRoute?: (route: RouteRecommendation, action: DecisionAction, tactical: TacticalManeuver) => void;
  selectedImpactedVehicle?: import('@/lib/types').ImpactedVehicleAssessment | null;
}

interface RouteCardProps {
  route: RouteRecommendation;
  idx: number;
  isActive: boolean;
  onSelect: () => void;
  isApproved: boolean;
  approvalData?: ApprovalItem | null;
  approving: boolean;
  onApprove: (action: DecisionAction, tacticalAction: TacticalManeuver, notes?: string) => Promise<void>;
  selectedImpactedVehicle?: import('@/lib/types').ImpactedVehicleAssessment | null;
  crisisHasEvidence: boolean;
}

// HITL integrity gate (Phase 82 audit): HITL approval is only enabled on a LIVE
// grounded route + evidence. SIMULASI/OFFLINE straight-line interpolations or
// routes without evidence keep Approve/Reroute disabled; HOLD stays allowed.
const HITL_UNVERIFIED_COPY =
  'Belum terverifikasi — rute SIMULASI/OFFLINE atau bukti belum tersedia. Approval dinonaktifkan.';
const HITL_PENDING_COPY = 'Tercatat sebagai HITL pending — belum dikirim ke armada';

function isSimulatedRoute(route: RouteRecommendation): boolean {
  const combined = `${route.route_name ?? ''} ${route.description ?? ''} ${route.safety_tag ?? ''}`;
  if (/SIMULASI/i.test(combined) || /OFFLINE/i.test(combined)) return true;
  const source = (route as unknown as { source?: string }).source;
  if (source === 'offline-interpolated') return true;
  // No safety_status means the corridor was never grounded by live routing.
  if (!route.safety_status) return true;
  return false;
}

function hasRouteProof(route: RouteRecommendation): boolean {
  const proof = (route as unknown as { proof?: unknown }).proof;
  if (proof !== undefined && proof !== null && String(proof).trim().length > 0) return true;
  if (typeof route.dampak === 'string' && route.dampak.trim().length > 0) return true;
  if (typeof route.dasar_risiko === 'string' && route.dasar_risiko.trim().length > 0) return true;
  return false;
}

function hasCrisisEvidence(crisis: CrisisState): boolean {
  if ((crisis.news_attributions?.length ?? 0) > 0) return true;
  if ((crisis.verified_news_citations?.length ?? 0) > 0) return true;
  if (crisis.evidence?.osint_text?.trim() || crisis.evidence?.osint_author?.trim()) return true;
  return false;
}

function FormattedMarkdown({ content }: { content: string }) {
  if (!content) return <p className="text-xs text-slate-400 italic">Sistem memadukan sensor cuaca BMKG dan telemetri arus jalan. Menunggu penetapan rute armada.</p>;

  // Remove robotic header if present
  const cleaned = content.replace(/^===.*===\s*/g, '');
  const paragraphs = cleaned.split(/\n\n+/);

  return (
    <div className="space-y-2 text-xs font-sans text-slate-200 leading-relaxed">
      {paragraphs.map((para, pIdx) => {
        const isBullet = para.trim().startsWith('•') || para.trim().startsWith('-');
        const lines = para.split('\n');

        return (
          <div key={pIdx} className={isBullet ? 'pl-1 font-sans' : ''}>
            {lines.map((line, lIdx) => {
              const parts = line.split(/(\*\*[^*]+\*\*)/g);
              return (
                <div key={lIdx} className="mb-0.5">
                  {parts.map((part, partIdx) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return (
                        <strong key={partIdx} className="font-bold text-cyan-300 font-mono">
                          {part.slice(2, -2)}
                        </strong>
                      );
                    }
                    return <span key={partIdx}>{part}</span>;
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function RouteCard({
  route,
  idx,
  isActive,
  onSelect,
  isApproved,
  approvalData,
  approving,
  onApprove,
  selectedImpactedVehicle,
  crisisHasEvidence,
}: RouteCardProps) {
  const { role } = useAuth();
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideNotes, setOverrideNotes] = useState('');
  const [overrideTactical, setOverrideTactical] = useState<TacticalManeuver>('CONTINUE');
  const [validationError, setValidationError] = useState<string | null>(null);

  const isCompromised = route.is_compromised;
  const isNonViable = route.viable === false;
  const isHoldStaging = route.corridor_type === 'hold_staging';

  // HITL integrity gate: LIVE grounded route + evidence required for Approve/Reroute.
  const isSimulated = isSimulatedRoute(route);
  const hasEvidence = crisisHasEvidence || hasRouteProof(route);
  const hitlBlocked = isSimulated || !hasEvidence;
  const provenanceLabel = isSimulated ? 'SIMULASI/OFFLINE' : 'LIVE';
  // GUEST sandbox is zero-POST local preview, so its buttons stay enabled;
  // the gate only locks real ledger writes. HOLD tactics stay allowed for all roles.
  const approveLocked = hitlBlocked && !isHoldStaging && role !== 'GUEST';

  const cardBorderColor = isCompromised
    ? 'border-red-500/50 bg-red-950/20'
    : isNonViable
      ? 'border-white/5 bg-slate-900/40 opacity-75 hover:opacity-100'
      : isActive
        ? 'border-cyan-400/80 bg-cyan-950/30 ring-2 ring-cyan-400/40'
        : 'border-white/10 bg-slate-800/40 hover:border-white/20';

  const titleText =
    route.route_name ||
    (() => {
      switch (route.corridor_type) {
        case 'land_primary':
          return 'Koridor Darat Primer (Terdampak)';
        case 'land_detour':
          return 'Koridor Darat Pengalihan Bebas Hambatan';
        case 'sea_intermodal':
          return 'Koridor Intermoda Laut + Darat (Ro-Ro / Feeder)';
        case 'air_intermodal':
          return 'Koridor Intermoda Udara + Darat (Cargo Air)';
        case 'hold_staging':
          return 'Opsi Tahan di Depo Penyangga (Hold & Buffer)';
        default:
          return idx === 0 ? 'Rute Rekomendasi Utama' : `Rute Alternatif ${idx + 1}`;
      }
    })();

  const handleExecuteOverride = async () => {
    if (!overrideNotes.trim()) {
      setValidationError('Catatan alasan wajib diisi untuk tindakan Override / Modifikasi.');
      return;
    }
    if (hitlBlocked && overrideTactical !== 'HOLD' && role !== 'GUEST') {
      setValidationError(HITL_UNVERIFIED_COPY);
      return;
    }
    setValidationError(null);
    await onApprove('OVERRIDE', overrideTactical, overrideNotes.trim());
    setShowOverrideModal(false);
  };

  return (
    <div
      id={`route-option-${idx}`}
      onClick={onSelect}
      className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${cardBorderColor}`}
    >
      <div className="flex justify-between items-start mb-1.5 gap-2">
        <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
            style={{
              backgroundColor:
                route.color ||
                (isHoldStaging ? '#F59E0B' : idx === 0 ? '#00f0ff' : '#3b82f6'),
            }}
          />
          <span>{titleText}</span>
        </span>

        <span className="inline-flex items-center gap-1.5 shrink-0">
        {isCompromised ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> TERDAMPAK
          </span>
        ) : isNonViable ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/10">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> NON-VIABEL
          </span>
        ) : isHoldStaging ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <PauseCircle className="w-3.5 h-3.5 text-amber-400" /> TAHAN DI DEPO
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> JALUR AMAN
          </span>
        )}
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${
              isSimulated
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
            }`}
            title={isSimulated ? 'Geometri interpolasi, bukan jalan raya live' : 'Rute jalan raya live ter-grounding'}
          >
            {provenanceLabel}
          </span>
        </span>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed mb-2 font-mono">
        {route.description}
      </p>

      {/* Non-Viable Callout Warning */}
      {isNonViable && route.non_viable_reason && (
        <div className="mb-2 p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/30 text-xs text-amber-200/90 font-mono flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-amber-300 block mb-0.5">Alasan Koridor Tidak Direkomendasikan:</span>
            <span>{route.non_viable_reason}</span>
          </div>
        </div>
      )}

      {typeof route.explainer === 'string' && route.explainer.length > 0 && (
        <p className="text-xs text-cyan-300/90 leading-relaxed mb-2 font-sans italic">
          {route.explainer}
        </p>
      )}

      {route.safety_tag && (
        <div className="mb-2 text-xs font-mono font-medium text-slate-300 bg-[#121822] px-2 py-1 rounded border border-[#1c2432]">
          {route.safety_tag}
        </div>
      )}

      {/* Multi-modal Leg Breakdown with Custom Palette */}
      {route.legs && route.legs.length > 0 && (
        <div className="mb-2 p-2.5 rounded-lg bg-[#0c1017] border border-white/10 flex flex-col gap-1.5 text-xs font-mono">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400 font-semibold border-b border-white/5 pb-1">
            <span>Rincian Leg Logistik Multi-Moda</span>
            <span className="text-slate-500 font-normal">{route.legs.length} Segmen</span>
          </div>
          {route.legs.map((leg, lIdx) => {
            const legColor =
              leg.color ||
              (leg.mode === 'truck'
                ? '#10B981'
                : leg.mode === 'maritime'
                ? '#3B82F6'
                : (leg.mode as string) === 'air'
                ? '#00F0FF'
                : '#F59E0B');

            return (
              <div
                key={lIdx}
                className="flex flex-col gap-0.5 border-b border-white/5 pb-1.5 last:border-b-0 last:pb-0"
              >
                <div className="flex justify-between items-center text-slate-300">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: legColor }}
                    />
                    <span className="flex items-center gap-1.5">
                      {leg.mode === 'truck' ? (
                        <Truck className="w-3.5 h-3.5" style={{ color: legColor }} />
                      ) : leg.mode === 'maritime' ? (
                        <Anchor className="w-3.5 h-3.5" style={{ color: legColor }} />
                      ) : (leg.mode as string) === 'air' ? (
                        <Plane className="w-3.5 h-3.5" style={{ color: legColor }} />
                      ) : (
                        <Train className="w-3.5 h-3.5" style={{ color: legColor }} />
                      )}
                      <span className="font-medium text-slate-200">{leg.title}</span>
                    </span>
                  </span>
                  <span className="text-white font-semibold tabular-nums text-[11px]">
                    {leg.eta_minutes} min ({leg.distance_km} km)
                  </span>
                </div>
                {leg.transfer_hub && (
                  <div className="flex items-center gap-1.5 pl-6 text-[10px] text-cyan-300/80">
                    <span className="w-1 h-1 rounded-full bg-cyan-400 shrink-0" />
                    <span>
                      Simpul Alih:{' '}
                      <strong className="text-cyan-200">{leg.transfer_hub.name}</strong>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 font-mono mb-1">
        <span className="inline-flex items-center gap-1">
          <MapPin className="w-3 h-3 text-slate-400" /> {(route.distance_km ?? 0).toFixed(0)} km
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3 text-amber-400" /> {route.eta_minutes ?? 0} min
        </span>
        <span className="inline-flex items-center gap-1">
          <Fuel className="w-3 h-3 text-emerald-400" /> +{(route.fuel_increase_pct ?? 0).toFixed(0)}%
        </span>
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${
            isSimulated
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
              : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
          }`}
          title={isSimulated ? 'Angka estimasi SIMULASI/OFFLINE, bukan pengukuran live' : 'Angka rute live ter-grounding'}
        >
          {provenanceLabel}
        </span>
      </div>

      {/* Structured Trade-Off Analysis (Pros / Cons + Delay & Cost Breakdown) */}
      {route.tradeoff_analysis && (
        <div className="mt-2 p-2.5 rounded-lg bg-[#0c1017] border border-white/10 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 font-sans">
              Analisis Trade-Off (Untung / Rugi &amp; Biaya Operasional)
            </span>
            <Scale className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25">
              <Clock className="w-3 h-3" />
              <span>
                ΔWaktu:{' '}
                {route.tradeoff_analysis.time_delta_minutes <= 0
                  ? 'Tepat Waktu'
                  : `+${Math.floor(route.tradeoff_analysis.time_delta_minutes / 60)} jam ${route.tradeoff_analysis.time_delta_minutes % 60} mnt`}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
              <Fuel className="w-3 h-3" />
              <span>ΔBiaya: +Rp {(route.tradeoff_analysis.additional_cost_idr ?? 0).toLocaleString('id-ID')}</span>
            </span>
          </div>
          {route.tradeoff_analysis.cost_breakdown_items && route.tradeoff_analysis.cost_breakdown_items.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {route.tradeoff_analysis.cost_breakdown_items.map((item, bIdx) => (
                <span
                  key={bIdx}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10"
                  title={`${item.label}: Rp ${item.amount_idr.toLocaleString('id-ID')}`}
                >
                  {item.label}: Rp {item.amount_idr.toLocaleString('id-ID')}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-[11px] leading-relaxed">
            <div className="p-2 rounded-md bg-emerald-950/30 border border-emerald-500/20">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-1 font-sans">
                Kelebihan
              </span>
              <ul className="flex flex-col gap-1 text-emerald-100/90 font-sans">
                {route.tradeoff_analysis.pros.map((pro, pIdx) => (
                  <li key={pIdx} className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-2 rounded-md bg-amber-950/20 border border-amber-500/20">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-1 font-sans">
                Kekurangan / Risiko
              </span>
              <ul className="flex flex-col gap-1 text-amber-100/90 font-sans">
                {route.tradeoff_analysis.cons.map((con, cIdx) => (
                  <li key={cIdx} className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                    <span>{con}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {(route.affected_port_name || route.alternate_port_name) && (
            <div className="text-[10px] font-mono text-cyan-300/80">
              {route.affected_port_name && <span>Pelabuhan terdampak: {route.affected_port_name}</span>}
              {route.affected_port_name && route.alternate_port_name && <span> → </span>}
              {route.alternate_port_name && <span>Alternatif: {route.alternate_port_name}</span>}
            </div>
          )}
        </div>
      )}

      {isActive && (
        <div className="mt-3 pt-2.5 border-t border-[#1c2432] flex flex-col gap-2">
          {isApproved ? (
            <div className="w-full py-2.5 px-3 rounded-md border border-[#1c2432] bg-[#121822] text-xs font-bold flex flex-col gap-1 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {approvalData?.action === 'OVERRIDE' ? (
                    <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                  ) : approvalData?.tactical_action === 'HOLD' ? (
                    <PauseCircle className="w-4 h-4 text-amber-400" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  <span className="text-white">
                    {approvalData?.action === 'OVERRIDE'
                      ? 'MODIFIKASI OPERATOR'
                      : approvalData?.tactical_action === 'HOLD'
                        ? 'INSTRUKSI TAHAN ARMADA'
                        : 'TERCATAT • HITL PENDING'}
                  </span>
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {approvalData?.tactical_action || 'REROUTE'}
                </span>
              </div>
              {approvalData?.action !== 'OVERRIDE' && (
                <p className="text-[10px] font-mono text-slate-400 leading-relaxed">
                  {HITL_PENDING_COPY}
                </p>
              )}
              {approvalData?.notes && (
                <div className="text-xs font-normal p-2 rounded border border-[#1c2432] bg-[#0c1017] text-slate-300 flex items-start gap-1.5 mt-1 font-mono">
                  <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                  <span>{approvalData.notes}</span>
                </div>
              )}

              {/* WhatsApp Driver Dispatch Action (Phase 45/48 Drill 1) */}
              {(() => {
                const targetPhone = (selectedImpactedVehicle?.driver_phone || '6281234567891').replace(/^\+/, '').replace(/\s+/g, '');
                const targetTruck = selectedImpactedVehicle?.vehicle_id || 'TRK-003-BELAWAN-TEBING';
                const targetVehicleName = selectedImpactedVehicle?.vehicle_name || 'Unit Logistik';
                const targetCargo = selectedImpactedVehicle ? `${selectedImpactedVehicle.cargo_tonnage}T ${selectedImpactedVehicle.commodity_key}` : 'Cabai Merah';
                
                return (
                  <a
                    href={`https://wa.me/${targetPhone}?text=${encodeURIComponent(
                      `PERINTAH DISPATCH RESMI - PIDI\n` +
                      `Armada: ${targetTruck} (${targetVehicleName})\n` +
                      `Muatan: ${targetCargo}\n` +
                      `Tindakan: ${approvalData?.tactical_action || 'REROUTE'}\n` +
                      `Rute Pengalihan: ${route.route_name || route.description}\n` +
                      `Status: Jalur utama terblokir gangguan. Ikuti koordinat alternatif mitigasi.\n` +
                      (approvalData?.notes ? `Catatan: ${approvalData.notes}\n` : '') +
                      `Harap segera konfirmasi penerimaan instruksi ini.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="w-full mt-2 py-2 px-3 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
                    title="Kirim instruksi pengalihan rute ke WhatsApp Pengemudi"
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    <span>Kirim Disposisi WhatsApp ke Driver ({targetTruck})</span>
                  </a>
                );
              })()}
            </div>
          ) : isCompromised ? (
            <div className="w-full py-2 px-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono font-semibold text-center flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Rute Terdampak Gangguan (Tidak Disarankan)</span>
            </div>
          ) : (
            <>
              {role === 'REGULATOR' ? (
                <>
                  <div className="w-full p-3 rounded-md bg-[#121822] border border-[#1c2432] text-slate-200 flex flex-col gap-1 text-xs font-mono">
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        <span className="text-white">Akses Regulator (Pengawas)</span>
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-slate-300 border border-white/20">
                        HOLD SAJA
                      </span>
                    </div>
                    <p className="text-xs font-sans text-slate-400 leading-snug pt-0.5">
                      Mode Regulator berwenang memantau koridor makro dan disparitas harga. Persetujuan pengalihan rute armada didelegasikan kepada Dispatcher logistik — Regulator hanya dapat menandai HOLD.
                    </p>
                  </div>
                  {/* Regulator HOLD-only: APPROVE locked, HOLD enabled */}
                  {hitlBlocked && (
                    <div className="w-full p-2.5 rounded-md bg-amber-950/20 border border-amber-500/30 text-amber-200/90 text-xs font-mono leading-relaxed">
                      {HITL_UNVERIFIED_COPY}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled
                      title="Memerlukan peran Dispatcher [Khusus Dispatcher]"
                      className="py-2 px-2.5 rounded-md text-xs font-semibold uppercase tracking-wider bg-[#121822] border border-[#1c2432] text-slate-500 flex items-center justify-center gap-1.5 cursor-not-allowed opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>SETUJUI [Khusus Dispatcher]</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onApprove('ACCEPT', 'HOLD', 'Regulator menandai HOLD untuk koridor ini.');
                      }}
                      disabled={approving}
                      className="py-2 px-2.5 rounded-md text-xs font-semibold uppercase tracking-wider bg-[#121822] hover:bg-slate-800 border border-amber-500/40 text-amber-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Tandai HOLD sebagai pengawas"
                    >
                      <PauseCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>TAHAN (HOLD)</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* HITL integrity gate: Approve/Reroute locked until LIVE + evidence; HOLD stays allowed. */}
                  {hitlBlocked && role !== 'GUEST' && (
                    <div className="w-full p-2.5 rounded-md bg-amber-950/20 border border-amber-500/30 text-amber-200/90 text-xs font-mono leading-relaxed">
                      {HITL_UNVERIFIED_COPY}
                    </div>
                  )}
                  {/* Tactical Buttons Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* 1. Primary: Approve Reroute or Hold */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isHoldStaging) {
                          onApprove('ACCEPT', 'HOLD', 'Armada diinstruksikan menahan laju di depo penyangga aman.');
                        } else {
                          onApprove('ACCEPT', 'REROUTE');
                        }
                      }}
                      disabled={approving || isNonViable || approveLocked}
                      className={`py-2 px-2.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        isHoldStaging
                          ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold'
                          : 'bg-white hover:bg-slate-200 text-[#080d14]'
                      }`}
                      title={
                        approveLocked
                          ? HITL_UNVERIFIED_COPY
                          : isNonViable
                          ? 'Koridor ini tidak viabel untuk eksekusi langsung'
                          : role === 'GUEST'
                          ? 'Simpan rencana rute dalam sandbox evaluasi tamu'
                          : 'Setujui dan instruksikan armada'
                      }
                    >
                      {isHoldStaging ? (
                        <PauseCircle className="w-3.5 h-3.5 text-slate-950 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#080d14] shrink-0" />
                      )}
                      <span>
                        {role === 'GUEST'
                          ? 'SIMPAN RENCANA'
                          : isHoldStaging
                          ? 'TAHAN DI DEPO'
                          : isNonViable
                          ? 'TIDAK VIABEL'
                          : 'SETUJUI RUTE'}
                      </span>
                    </button>

                    {/* 2. Secondary: Hold Fleet */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onApprove('ACCEPT', 'HOLD', 'Armada diinstruksikan menahan laju di safe point terdekat.');
                      }}
                      disabled={approving}
                      className="py-2 px-2.5 rounded-md text-xs font-semibold uppercase tracking-wider bg-[#121822] hover:bg-slate-800 border border-[#1c2432] text-amber-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title={role === 'GUEST' ? 'Simulasi tahan armada dalam sandbox' : 'Instruksikan armada parkir aman sementara waktu'}
                    >
                      <PauseCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>TAHAN ARMADA</span>
                    </button>
                  </div>

                  {role === 'GUEST' && (
                    <div className="text-[10px] font-mono text-amber-300/90 text-center">
                      Mode Sandbox: pratinjau lokal berwatermark — tanpa POST /approvals, tanpa ping TMS.
                    </div>
                  )}

                  {/* 3. Tertiary: Override with Custom Notes */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowOverrideModal(!showOverrideModal);
                    }}
                    disabled={approving}
                    className="w-full py-2 px-2.5 rounded-md text-xs font-semibold text-slate-300 hover:text-white bg-[#0c1017] hover:bg-[#121822] border border-[#1c2432] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                    <span>{showOverrideModal ? 'Tutup Panel Override' : 'Override / Modifikasi Mandiri'}</span>
                  </button>
                </>
              )}

              {/* Override Expanded Form */}
              {showOverrideModal && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="p-3 bg-[#0c1017] border border-[#1c2432] rounded-md flex flex-col gap-2.5 shadow-xl"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-sans font-bold text-cyan-300 flex items-center gap-1">
                      <FileText className="w-3 h-3 text-cyan-400" />
                      Catatan Keputusan Operator
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowOverrideModal(false)}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex gap-2 text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setOverrideTactical('CONTINUE')}
                      className={`flex-1 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                        overrideTactical === 'CONTINUE'
                          ? 'bg-white border-white text-[#080d14] font-semibold'
                          : 'bg-[#121822] border-[#1c2432] text-slate-400 hover:text-white'
                      }`}
                    >
                      CONTINUE
                    </button>
                    <button
                      type="button"
                      onClick={() => setOverrideTactical('REROUTE')}
                      className={`flex-1 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                        overrideTactical === 'REROUTE'
                          ? 'bg-white border-white text-[#080d14] font-semibold'
                          : 'bg-[#121822] border-[#1c2432] text-slate-400 hover:text-white'
                      }`}
                    >
                      REROUTE
                    </button>
                    <button
                      type="button"
                      onClick={() => setOverrideTactical('HOLD')}
                      className={`flex-1 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                        overrideTactical === 'HOLD'
                          ? 'bg-amber-400 border-amber-400 text-[#080d14] font-semibold'
                          : 'bg-[#121822] border-[#1c2432] text-slate-400 hover:text-white'
                      }`}
                    >
                      HOLD
                    </button>
                  </div>

                  <textarea
                    value={overrideNotes}
                    onChange={(e) => {
                      setOverrideNotes(e.target.value);
                      if (e.target.value.trim()) setValidationError(null);
                    }}
                    placeholder="Contoh: Dikawal patroli kepolisian daerah atau diprioritaskan via jalur tol..."
                    rows={2}
                    className="w-full bg-[#121822] border border-[#1c2432] focus:border-white/40 rounded-md p-2 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none"
                  />

                  {validationError && (
                    <span className="text-xs font-mono text-rose-400">
                      {validationError}
                    </span>
                  )}

                  {hitlBlocked && role !== 'GUEST' && overrideTactical !== 'HOLD' && (
                    <span className="text-xs font-mono text-amber-200/90 leading-relaxed">
                      {HITL_UNVERIFIED_COPY} Hanya HOLD yang diizinkan.
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleExecuteOverride}
                    disabled={approving || !overrideNotes.trim() || (hitlBlocked && overrideTactical !== 'HOLD' && role !== 'GUEST')}
                    className="w-full py-2 rounded-md bg-white hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-[#080d14] text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5 text-[#080d14]" />
                    <span>Kirim Keputusan Override</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function MitigationTab({
  crisis,
  activeRouteIdx,
  onSelectRoute,
  onApproveSuccess,
  onCommitOperationalRoute,
  selectedImpactedVehicle,
}: MitigationTabProps) {
  const { user, role } = useAuth();
  const [approvedRouteId, setApprovedRouteId] = useState<string | null>(null);
  const [latestApproval, setLatestApproval] = useState<ApprovalItem | null>(null);
  const [approvingIdx, setApprovingIdx] = useState<number | null>(null);
  // Phase 77: guest/403 sandbox preview — local-only, never approved/committed.
  const [sandboxNote, setSandboxNote] = useState<string | null>(null);

  // Load existing approvals on mount for this incident
  useEffect(() => {
    async function loadApprovals() {
      if (!crisis.crisis_id) return;
      try {
        const res = await api.approvals.list(crisis.crisis_id);
        if (res.items && res.items.length > 0) {
          const latest = res.items[0];
          setApprovedRouteId(latest.route_id);
          setLatestApproval(latest);
        } else {
          setApprovedRouteId(null);
          setLatestApproval(null);
        }
      } catch (err) {
        console.warn('Failed to load approvals:', err);
      }
    }
    loadApprovals();
  }, [crisis.crisis_id]);

  const handleApprove = async (
    idx: number, 
    route: RouteRecommendation,
    action: DecisionAction = 'ACCEPT',
    tacticalAction: TacticalManeuver = 'REROUTE',
    notes?: string
  ) => {
    if (!crisis.crisis_id) return;
    // Phase 77 role branches: Guest sandbox (zero POST), Regulator HOLD-only.
    if (role === 'GUEST') {
      setSandboxNote(
        `Mode Sandbox: rencana rute #${idx + 1} tersimpan lokal, tidak dikirim ke armada (tanpa POST /approvals, tanpa ping TMS).`
      );
      if (onApproveSuccess) {
        onApproveSuccess('Mode Sandbox: rencana tersimpan lokal, tidak dikirim ke armada (tanpa POST server).');
      }
      return;
    }
    if (role === 'REGULATOR' && tacticalAction !== 'HOLD') {
      if (onApproveSuccess) {
        onApproveSuccess('Akses Regulator: hanya HOLD yang diizinkan [Khusus Dispatcher].');
      }
      return;
    }
    // HITL integrity gate (Phase 82): SIMULASI/OFFLINE or evidence-less routes
    // never POST an Approve/Reroute. HOLD stays allowed (safe action, ledger).
    // Sandbox 403 path below is unchanged.
    if (
      (isSimulatedRoute(route) || !(hasCrisisEvidence(crisis) || hasRouteProof(route))) &&
      tacticalAction !== 'HOLD'
    ) {
      if (onApproveSuccess) {
        onApproveSuccess(HITL_UNVERIFIED_COPY);
      }
      return;
    }
    setApprovingIdx(idx);
    const opId = user?.name || user?.email || user?.id || 'OP-CHIEF-01';
    try {
      const res = await api.approvals.create({
        incident_id: crisis.crisis_id,
        route_id: String(idx),
        recommended_route: route,
        action,
        tactical_action: tacticalAction,
        operator_id: opId,
        approved_by: opId,
        notes,
      });
      setApprovedRouteId(String(idx));
      setLatestApproval({
        id: res.approval_id || res.id || String(Date.now()),
        incident_id: crisis.crisis_id,
        route_id: String(idx),
        action,
        tactical_action: tacticalAction,
        recommended_route: route,
        operator_id: opId,
        notes,
        approved_at: res.approved_at || new Date().toISOString(),
      });

      if (onCommitOperationalRoute) {
        onCommitOperationalRoute(route, action, tacticalAction);
      }

      if (onApproveSuccess) {
        const actionLabel = action === 'OVERRIDE' 
          ? 'Override rute tersimpan' 
          : tacticalAction === 'HOLD' 
            ? 'Tercatat sebagai HITL pending (HOLD) — belum dikirim ke armada' 
            : HITL_PENDING_COPY;
        onApproveSuccess(`${actionLabel} (#${idx + 1})!`);
      }
    } catch (err) {
      // Phase 77: 403-safe — a 403 NEVER paints approved/committed state, never
      // calls onCommitOperationalRoute, and never fires a TMS ping. Non-403
      // network failures also leave the card unapproved with an honest toast.
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to approve route:', err);
      if (msg.includes('403') || msg.includes('Forbidden')) {
        setSandboxNote(
          `Mode Sandbox: rencana rute #${idx + 1} tersimpan lokal, tidak dikirim ke armada (403 memerlukan akun Dispatcher).`
        );
        if (onApproveSuccess) {
          onApproveSuccess('Mode Sandbox: rencana tersimpan lokal, tidak dikirim ke armada (403 memerlukan akun Dispatcher).');
        }
      } else if (onApproveSuccess) {
        onApproveSuccess(
          `Gagal menyimpan keputusan rute #${idx + 1} — koneksi/server bermasalah, rute belum disetujui.`
        );
      }
    } finally {
      setApprovingIdx(null);
    }
  };

  // Confidence is only rendered when the swarm actually produced one; never a
  // canned benchmark (the SSE hook now forwards state.overall_confidence).
  const rawConfidence = Number(crisis.overall_confidence);
  const confidenceScore = Number.isFinite(rawConfidence) && rawConfidence > 0
    ? Math.round(rawConfidence * 100)
    : null;
  // HITL integrity gate input: crisis-level evidence shared by all route cards.
  const crisisHasEvidence = hasCrisisEvidence(crisis);

  // Impact block values come from the agent payload. When the field is absent we
  // state "belum terverifikasi" instead of inventing a headline percentage.
  const predictedDelayValue = crisis.prediction_finding?.data?.estimated_delay_hours;
  const predictedDelayFromFinding =
    typeof predictedDelayValue === 'number' && Number.isFinite(predictedDelayValue)
      ? predictedDelayValue
      : null;
  // Fallback: derive the 6h horizon ourselves when the finding projection is
  // missing but PredictionAgent's congestion forecast is present.
  const forecastDelayMin = crisis.congestion_forecast?.['6h']?.delay_min;
  const fallbackDelayHours =
    typeof forecastDelayMin === 'number' && Number.isFinite(forecastDelayMin) && forecastDelayMin > 0
      ? forecastDelayMin / 60
      : null;
  const predictedDelayHours = predictedDelayFromFinding ?? fallbackDelayHours;
  const inflationPctValue = crisis.inflation_forecast?.pct_increase;
  const inflationPct =
    typeof inflationPctValue === 'number' && Number.isFinite(inflationPctValue)
      ? inflationPctValue
      : null;
  const inflationRegion = normalizeRegion(crisis.inflation_forecast?.region || crisis.region);
  const inflationCommodity = crisis.inflation_forecast?.commodity;

  return (
    <div className="flex flex-col gap-4 text-slate-100">
      {/* Phase 77: sandbox notice — local-only preview, zero server POST */}
      {sandboxNote && (
        <div className="bg-amber-950/30 border border-amber-500/40 p-3 rounded-md text-xs font-sans text-amber-200 leading-relaxed">
          {sandboxNote}
        </div>
      )}

      {/* BLOCK A: CONSENSUS BADGE */}
      <div className="bg-[#121822] border border-[#1c2432] p-3 rounded-md">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-sans text-cyan-400 font-bold">
            Konsensus Sistem & Keyakinan
          </span>
          <span className="text-xs font-bold font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
            {confidenceScore === null ? 'Keyakinan belum tersedia' : `${confidenceScore}% Keyakinan`}
          </span>
        </div>
        <p className="text-xs text-slate-300 font-mono">
          Sensor: <span className="text-cyan-300">BMKG Radar</span> + <span className="text-amber-300">TomTom Traffic</span> + <span className="text-emerald-300">AISstream Maritime</span>
        </p>
      </div>

      {/* BLOCK B: PHYSICAL & ECONOMIC IMPACT CHAIN & MARKET REGIME */}
      <div className="bg-[#121822] border border-[#1c2432] p-3 rounded-md">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-sans text-amber-400 font-bold">
            Dampak Fisik & Rantai Ekonomi
          </span>
          <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[#0c1017] text-cyan-300 border border-[#1c2432]">
            Regim Pasar: Waspada
          </span>
        </div>
        <div className="flex flex-col gap-1.5 text-xs font-mono">
          <div className="flex items-center gap-2 text-rose-300">
            <span className="flex items-center gap-1"><Waves className="w-3.5 h-3.5 text-blue-400" /> Disrupsi Fisik:</span>
            <span className="font-bold">{crisis.title || 'Banjir Koridor Belawan'}</span>
          </div>
          <div className="flex items-center gap-2 text-amber-300">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-400" /> Keterlambatan Logistik:</span>
            <span className={`font-bold ${predictedDelayHours === null ? 'text-slate-400' : ''}`}>
              {predictedDelayHours === null
                ? 'Belum terverifikasi'
                : `+${predictedDelayHours.toFixed(1)} Jam Delay Pasokan`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-emerald-300">
            <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Proyeksi Inflasi Pangan:</span>
            <span className={`font-bold ${inflationPct === null ? 'text-slate-400' : ''}`}>
              {inflationPct === null
                ? 'Belum terverifikasi'
                : `Potensi Inflasi ${inflationRegion} +${inflationPct.toFixed(1)}%${
                    inflationCommodity ? ` (${inflationCommodity.replace(/_/g, ' ')})` : ''
                  }`}
            </span>
          </div>
        </div>
      </div>

      {/* BLOCK B2: OFFICIAL NEWS GROUNDING VERIFICATION */}
      {(() => {
        const rawVerified = crisis.verified_news_citations;
        const rawAttrs = crisis.news_attributions;

        // Only surface citations that the payload actually carries. The old
        // Antara/Kompas fallback invented sources for every crisis.
        const citations: Array<{ source_name: string; headline?: string; tier?: string; url: string }> =
          rawVerified && rawVerified.length > 0
            ? rawVerified.map((c) => {
                const rawItem = c as Record<string, unknown>;
                const src = String(c.source || c.source_name || 'Berita Resmi');
                const headline = c.headline ? String(c.headline) : undefined;
                const tier = c.tier ? String(c.tier) : undefined;
                const rawUrl = String(c.url || rawItem.link || '');
                const resolvedUrl = normalizeNewsPermalink(rawUrl, headline || crisis.title, src);
                return {
                  source_name: src,
                  headline,
                  tier,
                  url: resolvedUrl,
                };
              })
            : rawAttrs && rawAttrs.length > 0
              ? rawAttrs.map((a) => {
                  const src = a.source_name || 'Berita Resmi';
                  const resolvedUrl = normalizeNewsPermalink(a.url, crisis.title, src);
                  return {
                    source_name: src,
                    url: resolvedUrl,
                  };
                })
              : [];

        const hasCitations = citations.length > 0;
        const isVerified = hasCitations && Boolean(crisis.validated);

        return (
          <div className="bg-[#121822] border border-[#1c2432] p-3 rounded-md">

            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <path d="m9 12 2 2 4-4"/>
                </svg>
                <span className="text-xs font-sans font-bold text-slate-200">
                  Verifikasi Berita Resmi
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${
                isVerified
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-950/40 text-amber-300 border-amber-500/40'
              }`}>
                {isVerified ? 'TERVERIFIKASI' : hasCitations ? 'BELUM DIVERIFIKASI' : 'BELUM ADA SITASI'}
              </span>
            </div>

            {/* Dynamic Source Attribution Pills with Real Working Links */}
            {hasCitations ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {citations.map((attr, aIdx) => (
                  <a
                    key={aIdx}
                    href={attr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0c1017] hover:bg-slate-800 text-xs font-mono text-cyan-300 border border-[#1c2432] transition-all cursor-pointer"
                    title={attr.headline ? `${attr.source_name}: ${attr.headline}` : `Buka Berita Asli: ${attr.source_name}`}
                  >
                    <svg className="w-3 h-3 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                    <span>{attr.source_name}</span>
                    {attr.tier && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-500/30 uppercase font-sans">
                        {attr.tier}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400 font-sans leading-relaxed">
                Belum ada sitasi berita resmi yang tersimpan untuk insiden ini.
              </p>
            )}

            <p className="mt-2 text-xs text-slate-300 leading-relaxed font-sans">
              {isVerified ? (
                <>
                  <strong className="text-slate-200">Verifikasi Silang Berita:</strong> Informasi dikonfirmasi oleh sitasi resmi yang tersimpan. Laporan dinyatakan <span className="text-emerald-400 font-semibold">Valid</span>.
                </>
              ) : hasCitations ? (
                <>
                  <strong className="text-slate-200">Verifikasi Silang Berita:</strong> Sitasi tersimpan, tetapi belum diverifikasi silang. Status: <span className="text-amber-300 font-semibold">Belum terverifikasi</span>.
                </>
              ) : (
                <>
                  <strong className="text-slate-200">Verifikasi Silang Berita:</strong> <span className="text-amber-300 font-semibold">Belum terverifikasi</span> — tidak ada sitasi berita resmi yang dapat dikutip.
                </>
              )}
            </p>

          </div>
        );
      })()}

      {/* BLOCK C: OPERATIONAL REASONING TRACE */}
      <div className="bg-[#121822] border border-[#1c2432] p-3.5 rounded-md">
        <span className="text-xs font-sans text-cyan-400 font-bold block mb-2">
          Analisis Operasional & Rekomendasi
        </span>
        <FormattedMarkdown content={crisis.decision_support_output || ''} />
      </div>

      {/* BLOCK C2: SPOILAGE HEDGING COST MATRIX (PHASE 44 / FR-18) */}
      {(() => {
        const activeRoute = crisis.route_recommendations?.[activeRouteIdx ?? 0];
        // Every value below is either real payload data or null. No invented
        // commodity / plate / Medan-Pekanbaru / 10 t / 85 km stand-ins.
        const resolvedCommodity: string | null =
          selectedImpactedVehicle?.commodity_key?.replace(/_/g, ' ') ||
          crisis.inflation_forecast?.commodity ||
          ((crisis as unknown as Record<string, unknown>).commodities_affected as string[] | undefined)?.[0] ||
          null;
        const resolvedVehicleId: string | null =
          selectedImpactedVehicle?.vehicle_id ||
          ((crisis as unknown as Record<string, unknown>).vehicle_id as string | undefined) ||
          null;
        const resolvedOrigin: string | null = (() => {
          if (activeRoute?.legs && activeRoute.legs.length > 0 && activeRoute.legs[0].from_name) {
            return activeRoute.legs[0].from_name;
          }
          if (activeRoute?.route_name) {
            const parts = activeRoute.route_name.split(/→|->|\bto\b/i);
            if (parts.length > 1 && parts[0].trim()) return parts[0].trim();
          }
          if (selectedImpactedVehicle?.origin) return selectedImpactedVehicle.origin;
          return crisis.region?.trim() || null;
        })();
        const resolvedDestination: string | null = (() => {
          if (activeRoute?.legs && activeRoute.legs.length > 0 && activeRoute.legs[activeRoute.legs.length - 1].to_name) {
            return activeRoute.legs[activeRoute.legs.length - 1].to_name;
          }
          if (activeRoute?.route_name) {
            const parts = activeRoute.route_name.split(/→|->|\bto\b/i);
            if (parts.length > 1 && parts[1].trim()) return parts[1].trim();
          }
          if (selectedImpactedVehicle?.destination) return selectedImpactedVehicle.destination;
          return null;
        })();
        const resolvedCargoTonnage: number | null =
          typeof selectedImpactedVehicle?.cargo_tonnage === 'number' &&
          Number.isFinite(selectedImpactedVehicle.cargo_tonnage)
            ? selectedImpactedVehicle.cargo_tonnage
            : null;
        const resolvedDetourDist: number | null =
          typeof selectedImpactedVehicle?.detour_route?.distance_km === 'number' &&
          Number.isFinite(selectedImpactedVehicle.detour_route.distance_km)
            ? selectedImpactedVehicle.detour_route.distance_km
            : typeof activeRoute?.distance_km === 'number' && Number.isFinite(activeRoute.distance_km)
              ? activeRoute.distance_km
              : null;
        const resolvedDetourHours: number | null =
          typeof selectedImpactedVehicle?.detour_route?.eta_minutes === 'number' &&
          selectedImpactedVehicle.detour_route.eta_minutes > 0
            ? selectedImpactedVehicle.detour_route.eta_minutes / 60
            : typeof activeRoute?.eta_minutes === 'number' && activeRoute.eta_minutes > 0
              ? activeRoute.eta_minutes / 60
              : null;
        const resolvedTraversedRoads: string[] = (() => {
          if (selectedImpactedVehicle?.detour_route?.nodes && selectedImpactedVehicle.detour_route.nodes.length > 0) {
            return selectedImpactedVehicle.detour_route.nodes;
          }
          const roads: string[] = [];
          if (activeRoute?.description) roads.push(activeRoute.description);
          if (activeRoute?.route_name) roads.push(activeRoute.route_name);
          return roads;
        })();

        return (
          <>
            {resolvedCommodity &&
            resolvedVehicleId &&
            resolvedOrigin &&
            resolvedDestination &&
            resolvedCargoTonnage != null &&
            resolvedDetourDist != null &&
            resolvedDetourHours != null ? (
              <SpoilageHedgingCard
                commodity={resolvedCommodity}
                vehicleId={resolvedVehicleId}
                cargoTonnage={resolvedCargoTonnage}
                origin={resolvedOrigin}
                destination={resolvedDestination}
                detourDistanceKm={resolvedDetourDist}
                detourTimeHours={resolvedDetourHours}
                onApplyPolicy={(policy) => {
                  if (policy === 'REROUTE' && onSelectRoute) {
                    onSelectRoute(0);
                  }
                }}
              />
            ) : (
              <div className="bg-[#121822] border border-[#1c2432] p-3 rounded-md text-xs font-sans text-slate-400 leading-relaxed">
                Hedging biaya &amp; risiko pembusukan belum tersedia — komoditas, muatan, asal/tujuan, atau rute detour belum terverifikasi.
              </div>
            )}

            {/* BLOCK C3: HOLD VS REROUTE ECONOMIC DECISION CARD */}
            {(() => {
              const holdVsRerouteEconomics =
                activeRoute?.economic_comparison ||
                crisis.route_recommendations?.find((r) => r.economic_comparison)?.economic_comparison;

              if (!holdVsRerouteEconomics) return null;

              return (
                <HoldVsRerouteCard
                  economics={holdVsRerouteEconomics}
                  onApplyTactical={(action) => {
                    if (action === 'HOLD') {
                      const holdIdx = crisis.route_recommendations?.findIndex(
                        (r) => r.corridor_type === 'hold_staging'
                      );
                      if (holdIdx !== undefined && holdIdx >= 0 && onSelectRoute) {
                        onSelectRoute(holdIdx);
                      }
                    } else if (action === 'REROUTE') {
                      const detourIdx = crisis.route_recommendations?.findIndex(
                        (r) => r.corridor_type === 'land_detour' || r.corridor_type === 'sea_intermodal'
                      );
                      if (detourIdx !== undefined && detourIdx >= 0 && onSelectRoute) {
                        onSelectRoute(detourIdx);
                      }
                    }
                  }}
                />
              );
            })()}

            {/* BLOCK D: HUMAN-IN-THE-LOOP (HITL) ROUTE RECOMMENDATIONS & ACTION */}
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider font-semibold">
                REKOMENDASI JALUR ALTERNATIF
              </span>

              {crisis.route_recommendations && crisis.route_recommendations.length > 0 ? (
                crisis.route_recommendations.map((route, idx) => {
                  const isActive = (activeRouteIdx ?? 0) === idx;
                  const isApproved = approvedRouteId === String(idx);
                  const approving = approvingIdx === idx;

                      return (
                        <RouteCard
                          key={idx}
                          route={route}
                          idx={idx}
                          isActive={isActive}
                          onSelect={() => onSelectRoute(idx)}
                          isApproved={isApproved}
                          approvalData={isApproved ? latestApproval : null}
                          approving={approving}
                          onApprove={(action, tacticalAction, notes) => handleApprove(idx, route, action, tacticalAction, notes)}
                          selectedImpactedVehicle={selectedImpactedVehicle}
                          crisisHasEvidence={crisisHasEvidence}
                        />
                      );
                })
              ) : (
                <p className="text-xs text-slate-500 text-center py-4 font-mono">
                  Belum ada alternatif rute yang dihasilkan.
                </p>
              )}
            </div>

            {/* BLOCK E: DIGITAL COMPLIANCE INSPECTOR (PHASE 44 / FR-19) */}
            {resolvedVehicleId &&
            resolvedOrigin &&
            resolvedDestination &&
            resolvedTraversedRoads.length > 0 &&
            resolvedCargoTonnage != null ? (
              <ComplianceInspectorCard
                vehicleId={resolvedVehicleId}
                origin={resolvedOrigin}
                destination={resolvedDestination}
                traversedRoads={resolvedTraversedRoads}
                vehicleGrossWeightTon={resolvedCargoTonnage + 5.0}
                commodity={resolvedCommodity ?? undefined}
                hasBkhitCert={selectedImpactedVehicle ? selectedImpactedVehicle.compliance_status === 'PASSED' : false}
                driverPhone={selectedImpactedVehicle?.driver_phone ?? undefined}
              />
            ) : (
              <div className="bg-[#121822] border border-[#1c2432] p-3 rounded-md text-xs font-sans text-slate-400 leading-relaxed">
                Inspeksi kepatuhan digital belum tersedia — data kendaraan, asal/tujuan, atau jalan yang dilalui belum terverifikasi.
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
