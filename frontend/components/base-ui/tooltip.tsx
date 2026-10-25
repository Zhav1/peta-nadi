// C1 base-ui tooltip — dark hand-scaffold over @base-ui/react/tooltip (1.9.0).
//
// CONSTRAINT: never render a Tooltip Portal/Positioner over the Mapbox canvas.
// Portal content clips and misplaces over the WebGL canvas (same rule as the
// Popover in AnalyticsSection: only inline collapse over the map). Tooltips are
// for static chrome / sidebar / table cells only — keep map chrome on native
// `title` attributes.
//
// Rewritten from watermelon tooltip-1 for the dark theme (bg-[#0c1017],
// border-white/10, text-xs, tabular-nums). Uses the render-pattern for triggers
// (never asChild on Button) and never passes hideWhenDetached (does not exist
// in @base-ui/react 1.9.0).
'use client';

import * as React from 'react';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { cn } from '@/lib/utils';

export function Tooltip(props: React.ComponentProps<typeof BaseTooltip.Root>) {
  return <BaseTooltip.Root {...props} />;
}

export function TooltipProvider(props: React.ComponentProps<typeof BaseTooltip.Provider>) {
  return <BaseTooltip.Provider {...props} />;
}

export interface TooltipTriggerProps
  extends Omit<React.ComponentProps<typeof BaseTooltip.Trigger>, 'render' | 'children'> {
  children?: React.ReactNode;
  render?: React.ComponentProps<typeof BaseTooltip.Trigger>['render'];
  /** Accepted for registry compatibility; prefer render. Never use asChild on Button. */
  asChild?: boolean;
}

export function TooltipTrigger({ children, render, asChild, ...props }: TooltipTriggerProps) {
  const resolved = render ?? (asChild && React.isValidElement(children) ? children : undefined);
  if (resolved) {
    return <BaseTooltip.Trigger render={resolved} {...props} />;
  }
  return <BaseTooltip.Trigger {...props}>{children}</BaseTooltip.Trigger>;
}

export interface TooltipContentProps
  extends Pick<
    React.ComponentProps<typeof BaseTooltip.Positioner>,
    | 'side'
    | 'sideOffset'
    | 'align'
    | 'alignOffset'
    | 'collisionPadding'
    | 'collisionBoundary'
    | 'arrowPadding'
    | 'sticky'
  > {
  className?: string;
  children?: React.ReactNode;
  showArrow?: boolean;
  portal?: boolean;
}

export function TooltipContent({
  className,
  children,
  showArrow = true,
  portal = true,
  side,
  sideOffset = 8,
  align,
  alignOffset,
  collisionPadding,
  collisionBoundary,
  arrowPadding,
  sticky,
}: TooltipContentProps) {
  const content = (
    <BaseTooltip.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      collisionPadding={collisionPadding}
      collisionBoundary={collisionBoundary}
      arrowPadding={arrowPadding}
      sticky={sticky}
    >
      <BaseTooltip.Popup
        data-slot="tooltip-content"
        className={cn(
          'z-50 w-fit max-w-xs rounded-lg border border-white/10 bg-[#0c1017] px-2.5 py-1.5 text-xs tabular-nums text-slate-200 shadow-xl outline-none',
          className,
        )}
      >
        {children}
        {showArrow ? (
          <BaseTooltip.Arrow
            data-slot="tooltip-arrow"
            className="fill-[#0c1017] stroke-white/10"
          />
        ) : null}
      </BaseTooltip.Popup>
    </BaseTooltip.Positioner>
  );

  // In @base-ui/react 1.9.0, TooltipPositioner strictly requires TooltipPortalContext
  // provided by BaseTooltip.Portal. Even when portal === false, Tooltip.Portal is required
  // to avoid runtime crash ('Base UI: <Tooltip.Portal> is missing').
  const portalNode = <BaseTooltip.Portal>{content}</BaseTooltip.Portal>;
  if (portal === false) {
    return portalNode;
  }

  return portalNode;
}
