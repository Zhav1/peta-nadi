import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number;
  rowClassName?: string;
}

export function Skeleton({ rows = 4, rowClassName, className, ...props }: SkeletonProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden="true" {...props}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn('motion-safe:animate-pulse bg-white/5 rounded-md w-full', rowClassName ?? 'h-11')}
        />
      ))}
    </div>
  );
}
