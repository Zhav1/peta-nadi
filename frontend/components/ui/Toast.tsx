'use client';
import { useEffect } from 'react';
import { X } from 'lucide-react';

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
    success: 'bg-[#0c1017] border-emerald-500/40 text-emerald-300',
    error: 'bg-[#0c1017] border-rose-500/40 text-rose-300',
    info: 'bg-[#0c1017] border-cyan-500/40 text-cyan-300',
  }[type];

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-lg border shadow-xl transition-all duration-300 ${bgColors}`}
      style={{
        animation: 'slideDown 0.3s ease-out'
      }}
    >
      <span className="text-xs font-medium">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer p-0.5 rounded hover:bg-white/10"
        aria-label="Tutup notifikasi"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
