'use client';

import * as React from 'react';
import { Popover as BasePopover } from '@base-ui/react/popover';
import { cn } from '@/lib/utils';

export function Popover(props: React.ComponentProps<typeof BasePopover.Root>) {
  return <BasePopover.Root {...props} />;
}

export interface PopoverTriggerProps
  extends Omit<React.ComponentProps<typeof BasePopover.Trigger>, 'render' | 'children'> {
  children?: React.ReactNode;
  render?: React.ComponentProps<typeof BasePopover.Trigger>['render'];
  /** Accepted for registry compatibility; prefer render. */
  asChild?: boolean;
}

export function PopoverTrigger({ children, render, asChild, ...props }: PopoverTriggerProps) {
  const resolved = render ?? (asChild && React.isValidElement(children) ? children : undefined);
  if (resolved) {
    return <BasePopover.Trigger render={resolved} {...props} />;
  }
  return <BasePopover.Trigger {...props}>{children}</BasePopover.Trigger>;
}

type PositionerProps = React.ComponentProps<typeof BasePopover.Positioner>;

export interface PopoverContentProps
  extends Pick<
    PositionerProps,
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
  portal?: boolean;
}

export function PopoverContent({
  className,
  children,
  side,
  sideOffset = 8,
  align,
  alignOffset,
  collisionPadding,
  collisionBoundary,
  arrowPadding,
  sticky,
  portal = true,
}: PopoverContentProps) {
  const content = (
    <BasePopover.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      collisionPadding={collisionPadding}
      collisionBoundary={collisionBoundary}
      arrowPadding={arrowPadding}
      sticky={sticky}
    >
      <BasePopover.Popup
        data-slot="popover-content"
        className={cn(
          'z-50 w-72 rounded-xl border border-white/10 bg-[#0c1017] p-4 text-xs text-slate-100 shadow-xl outline-none',
          className,
        )}
      >
        {children}
      </BasePopover.Popup>
    </BasePopover.Positioner>
  );

  if (portal === false) {
    return content;
  }

  return <BasePopover.Portal>{content}</BasePopover.Portal>;
}

export function PopoverClose(props: React.ComponentProps<typeof BasePopover.Close>) {
  return <BasePopover.Close {...props} />;
}
