import * as React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyProps extends React.HTMLAttributes<HTMLDivElement> {
  loading?: boolean;
  title?: string;
  message?: string;
}

export function Empty({
  loading = false,
  title = 'Data tidak tersedia',
  message,
  className,
  ...props
}: EmptyProps) {
  return (
    <div
      {...(loading ? { role: 'status' as const } : {})}
      className={cn(
        'flex flex-col items-center justify-center p-6 text-center rounded-lg border border-dashed border-white/10 text-slate-400 text-xs tabular-nums',
        className,
      )}
      {...props}
    >
      <Info className="w-5 h-5 mb-2 text-slate-500" />
      <p className="text-xs font-medium text-slate-300">{loading ? 'Memuat…' : title}</p>
      {message ? <p className="text-xs text-slate-500 mt-1 max-w-xs font-sans">{message}</p> : null}
    </div>
  );
}
