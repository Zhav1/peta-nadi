'use client';
import React, { useState } from 'react';
import { X, Link2, ChevronUp, ChevronDown, UserCheck, HelpCircle } from 'lucide-react';
import { EvidenceTab } from './EvidenceTab';
import { MitigationTab } from './MitigationTab';
import { EconomicTab } from './EconomicTab';
import { CausalChainPanel } from './CausalChainPanel';
import type { CrisisState } from '@/lib/types';

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
}

export function CrisisSidebar({
  crisis,
  onClose,
  onSelectRoute,
  activeRouteIdx,
  onApproveSuccess,
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
      className="fixed top-20 right-6 w-[400px] max-h-[calc(100vh-7.5rem)] bg-[#0c0e12]/95 backdrop-blur-2xl border border-white/10 rounded-2xl flex flex-col z-40 overflow-hidden shadow-2xl animate-in slide-in-from-right-4 duration-300 pointer-events-auto"
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-slate-950/60 space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono uppercase tracking-wide ${severityColor}`}>
                {crisis.status}
              </span>
              <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                {confidencePct}% CONFIDENCE
              </span>
              {crisis.is_simulated && (
                <span className="text-[9px] text-amber-300 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                  SIMULASI FIXTURE
                </span>
              )}
            </div>
            <h2 className="text-sm font-bold text-white leading-snug font-sans">
              {crisis.title}
            </h2>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              {crisis.region.replace(/_/g, ' ')} · {crisis.type}
            </p>
          </div>
          <button
            id="sidebar-close-btn"
            type="button"
            onClick={onClose}
            className="cursor-pointer w-7 h-7 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Tutup panel krisis"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* HITL Decision Support Context Strip */}
        <div className="pt-2 border-t border-white/5">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 bg-cyan-950/30 border border-cyan-500/20 px-2.5 py-1.5 rounded-lg">
            <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
              <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Decision Support · HITL Active</span>
            </span>
            <button
              type="button"
              onClick={() => setShowHitlExplainer((v) => !v)}
              className="cursor-pointer text-slate-400 hover:text-cyan-300 transition"
              title="Penjelasan Tata Kelola Keputusan PreHub"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>

          {showHitlExplainer && (
            <div className="mt-2 p-2.5 rounded-lg bg-slate-950 border border-white/10 text-[10px] text-slate-300 font-sans leading-relaxed animate-in fade-in duration-150">
              <strong className="text-cyan-300 font-bold block mb-1">Prinsip Human-in-the-Loop (Proposal Bagian 4.2):</strong>
              PreHub tidak melakukan intervensi kendaraan otomatis. Sistem hanya menyediakan analisis bukti multisumber & estimasi risiko. Persetujuan rute pengalihan mutlak berada pada kewenangan operator.
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 bg-slate-950/40">
        {TABS.map((tab) => (
          <button
            key={tab}
            id={`tab-${tab.toLowerCase()}`}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`cursor-pointer flex-1 py-2.5 text-xs font-headline font-bold uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/10'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab}
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
          />
        )}
        {activeTab === 'Economic' && <EconomicTab crisis={crisis} />}
      </div>

      {/* GraphRAG causal chain */}
      {crisis.causal_chain && crisis.causal_chain.length > 0 && (
        <div className="border-t border-white/10 bg-slate-950/60">
          <button
            id="causal-chain-toggle"
            type="button"
            onClick={() => setShowCausalChain((v) => !v)}
            className="cursor-pointer w-full flex items-center justify-between px-4 py-2.5 text-xs font-mono text-slate-300 hover:text-slate-100 transition-colors"
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
