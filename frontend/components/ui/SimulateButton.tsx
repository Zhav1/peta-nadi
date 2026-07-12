'use client';

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
        flex items-center gap-2 px-4 py-2.5
        rounded-xl text-xs font-semibold uppercase tracking-wider
        border transition-all duration-200
        ${isActive
          ? 'bg-orange-500/20 border-orange-400/60 text-orange-400 ring-1 ring-orange-400/30'
          : 'bg-slate-900/60 backdrop-blur-lg border-white/10 text-slate-300 hover:text-white hover:border-white/20'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {isLoading ? (
        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <span>{isActive ? '✏' : '⚡'}</span>
      )}
      {isActive ? 'Draw Zone' : 'Simulate Disaster'}
    </button>
  );
}
