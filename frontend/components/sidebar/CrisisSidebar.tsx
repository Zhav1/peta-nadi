'use client';
import React, { useState, useEffect } from 'react';
import { X, Link2, ChevronUp, ChevronDown } from 'lucide-react';
import { EvidenceTab } from './EvidenceTab';
import { MitigationTab } from './MitigationTab';
import { EconomicTab } from './EconomicTab';
import { CausalChainPanel } from './CausalChainPanel';
import type { CrisisState, RouteRecommendation } from '@/lib/types';
import { normalizeRegion } from '@/lib/region';

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
 selectedImpactedVehicle?: import('@/lib/types').ImpactedVehicleAssessment | null;
 selectedCommodity?: string | null;
 /** P3 zone evidence-only gate: true once a route is chosen/available. */
 hasRoute?: boolean;
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
 selectedImpactedVehicle,
 selectedCommodity,
 hasRoute: hasRouteProp,
}: CrisisSidebarProps) {
 const [internalTab, setInternalTab] = useState<Tab>('Evidence');

 /* Escape-to-close (drawer shell focus pattern; tab/crisis logic below is untouched). */
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if (e.key === 'Escape') onClose();
 };
 window.addEventListener('keydown', onKey);
 return () => window.removeEventListener('keydown', onKey);
 }, [onClose]);
 
 const activeTab = controlledTab || internalTab;
 const setActiveTab = controlledSetActiveTab || setInternalTab;
 const [showCausalChain, setShowCausalChain] = useState(true);
 // P3: zone click (highlighted zone, no route yet) is evidence-only.
 // Mitigasi/Ekonomi reappear once a real corridor is chosen or available.
 // hold_staging (forecast HOLD placeholder) never counts as a route.
  const hasRealFallbackRoute = (crisis.route_recommendations ?? []).some(
   (r) => r.corridor_type !== 'hold_staging'
 );
 const activeFallbackRoute =
  activeRouteIdx != null ? crisis.route_recommendations?.[activeRouteIdx] : undefined;
 const hasRoute =
  hasRouteProp ??
  ((activeRouteIdx != null && activeFallbackRoute?.corridor_type !== 'hold_staging') ||
  hasRealFallbackRoute);
 const visibleTabs: Tab[] = hasRoute ? ['Evidence', 'Mitigation', 'Economic'] : ['Evidence'];
 const effectiveTab: Tab = hasRoute ? activeTab : 'Evidence';

 // Severity dot only for critical/high. Medium/low stay quiet plain text.
 const isCritical = crisis.severity === 'critical';
 const isHigh = crisis.severity === 'high';

 // Confidence is displayed only when the swarm reported one (no 0.92 stand-in).
 const rawConfidence = Number(crisis.overall_confidence);
 const confidencePct =
 Number.isFinite(rawConfidence) && rawConfidence > 0
 ? Math.round(rawConfidence * 100)
 : null;

 return (
 <div
 id="crisis-sidebar"
 role="complementary"
 aria-label="Panel krisis"
 tabIndex={-1}
 className="absolute top-16 right-3 bottom-4 z-40 w-[calc(100vw-1.5rem)] sm:w-[390px] bg-[#0c1017] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl text-xs tabular-nums outline-none pointer-events-auto"
 >
 {/* Header */}
 <div className="p-4 border-b border-[#1c2432] bg-[#0c1017] space-y-2">
 <div className="flex items-start justify-between">
 <div className="flex-1 min-w-0 pr-2">
 <div className="flex items-center gap-2 mb-1.5 flex-wrap">
 {(isCritical || isHigh) && (
 <span className="flex items-center gap-1.5 text-xs text-slate-300">
 <span className={`w-1.5 h-1.5 rounded-full inline-block ${isCritical ? 'bg-red-400' : 'bg-orange-400'}`} />
 <span>{isCritical ? 'Kritis' : 'Tinggi'}</span>
 </span>
 )}
 <span className="text-xs text-slate-400 tabular-nums">
 {confidencePct === null ? 'Keyakinan belum tersedia' : `${confidencePct}% yakin`}
 </span>
 {crisis.zone_tier === 'RED_CONFIRMED' && (
 <span className="text-xs text-slate-300">
 Bahaya
 </span>
 )}
 {crisis.zone_tier === 'YELLOW_CLARIFY' && (
 <span className="text-xs text-slate-300">
 Waspada
 </span>
 )}
 {crisis.is_simulated && (
 <span className="text-xs text-slate-500">
 Simulasi
 </span>
 )}
 </div>
 <h2 className="text-sm font-bold text-white leading-snug font-sans">
 {crisis.title}
 </h2>
 <p className="text-xs text-slate-400 font-mono mt-0.5">
 {normalizeRegion(crisis.region)}
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

 </div>

 {/* Tabs */}
 <div className="flex border-b border-[#1c2432] bg-[#0c1017]">
 {(hasRoute
 ? [
 { id: 'Evidence', label: 'Bukti & Sensor' },
 { id: 'Mitigation', label: 'Mitigasi & Rute' },
 { id: 'Economic', label: 'Dampak Ekonomi' },
 ]
 : [{ id: 'Evidence', label: 'Bukti & Sensor' }]
 ).filter((tab) => visibleTabs.includes(tab.id as Tab)).map((tab) => (
 <button
 key={tab.id}
 id={`tab-${tab.id.toLowerCase()}`}
 type="button"
 onClick={() => setActiveTab(tab.id as Tab)}
 className={`cursor-pointer flex-1 py-2 text-xs font-sans font-medium transition-colors ${
 effectiveTab === tab.id
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
 {effectiveTab === 'Evidence' && <EvidenceTab crisis={crisis} />}
 {hasRoute && effectiveTab === 'Mitigation' && (
 <MitigationTab
 crisis={crisis}
 activeRouteIdx={activeRouteIdx}
 onSelectRoute={onSelectRoute}
 onApproveSuccess={onApproveSuccess}
 onCommitOperationalRoute={onCommitOperationalRoute}
 selectedImpactedVehicle={selectedImpactedVehicle}
 selectedCommodity={selectedCommodity}
 />
 )}
 {hasRoute && effectiveTab === 'Economic' && <EconomicTab crisis={crisis} />}
 </div>

 {/* GraphRAG causal chain — always-visible Why-this-alert section with collapse */}
 {crisis.causal_chain && crisis.causal_chain.length > 0 && (
 <div className="border-t border-[#1c2432] bg-[#0c1017]">
 <button
 id="causal-chain-toggle"
 aria-expanded={showCausalChain}
 aria-controls="causal-chain-body"
 type="button"
 onClick={() => setShowCausalChain((v) => !v)}
 className="cursor-pointer w-full flex items-center justify-between px-4 py-2.5 text-xs font-sans text-slate-300 hover:text-slate-100 transition-colors"
 >
 <span className="flex items-center gap-1.5">
 <Link2 className="w-3.5 h-3.5 text-cyan-400" />
 <span>Mengapa Peringatan Ini Muncul? <span className="text-slate-500">Why this alert</span></span>
 </span>
 <span>{showCausalChain ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</span>
 </button>
 <div
 id="causal-chain-body"
 className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${showCausalChain ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
 >
 <div className="overflow-hidden">
 <div className="px-4 pb-3">
 <CausalChainPanel chain={crisis.causal_chain} />
 </div>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
