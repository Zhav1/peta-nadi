import * as React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyProps extends React.HTMLAttributes<HTMLDivElement> {
  loading?: boolean;
  title?: string;
  message?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
}

export function Empty({
  loading = false,
  title = 'Data tidak tersedia',
  message,
  icon: Icon = Info,
  className,
  children,
  ...props
}: EmptyProps) {
  return (
    <div
      {...(loading ? { role: 'status' as const } : {})}
      data-slot="empty"
      className={cn(
        'flex flex-col items-center justify-center p-6 text-center rounded-lg border border-dashed border-white/10 text-slate-400 text-xs tabular-nums',
        className,
      )}
      {...props}
    >
      <Icon className="w-5 h-5 mb-2 text-slate-500 shrink-0" />
      <p className="text-xs font-medium text-slate-300">{loading ? 'Memuat…' : title}</p>
      {message ? <p className="text-xs text-slate-500 mt-1 max-w-xs font-sans">{message}</p> : null}
      {children}
    </div>
  );
}
