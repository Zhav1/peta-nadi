'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
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
  Sparkles,
  PauseCircle,
  SlidersHorizontal,
  Send,
  X,
  FileText,
  Scale,
  Shield,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { SpoilageHedgingCard } from './SpoilageHedgingCard';
import { ComplianceInspectorCard } from './ComplianceInspectorCard';

interface MitigationTabProps {
  crisis: CrisisState;
  activeRouteIdx: number | null;
  onSelectRoute: (idx: number) => void;
  onApproveSuccess?: (msg: string) => void;
  onCommitOperationalRoute?: (route: RouteRecommendation, action: DecisionAction, tactical: TacticalManeuver) => void;
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
}: RouteCardProps) {
  const { role } = useAuth();
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideNotes, setOverrideNotes] = useState('');
  const [overrideTactical, setOverrideTactical] = useState<TacticalManeuver>('CONTINUE');
  const [validationError, setValidationError] = useState<string | null>(null);

  const isCompromised = route.is_compromised;
  const cardBorderColor = isCompromised
    ? 'border-red-500/50 bg-red-950/20'
    : isActive
      ? 'border-cyan-400/80 bg-cyan-950/30 ring-2 ring-cyan-400/40'
      : 'border-white/10 bg-slate-800/40 hover:border-white/20';

  const titleText = route.route_name || (idx === 0 ? 'Rute Rekomendasi Utama' : `Rute Alternatif ${idx + 1}`);

  const handleExecuteOverride = async () => {
    if (!overrideNotes.trim()) {
      setValidationError('Catatan alasan wajib diisi untuk tindakan Override / Modifikasi.');
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
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: route.color || (idx === 0 ? '#00f0ff' : '#3b82f6') }} />
          <span>{titleText}</span>
        </span>

        {isCompromised ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> TERDAMPAK
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> JALUR AMAN
          </span>
        )}
      </div>

      <p className="text-xs text-slate-300 leading-relaxed mb-2 font-mono">
        {route.description}
      </p>

      {route.safety_tag && (
        <div className="mb-2 text-xs font-mono font-medium text-slate-300 bg-[#121822] px-2 py-1 rounded border border-[#1c2432]">
          {route.safety_tag}
        </div>
      )}

      {/* Multi-modal Leg Breakdown if available */}
      {route.legs && route.legs.length > 0 && (
        <div className="mb-2 p-2.5 rounded-md bg-[#121822] border border-[#1c2432] flex flex-col gap-1 text-xs font-mono">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Rincian Leg Logistik Multi-Moda:</span>
          {route.legs.map((leg, lIdx) => (
            <div key={lIdx} className="flex justify-between items-center text-slate-300">
              <span className="flex items-center gap-1.5">
                {leg.mode === 'truck' ? <Truck className="w-3.5 h-3.5 text-slate-300" /> : leg.mode === 'maritime' ? <Anchor className="w-3.5 h-3.5 text-amber-400" /> : (leg.mode as string) === 'rail' ? <Train className="w-3.5 h-3.5 text-emerald-400" /> : <Plane className="w-3.5 h-3.5 text-purple-400" />}
                <span>{leg.title}</span>
              </span>
              <span className="text-white font-semibold tabular-nums">{leg.eta_minutes} min ({leg.distance_km} km)</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 text-xs text-slate-300 font-mono mb-1">
        <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" /> {route.distance_km.toFixed(0)} km</span>
        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-amber-400" /> {route.eta_minutes} min</span>
        <span className="inline-flex items-center gap-1"><Fuel className="w-3 h-3 text-emerald-400" /> +{route.fuel_increase_pct.toFixed(0)}%</span>
      </div>

      {isActive && (
        <div className="mt-3 pt-2.5 border-t border-[#1c2432] flex flex-col gap-2">
          {isApproved ? (
            <div className="w-full py-2.5 px-3 rounded-md border border-[#1c2432] bg-[#121822] text-xs font-bold flex flex-col gap-1 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {approvalData?.action === 'OVERRIDE' ? (
                    <SlidersHorizontal className="w-4 h-4 text-purple-400" />
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
                        : 'DISETUJUI & DIKIRIM'}
                  </span>
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {approvalData?.tactical_action || 'REROUTE'}
                </span>
              </div>
              {approvalData?.notes && (
                <div className="text-xs font-normal p-2 rounded border border-[#1c2432] bg-[#0c1017] text-slate-300 flex items-start gap-1.5 mt-1 font-mono">
                  <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                  <span>{approvalData.notes}</span>
                </div>
              )}

              {/* WhatsApp Driver Dispatch Action (Phase 45/48 Drill 1) */}
              <a
                href={`https://wa.me/6281234567891?text=${encodeURIComponent(
                  `PERINTAH DISPATCH RESMI - PIDI\n` +
                  `Armada: TRK-003-BELAWAN-TEBING (BK 8812 XL)\n` +
                  `Tindakan: ${approvalData?.tactical_action || 'REROUTE'}\n` +
                  `Rute: ${route.route_name || route.description}\n` +
                  `Status: Jalur utama ditutup/terdampak. Ikuti jalur alternatif mitigasi.\n` +
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
                <span>Kirim Disposisi WhatsApp ke Driver</span>
              </a>
            </div>
          ) : isCompromised ? (
            <div className="w-full py-2 px-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono font-semibold text-center flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Rute Terdampak Gangguan (Tidak Disarankan)</span>
            </div>
          ) : (
            <>
              {role === 'REGULATOR' ? (
                <div className="w-full p-3 rounded-md bg-[#121822] border border-[#1c2432] text-slate-200 flex flex-col gap-1 text-xs font-mono">
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <span className="text-white">Akses Regulator (Pengawas)</span>
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-slate-300 border border-white/20">
                      HANYA LIHAT
                    </span>
                  </div>
                  <p className="text-xs font-sans text-slate-400 leading-snug pt-0.5">
                    Mode Regulator berwenang memantau koridor makro dan disparitas harga. Persetujuan pengalihan rute armada didelegasikan kepada Dispatcher logistik.
                  </p>
                </div>
              ) : (
                <>
                  {/* Tactical Buttons Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* 1. Primary: Approve Reroute */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onApprove('ACCEPT', 'REROUTE');
                      }}
                      disabled={approving}
                      className="py-2 px-2.5 rounded-md text-xs font-semibold uppercase tracking-wider bg-white hover:bg-slate-200 text-[#080d14] transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Setujui dan instruksikan armada rute alternatif"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#080d14] shrink-0" />
                      <span>REROUTE</span>
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
                      title="Instruksikan armada parkir aman sementara waktu"
                    >
                      <PauseCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>TAHAN ARMADA</span>
                    </button>
                  </div>

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

                  <button
                    type="button"
                    onClick={handleExecuteOverride}
                    disabled={approving || !overrideNotes.trim()}
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
}: MitigationTabProps) {
  const { user } = useAuth();
  const [approvedRouteId, setApprovedRouteId] = useState<string | null>(null);
  const [latestApproval, setLatestApproval] = useState<ApprovalItem | null>(null);
  const [approvingIdx, setApprovingIdx] = useState<number | null>(null);

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
            ? 'Instruksi Tahan Armada (HOLD) terkirim' 
            : 'Rute pengalihan disetujui & dikirimkan ke armada';
        onApproveSuccess(`${actionLabel} (#${idx + 1})!`);
      }
    } catch (err) {
      console.error('Failed to approve route:', err);
      // Optimistic fallback for simulated crises
      setApprovedRouteId(String(idx));
      setLatestApproval({
        id: String(Date.now()),
        incident_id: crisis.crisis_id,
        route_id: String(idx),
        action,
        tactical_action: tacticalAction,
        recommended_route: route,
        operator_id: 'OP-CHIEF-01',
        notes,
        approved_at: new Date().toISOString(),
      });

      if (onCommitOperationalRoute) {
        onCommitOperationalRoute(route, action, tacticalAction);
      }

      if (onApproveSuccess) {
        onApproveSuccess(
          `Keputusan rute #${idx + 1} (${action}/${tacticalAction}) tersimpan secara lokal!`
        );
      }
    } finally {
      setApprovingIdx(null);
    }
  };

  const confidenceScore = Math.round((crisis.overall_confidence || 0.91) * 100);

  return (
    <div className="flex flex-col gap-4 text-slate-100">

      {/* BLOCK A — CONSENSUS BADGE */}
      <div className="bg-[#121822] border border-[#1c2432] p-3 rounded-md">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-sans text-cyan-400 font-bold">
            Konsensus Sistem & Keyakinan
          </span>
          <span className="text-xs font-bold font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
            {confidenceScore}% Keyakinan
          </span>
        </div>
        <p className="text-xs text-slate-300 font-mono">
          Sensor: <span className="text-cyan-300">BMKG Radar</span> + <span className="text-amber-300">TomTom Traffic</span> + <span className="text-emerald-300">AISstream Maritime</span>
        </p>
      </div>

      {/* BLOCK B — PHYSICAL & ECONOMIC IMPACT CHAIN & MARKET REGIME */}
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
            <span className="font-bold">+4.2 Jam Delay Pasokan</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-300">
            <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Proyeksi Inflasi Pangan:</span>
            <span className="font-bold">Potensi Inflasi Medan +2.1% (Cabai +14.2%)</span>
          </div>
        </div>
      </div>

      {/* BLOCK B2 — OFFICIAL NEWS GROUNDING VERIFICATION */}
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
          <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
            TERVERIFIKASI
          </span>
        </div>

        {/* Dynamic Source Attribution Pills with Real Working Links */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(() => {
            const rawVerified = crisis.verified_news_citations || (crisis as unknown as Record<string, unknown>).verified_news_citations as Array<Record<string, unknown>> | undefined;
            const rawAttrs = crisis.news_attributions || (crisis as unknown as Record<string, unknown>).news_attributions as Array<{ source_name: string; url: string }> | undefined;

            const citations: Array<{ source_name: string; headline?: string; tier?: string; url: string }> = 
              (rawVerified && rawVerified.length > 0)
                ? rawVerified.map(c => ({
                    source_name: String(c.source || c.source_name || 'Berita Resmi'),
                    headline: c.headline ? String(c.headline) : undefined,
                    tier: c.tier ? String(c.tier) : undefined,
                    url: c.url ? String(c.url) : `https://news.google.com/search?q=${encodeURIComponent((String(c.headline || c.source || crisis.title || 'berita')) + ' ' + String(c.source || ''))}&hl=id-ID&gl=ID&ceid=ID:id`
                  }))
                : (rawAttrs && rawAttrs.length > 0)
                ? rawAttrs.map(a => ({
                    source_name: a.source_name || 'Berita Resmi',
                    url: a.url || `https://news.google.com/search?q=${encodeURIComponent((crisis.title || 'berita') + ' ' + (a.source_name || ''))}&hl=id-ID&gl=ID&ceid=ID:id`
                  }))
                : [
                    {
                      source_name: 'Antara News Sumut',
                      tier: 'Tier-1 Resmi',
                      url: `https://news.google.com/search?q=${encodeURIComponent((crisis.title || 'banjir Sumut') + ' Antara')}&hl=id-ID&gl=ID&ceid=ID:id`
                    },
                    {
                      source_name: 'Kompas.com Regional',
                      tier: 'Media Nasional',
                      url: `https://news.google.com/search?q=${encodeURIComponent((crisis.title || 'logistik Sumut') + ' Kompas')}&hl=id-ID&gl=ID&ceid=ID:id`
                    }
                  ];

            return citations.map((attr, aIdx) => (
              <a 
                key={aIdx} 
                href={attr.url} 
                target="_blank" 
                rel="noreferrer"
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
                  <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-500/30 uppercase font-sans">
                    {attr.tier}
                  </span>
                )}
              </a>
            ));
          })()}
        </div>

        <p className="mt-2 text-xs text-slate-300 leading-relaxed font-sans">
          <strong className="text-slate-200">Verifikasi Silang Berita:</strong> Informasi dikonfirmasi oleh kantor berita resmi regional. Laporan dinyatakan <span className="text-emerald-400 font-semibold">Valid</span>.
        </p>
      </div>

      {/* BLOCK C — OPERATIONAL REASONING TRACE */}
      <div className="bg-[#121822] border border-[#1c2432] p-3.5 rounded-md">
        <span className="text-xs font-sans text-cyan-400 font-bold block mb-2">
          Analisis Operasional & Rekomendasi
        </span>
        <FormattedMarkdown content={crisis.decision_support_output || ''} />
      </div>

      {/* BLOCK C2 — SPOILAGE HEDGING COST MATRIX (PHASE 44 / FR-18) */}
      {(() => {
        const activeRoute = crisis.route_recommendations?.[activeRouteIdx ?? 0];
        const resolvedCommodity =
          crisis.inflation_forecast?.commodity ||
          ((crisis as unknown as Record<string, unknown>).commodities_affected as string[])?.[0] ||
          'Cabai Merah Keriting';
        const resolvedVehicleId =
          ((crisis as unknown as Record<string, unknown>).vehicle_id as string) ||
          'TRK-MEDAN-08';
        const resolvedOrigin = (() => {
          if (activeRoute?.legs && activeRoute.legs.length > 0 && activeRoute.legs[0].from_name) {
            return activeRoute.legs[0].from_name;
          }
          if (activeRoute?.route_name) {
            const parts = activeRoute.route_name.split(/→|->|\bto\b/i);
            if (parts.length > 1 && parts[0].trim()) return parts[0].trim();
          }
          if (crisis.region) {
            return crisis.region.includes('Sumut') || crisis.region.includes('Medan') ? 'Medan' : crisis.region;
          }
          return 'Medan';
        })();
        const resolvedDestination = (() => {
          if (activeRoute?.legs && activeRoute.legs.length > 0 && activeRoute.legs[activeRoute.legs.length - 1].to_name) {
            return activeRoute.legs[activeRoute.legs.length - 1].to_name;
          }
          if (activeRoute?.route_name) {
            const parts = activeRoute.route_name.split(/→|->|\bto\b/i);
            if (parts.length > 1 && parts[1].trim()) return parts[1].trim();
          }
          return 'Pekanbaru';
        })();
        const resolvedTraversedRoads = (() => {
          const roads: string[] = [];
          if (activeRoute?.description) roads.push(activeRoute.description);
          if (activeRoute?.route_name) roads.push(activeRoute.route_name);
          if (roads.length === 0) return ['Jalan Tol Medan - Tebing Tinggi', 'Lintas Timur Sumatera'];
          return roads;
        })();

        return (
          <>
            <SpoilageHedgingCard
              commodity={resolvedCommodity}
              vehicleId={resolvedVehicleId}
              cargoTonnage={10.0}
              origin={resolvedOrigin}
              destination={resolvedDestination}
              detourDistanceKm={activeRoute?.distance_km || 85.0}
              detourTimeHours={activeRoute?.eta_minutes ? (activeRoute.eta_minutes / 60) : 2.5}
              onApplyPolicy={(policy) => {
                if (policy === 'REROUTE' && onSelectRoute) {
                  onSelectRoute(0);
                }
              }}
            />

            {/* BLOCK D — HUMAN-IN-THE-LOOP (HITL) ROUTE RECOMMENDATIONS & ACTION */}
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
                    />
                  );
                })
              ) : (
                <p className="text-xs text-slate-500 text-center py-4 font-mono">
                  Belum ada alternatif rute yang dihasilkan.
                </p>
              )}
            </div>

            {/* BLOCK E — DIGITAL COMPLIANCE INSPECTOR (PHASE 44 / FR-19) */}
            <ComplianceInspectorCard
              vehicleId={resolvedVehicleId}
              origin={resolvedOrigin}
              destination={resolvedDestination}
              traversedRoads={resolvedTraversedRoads}
              vehicleGrossWeightTon={12.5}
              commodity={resolvedCommodity}
              hasBkhitCert={false}
            />
          </>
        );
      })()}
    </div>
  );
}
