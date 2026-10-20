'use client';

import React from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface RoutingStatusBannerProps {
  isLoading: boolean;
  error?: string | null;
  /** Elapsed calculation time in milliseconds, shown while routing. */
  elapsedMs?: number;
  onCancel?: () => void;
  onDismissError?: () => void;
}

/**
 * Persistent route-computation banner. Unlike the 3s Toast it stays visible for
 * the whole request (cold renders can take 30-50s) and offers an explicit
 * "Batal" abort action instead of leaving the operator waiting on a dead UI.
 */
export function RoutingStatusBanner({
  isLoading,
  error,
  elapsedMs = 0,
  onCancel,
  onDismissError,
}: RoutingStatusBannerProps) {
  if (!isLoading && !error) return null;

  if (isLoading) {
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    return (
      <div
        data-testid="routing-status-banner"
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex items-center gap-3 px-3.5 py-2 rounded-lg border border-cyan-500/40 bg-[#0c1017]/95 text-cyan-200 shadow-2xl backdrop-blur-md"
      >
        <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" aria-hidden="true" />
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-xs font-semibold">Menghitung rute...</span>
          <span className="text-[10px] font-mono text-slate-400">
            {elapsedSeconds}s
            {elapsedSeconds >= 10 ? ' · render dingin bisa 30-50 detik' : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="ml-2 shrink-0 cursor-pointer px-2.5 py-1 rounded-md border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] font-mono font-semibold transition-colors"
          title="Batalkan perhitungan rute yang sedang berjalan"
        >
          Batal
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="routing-status-banner"
      role="alert"
      className="pointer-events-auto flex items-center gap-3 px-3.5 py-2 rounded-lg border border-rose-500/40 bg-[#0c1017]/95 text-rose-300 shadow-2xl backdrop-blur-md"
    >
      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
      <span className="text-xs font-medium min-w-0">{error}</span>
      {onDismissError && (
        <button
          type="button"
          onClick={onDismissError}
          className="ml-2 shrink-0 cursor-pointer p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors"
          aria-label="Tutup peringatan rute"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
