'use client';

import * as React from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { cn } from '@/lib/utils';

// Non-alerting modal surface. Base UI's Dialog renders `role="dialog"` and keeps
// the same modal focus trap / Escape / scroll-lock behaviour as AlertDialog,
// which reserves `role="alertdialog"` for urgent confirmations only.
export function Dialog(props: React.ComponentProps<typeof BaseDialog.Root>) {
  return <BaseDialog.Root {...props} />;
}

export interface DialogTriggerProps
  extends Omit<React.ComponentProps<typeof BaseDialog.Trigger>, 'render' | 'children'> {
  children?: React.ReactNode;
  render?: React.ComponentProps<typeof BaseDialog.Trigger>['render'];
  /** Accepted for registry compatibility; a single element child is used as render. */
  asChild?: boolean;
}

export function DialogTrigger({ children, render, asChild, ...props }: DialogTriggerProps) {
  void asChild;
  const resolved = render ?? (React.isValidElement(children) ? children : undefined);
  if (resolved) {
    return <BaseDialog.Trigger render={resolved} {...props} />;
  }
  return <BaseDialog.Trigger {...props}>{children}</BaseDialog.Trigger>;
}

export interface DialogContentProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  className?: string;
  children?: React.ReactNode;
}

export function DialogContent({ className, children, ...props }: DialogContentProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        data-slot="dialog-backdrop"
        className="fixed inset-0 z-50 bg-black/70"
      />
      <BaseDialog.Popup
        data-slot="dialog-content"
        {...props}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-[#0c1017] p-6 text-xs text-slate-100 shadow-2xl outline-none',
          className,
        )}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-left', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      data-slot="dialog-title"
      className={cn('text-sm font-semibold text-slate-100', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      data-slot="dialog-description"
      className={cn('text-xs text-slate-400', className)}
      {...props}
    />
  );
}

export interface DialogButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

export function DialogClose({ className, children, type = 'button', ...props }: DialogButtonProps) {
  return (
    <BaseDialog.Close
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
