'use client';

import React, { useState } from 'react';
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
import {
 Popover,
 PopoverContent,
 PopoverTrigger,
} from '@/components/base-ui/popover';

export interface IntermodalTerminalPopoverProps {
 isOpen?: boolean;
 onToggle?: () => void;
 onClose?: () => void;
 onSelectHub?: (hub: ChokePointItem) => void;
}

export const IntermodalTerminalPopover: React.FC<IntermodalTerminalPopoverProps> = ({
 isOpen: controlledIsOpen,
 onToggle,
 onClose,
 onSelectHub,
}) => {
 const [internalIsOpen, setInternalIsOpen] = useState(false);
 const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
 const [activeTab, setActiveTab] = useState<'SEAPORTS' | 'PASSES'>('SEAPORTS');

 const {
 chokePoints,
 totalCount,
 congestedCount,
 restrictedCount,
 loading
 } = useIntermodalData();
 void loading;
 void AlertTriangle;
 void CheckCircle2;
 void Layers;
 void ArrowUpRight;

 const handleOpenChange = (next: boolean) => {
 if (controlledIsOpen !== undefined) {
 if (next === controlledIsOpen) return;
 if (next) {
 onToggle?.();
 } else {
 onClose?.();
 }
 } else {
 setInternalIsOpen(next);
 }
 };

 const seaports = chokePoints.filter(p => p.type === 'SEAPORT' || p.type === 'FERRY_TERMINAL');
 const mountainPasses = chokePoints.filter(p => p.type !== 'SEAPORT' && p.type !== 'FERRY_TERMINAL');

 const getStatusBadge = (status: string) => {
 switch (status) {
 case 'BLOCKED':
 return <span className="flex items-center gap-1.5 text-xs text-slate-300"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Blokir</span>;
 case 'RESTRICTED':
 return <span className="text-xs text-slate-300">Terbatas</span>;
 case 'CONGESTED':
 return <span className="text-xs text-slate-300">Padat</span>;
 default:
 return <span className="text-xs text-slate-500">Lancar</span>;
 }
 };

 return (
 <Popover open={isOpen} onOpenChange={handleOpenChange}>
 <PopoverTrigger asChild>
 <button
 type="button"
 className={`cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors duration-150 shrink-0 ${
 isOpen
 ? 'bg-white border-white text-[#080d14] font-semibold'
 : 'bg-[#0c1017] border-white/10 text-slate-300 hover:text-white hover:border-slate-500'
 }`}
 title={`Pan-Sumatra Intermodal: ${totalCount} Hub (${congestedCount + restrictedCount} Padat/Terbatas)`}
 >
 <Ship className="w-3.5 h-3.5 text-slate-400 shrink-0" />
 <span className="font-mono text-xs tabular-nums">
 <span className="hidden 2xl:inline">Intermodal: </span>{totalCount} Hub
 </span>
 <ChevronDown className={`w-3 h-3 opacity-60 ml-0.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
 </button>
 </PopoverTrigger>
 <PopoverContent
 side="bottom"
 align="end"
 sideOffset={8}
 collisionPadding={12}
 className="w-80 sm:w-96 max-w-[calc(100vw-32px)] max-h-[520px] overflow-y-auto p-0 flex flex-col"
 >
 <div className="p-3 border-b border-white/10 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="p-1 rounded text-slate-300">
 <Anchor className="w-4 h-4" />
 </div>
 <div>
 <h4 className="font-sans font-semibold text-xs text-white">
 Hub
 </h4>
 <p className="text-xs text-slate-400 font-mono tabular-nums">
 {totalCount} hub · {congestedCount + restrictedCount} padat
 </p>
 </div>
 </div>
 </div>

 <div className="flex border-b border-white/10 p-1 gap-1">
 <button
 onClick={() => setActiveTab('SEAPORTS')}
 className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
 activeTab === 'SEAPORTS'
 ? 'bg-white/10 text-white border border-white/10 font-semibold'
 : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
 }`}
 >
 <Ship className="w-3.5 h-3.5" />
 <span className="tabular-nums">Laut ({seaports.length})</span>
 </button>
 <button
 onClick={() => setActiveTab('PASSES')}
 className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
 activeTab === 'PASSES'
 ? 'bg-white/10 text-white border border-white/10 font-semibold'
 : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
 }`}
 >
 <Mountain className="w-3.5 h-3.5" />
 <span className="tabular-nums">Darat ({mountainPasses.length})</span>
 </button>
 </div>

 <div className="overflow-y-auto p-2 space-y-1.5 max-h-[340px]">
 {(activeTab === 'SEAPORTS' ? seaports : mountainPasses).map((hub) => (
 <div
 key={hub.id}
 onClick={() => onSelectHub?.(hub)}
 className={`p-2.5 rounded-md border-t border-white/10 hover:border-white/10 hover:bg-white/5 transition-colors flex items-center justify-between gap-2 ${
 onSelectHub ? 'cursor-pointer' : ''
 }`}
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
 <span className="flex items-center gap-1 tabular-nums">
 <Clock className="w-3 h-3 text-slate-400" />
 Dwell: {hub.dwelling_time_hours}h
 </span>
 <span>·</span>
 <span className="tabular-nums">Antrean: {hub.queue_count}</span>
 </div>
 </div>

 <div className="text-right shrink-0">
 <span className="text-xs font-medium text-slate-400 block">Tunda</span>
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

 <div className="p-2.5 border-t border-white/10 text-xs font-mono text-slate-400 flex items-center justify-between">
 <span className="flex items-center gap-1.5">
 <Activity className="w-3.5 h-3.5 text-slate-400" />
 M_intermodal: 1.0 + 0.15×(N_queue/10)×W
 </span>
 <span className="text-slate-200 font-mono tabular-nums">Clamp [1.0, 3.5]</span>
 </div>
 </PopoverContent>
 </Popover>
 );
};
