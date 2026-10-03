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
        'bg-[#0c1017] border border-[#1c2432]',
        'rounded-lg shadow-xl',
        className
      )}
    >
      {children}
    </div>
  );
}
