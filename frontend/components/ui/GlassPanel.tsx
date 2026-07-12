'use client';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function GlassPanel({ children, className, id }: GlassPanelProps) {
  return (
    <div
      id={id}
      className={cn(
        'bg-slate-900/60 backdrop-blur-lg',
        'border border-white/10',
        'rounded-2xl shadow-2xl shadow-black/60',
        'ring-1 ring-white/5',
        className
      )}
    >
      {children}
    </div>
  );
}
