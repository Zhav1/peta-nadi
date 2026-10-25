'use client';
import { useEffect, useState } from 'react';

interface FreshnessBadgeProps {
 lastUpdated: Date | null;
 sourceLabel?: string;
 /** Per-article publish time (ISO string or Date). Rendered in WIB. */
 publishedAt?: string | Date | null;
 thresholdYellowMs?: number; // default: 5 min
 thresholdRedMs?: number; // default: 15 min
}

function formatAge(ms: number): string {
 if (ms < 60_000) return '< 1 mnt lalu';
 if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} mnt lalu`;
 return `${Math.floor(ms / 3_600_000)} jam lalu`;
}

/**
 * Formats an article publish time in WIB (Asia/Jakarta). Returns null for
 * unparseable input so the badge never fabricates a timestamp.
 */
function formatWibDateTime(value: string | Date): string | null {
 const date = value instanceof Date ? value : new Date(value);
 if (Number.isNaN(date.getTime())) return null;
 try {
  return `${new Intl.DateTimeFormat('id-ID', {
   day: '2-digit',
   month: 'short',
   hour: '2-digit',
   minute: '2-digit',
   timeZone: 'Asia/Jakarta',
  }).format(date)} WIB`;
 } catch {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hh}.${mm} WIB`;
 }
}

export function FreshnessBadge({
 lastUpdated,
 sourceLabel = '',
 publishedAt = null,
 thresholdYellowMs = 300_000,
 thresholdRedMs = 900_000,
}: FreshnessBadgeProps) {
 const [age, setAge] = useState<number | null>(null);

 useEffect(() => {
  if (!lastUpdated || Number.isNaN(lastUpdated.getTime())) {
   setAge(null);
   return;
  }
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

 const isCritical = health === 'red';
 const publishedLabel = publishedAt ? formatWibDateTime(publishedAt) : null;

 return (
  <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-slate-400 truncate min-w-0">
  {isCritical && (
  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
  )}
  {publishedLabel && (
  <>
  <span className="text-slate-300 truncate" title="Waktu terbit artikel (WIB)">
  Terbit {publishedLabel}
  </span>
  <span className="text-slate-600 shrink-0">•</span>
  </>
  )}
  {sourceLabel && <span className="shrink-0">{sourceLabel}</span>}
  {age !== null && (
  <span className="text-slate-500 tabular-nums shrink-0" title="Waktu data global diperbarui">
  Diperbarui {formatAge(age)}
  </span>
  )}
  </span>
 );
}
