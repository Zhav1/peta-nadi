'use client';
import { useEffect } from 'react';

export interface ToastMessage {
  id: string;
  text: string;
  type?: 'success' | 'error' | 'info';
}

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = 'success', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgColors = {
    success: 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300',
    error: 'bg-red-950/90 border-red-500/30 text-red-300',
    info: 'bg-cyan-950/90 border-cyan-500/30 text-cyan-300',
  }[type];

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-lg transition-all duration-300 ${bgColors}`}
      style={{
        animation: 'slideDown 0.3s ease-out'
      }}
    >
      <span className="text-xs font-medium">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 text-slate-500 hover:text-slate-300 text-xs transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
