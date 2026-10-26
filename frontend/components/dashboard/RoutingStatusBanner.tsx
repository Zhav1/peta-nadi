'use client';

import React, { useEffect } from 'react';
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
 * Route-computation status modal (Watermelon Dialog-1 pattern: frosted
 * blurred panel + pill buttons, cyan #00f0ff primary, slate/white neutrals).
 * Centered overlay — never an absolute top banner — with subtle fade/slide
 * entrance (no idle wobble). Keeps data-testid + role attributes so E2E
 * selectors (`routing-status-banner`, status/alert) keep passing.
 * Auto-closes on done: renders nothing when neither loading nor error.
 */
export function RoutingStatusBanner({
  isLoading,
  error,
  elapsedMs = 0,
  onCancel,
  onDismissError,
}: RoutingStatusBannerProps) {
  useEffect(() => {
    if (!isLoading && !error) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isLoading) onCancel?.();
        else onDismissError?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLoading, error, onCancel, onDismissError]);

  if (!isLoading && !error) return null;

  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-auto"
      aria-hidden={false}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#080d14]/70 backdrop-blur-sm animate-[routingFadeIn_180ms_ease-out]" />

      {isLoading ? (
        <div
          data-testid="routing-status-banner"
          role="status"
          aria-live="polite"
          className="relative w-full max-w-sm rounded-xl border border-cyan-400/40 bg-[#0c1017]/95 text-cyan-100 shadow-2xl p-5 animate-[routingPopIn_220ms_ease-out]"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/10">
              <Loader2 className="h-4 w-4 text-[#00f0ff] animate-spin" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Menghitung rute…</p>
              <p className="mt-0.5 text-xs font-mono tabular-nums text-slate-400">
                {elapsedSeconds}s
                {elapsedSeconds >= 10 ? ' · render dingin bisa 30-50 detik' : ''}
              </p>
              <div
                className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-label="Kemajuan perhitungan rute"
                aria-valuetext={`${elapsedSeconds} detik`}
              >
                <div className="h-full w-1/3 rounded-full bg-[#00f0ff] animate-[routingSlide_1.2s_ease-in-out_infinite]" />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-rose-400/50 hover:bg-rose-500/10 hover:text-rose-200"
              title="Batalkan perhitungan rute yang sedang berjalan"
            >
              Batal
            </button>
          </div>
        </div>
      ) : (
        <div
          data-testid="routing-status-banner"
          role="alert"
          className="relative w-full max-w-sm rounded-xl border border-rose-500/40 bg-[#0c1017]/95 text-rose-100 shadow-2xl p-5 animate-[routingPopIn_220ms_ease-out]"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10">
              <AlertTriangle className="h-4 w-4 text-rose-400" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Rute gagal dihitung</p>
              <p className="mt-0.5 text-xs text-rose-200/90 break-words">{error}</p>
            </div>
            {onDismissError && (
              <button
                type="button"
                onClick={onDismissError}
                className="cursor-pointer shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
                aria-label="Tutup peringatan rute"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {onDismissError && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onDismissError}
                className="cursor-pointer rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-[#080d14] transition-colors hover:bg-slate-200"
              >
                Mengerti
              </button>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes routingFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes routingPopIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes routingSlide {
          0% { margin-left: 0; }
          50% { margin-left: 66%; }
          100% { margin-left: 0; }
        }
      `}</style>
    </div>
  );
}
