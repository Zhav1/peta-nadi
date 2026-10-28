'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Scale,
  ClipboardCheck,
  ExternalLink,
  Truck,
  CheckCircle2,
  XCircle,
  PauseCircle,
  RefreshCw,
  Sparkles,
  MapPin,
  FileText
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog';

export interface HitlPendingItem {
  approval_id: string;
  incident_id: string;
  route_id?: string;
  route_name?: string;
  origin?: string;
  destination?: string;
  operator_id?: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'HELD';
  created_at?: string;
  notes?: string;
  impact_assessment?: {
    hazard_type?: string;
    total_value_at_risk_idr?: number;
    critical_spoilage_count?: number;
    impacted_vehicles_count?: number;
    recommended_action?: string;
    impacted_assessments?: Array<{
      vehicle_id: string;
      commodity_key: string;
      cargo_tonnage: number;
      spoilage_loss_idr: number;
      detour_fuel_cost_idr: number;
      detour_distance_km: number;
      detour_time_hours: number;
      net_benefit_idr: number;
      recommended_action: string;
    }>;
  };
  news_citation?: {
    headline: string;
    source: string;
    link?: string;
    corridor?: string;
    severity?: string;
    confidence_score?: number;
  };
}

interface HitlDecisionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onDecisionApplied?: (approvalId: string, decision: string) => void;
}

