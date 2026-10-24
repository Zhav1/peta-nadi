'use client';

import * as React from 'react';
import { Progress as BaseProgress } from '@base-ui/react/progress';
import { cn } from '@/lib/utils';

export interface ProgressProps
  extends Omit<React.ComponentProps<typeof BaseProgress.Root>, 'children' | 'value' | 'className'> {
  value: number | null;
  className?: string;
  indicatorClassName?: string;
}

export function Progress({ value, max = 100, className, indicatorClassName, ...props }: ProgressProps) {
  const pct =
    value == null ? undefined : Math.min(100, Math.max(0, (value / Math.max(max, 1)) * 100));
  return (
    <BaseProgress.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-white/10', className)}
      {...props}
    >
      <BaseProgress.Track data-slot="progress-track" className="size-full">
        <BaseProgress.Indicator
          data-slot="progress-indicator"
          className={cn('size-full rounded-full bg-white transition-[width]', indicatorClassName)}
          style={{ width: pct === undefined ? '100%' : `${pct}%` }}
        />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
