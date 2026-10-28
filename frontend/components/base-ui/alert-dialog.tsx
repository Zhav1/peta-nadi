'use client';

import * as React from 'react';
import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog';
import { cn } from '@/lib/utils';

export function AlertDialog(props: React.ComponentProps<typeof BaseAlertDialog.Root>) {
  return <BaseAlertDialog.Root {...props} />;
}

export interface AlertDialogTriggerProps
  extends Omit<React.ComponentProps<typeof BaseAlertDialog.Trigger>, 'render' | 'children'> {
  children?: React.ReactNode;
  render?: React.ComponentProps<typeof BaseAlertDialog.Trigger>['render'];
  /** Accepted for registry compatibility; a single element child is used as render. */
  asChild?: boolean;
}

export function AlertDialogTrigger({ children, render, asChild, ...props }: AlertDialogTriggerProps) {
  void asChild;
  const resolved = render ?? (React.isValidElement(children) ? children : undefined);
  if (resolved) {
    return <BaseAlertDialog.Trigger render={resolved} {...props} />;
  }
  return <BaseAlertDialog.Trigger {...props}>{children}</BaseAlertDialog.Trigger>;
}

export interface AlertDialogContentProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  className?: string;
  children?: React.ReactNode;
}

export function AlertDialogContent({ className, children, ...props }: AlertDialogContentProps) {
  return (
    <BaseAlertDialog.Portal>
      <BaseAlertDialog.Backdrop
        data-slot="alert-dialog-backdrop"
        className="fixed inset-0 z-50 bg-[#080d14]/80"
      />
      <BaseAlertDialog.Popup
        data-slot="alert-dialog-content"
        {...props}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-[#0c1017] p-6 text-xs text-[#e8eaed] shadow-[0_12px_32px_rgba(0,0,0,0.4)] outline-none',
          className,
        )}
      >
        {children}
      </BaseAlertDialog.Popup>
    </BaseAlertDialog.Portal>
  );
}

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn('flex flex-col gap-2 text-left', className)}
      {...props}
    />
  );
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof BaseAlertDialog.Title>) {
  return (
    <BaseAlertDialog.Title
      data-slot="alert-dialog-title"
      className={cn('text-sm font-semibold text-slate-100', className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseAlertDialog.Description>) {
  return (
    <BaseAlertDialog.Description
      data-slot="alert-dialog-description"
      className={cn('text-xs text-slate-400', className)}
      {...props}
    />
  );
}

export interface AlertDialogButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

export function AlertDialogCancel({ className, children, type = 'button', ...props }: AlertDialogButtonProps) {
  return (
    <BaseAlertDialog.Close
      render={
        <button
          type={type}
          className={cn(
            'inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10',
            className,
          )}
          {...props}
        >
          {children}
        </button>
      }
    />
  );
}

export function AlertDialogAction({ className, children, type = 'button', ...props }: AlertDialogButtonProps) {
  return (
    <BaseAlertDialog.Close
      render={
        <button
          type={type}
          className={cn(
            'inline-flex h-9 items-center justify-center rounded-xl bg-white px-4 text-xs font-semibold text-[#080d14] transition-colors hover:bg-slate-200',
            className,
          )}
          {...props}
        >
          {children}
        </button>
      }
    />
  );
}
