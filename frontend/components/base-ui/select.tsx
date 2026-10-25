'use client';

import * as React from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Select<Value, Multiple extends boolean | undefined = false>(
  props: BaseSelect.Root.Props<Value, Multiple>,
) {
  return <BaseSelect.Root {...props} />;
}

export const SelectRoot = Select;

export interface SelectTriggerProps
  extends Omit<React.ComponentProps<typeof BaseSelect.Trigger>, 'render' | 'children'> {
  children?: React.ReactNode;
  render?: React.ComponentProps<typeof BaseSelect.Trigger>['render'];
  asChild?: boolean;
  showIcon?: boolean;
}

export function SelectTrigger({
  className,
  children,
  render,
  asChild,
  showIcon = true,
  ...props
}: SelectTriggerProps) {
  const resolved = render ?? (asChild && React.isValidElement(children) ? children : undefined);
  if (resolved) {
    return <BaseSelect.Trigger render={resolved} {...props} />;
  }
  return (
    <BaseSelect.Trigger
      data-slot="select-trigger"
      className={cn(
        'flex h-8 items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50 tabular-nums',
        className,
      )}
      {...props}
    >
      {children}
      {showIcon ? (
        <BaseSelect.Icon className="ml-1 shrink-0">
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </BaseSelect.Icon>
      ) : null}
    </BaseSelect.Trigger>
  );
}

export function SelectValue({
  className,
  placeholder,
  children,
  ...props
}: React.ComponentProps<typeof BaseSelect.Value>) {
  return (
    <BaseSelect.Value
      data-slot="select-value"
      placeholder={placeholder}
      className={cn('data-[placeholder]:text-slate-500 truncate', className)}
      {...props}
    >
      {children}
    </BaseSelect.Value>
  );
}

export interface SelectContentProps
  extends React.ComponentProps<typeof BaseSelect.Popup> {
  sideOffset?: number;
  align?: 'start' | 'center' | 'end';
  positionerClassName?: string;
  portal?: boolean;
}

export function SelectContent({
  className,
  children,
  sideOffset = 4,
  align = 'start',
  positionerClassName,
  portal = true,
  ...props
}: SelectContentProps) {
  const content = (
    <BaseSelect.Positioner
      sideOffset={sideOffset}
      align={align}
      alignItemWithTrigger={false}
      className={cn('z-50 select-none outline-none', positionerClassName)}
    >
      <BaseSelect.Popup
        data-slot="select-content"
        className={cn(
          'min-w-[var(--anchor-width)] rounded-lg border border-white/10 bg-[#0c1017] p-1 text-xs text-slate-200 shadow-2xl backdrop-blur-xl outline-none motion-safe:transition-all',
          className,
        )}
        {...props}
      >
        <BaseSelect.List className="max-h-60 overflow-y-auto py-1">
          {children}
        </BaseSelect.List>
      </BaseSelect.Popup>
    </BaseSelect.Positioner>
  );

  if (portal === false) {
    return content;
  }

  return <BaseSelect.Portal>{content}</BaseSelect.Portal>;
}

export interface SelectItemProps
  extends React.ComponentProps<typeof BaseSelect.Item> {
  showIndicator?: boolean;
}

export function SelectItem({
  className,
  children,
  showIndicator = true,
  ...props
}: SelectItemProps) {
  return (
    <BaseSelect.Item
      data-slot="select-item"
      className={cn(
        'relative flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs text-slate-200 cursor-pointer outline-none select-none transition-colors hover:bg-white/10 data-[highlighted]:bg-white/10 data-[selected]:text-white data-[selected]:font-medium data-[disabled]:opacity-50 data-[disabled]:pointer-events-none tabular-nums',
        className,
      )}
      {...props}
    >
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
      {showIndicator ? (
        <BaseSelect.ItemIndicator>
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        </BaseSelect.ItemIndicator>
      ) : null}
    </BaseSelect.Item>
  );
}

export function SelectGroup(props: React.ComponentProps<typeof BaseSelect.Group>) {
  return <BaseSelect.Group data-slot="select-group" {...props} />;
}

export function SelectGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof BaseSelect.GroupLabel>) {
  return (
    <BaseSelect.GroupLabel
      data-slot="select-group-label"
      className={cn(
        'px-2 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider',
        className,
      )}
      {...props}
    />
  );
}

export function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof BaseSelect.Separator>) {
  return (
    <BaseSelect.Separator
      data-slot="select-separator"
      className={cn('-mx-1 my-1 h-px bg-white/10', className)}
      {...props}
    />
  );
}

export function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof BaseSelect.Label>) {
  return (
    <BaseSelect.Label
      data-slot="select-label"
      className={cn('text-xs font-medium text-slate-400 mb-1', className)}
      {...props}
    />
  );
}

export const SelectPortal = BaseSelect.Portal;
export const SelectPositioner = BaseSelect.Positioner;
export const SelectPopup = BaseSelect.Popup;
export const SelectList = BaseSelect.List;
export const SelectItemText = BaseSelect.ItemText;
export const SelectItemIndicator = BaseSelect.ItemIndicator;
export const SelectIcon = BaseSelect.Icon;
