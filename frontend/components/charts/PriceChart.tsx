'use client';
import React, { useState, useEffect } from 'react';
import {
 LineChart,
 Line,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 ResponsiveContainer,
 ReferenceLine,
} from 'recharts';
import type { PricePoint } from '@/lib/types';

interface PriceChartProps {
 data: PricePoint[];
 crisisDate?: string; // show vertical crisis line
 title?: string;
}

// Stable identities: recharts re-dispatches its internal tooltip/axis settings
// store on every identity change, so module-level constants instead of inline
// literals (React #185 "Maximum update depth exceeded" guard).
const TOOLTIP_STYLE = {
  background: '#1e293b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  fontSize: 12,
} as const;
const LABEL_STYLE = { color: '#94a3b8' } as const;
const CHART_MARGIN = { top: 4, right: 4, left: -20, bottom: 0 } as const;
const AXIS_TICK = { fontSize: 12, fill: '#64748b' } as const;
const CRISIS_LABEL = { value: 'Crisis', position: 'top', fill: '#f87171', fontSize: 12 } as const;

export default function PriceChart({ data, crisisDate, title }: PriceChartProps) {
 const [isMounted, setIsMounted] = useState(false);

 useEffect(() => {
 setIsMounted(true);
 }, []);

 if (!isMounted) {
 return (
 <div className="w-full h-[160px] flex items-center justify-center bg-slate-800/40 rounded-xl animate-pulse">
 <span className="text-xs text-slate-500">Loading chart...</span>
 </div>
 );
 }

 return (
 <div className="tabular-nums">
 {title && <p className="text-xs font-medium text-slate-400 mb-2">{title}</p>}
 <ResponsiveContainer width="100%" height={160}>
 <LineChart data={data} margin={CHART_MARGIN}>
 <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
 <XAxis
 dataKey="date"
 stroke="#475569"
 tick={AXIS_TICK}
 tickLine={false}
 />
 <YAxis stroke="#475569" tick={AXIS_TICK} tickLine={false} />
 <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} />
 {crisisDate && (
 <ReferenceLine
 x={crisisDate}
 stroke="#f87171"
 strokeDasharray="4 2"
 label={CRISIS_LABEL}
 />
 )}
 <Line type="monotone" dataKey="beras" name="Rice" stroke="#38bdf8" dot={false} strokeWidth={1.5} />
 <Line type="monotone" dataKey="minyak" name="Cooking Oil" stroke="#fb923c" dot={false} strokeWidth={1.5} />
 <Line type="monotone" dataKey="cabai" name="Chili" stroke="#a78bfa" dot={false} strokeWidth={1.5} />
 </LineChart>
 </ResponsiveContainer>
 </div>
 );
}
