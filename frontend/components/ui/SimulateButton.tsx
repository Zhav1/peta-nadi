'use client';
import { Pencil, Zap } from 'lucide-react';

interface SimulateButtonProps {
  isActive: boolean;
  onClick: () => void;
  isLoading?: boolean;
}

export function SimulateButton({ isActive, onClick, isLoading }: SimulateButtonProps) {
  return (
    <button
      id="simulate-disaster-btn"
      onClick={onClick}
      disabled={isLoading}
      className={`
        absolute top-4 left-4 z-20
        flex items-center gap-2 px-3.5 py-2
        rounded-lg text-xs font-semibold
        border transition-all duration-200 cursor-pointer
        ${isActive
          ? 'bg-amber-950/80 border-amber-500/60 text-amber-300'
          : 'bg-[#0c1017] border-[#1c2432] text-slate-300 hover:text-white hover:border-slate-600'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {isLoading ? (
        <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
      ) : isActive ? (
        <Pencil className="w-3.5 h-3.5" />
      ) : (
        <Zap className="w-3.5 h-3.5" />
      )}
      {isActive ? 'Gambar Zona' : 'Simulasi Bencana'}
    </button>
  );
}
