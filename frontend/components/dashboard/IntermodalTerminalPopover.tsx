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
        return <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-red-950 text-red-400 border border-red-500/40">BLOKIR</span>;
      case 'RESTRICTED':
        return <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-amber-950 text-amber-400 border border-amber-500/40">TERBATAS</span>;
      case 'CONGESTED':
        return <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-amber-900/60 text-amber-300 border border-amber-500/30">PADAT</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">LANCAR</span>;
    }
  };

  return (
    <div ref={popoverRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl border backdrop-blur-md transition-all duration-200 hover:border-blue-400/60 ${
          isOpen
            ? 'bg-blue-950/80 border-blue-400 text-blue-300 ring-2 ring-blue-500/20'
            : 'bg-[#0c0e12]/80 border-white/10 text-blue-400 hover:bg-slate-900/80'
        }`}
        title="Pan-Sumatra Intermodal Sea-Land Gateways & Mountain Passes"
      >
        <Ship className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span>INTERMODAL: {totalCount} Hub ({congestedCount + restrictedCount} Padat)</span>
        <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-96 max-h-[520px] flex flex-col rounded-2xl bg-[#0c0e12]/95 border border-blue-500/30 backdrop-blur-xl shadow-2xl z-50 text-slate-200 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/40">
                <Anchor className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-sans font-bold text-xs text-blue-300 uppercase tracking-wider">
                  Pan-Sumatra Intermodal Hubs
                </h4>
                <p className="text-[10px] text-slate-400 font-mono">
                  7 Pelabuhan Laut • 11 Bottleneck Gunung/Tol
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/30">
              FR-17
            </span>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-white/10 bg-slate-900/50 p-1 gap-1">
            <button
              onClick={() => setActiveTab('SEAPORTS')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'SEAPORTS'
                  ? 'bg-blue-600 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Ship className="w-3 h-3" />
              <span>Gerbang Laut/Feri ({seaports.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('PASSES')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'PASSES'
                  ? 'bg-blue-600 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Mountain className="w-3 h-3" />
              <span>Tanjakan & Tol ({mountainPasses.length})</span>
            </button>
          </div>

          {/* Content List */}
          <div className="overflow-y-auto p-2 space-y-1.5 max-h-[340px]">
            {(activeTab === 'SEAPORTS' ? seaports : mountainPasses).map((hub) => (
              <div
                key={hub.id}
                className="p-2 rounded-xl bg-slate-900/60 border border-white/5 hover:border-white/15 transition-all flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-mono font-bold text-xs text-slate-200 truncate">
                      {hub.name}
                    </span>
                    {getStatusBadge(hub.status)}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                    <span>{hub.province}</span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5 text-amber-400" />
                      Dwell: {hub.dwelling_time_hours}h
                    </span>
                    <span>•</span>
                    <span>Antrean: {hub.queue_count} unit</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[9px] font-mono text-slate-400 block">Delay Multiplier</span>
                  <span className={`text-xs font-mono font-black ${
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
          <div className="p-2.5 border-t border-white/10 bg-slate-950/70 text-[10px] font-mono text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-cyan-400" />
              M_intermodal: 1.0 + 0.15×(N_queue/10)×W
            </span>
            <span className="text-cyan-300 font-bold">Clamp [1.0, 3.5]</span>
          </div>
        </div>
      )}
    </div>
  );
};
