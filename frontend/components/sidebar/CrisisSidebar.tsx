'use client';
import React, { useState } from 'react';
import { X, Link2, ChevronUp, ChevronDown, UserCheck, HelpCircle } from 'lucide-react';
import { EvidenceTab } from './EvidenceTab';
import { MitigationTab } from './MitigationTab';
import { EconomicTab } from './EconomicTab';
import { CausalChainPanel } from './CausalChainPanel';
import type { CrisisState, RouteRecommendation } from '@/lib/types';

const TABS = ['Evidence', 'Mitigation', 'Economic'] as const;
type Tab = typeof TABS[number];

interface CrisisSidebarProps {
  crisis: CrisisState;
  onClose: () => void;
  onSelectRoute: (idx: number) => void;
  activeRouteIdx: number | null;
  onApproveSuccess?: (msg: string) => void;
  activeTab?: Tab;
  setActiveTab?: (tab: Tab) => void;
  onCommitOperationalRoute?: (route: RouteRecommendation, action: any, tactical: any) => void;
}

export function CrisisSidebar({
  crisis,
  onClose,
  onSelectRoute,
  activeRouteIdx,
  onApproveSuccess,
  onCommitOperationalRoute,
  activeTab: controlledTab,
  setActiveTab: controlledSetActiveTab,
}: CrisisSidebarProps) {
  const [internalTab, setInternalTab] = useState<Tab>('Evidence');
  const [showHitlExplainer, setShowHitlExplainer] = useState(false);
  
  const activeTab = controlledTab || internalTab;
  const setActiveTab = controlledSetActiveTab || setInternalTab;
  const [showCausalChain, setShowCausalChain] = useState(false);

  const severityColor = {
    critical: 'text-red-400 bg-red-400/10 ring-red-400/30 border border-red-500/30',
    high: 'text-orange-400 bg-orange-400/10 ring-orange-400/30 border border-orange-500/30',
    medium: 'text-yellow-400 bg-yellow-400/10 ring-yellow-400/30 border border-yellow-500/30',
    low: 'text-emerald-400 bg-emerald-400/10 ring-emerald-400/30 border border-emerald-500/30',
  }['high'];

  const confidencePct = Math.round((crisis.overall_confidence || 0.92) * 100);

  return (
    <div
      id="crisis-sidebar"
      className="fixed top-20 right-3 sm:right-6 w-[calc(100vw-1.5rem)] sm:w-[400px] max-h-[calc(100vh-6rem)] sm:max-h-[calc(100vh-7.5rem)] bg-[#0c1017] border border-[#1c2432] rounded-lg flex flex-col z-40 overflow-hidden shadow-xl animate-in slide-in-from-right-4 duration-300 pointer-events-auto"
    >
      {/* Header */}
      <div className="p-4 border-b border-[#1c2432] bg-[#0c1017] space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wide ${severityColor}`}>
                {crisis.status}
              </span>
              <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold">
                {confidencePct}% Keyakinan
              </span>
              {crisis.is_simulated && (
                <span className="text-xs text-amber-300 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded font-mono font-bold">
                  SIMULASI FIXTURE
                </span>
              )}
            </div>
            <h2 className="text-sm font-bold text-white leading-snug font-sans">
              {crisis.title}
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {crisis.region.replace(/_/g, ' ')} · {crisis.type}
            </p>
          </div>
          <button
            id="sidebar-close-btn"
            type="button"
            onClick={onClose}
            className="cursor-pointer w-7 h-7 rounded-md bg-[#121822] border border-[#1c2432] text-slate-400 hover:text-white flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Tutup panel krisis"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* HITL Decision Support Context Strip */}
        <div className="pt-2 border-t border-[#1c2432]">
          <div className="flex items-center justify-between text-xs font-sans text-slate-300 bg-[#121822] border border-[#1c2432] px-3 py-1.5 rounded-md">
            <span className="flex items-center gap-1.5 text-cyan-300 font-medium">
              <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Dukungan Keputusan · Kendali Operator</span>
            </span>
            <button
              type="button"
              onClick={() => setShowHitlExplainer((v) => !v)}
              className="cursor-pointer text-slate-400 hover:text-cyan-300 transition"
              title="Penjelasan Tata Kelola Keputusan Sistem"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>

          {showHitlExplainer && (
            <div className="mt-2 p-2.5 rounded-md bg-[#080d14] border border-[#1c2432] text-xs text-slate-300 font-sans leading-relaxed animate-in fade-in duration-150">
              <strong className="text-cyan-300 font-bold block mb-1">Prinsip Kendali Operator (Human-in-the-Loop):</strong>
              Sistem tidak melakukan intervensi kendaraan otomatis. Sistem hanya menyediakan analisis bukti multisumber & estimasi risiko. Persetujuan rute pengalihan mutlak berada pada kewenangan operator logistik.
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1c2432] bg-[#0c1017]">
        {[
          { id: 'Evidence', label: 'Bukti & Sensor' },
          { id: 'Mitigation', label: 'Mitigasi & Rute' },
          { id: 'Economic', label: 'Dampak Ekonomi' },
        ].map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id.toLowerCase()}`}
            type="button"
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`cursor-pointer flex-1 py-2 text-xs font-sans font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-white bg-white/5 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto panel-scroll p-4 space-y-4">
        {activeTab === 'Evidence' && <EvidenceTab crisis={crisis} />}
        {activeTab === 'Mitigation' && (
          <MitigationTab
            crisis={crisis}
            activeRouteIdx={activeRouteIdx}
            onSelectRoute={onSelectRoute}
            onApproveSuccess={onApproveSuccess}
            onCommitOperationalRoute={onCommitOperationalRoute}
          />
        )}
        {activeTab === 'Economic' && <EconomicTab crisis={crisis} />}
      </div>

      {/* GraphRAG causal chain */}
      {crisis.causal_chain && crisis.causal_chain.length > 0 && (
        <div className="border-t border-[#1c2432] bg-[#0c1017]">
          <button
            id="causal-chain-toggle"
            type="button"
            onClick={() => setShowCausalChain((v) => !v)}
            className="cursor-pointer w-full flex items-center justify-between px-4 py-2.5 text-xs font-sans text-slate-300 hover:text-slate-100 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Mengapa Peringatan Ini Muncul? (Causal Chain)</span>
            </span>
            <span>{showCausalChain ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</span>
          </button>
          {showCausalChain && (
            <div className="px-4 pb-3">
              <CausalChainPanel chain={crisis.causal_chain} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
