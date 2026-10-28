'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, KeyRound, X } from 'lucide-react';
import { useAuth } from '@/lib/authContext';

const DISMISS_KEY = 'prehub_guest_banner_dismissed';

// Explicit guest evaluation banner: shown whenever /dashboard is accessed without a
// verified session (middleware guest redirect or client-side logout), so restricted
// access is never silent. Phase 57 WP-A1 (D7): dismissible per-session via X;
// reappears next session only (sessionStorage, not localStorage).
//
// Phase 176.9 (M9): the banner is NO LONGER a `fixed` overlay. It is docked as a
// shrink-0 row inside the Berita panel's flex column — below the scrolling feed,
// above the data-integrity footer. Overlap with a card is impossible by
// construction: the feed is the only scroll container, so nothing behind it can
// reach this row, at any scroll position or viewport. The old
// `--guest-banner-clearance` measurement (ResizeObserver + padding) is gone.
export function GuestEvaluationBanner() {
  const { isAuthenticated, isLoading, openAuthModal } = useAuth();
  // Phase 57 WP-A3 follow-up: read storage in an effect, not during render,
  // so server prerender and first client render agree (no hydration mismatch).
  const [dismissed, setDismissed] = useState<boolean>(false);
  const visible = !isAuthenticated && !isLoading && !dismissed;

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true);
    } catch {
      // storage unavailable: banner stays visible
    }
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // storage unavailable: dismiss for this render only
    }
    setDismissed(true);
  };

  return (
    <div
      id="guest-evaluation-banner"
      data-testid="guest-evaluation-banner"
      className="shrink-0 rounded-lg border border-amber-500/40 bg-[#0c1017]/95 shadow-2xl px-3 py-2 flex items-center justify-between gap-2"
    >
      <div className="flex items-center gap-2 min-w-0">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <div className="min-w-0">
          <span className="block text-xs font-mono font-medium text-amber-300 tracking-wide">
            Evaluasi tamu
          </span>
          <span
            className="block text-xs font-sans text-slate-300 truncate"
            title="Mode Evaluasi Tamu: pilihan rute membuka pratinjau berwatermark lokal; tidak ada POST /approvals dan tidak ada ping TMS. Masuk untuk commit."
          >
            Mode Evaluasi Tamu: pilihan rute membuka pratinjau berwatermark lokal; tidak ada POST /approvals dan tidak ada ping TMS. Masuk untuk commit.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={openAuthModal}
          className="cursor-pointer px-2.5 py-1.5 rounded-md bg-white hover:bg-slate-200 text-[#080d14] text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap"
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Masuk / Daftar</span>
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Tutup banner evaluasi tamu"
          className="cursor-pointer p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
