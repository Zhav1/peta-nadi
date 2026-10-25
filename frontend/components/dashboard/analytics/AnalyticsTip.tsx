'use client';

import * as React from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/base-ui/tooltip';

// ---------------------------------------------------------------------------
// Shared rich-tooltip wiring for Analitik (bars / pills / spike rows /
// heatmap cells). Base-ui Tooltip (Portal) replaces the dead CSS-only DarkTip
// group-hover spans (clipped by overflow-hidden parents) and the bare native
// `title` attributes.
//
// The caller builds the `trigger` element itself so `title` (touch fallback),
// `tabIndex`, `role`, and `aria-label` stay visible at the call site.
// Content follows the dark tooltip contract (bg #0c1017, border-white/10,
// text-xs, tabular-nums — see base-ui/tooltip.tsx). GET-only, no map canvas.
// ---------------------------------------------------------------------------

export function AnalyticsTip({
  trigger,
  content,
  side,
}: {
  /** Trigger element carrying title/tabIndex/role/aria-label + visuals. */
  trigger: React.ReactElement;
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  );
}

/** Two-column label/value row inside tooltip content. */
export function TipRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-slate-400">{k}</span>
      <span className="text-right font-medium text-slate-100">{v}</span>
    </div>
  );
}

export function TipTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 font-semibold text-white">{children}</p>;
}

export function TipSource({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 border-t border-white/10 pt-1 text-[11px] text-slate-500">
      Sumber: {children}
    </p>
  );
}

export function fmtRp(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

export function fmtFullId(v: string): string {
  try {
    return new Date(v).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return v;
  }
}

/** Severity band shared with the 5/10/15% spike thresholds. */
export function spikeBand(v: number | null): string {
  if (v == null) return 'tanpa spike';
  if (v >= 15) return 'kritis';
  if (v >= 10) return 'tinggi';
  if (v >= 5) return 'waspada';
  return 'terpantau';
}
