'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Truck,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Clock,
  TrendingDown,
  Scale,
  RefreshCw,
  Sparkles,
  MapPin,
  FileText
} from 'lucide-react';
import { api } from '@/lib/api';

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

  if (!isOpen) return null;

  const handleDecision = async (decision: 'APPROVE' | 'REJECT' | 'HOLD') => {
    if (!selectedItem) return;
    setActionLoading(true);
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
      console.error('Failed to apply HITL decision:', err);
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
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-[#0c1017]/95 backdrop-blur-md border-l border-white/10 shadow-2xl flex flex-col text-slate-200 animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-4 border-b border-[#1c2432] flex items-center justify-between bg-[#080d14]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                Human-in-the-Loop Review
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                GLOBOT PROTOCOL
              </span>
            </div>
            <p className="text-xs text-slate-400 font-sans">
              Evaluasi biaya deviasi vs pembusukan kargo sebelum instruksi disahkan
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchPending}
            disabled={isLoading}
            className="cursor-pointer p-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition"
            title="Muat Ulang Antrean"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="cursor-pointer p-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Drawer Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Pending Items Tab/Selector if multiple */}
        {pendingItems.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {pendingItems.map((item) => (
              <button
                key={item.approval_id}
                onClick={() => setSelectedItem(item)}
                className={`cursor-pointer px-3 py-1.5 rounded-lg border text-xs font-mono whitespace-nowrap transition ${
                  selectedItem?.approval_id === item.approval_id
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                    : 'bg-[#121822] border-[#1c2432] text-slate-400 hover:text-slate-200'
                }`}
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
              Tidak ada rute kritis yang menunggu intervensi HITL saat ini. Rerouting berjalan sesuai ambang batas otomatis.
            </p>
          </div>
        ) : selectedItem ? (
          <>
            {/* Ground Truth Citation Card (Globot / God's Eye View Pattern) */}
            <div className="p-3.5 rounded-xl border border-white/10 bg-[#0c1017] space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  EVIDENCE CITATION (VERIFIED OSINT)
                </span>
                {citation?.confidence_score && (
                  <span className="text-emerald-400 font-bold">
                    {(citation.confidence_score * 100).toFixed(0)}% CONFIDENCE
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white font-sans leading-snug">
                  {citation?.headline || selectedItem.route_name || 'Disrupsi Koridor Teridentifikasi'}
                </h3>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-400">
                  <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800 text-cyan-300 font-mono">
                    {citation?.source || 'LKBN ANTARA'}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-slate-400">
                    <MapPin className="w-3 h-3 text-rose-400" />
                    {citation?.corridor || selectedItem.origin || 'Koridor Logistik'}
                  </span>
                  {citation?.link && (
                    <a
                      href={citation.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer flex items-center gap-1 text-cyan-400 hover:underline"
                    >
                      Buka Sumber <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Economic Trade-off Matrix: Spoilage Risk vs Detour Surcharge */}
            <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-950/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5" />
                  COST-BENEFIT HEDGING MATRIX
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {activeAssessment?.impacted_vehicles_count || 1} Armada Terdampak
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-[#080d14] border border-rose-500/30">
                  <span className="text-slate-400 text-[10px] block">POTENSI SUSUT / SPOILAGE</span>
                  <span className="text-sm font-bold text-rose-400 block mt-0.5">
                    {formatIDR(topVehicle?.spoilage_loss_idr || activeAssessment?.total_value_at_risk_idr)}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Jika tertahan di titik macet
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-[#080d14] border border-cyan-500/30">
                  <span className="text-slate-400 text-[10px] block">BIAYA DETOUR (+SOLAR/TOL)</span>
                  <span className="text-sm font-bold text-cyan-400 block mt-0.5">
                    {formatIDR(topVehicle?.detour_fuel_cost_idr || 185000)}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    +{topVehicle?.detour_distance_km || 42} km | +{topVehicle?.detour_time_hours || 1.5} jam
                  </span>
                </div>
              </div>

              {/* Net Benefit Callout */}
              {topVehicle && (
                <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Net Saving Detour:</span>
                  </div>
                  <span className="font-bold text-emerald-300">
                    +{formatIDR(topVehicle.net_benefit_idr)}
                  </span>
                </div>
              )}
            </div>

            {/* Target Fleet Vehicle Details */}
            {topVehicle && (
              <div className="p-3 rounded-lg border border-white/5 bg-[#080d14] space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-slate-300" />
                    Target Armada: <strong className="text-white">{topVehicle.vehicle_id}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-slate-300 font-bold">
                    {topVehicle.commodity_key} ({topVehicle.cargo_tonnage} Ton)
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400 font-sans">
                  <span>Rekomendasi Algoritma:</span>
                  <span className="font-mono font-bold text-cyan-300">
                    {topVehicle.recommended_action === 'REROUTE' ? 'PENGALIHAN RUTE (DETOUR)' : 'TAHAN DI BUFFER'}
                  </span>
                </div>
              </div>
            )}

            {/* Operator Notes Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400 block">
                Catatan Operator / Instruksi Dispatcher (Opsional):
              </label>
              <textarea
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="cth: Pengalihan disetujui via koridor alternatif, koordinasikan dengan pos Dishub setempat..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-[#080d14] border border-[#1c2432] text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition font-sans"
              />
            </div>
          </>
        ) : null}
      </div>

      {/* Decision Action Toolbar */}
      {selectedItem && (
        <div className="p-4 border-t border-[#1c2432] bg-[#080d14] flex items-center gap-2">
          <button
            onClick={() => handleDecision('APPROVE')}
            disabled={actionLoading}
            className="cursor-pointer flex-1 py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>SETUJUI DETOUR</span>
          </button>

          <button
            onClick={() => handleDecision('HOLD')}
            disabled={actionLoading}
            className="cursor-pointer py-2.5 px-3 rounded-lg border border-amber-500/40 hover:bg-amber-500/10 text-amber-300 font-mono text-xs font-medium transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            title="Tahan armada di kantong parkir buffer"
          >
            <PauseCircle className="w-4 h-4" />
            <span>TAHAN BUFFER</span>
          </button>

          <button
            onClick={() => handleDecision('REJECT')}
            disabled={actionLoading}
            className="cursor-pointer py-2.5 px-3 rounded-lg border border-rose-500/40 hover:bg-rose-500/10 text-rose-300 font-mono text-xs font-medium transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            title="Tolak deviasi, lanjutkan rute utama"
          >
            <XCircle className="w-4 h-4" />
            <span>TETAP RUTE AWAL</span>
          </button>
        </div>
      )}
    </div>
  );
}
