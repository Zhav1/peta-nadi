'use client';
import { useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
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
}

export function CrisisSidebar({
  crisis,
  onClose,
  onSelectRoute,
  activeRouteIdx,
  onApproveSuccess,
}: CrisisSidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Evidence');
  const [showCausalChain, setShowCausalChain] = useState(false);

  const severityColor = {
    critical: 'text-red-400 bg-red-400/10 ring-red-400/30',
    high: 'text-orange-400 bg-orange-400/10 ring-orange-400/30',
    medium: 'text-yellow-400 bg-yellow-400/10 ring-yellow-400/30',
    low: 'text-emerald-400 bg-emerald-400/10 ring-emerald-400/30',
  }['high']; // default severity fallback or map status

  return (
    <GlassPanel
      id="crisis-sidebar"
      className="absolute top-4 right-4 w-96 max-h-[calc(100vh-2rem)] flex flex-col z-20 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-white/10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ring-1 uppercase tracking-wide ${severityColor}`}>
              {crisis.status}
            </span>
            <span className="text-xs text-slate-500">
              {Math.round(crisis.overall_confidence * 100)}% confidence
            </span>
          </div>
          <h2 className="text-sm font-semibold text-white leading-snug truncate">
            {crisis.title}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {crisis.region.replace(/_/g, ' ')} · {crisis.type}
          </p>
        </div>
        <button
          id="sidebar-close-btn"
          onClick={onClose}
          className="ml-2 text-slate-500 hover:text-white transition-colors flex-shrink-0"
          aria-label="Close crisis panel"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab}
            id={`tab-${tab.toLowerCase()}`}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto panel-scroll p-4">
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
        <div className="border-t border-white/10">
          <button
            id="causal-chain-toggle"
            onClick={() => setShowCausalChain((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <span>🔗</span>
              <span>Why this alert? (Causal chain)</span>
            </span>
            <span>{showCausalChain ? '▲' : '▼'}</span>
          </button>
          {showCausalChain && (
            <div className="px-4 pb-3">
              <CausalChainPanel chain={crisis.causal_chain} />
            </div>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
