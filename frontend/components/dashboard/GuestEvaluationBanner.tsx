'use client';

import { ShieldAlert, KeyRound } from 'lucide-react';
import { useAuth } from '@/lib/authContext';

// Explicit guest evaluation banner: shown whenever /dashboard is accessed without a
// verified session (middleware guest redirect or client-side logout), so restricted
// access is never silent.
export function GuestEvaluationBanner() {
  const { isAuthenticated, isLoading, openAuthModal } = useAuth();

  if (isAuthenticated || isLoading) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[550] w-[95%] max-w-3xl pointer-events-auto">
      <div className="mt-2 bg-[#0c1017] border border-amber-500/40 rounded-lg shadow-xl px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <span className="block text-xs font-mono font-semibold text-amber-300 uppercase tracking-wider">
              Mode Evaluasi Tamu (Belum Terautentikasi)
            </span>
            <span className="block text-xs font-sans text-slate-300 truncate">
              Akses preview terbatas: beralih peran operasional dan aksi persetujuan memerlukan akun resmi.
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={openAuthModal}
          className="cursor-pointer shrink-0 px-3 py-1.5 rounded-md bg-white hover:bg-slate-200 text-[#080d14] text-xs font-semibold transition flex items-center gap-1.5"
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Masuk / Daftar</span>
        </button>
      </div>
    </div>
  );
}
