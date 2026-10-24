import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-white text-[#080d14]',
  secondary: 'border-transparent bg-white/10 text-slate-200',
  outline: 'border-white/10 text-slate-200',
  destructive: 'border-transparent bg-[#ef4444]/10 text-[#ef4444]',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors outline-none',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