export function HitlDecisionDrawer({
  isOpen,
  onClose,
  onDecisionApplied
}: HitlDecisionDrawerProps) {
  const [pendingItems, setPendingItems] = useState<HitlPendingItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<HitlPendingItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewerNotes, setReviewerNotes] = useState('');
  // Phase 77: role-gated commits — guest read-only, regulator HOLD-only.
  const { role } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchPending = async () => {
    setIsLoading(true);
    try {
      const res = await api.news.hitlPending();
      if (res && res.items) {
        setPendingItems(res.items as unknown as HitlPendingItem[]);
        if (res.items.length > 0 && !selectedItem) {
          setSelectedItem(res.items[0] as unknown as HitlPendingItem);
        }
      }
    } catch (err) {
      console.error('Failed to load pending HITL decisions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPending();
    }
  }, [isOpen]);

  /* Escape-to-close and focus trapping are provided by the drawer block (Root onOpenChange + Popup). */

  /* Drawer visibility is controlled by the Root open prop (Watermelon block pattern). */

  const handleDecision = async (decision: 'APPROVE' | 'REJECT' | 'HOLD') => {
    if (!selectedItem) return;
    // Phase 77: guest never crosses the mutation boundary; regulator HOLD-only.
    if (role === 'GUEST') {
      setActionError('Pratinjau sandbox — masuk sebagai Dispatcher untuk mengeksekusi.');
      return;
    }
    if (role === 'REGULATOR' && decision !== 'HOLD') {
      setActionError('Memerlukan peran Dispatcher . Regulator hanya dapat TAHAN.');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      await api.news.hitlAction({
        approval_id: selectedItem.approval_id,
        decision,
        approved_by: 'Dispatcher Command (HITL)',
        notes: reviewerNotes || `Keputusan operator: ${decision}`
      });

      if (onDecisionApplied) {
        onDecisionApplied(selectedItem.approval_id, decision);
      }

      // Refresh queue
      await fetchPending();
      setReviewerNotes('');
    } catch (err) {
      // Phase 77: on 403 the item stays in the queue — never removed or marked decided.
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to apply HITL decision:', err);
      if (msg.includes('403') || msg.includes('Forbidden')) {
        setActionError('Mode Sandbox (403): antrean dipertahankan, tidak ada keputusan yang dicatat.');
      } else {
        setActionError('Gagal mencatat keputusan — antrean dipertahankan, coba lagi.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const formatIDR = (val?: number) => {
    if (!val) return 'Rp 0';
    if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(2)} M`;
    if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)} Jt`;
    return `Rp ${val.toLocaleString('id-ID')}`;
  };

  const activeAssessment = selectedItem?.impact_assessment;
  const citation = selectedItem?.news_citation;
  const topVehicle = activeAssessment?.impacted_assessments?.[0];

  return (
    <BaseAlertDialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <BaseAlertDialog.Portal>
        {/* Opaque dim overlay isolates the drawer from the map (no blur). AlertDialog semantics: deliberate close only. */}
        <BaseAlertDialog.Backdrop
          data-slot="hitl-drawer-backdrop"
          className="fixed inset-0 z-[95] bg-[#080d14]/80"
        />
        <BaseAlertDialog.Popup
          data-slot="hitl-drawer-content"
          aria-label="Tinjau keputusan HITL"
          className="fixed top-0 right-0 bottom-0 z-[100] w-full max-w-xl bg-[#0c1017] border-l border-white/10 rounded-l-xl shadow-[0_12px_32px_rgba(0,0,0,0.4)] flex flex-col text-xs text-[#e8eaed] tabular-nums outline-none"
        >
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0c1017]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-[10px] bg-[#121822] border border-white/10 flex items-center justify-center text-[#38b8f8]">
                <Scale className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <BaseAlertDialog.Title className="text-sm font-bold text-white">
                    Tinjau
                  </BaseAlertDialog.Title>
                  {pendingItems.length > 0 && (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 tabular-nums">
                      {pendingItems.length} antre
                    </span>
                  )}
                </div>
                <p className="text-xs text-[rgba(232,234,237,0.62)]">
                  Putuskan deviasi vs pembusukan sebelum instruksi disahkan
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchPending}
                disabled={isLoading}
                className="cursor-pointer p-1.5 rounded-[10px] border border-white/10 hover:bg-white/5 text-[rgba(232,234,237,0.62)] hover:text-white ds-pressable"
                title="Muat Ulang Antrean"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                id="close-hitl-drawer-btn"
                onClick={onClose}
                className="cursor-pointer p-1.5 rounded-[10px] border border-white/10 hover:bg-white/5 text-[rgba(232,234,237,0.62)] hover:text-white ds-pressable"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Drawer Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Pending Items Tab/Selector if multiple */}
            {pendingItems.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {pendingItems.map((item) => (
                  <button
                    key={item.approval_id}
                    onClick={() => setSelectedItem(item)}
                    className={`cursor-pointer px-3 py-1.5 rounded-[10px] border text-xs font-mono max-w-[260px] truncate ds-pressable ${
                      selectedItem?.approval_id === item.approval_id
                        ? 'bg-[#38b8f8]/15 border-[#38b8f8]/40 text-[#38b8f8] font-bold'
                        : 'bg-[#121822] border-white/10 text-[rgba(232,234,237,0.62)] hover:text-[#e8eaed]'
                    }`}
                    title={item.route_name || item.incident_id}
                  >
                    {item.route_name || item.incident_id}
                  </button>
                ))}
              </div>
            )}

            {pendingItems.length === 0 && !isLoading ? (
              <div className="py-16 text-center text-slate-500 space-y-2">
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/50" />
                <p className="text-sm font-sans font-medium text-slate-300">Antrean Tinjauan Bersih</p>
                <p className="text-xs max-w-sm mx-auto">
                  Tidak ada rute kritis menunggu intervensi HITL.
                </p>
              </div>
            ) : selectedItem ? (
              <>
                {/* Section 1: Risiko */}
                <section aria-label="Risiko" className="rounded-xl bg-[#080d14] p-3 space-y-2">
                  <h3 className="text-xs font-bold font-sans text-[#e8eaed] flex items-center justify-between gap-1.5">
                    <span className="flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                      <span>1. Risiko</span>
                    </span>
                    {citation?.confidence_score && (
                      <span className="text-xs text-[rgba(232,234,237,0.62)] tabular-nums font-mono font-normal">{(citation.confidence_score * 100).toFixed(0)}% yakin</span>
                    )}
                  </h3>
                  <h4 className="text-sm font-bold text-white font-sans leading-snug">
                    {citation?.headline || selectedItem.route_name || 'Disrupsi koridor teridentifikasi'}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[rgba(232,234,237,0.62)]">
                    <span className="px-2 py-0.5 rounded bg-[#121822] border border-white/10 text-[#38b8f8] font-mono">
                      {citation?.source || 'LKBN ANTARA'}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[rgba(232,234,237,0.62)]">
                      <MapPin className="w-3 h-3 text-rose-400" />
                      {citation?.corridor || selectedItem.origin || 'Koridor Logistik'}
                    </span>
                    {citation?.link && (
                      <a
                        href={citation.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-pointer flex items-center gap-1 text-[#38b8f8] hover:underline"
                      >
                        Buka Sumber <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  <div className="text-xs font-mono space-y-1 text-[#e8eaed] pt-1 border-t border-white/10">
                    <div className="flex justify-between gap-2">
                      <span className="text-[rgba(232,234,237,0.62)]">Bahaya:</span>
                      <span className="text-right">{activeAssessment?.hazard_type || citation?.severity || 'Gangguan koridor'}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-[rgba(232,234,237,0.62)]">Armada terdampak:</span>
                      <span className="font-bold text-white tabular-nums">{activeAssessment?.impacted_vehicles_count || 1} unit</span>
                    </div>
                  </div>
                </section>

                {/* Section 2: Dampak & Biaya */}
                <section aria-label="Dampak dan Biaya" className="rounded-xl bg-[#080d14] p-3 space-y-2.5">
                  <h3 className="text-xs font-bold font-sans text-[#e8eaed] flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-[#38b8f8]" />
                    <span>2. Dampak &amp; Biaya</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2 rounded-[10px] bg-[#0c1017]">
                      <span className="text-[rgba(232,234,237,0.62)] text-xs block">Susut</span>
                      <span className="text-sm font-bold text-rose-400 block mt-0.5">
                        {formatIDR(topVehicle?.spoilage_loss_idr || activeAssessment?.total_value_at_risk_idr)}
                      </span>
                      <span className="text-xs text-[rgba(232,234,237,0.38)] mt-1 block">
                        Jika tertahan di titik macet
                      </span>
                    </div>
                    <div className="p-2 rounded-[10px] bg-[#0c1017]">
                      <span className="text-[rgba(232,234,237,0.62)] text-xs block">Detour</span>
                      <span className="text-sm font-bold text-[#38b8f8] block mt-0.5">
                        {formatIDR(topVehicle?.detour_fuel_cost_idr || 185000)}
                      </span>
                      <span className="text-xs text-[rgba(232,234,237,0.38)] mt-1 block">
                        +{topVehicle?.detour_distance_km || 42} km | +{topVehicle?.detour_time_hours || 1.5} jam
                      </span>
                    </div>
                  </div>
                  {topVehicle && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-white/10">
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Net Saving Detour:</span>
                      </div>
                      <span className="font-bold text-emerald-300 font-mono">
                        +{formatIDR(topVehicle.net_benefit_idr)}
                      </span>
                    </div>
                  )}
                  {topVehicle && (
                    <div className="text-xs space-y-1.5 pt-1 border-t border-white/10">
                      <div className="flex items-center justify-between text-[rgba(232,234,237,0.62)] font-mono">
                        <span className="flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-slate-300" />
                          Target: <strong className="text-white">{topVehicle.vehicle_id}</strong>
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-slate-300 font-bold">
                          {topVehicle.commodity_key} ({topVehicle.cargo_tonnage} Ton)
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400 font-sans">
                        <span>Rekomendasi algoritma:</span>
                        <span className="font-mono font-bold text-[#38b8f8]">
                          {topVehicle.recommended_action === 'REROUTE' ? 'Alih' : 'Tahan'}
                        </span>
                      </div>
                    </div>
                  )}
                </section>

                {/* Section 3: Verifikasi */}
                <section aria-label="Verifikasi" className="rounded-xl bg-[#080d14] p-3 space-y-2">
                  <h3 className="text-xs font-bold font-sans text-[#e8eaed] flex items-center gap-1.5">
                    <ClipboardCheck className="w-3.5 h-3.5 text-[#38b8f8]" />
                    <span>3. Verifikasi</span>
                  </h3>
                  <div className="flex items-start gap-1.5 text-xs font-mono text-[rgba(232,234,237,0.62)]">
                    <FileText className="w-3.5 h-3.5 text-[#38b8f8] shrink-0 mt-0.5" />
                    <span>
                      {citation?.source
                        ? `Disitasi ${citation.source}; validasi silang sebelum eksekusi.`
                        : 'Belum ada sitasi resmi — validasi silang sebelum eksekusi.'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-[rgba(232,234,237,0.62)] block">
                      Catatan:
                    </label>
                    <textarea
                      value={reviewerNotes}
                      onChange={(e) => setReviewerNotes(e.target.value)}
                      placeholder="cth: Pengalihan disetujui via koridor alternatif..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-[10px] bg-[#0c1017] border border-white/10 text-xs text-white placeholder:text-[rgba(232,234,237,0.38)] focus:outline-none focus:border-white/15 transition-colors font-sans"
                    />
                  </div>
                </section>
              </>
            ) : null}
          </div>

          {/* Decision Action Toolbar */}
          {selectedItem && (
            <div className="p-4 border-t border-white/10 bg-[#0c1017] flex flex-col gap-2">
              {role === 'GUEST' && (
                <p className="text-xs font-mono text-amber-300/90 text-center">
                  Pratinjau sandbox — masuk sebagai Dispatcher untuk mengeksekusi.
                </p>
              )}
              {actionError && (
                <p role="alert" className="text-xs font-mono text-rose-300 text-center">
                  {actionError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDecision('APPROVE')}
                  disabled={actionLoading || role === 'GUEST' || role === 'REGULATOR'}
                  title={role === 'REGULATOR' ? 'Memerlukan peran Dispatcher ' : role === 'GUEST' ? 'Pratinjau sandbox — masuk sebagai Dispatcher untuk mengeksekusi' : 'Setujui detour'}
                  className="cursor-pointer flex-1 py-2.5 px-3 rounded-[10px] bg-white hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-[#080d14] font-mono text-xs font-bold flex items-center justify-center gap-2 ds-pressable"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Setujui</span>
                </button>

                <button
                  onClick={() => handleDecision('HOLD')}
                  disabled={actionLoading || role === 'GUEST'}
                  title={role === 'GUEST' ? 'Pratinjau sandbox — masuk sebagai Dispatcher untuk mengeksekusi' : 'Tahan armada di buffer'}
                  className="cursor-pointer py-2.5 px-3 rounded-[10px] border border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 font-mono text-xs font-medium flex items-center justify-center gap-1.5 ds-pressable"
                >
                  <PauseCircle className="w-4 h-4" />
                  <span>Tahan</span>
                </button>

                <button
                  onClick={() => handleDecision('REJECT')}
                  disabled={actionLoading || role === 'GUEST' || role === 'REGULATOR'}
                  title={role === 'REGULATOR' ? 'Memerlukan peran Dispatcher ' : role === 'GUEST' ? 'Pratinjau sandbox — masuk sebagai Dispatcher untuk mengeksekusi' : 'Tolak deviasi, lanjutkan rute utama'}
                  className="cursor-pointer py-2.5 px-3 rounded-[10px] border border-rose-500/40 hover:bg-rose-500/10 disabled:opacity-40 disabled:cursor-not-allowed text-rose-300 font-mono text-xs font-medium flex items-center justify-center gap-1.5 ds-pressable"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Tetap</span>
                </button>
              </div>
            </div>
          )}
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}
