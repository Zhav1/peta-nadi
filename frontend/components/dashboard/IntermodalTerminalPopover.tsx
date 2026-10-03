'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Ship, 
  Anchor, 
  Mountain, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ChevronDown, 
  Activity,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { useIntermodalData } from '@/hooks/useIntermodalData';
import type { ChokePointItem } from '@/lib/types';

export const IntermodalTerminalPopover: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'SEAPORTS' | 'PASSES'>('SEAPORTS');
  const popoverRef = useRef<HTMLDivElement>(null);

  const { 
    chokePoints, 
    totalCount, 
    congestedCount, 
    restrictedCount, 
    loading 
  } = useIntermodalData();

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const seaports = chokePoints.filter(p => p.type === 'SEAPORT' || p.type === 'FERRY_TERMINAL');
  const mountainPasses = chokePoints.filter(p => p.type !== 'SEAPORT' && p.type !== 'FERRY_TERMINAL');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'BLOCKED':
        return <span className="px-1.5 py-0.5 rounded text-xs font-mono font-medium bg-red-950/40 text-red-400 border border-red-500/30">Blokir</span>;
      case 'RESTRICTED':
        return <span className="px-1.5 py-0.5 rounded text-xs font-mono font-medium bg-amber-950/40 text-amber-400 border border-amber-500/30">Terbatas</span>;
      case 'CONGESTED':
        return <span className="px-1.5 py-0.5 rounded text-xs font-mono font-medium bg-amber-950/40 text-amber-300 border border-amber-500/30">Padat</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-xs font-mono font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">Lancar</span>;
    }
  };

  return (
    <div ref={popoverRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors duration-150 ${
          isOpen
            ? 'bg-white border-white text-[#080d14] font-semibold'
            : 'bg-[#0c1017] border-[#1c2432] text-slate-300 hover:text-white hover:border-slate-500'
        }`}
        title="Pan-Sumatra Intermodal Sea-Land Gateways & Mountain Passes"
      >
        <Ship className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="font-mono text-xs tabular-nums">Intermodal: {totalCount} Hub ({congestedCount + restrictedCount} Padat)</span>
        <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-96 max-h-[520px] flex flex-col rounded-lg bg-[#0c1017] border border-[#1c2432] shadow-xl z-50 text-slate-200 animate-in fade-in duration-150">
          {/* Header */}
          <div className="p-3 border-b border-[#1c2432] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-[#121822] text-slate-300 border border-[#1c2432]">
                <Anchor className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-sans font-semibold text-xs text-white uppercase tracking-wider">
                  Hub Intermodal Pan-Sumatra
                </h4>
                <p className="text-xs text-slate-400 font-mono tabular-nums">
                  7 Pelabuhan Laut · 11 Bottleneck Gunung/Tol
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-xs font-mono text-slate-300 bg-[#121822] border border-[#1c2432]">
              FR-17
            </span>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-[#1c2432] bg-[#080d14] p-1 gap-1">
            <button
              onClick={() => setActiveTab('SEAPORTS')}
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'SEAPORTS'
                  ? 'bg-white text-[#080d14] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#121822]'
              }`}
            >
              <Ship className="w-3.5 h-3.5" />
              <span>Gerbang Laut/Feri ({seaports.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('PASSES')}
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'PASSES'
                  ? 'bg-white text-[#080d14] font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#121822]'
              }`}
            >
              <Mountain className="w-3.5 h-3.5" />
              <span>Tanjakan & Tol ({mountainPasses.length})</span>
            </button>
          </div>

          {/* Content List */}
          <div className="overflow-y-auto p-2 space-y-1.5 max-h-[340px]">
            {(activeTab === 'SEAPORTS' ? seaports : mountainPasses).map((hub) => (
              <div
                key={hub.id}
                className="p-2.5 rounded-md bg-[#121822] border border-[#1c2432] hover:border-slate-500 transition-colors flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-sans font-medium text-xs text-white truncate">
                      {hub.name}
                    </span>
                    {getStatusBadge(hub.status)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                    <span>{hub.province}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      Dwell: {hub.dwelling_time_hours}h
                    </span>
                    <span>·</span>
                    <span>Antrean: {hub.queue_count} unit</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-medium text-slate-400 block">Pengali Tunda</span>
                  <span className={`text-xs font-mono tabular-nums font-semibold ${
                    hub.intermodal_delay_multiplier > 1.2
                      ? 'text-red-400'
                      : hub.intermodal_delay_multiplier > 1.05
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                  }`}>
                    {hub.intermodal_delay_multiplier.toFixed(2)}x
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer Formula Note */}
          <div className="p-2.5 border-t border-[#1c2432] bg-[#080d14] text-xs font-mono text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-slate-400" />
              M_intermodal: 1.0 + 0.15×(N_queue/10)×W
            </span>
            <span className="text-slate-200 font-mono">Clamp [1.0, 3.5]</span>
          </div>
        </div>
      )}
    </div>
  );
};
