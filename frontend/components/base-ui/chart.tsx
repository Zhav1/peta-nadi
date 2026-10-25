'use client';

import * as React from 'react';
import { ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { cn } from '@/lib/utils';

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: string;
    icon?: React.ComponentType;
  }
>;

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig;
  children: React.ReactElement;
}

function configToStyle(config: ChartConfig): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value?.color) style[`--color-${key}`] = value.color;
  }
  return style as React.CSSProperties;
}

export function ChartContainer({ config, className, children, ...props }: ChartContainerProps) {
  const id = React.useId().replace(/:/g, '');
  return (
    <div
      data-slot="chart"
      data-chart={id}
      style={configToStyle(config)}
      className={cn('flex aspect-video w-full justify-center text-xs text-slate-200', className)}
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartTooltip(
  props: React.ComponentProps<typeof RechartsTooltip>,
) {
  return (
    <RechartsTooltip
      cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeDasharray: '3 3' }}
      contentStyle={{
        background: '#0c1017',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        fontSize: 12,
        color: '#e2e8f0',
      }}
      labelStyle={{ color: '#94a3b8', fontSize: 12 }}
      itemStyle={{ color: '#e2e8f0', fontSize: 12 }}
      {...props}
    />
  );
}

interface TooltipEntry {
  name?: string;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

interface ChartTooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  labelFormatter?: (value: string | number, payload: TooltipEntry[]) => React.ReactNode;
  valueFormatter?: (value: string | number, entry: TooltipEntry) => React.ReactNode;
  nameKey?: string;
}

export function ChartTooltipContent({
  className,
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  nameKey,
  ...props
}: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null;
  const labelText = labelFormatter && label !== undefined ? labelFormatter(label, payload) : label;
  return (
    <div
      data-slot="chart-tooltip"
      className={cn(
        'rounded-xl border border-white/10 bg-[#0c1017] px-3 py-2 text-xs text-slate-200 shadow-xl tabular-nums',
        className,
      )}
      {...props}
    >
      {labelText !== undefined && (
        <p className="mb-1 text-xs text-slate-400">{labelText}</p>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry, i) => {
          const key = `${nameKey && entry.payload ? String(entry.payload[nameKey] ?? entry.name ?? i) : String(entry.name ?? entry.dataKey ?? i)}-${i}`;
          const displayName =
            (nameKey && entry.payload
              ? (entry.payload[nameKey] as React.ReactNode)
              : undefined) ??
            entry.name ??
            entry.dataKey;
          const displayValue = valueFormatter
            ? valueFormatter((entry.value ?? '') as string | number, entry)
            : entry.value;
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ background: entry.color ?? 'var(--color-primary, #38bdf8)' }}
              />
              <span className="text-slate-400">{displayName}</span>
              <span className="ml-auto pl-4 font-medium text-slate-100 tabular-nums">
                {displayValue as React.ReactNode}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
