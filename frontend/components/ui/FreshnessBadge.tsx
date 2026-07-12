'use client';
import { useEffect, useState } from 'react';

interface FreshnessBadgeProps {
  lastUpdated: Date | null;
  sourceLabel: string;
  thresholdYellowMs?: number;   // default: 5 min
  thresholdRedMs?: number;      // default: 15 min
}

function formatAge(ms: number): string {
  if (ms < 60_000) return '< 1 min ago';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

export function FreshnessBadge({
  lastUpdated,
  sourceLabel,
  thresholdYellowMs = 300_000,
  thresholdRedMs = 900_000,
}: FreshnessBadgeProps) {
  const [age, setAge] = useState<number | null>(null);

  useEffect(() => {
    if (!lastUpdated) return;
    const tick = () => setAge(Date.now() - lastUpdated.getTime());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  const health =
    age === null ? 'gray'
    : age < thresholdYellowMs ? 'green'
    : age < thresholdRedMs ? 'yellow'
    : 'red';

  const dotColor = {
    green: 'bg-emerald-400',
    yellow: 'bg-yellow-400',
    red: 'bg-red-400 animate-pulse',
    gray: 'bg-slate-600',
  }[health];

  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span>{sourceLabel}</span>
      {age !== null && (
        <span className="text-slate-500">{formatAge(age)}</span>
      )}
    </div>
  );
}
