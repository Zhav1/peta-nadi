'use client';

import * as React from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { cn } from '@/lib/utils';

export type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg';

const baseClasses =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-white text-[#080d14] hover:bg-slate-200',
  destructive: 'bg-[#ef4444] text-white hover:bg-[#ef4444]/90',
  outline: 'border border-white/10 bg-transparent text-slate-100 hover:bg-white/5',
  secondary: 'bg-[#121822] text-slate-100 hover:bg-white/10',
  ghost: 'text-slate-200 hover:bg-white/5 hover:text-slate-100',
  link: 'text-slate-100 underline-offset-4 hover:underline',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  lg: 'h-10 rounded-md px-6',
  icon: 'size-9',
  'icon-sm': 'size-8',
  'icon-lg': 'size-10',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Accepted for registry compatibility. Button always renders its own <button>. */
  asChild?: boolean;
}

export function Button(props: ButtonProps) {
  const { className, variant = 'default', size = 'default', type = 'button' } = props;
  const { asChild: _ignored, ...rest } = props as ButtonProps & { asChild?: boolean };
  void _ignored;
  return (
    <BaseButton
      type={type}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      {...rest}
    />
  );
}
