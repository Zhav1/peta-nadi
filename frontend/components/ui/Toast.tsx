'use client';
import { useEffect } from 'react';
import { toast } from 'sonner';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  text: string;
  type?: ToastType;
}

export interface ToastProps {
  message: string;
  type?: ToastType;
  onClose: () => void;
  duration?: number;
}

export function notifyToast({
  message,
  type = 'success',
  duration = 3000,
}: {
  message: string;
  type?: ToastType;
  duration?: number;
}): string | number {
  const options = { duration };
  switch (type) {
    case 'error':
      return toast.error(message, options);
    case 'info':
      return toast.info(message, options);
    default:
      return toast.success(message, options);
  }
}

// Compat shim: rendering is owned by the global <Toaster theme="dark"
// position="top-center"> in app/layout.tsx, so this fires Sonner once and
// renders nothing locally (no fixed container, no z-index stacking with the
// routing banner or alert queue). onClose is still invoked after `duration`
// to preserve the old auto-dismiss contract for any caller holding local state.
export function Toast({ message, type = 'success', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    notifyToast({ message, type, duration });
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, type, duration, onClose]);
  return null;
}
