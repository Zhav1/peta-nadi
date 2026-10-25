import * as React from 'react';
import { cn } from '@/lib/utils';

export type ChipVariant = 'default' | 'outline' | 'secondary' | 'status';
export type ChipSize = 'sm' | 'default';
export type ChipStatus = 'online' | 'offline' | 'warning' | 'critical' | 'neutral';

const variantClasses: Record<ChipVariant, string> = {
  default: 'border-transparent bg-white/10 text-slate-100',
  outline: 'border-white/10 bg-white/5 text-slate-200',
  secondary: 'border-transparent bg-white/5 text-slate-300',
  status: 'border-white/10 bg-[#0c1017] text-slate-200',
};

const sizeClasses: Record<ChipSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  default: 'px-2.5 py-1 text-xs',
};

const statusDotColors: Record<ChipStatus, string> = {
  online: 'bg-emerald-400',
  warning: 'bg-amber-400',
  critical: 'bg-rose-400',
  offline: 'bg-slate-600',
  neutral: 'bg-slate-400',
};

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
  size?: ChipSize;
  statusDot?: boolean;
  dotClassName?: string;
  status?: ChipStatus;
}

export function Chip({
  className,
  variant = 'default',
  size = 'default',
  statusDot = false,
  dotClassName,
  status,
  children,
  ...props
}: ChipProps) {
  const dotColor = status ? statusDotColors[status] : 'bg-emerald-400';

  return (
    <span
      data-slot="chip"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium tabular-nums select-none transition-colors',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {statusDot ? (
        <span
          data-slot="chip-dot"
          className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor, dotClassName)}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}
