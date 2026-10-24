'use client';

import * as React from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxProps
  extends Omit<React.ComponentProps<typeof BaseCheckbox.Root>, 'className' | 'children'> {
  className?: string;
  children?: React.ReactNode;
}

export function Checkbox({ className, children, ...props }: CheckboxProps) {
  return (
    <BaseCheckbox.Root
      data-slot="checkbox"
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded border border-white/20 bg-transparent text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-white data-checked:bg-white data-checked:text-[#080d14]',
        className,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center"
      >
        {children ?? <Check className="size-3" strokeWidth={3} />}
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
