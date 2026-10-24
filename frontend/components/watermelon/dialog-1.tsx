// Watermelon registry: dialog-1 (alert dialog)
// Source: https://registry.watermelon.sh/r/dialog-1.json
// Adapted for PreHub dark theme: single surface bg-[#0c1017], borders
// border-white/10, min text size text-xs (12px). Imports rewritten from
// shadcn/Radix to local @base-ui/react-backed primitives. No GlassPanel.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/base-ui/alert-dialog';
import { Button } from '@/components/base-ui/button';

import type { FC } from 'react';

const Dialog1: FC = () => {
  return (
    <AlertDialog>
      <AlertDialogTrigger>
        <Button
          variant="outline"
          className="rounded-xl border border-white/10 bg-[#0c1017] px-6 py-2 text-xs font-medium text-slate-100 shadow-sm transition-all hover:bg-white/5"
        >
          Alert Dialog
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl border border-white/10 bg-[#0c1017] shadow-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-slate-100">
            Are you absolutely sure?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-slate-400">
            This action cannot be undone. This will permanently delete your
            account and remove your data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-2xl border border-white/10 bg-white/5 text-xs text-slate-200 shadow hover:bg-white/10">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction className="rounded-xl bg-white px-7 py-2.5 text-xs font-semibold text-[#080d14] shadow transition hover:bg-slate-200">
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default Dialog1;
