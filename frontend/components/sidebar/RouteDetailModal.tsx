'use client';

import { useEffect, useState } from 'react';
import {
  X,
  ShieldAlert,
  Activity,
  Scale,
  Database,
  ClipboardCheck,
  Lock,
} from 'lucide-react';
import type {
  CrisisState,
  RouteDetailModalProps,
  TacticalManeuver,
} from '@/lib/types';

type Decision = 'APPROVE' | 'REJECT' | 'HOLD';

const CHECKLIST_ITEMS = [
  {
    id: 'visual',
    label: 'Rute bebas zona merah terverifikasi visual di peta',
  },
  {
    id: 'tradeoff',
    label: 'Analisis trade-off waktu vs biaya telah dibaca',
  },
  {
    id: 'legs',
    label: 'Moda dan simpul alih (transfer hub) tiap leg dikonfirmasi',
  },
  {
    id: 'notes',
    label: 'Catatan operator diisi untuk keputusan OVERRIDE / HOLD',
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
}: RouteDetailModalProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [tactical, setTactical] = useState<TacticalManeuver>('REROUTE');

  useEffect(() => {
    if (open) {
      setChecked({});
      setNotes('');
      setTactical(
        route.corridor_type === 'hold_staging' ? 'HOLD' : 'REROUTE'
      );
    }
  }, [open, route.corridor_type]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isSandbox = mode === 'sandbox' || role === 'GUEST';
  const allChecked = CHECKLIST_ITEMS.every((c) => checked[c.id]);
  const notesRequired = tactical === 'HOLD';
  const notesOk = notesRequired ? notes.trim().length > 0 : true;
  const canCommit = !isSandbox && allChecked && notesOk && !isActing;

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

  const toggleCheck = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleDecision = (decision: Decision) => {
    if (isSandbox) return;
    if (role === 'REGULATOR' && decision !== 'HOLD') return;
    if (!allChecked) return;
    void onAction(decision, tactical, notes.trim() || undefined);
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detail rute dan verifikasi operator"
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6"
    >
      <div
        className="absolute inset-0 bg-[#080d14]/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0c1017] border border-[#1c2432] rounded-xl shadow-2xl text-slate-200">
        {/* Watermark ribbon for sandbox preview */}
        {isSandbox && (
          <div
            data-testid="sandbox-watermark"
            className="pointer-events-none absolute -right-10 top-6 rotate-45 bg-amber-500/90 text-black text-[11px] font-bold font-mono px-10 py-1 tracking-widest shadow-lg"
          >
            SANDBOX PREVIEW
          </div>
        )}

        {/* Header */}
        <div className="sticky top-0 bg-[#080d14] border-b border-[#1c2432] p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 uppercase tracking-wider">
                Detail Rute
              </span>
              {isSandbox && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
                  Pratinjau lokal — tanpa POST server
                </span>
              )}
            </div>
            <h2 className="text-sm font-bold text-white font-sans mt-1.5 leading-snug">
              {title}
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {(route.distance_km ?? 0).toFixed(0)} km · {route.eta_minutes ?? 0} mnt · +{(route.fuel_increase_pct ?? 0).toFixed(0)}% BBM
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail rute"
            className="cursor-pointer p-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Section 1: Dasar Risiko */}
          <section aria-label="Dasar Risiko" className="p-3.5 rounded-xl border border-white/10 bg-[#121822] space-y-2">
            <h3 className="text-xs font-bold font-sans text-rose-300 flex items-center gap-1.5 uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>1. Dasar Risiko</span>
            </h3>
            <div className="text-xs font-mono space-y-1.5 text-slate-300">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Status keselamatan:</span>
                <span className="font-bold text-white text-right">{route.safety_status ?? 'Tidak tersedia'}</span>
              </div>
              {route.safety_tag && (
                <div className="p-2 rounded bg-[#0c1017] border border-[#1c2432] text-slate-200">
                  {route.safety_tag}
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Kompromi zona bahaya:</span>
                <span className={route.is_compromised ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {route.is_compromised ? 'TERDAMPAK' : 'BEBAS'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Passabilitas koridor:</span>
                <span className="font-bold text-white">{passability}</span>
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

          {/* Section 2: Dampak + Uncertainty */}
          <section aria-label="Dampak dan Ketidakpastian" className="p-3.5 rounded-xl border border-white/10 bg-[#121822] space-y-2">
            <h3 className="text-xs font-bold font-sans text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Activity className="w-4 h-4 text-amber-400" />
              <span>2. Dampak + Uncertainty</span>
            </h3>
            <div className="text-xs font-mono space-y-1.5 text-slate-300">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Deviasi waktu:</span>
                <span className="font-bold text-white">
                  {route.tradeoff_analysis
                    ? formatDelay(route.tradeoff_analysis.time_delta_minutes)
                    : 'Data tidak tersedia'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Kongesti segmen:</span>
                <span>{congestionLevels ?? 'Data tidak tersedia'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Penghematan bersih (hedging):</span>
                <span className="font-bold text-emerald-300">
                  {route.hedging ? formatIDR(route.hedging.net_savings_idr) : 'Data tidak tersedia'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Potensi susut (spoilage):</span>
                <span className="font-bold text-rose-300">
                  {route.hedging ? formatIDR(route.hedging.spoilage_loss_idr) : 'Data tidak tersedia'}
                </span>
              </div>
              {route.dampak && (
                <p className="text-xs font-sans text-slate-200 leading-relaxed pt-1 border-t border-white/5">
                  {route.dampak}
                </p>
              )}
              {!route.tradeoff_analysis && !route.hedging && (
                <p className="text-xs text-slate-500 italic">
                  Data dampak kuantitatif belum tersedia untuk koridor ini.
                </p>
              )}
            </div>
          </section>

          {/* Section 3: Manfaat vs Konsekuensi */}
          <section aria-label="Manfaat vs Konsekuensi" className="p-3.5 rounded-xl border border-white/10 bg-[#121822] space-y-2">
            <h3 className="text-xs font-bold font-sans text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Scale className="w-4 h-4 text-cyan-400" />
              <span>3. Manfaat vs Konsekuensi</span>
            </h3>
            {route.tradeoff_analysis ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-[11px] leading-relaxed">
                  <div className="p-2 rounded-md bg-emerald-950/30 border border-emerald-500/20">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-1 font-sans">
                      Manfaat
                    </span>
                    <ul className="space-y-1 text-emerald-100/90 font-sans">
                      {route.tradeoff_analysis.pros.map((pro, i) => (
                        <li key={i}>• {pro}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-2 rounded-md bg-amber-950/20 border border-amber-500/20">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-1 font-sans">
                      Konsekuensi
                    </span>
                    <ul className="space-y-1 text-amber-100/90 font-sans">
                      {route.tradeoff_analysis.cons.map((con, i) => (
                        <li key={i}>• {con}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="text-xs font-mono text-slate-300 space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Tambahan biaya:</span>
                    <span className="font-bold text-white">
                      {formatIDR(route.tradeoff_analysis.additional_cost_idr)}
                    </span>
                  </div>
                  {route.tradeoff_analysis.cost_breakdown_items?.map((item, i) => (
                    <div key={i} className="flex justify-between gap-2 text-[11px]">
                      <span className="text-slate-400">{item.label}:</span>
                      <span>Rp {item.amount_idr.toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500 italic">
                Analisis manfaat vs konsekuensi belum tersedia untuk koridor ini.
              </p>
            )}
          </section>

          {/* Section 4: Keterbatasan Data */}
          <section aria-label="Keterbatasan Data" className="p-3.5 rounded-xl border border-white/10 bg-[#121822] space-y-2">
            <h3 className="text-xs font-bold font-sans text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
              <Database className="w-4 h-4 text-slate-300" />
              <span>4. Keterbatasan Data</span>
            </h3>
            <ul className="text-xs font-mono text-slate-300 space-y-1.5">
              <li className="flex justify-between gap-2">
                <span className="text-slate-400">Kepatuhan (compliance):</span>
                <span className="text-right">
                  {route.compliance
                    ? `${route.compliance.status} — ${route.compliance.summary}`
                    : 'Data tidak tersedia'}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-400">Data hedging:</span>
                <span>{route.hedging ? 'Tersedia' : 'Tidak tersedia — estimasi belum dihitung'}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-400">Tautan berita rujukan:</span>
                <span>
                  {newsLinks.length === 0
                    ? 'Tidak ada rujukan terverifikasi'
                    : `${newsLinks.length} rujukan${deadLinks > 0 ? ` (${deadLinks} kedaluwarsa)` : ''}`}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-400">Konteks koridor:</span>
                <span>{corridorIsFallback ? 'CACHE/FALLBACK — telemetri mungkin basi' : 'Live'}</span>
              </li>
              {route.keterbatasan_data?.map((item, i) => (
                <li key={i} className="text-slate-400">• {item}</li>
              ))}
            </ul>
          </section>

          {/* Section 5: Verifikasi Operator Checklist */}
          <section aria-label="Verifikasi Operator" className="p-3.5 rounded-xl border border-cyan-500/20 bg-cyan-950/10 space-y-2.5">
            <h3 className="text-xs font-bold font-sans text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider">
              <ClipboardCheck className="w-4 h-4 text-cyan-400" />
              <span>5. Verifikasi Operator (4/4)</span>
            </h3>
            <div className="space-y-1.5">
              {CHECKLIST_ITEMS.map((item) => (
                <label
                  key={item.id}
                  className="flex items-start gap-2.5 p-2 rounded-lg bg-[#080d14] border border-[#1c2432] cursor-pointer hover:border-cyan-500/40 transition text-xs font-sans text-slate-200"
                >
                  <input
                    type="checkbox"
                    checked={!!checked[item.id]}
                    onChange={() => toggleCheck(item.id)}
                    className="mt-0.5 w-4 h-4 accent-cyan-400 cursor-pointer"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              {Object.values(checked).filter(Boolean).length}/4 verifikasi selesai
            </div>

            {isSandbox ? (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs font-sans text-amber-200 leading-relaxed">
                Mode Evaluasi Tamu — pratinjau berwatermark lokal. Tidak ada POST /approvals
                dan tidak ada ping TMS. Masuk sebagai Dispatcher untuk commit operasional.
              </div>
            ) : (
              <>
                <div className="flex gap-2 text-xs font-mono">
                  {(['REROUTE', 'HOLD', 'CONTINUE'] as TacticalManeuver[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTactical(t)}
                      className={`cursor-pointer flex-1 py-1.5 rounded-md border text-xs transition ${
                        tactical === t
                          ? 'bg-white border-white text-[#080d14] font-semibold'
                          : 'bg-[#121822] border-[#1c2432] text-slate-400 hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan operator (wajib untuk HOLD)..."
                  rows={2}
                  className="w-full bg-[#080d14] border border-[#1c2432] focus:border-cyan-500/50 rounded-md p-2 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none"
                />
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDecision('APPROVE')}
                    disabled={!canCommit || (role === 'REGULATOR')}
                    title={role === 'REGULATOR' ? 'Memerlukan peran Dispatcher [Khusus Dispatcher]' : 'Setujui rute'}
                    className="cursor-pointer py-2 px-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    {role === 'REGULATOR' && <Lock className="w-3.5 h-3.5" />}
                    <span>{role === 'REGULATOR' ? 'SETUJUI [Khusus Dispatcher]' : 'SETUJUI'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecision('HOLD')}
                    disabled={!canCommit}
                    title="Tahan armada di buffer"
                    className="cursor-pointer py-2 px-2 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 text-xs font-semibold transition"
                  >
                    <span>TAHAN</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecision('REJECT')}
                    disabled={!canCommit || (role === 'REGULATOR')}
                    title={role === 'REGULATOR' ? 'Memerlukan peran Dispatcher [Khusus Dispatcher]' : 'Tolak rute'}
                    className="cursor-pointer py-2 px-2 rounded-md border border-rose-500/40 hover:bg-rose-500/10 disabled:opacity-40 disabled:cursor-not-allowed text-rose-300 text-xs font-semibold transition"
                  >
                    <span>{role === 'REGULATOR' ? 'TOLAK [Khusus Dispatcher]' : 'TOLAK'}</span>
                  </button>
                </div>
                {!allChecked && (
                  <p className="text-[11px] font-mono text-slate-500">
                    Lengkapi 4/4 verifikasi untuk mengaktifkan tombol keputusan.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
