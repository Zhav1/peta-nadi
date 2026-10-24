// Watermelon registry: popover-1 (rating breakdown popover)
// Source: https://registry.watermelon.sh/r/popover-1.json
// Adapted for PreHub dark theme: single surface bg-[#0c1017], borders
// border-white/10, min text size text-xs (12px). Imports rewritten from
// shadcn/Radix to local @base-ui/react-backed primitives. No GlassPanel.
import { StarIcon } from 'lucide-react';

import { Badge } from '@/components/base-ui/badge';
import { Button } from '@/components/base-ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/base-ui/popover';
import { Progress } from '@/components/base-ui/progress';
import { Separator } from '@/components/base-ui/separator';
import { cn } from '@/lib/utils';

const ratings = {
  1: 0,
  2: 15,
  3: 30,
  4: 30,
  5: 225,
};

const Popover1 = () => {
  const totalReviews = Object.values(ratings).reduce(
    (acc, count) => acc + count,
    0,
  );
  const totalRating = Object.entries(ratings).reduce(
    (acc, [star, count]) => acc + Number(star) * count,
    0,
  );
  const averageRating = Number((totalRating / totalReviews || 0).toFixed(2));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="rounded-xl border-white/10 hover:bg-white/5"
        >
          <StarIcon className="size-4 text-slate-400" />
          <span className="sr-only">View Reviews</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        sideOffset={8}
        collisionPadding={12}
        className="max-h-96 w-[calc(100vw-32px)] max-w-[340px] overflow-y-auto rounded-3xl border-white/10 bg-[#0c1017] p-4 shadow-2xl"
      >
        <div className="flex flex-col gap-4 sm:gap-8">
          <div className="flex items-end justify-between px-1">
            <div className="flex flex-col gap-1">
              <span className="text-4xl font-bold tracking-tight text-slate-100">
                {averageRating}
              </span>
              <div className="text-xs font-bold tracking-widest text-slate-500 uppercase">
                Rating Score
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <StarIcon
                    key={i}
                    className={cn(
                      'size-3.5',
                      i < Math.floor(averageRating)
                        ? 'fill-orange-500 stroke-orange-500'
                        : 'fill-white/10 stroke-white/20',
                    )}
                  />
                ))}
              </div>
              <div className="text-xs font-medium text-slate-500">
                {totalReviews} global reviews
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-slate-100">
                  Live Activity
                </span>
              </div>
              <Badge
                variant="secondary"
                className="rounded-sm bg-emerald-500/10 px-2 py-0.5 text-xs font-bold tracking-widest text-emerald-400 uppercase"
              >
                +6 Today
              </Badge>
            </div>
            <Separator className="opacity-50" />

            <ul className="space-y-4 px-1">
              {Object.entries(ratings)
                .reverse()
                .map(([star, count]) => (
                  <li key={star} className="flex items-center gap-4">
                    <span className="w-10 shrink-0 text-xs font-medium text-slate-400">
                      {star} Star
                    </span>
                    <Progress
                      value={(count / totalReviews) * 100}
                      className="h-1 bg-white/10 [&>[data-slot=progress-indicator]]:bg-orange-500"
                    />
                    <span className="w-8 shrink-0 text-right text-xs font-medium text-slate-500">
                      {count.toString()}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default Popover1;
