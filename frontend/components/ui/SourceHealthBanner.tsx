'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { SourceHealth } from '@/lib/types';
import { GlassPanel } from './GlassPanel';

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '—';
  try {
    const past = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - past.getTime();
    if (diffMs < 0) return 'just now'; // local time skew safety
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return past.toLocaleDateString();
  } catch {
    return '—';
  }
}

export function SourceHealthBanner() {
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try {
      const res = await api.sourceHealth.get();
      setSources(res.sources);
    } catch (err) {
      console.error('Failed to fetch source health:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Poll every 30 seconds for dynamic demo health updates
    const timer = setInterval(fetchHealth, 30000);
    return () => clearInterval(timer);
  }, []);

  if (loading && sources.length === 0) {
    return (
      <GlassPanel className="absolute bottom-24 left-4 z-20 p-3 w-56 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mr-2" />
        <span className="text-[10px] text-slate-400 font-medium">Checking source health...</span>
      </GlassPanel>
    );
  }

  const dotColors = {
    healthy: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
    degraded: 'bg-yellow-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]',
    down: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
    unknown: 'bg-slate-500',
  };

  const textColors = {
    healthy: 'text-emerald-400',
    degraded: 'text-yellow-400',
    down: 'text-red-400',
    unknown: 'text-slate-400',
  };

  return (
    <GlassPanel className="absolute bottom-24 left-4 z-20 p-3.5 w-60 select-none">
      <h3 className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase mb-2">
        Data Pipelines Health
      </h3>
      <div className="space-y-2">
        {sources.map((src) => (
          <div key={src.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${dotColors[src.status]}`} />
              <span className="text-xs font-medium text-slate-200">{src.name}</span>
            </div>
            <div className="text-right">
              <span className={`text-[10px] font-semibold capitalize mr-2 ${textColors[src.status]}`}>
                {src.status === 'healthy' ? 'online' : src.status === 'down' ? 'offline' : src.status}
              </span>
              <span className="text-[9px] text-slate-500">
                {formatRelativeTime(src.last_seen)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
