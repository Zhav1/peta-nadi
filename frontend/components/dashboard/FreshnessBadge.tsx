'use client';

import React, { useEffect, useState } from 'react';
import type { HazardCounterStatus } from '@/lib/types';

export type FreshnessStatus = HazardCounterStatus;

export interface FreshnessBadgeProps {
  /** ok | empty (fresh), stale (last-known-good), degraded (unknown). */
  status: FreshnessStatus;
  /** ISO timestamp the payload describes (generated_at / updated_at). */
  updatedAt?: string | null;
  /** Human reason from the backend (carries the age for stale payloads). */
  reason?: string | null;
  /** Optional class hook; layout stays unchanged (no restyle). */
  className?: string;
}

/** Age in the dashboard's short Indonesian form: "4 mnt", "2 j", "3 hr". */
export function formatAgeId(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 60_000) return 'kurang dari 1 mnt';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} mnt`;
  if (ms < 86_400_000) {
    const hours = Math.round((ms / 3_600_000) * 10) / 10;
    return `${hours} j`;
  }
  const days = Math.round((ms / 86_400_000) * 10) / 10;
  return `${days} hr`;
}

/**
 * One-line freshness text shared by the visible badge and the counter tooltips
 * (single source of wording, phase 169):
 *   ok      -> "Diperbarui 4 mnt lalu"
 *   stale   -> "Data tertunda · 2 j"
 *   degraded-> "Tidak tersedia"
 */
export function freshnessText(
  status: FreshnessStatus,
  updatedAt?: string | null,
  nowMs: number = Date.now(),
): string {
  if (status === 'degraded') return 'Tidak tersedia';
  const parsed = updatedAt ? Date.parse(updatedAt) : NaN;
  const age = Number.isFinite(parsed) ? formatAgeId(nowMs - parsed) : null;
  if (status === 'stale') return age ? `Data tertunda · ${age}` : 'Data tertunda';
  if (age == null) return 'Diperbarui —';
  return `Diperbarui ${age} lalu`;
}

/**
 * Minimal freshness badge (no new colour families: slate text + existing border
 * tokens only). Renders nothing visual beyond a status dot and one line.
 */
export const FreshnessBadge: React.FC<FreshnessBadgeProps> = ({
  status,
  updatedAt = null,
  reason = null,
  className = '',
}) => {
  // 30s tick so "4 mnt lalu" ages without a refetch.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (status === 'degraded') return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [status]);

  const text = freshnessText(status, updatedAt, nowMs);
  // Phase 175 — freshness is chrome: neutral text tiers only. Amber is the one
  // permitted exception, and only when the payload is genuinely stale (a
  // last-known-good value the operator must not mistake for fresh). Degraded is
  // dim, not red: unknown data is not a hazard.
  const tone =
    status === 'stale'
      ? 'text-[#f59e0b] border-white/10'
      : status === 'degraded'
        ? 'text-[rgba(232,234,237,0.38)] border-white/10'
        : 'text-[rgba(232,234,237,0.62)] border-white/10';

  return (
    <span
      className={`inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-xs font-sans tabular-nums whitespace-nowrap ${tone} ${className}`}
      title={reason ?? text}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          status === 'degraded'
            ? 'border border-white/25'
            : status === 'stale'
              ? 'border border-dashed border-[#f59e0b]'
              : 'bg-white/45'
        }`}
      />
      {text}
    </span>
  );
};

export default FreshnessBadge;
