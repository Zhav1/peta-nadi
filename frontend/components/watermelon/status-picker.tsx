// Watermelon registry: status-picker (animated status picker)
// Source: https://registry.watermelon.sh/r/status-picker.json
// Adapted for PreHub dark theme: single surface bg-[#0c1017], borders
// border-white/10, rounded-2xl, min text size text-xs (12px) tabular-nums.
// Hand-rolled: motion/react AnimatePresence/motion (popLayout, blur, spring
// stiffness 300/damping 18) replaced with CSS motion-safe keyframes +
// static reduced-motion final state. Zero-emoji NFR-11.1: emoji:string
// swapped to icon:LucideIcon. Absolute positioning (no Portal, Mapbox-safe).
'use client';

import { CircleDashed, EllipsisIcon, X, type LucideIcon } from 'lucide-react';
import React from 'react';

export interface StatusPickerItem {
  id: number;
  name: string;
  icon?: LucideIcon;
}

interface StatusPickerProps {
  items: StatusPickerItem[];
  value?: number;
  defaultValue?: number;
  onChange?: (id: number) => void;
}

export const StatusPicker: React.FC<StatusPickerProps> = ({
  items,
  value,
  defaultValue = 0,
  onChange,
}) => {
  const [open, setOpen] = React.useState(false);
  const [hoveredIdx, setHoveredIdx] = React.useState(0);
  const [internalStatus, setInternalStatus] = React.useState(defaultValue);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const isControlled = value !== undefined;
  const status = isControlled ? value : internalStatus;

  const setStatus = (id: number) => {
    if (!isControlled) setInternalStatus(id);
    onChange?.(id);
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeItem = items.find((item) => item.id === status);
  const ActiveIcon = activeItem?.icon;

  return (
    <div className="flex w-full items-center justify-center">
      <style>{`@media (prefers-reduced-motion: no-preference) {
  @keyframes wm-status-fade { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
  @keyframes wm-status-rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .wm-status-fade { animation: wm-status-fade 0.2s ease both; }
  .wm-status-rise { animation: wm-status-rise 0.2s ease both; }
}`}</style>
      <div className="flex items-center justify-center" ref={rootRef}>
        <div
          className="relative flex cursor-pointer items-center justify-center gap-1 rounded-2xl border border-white/10 bg-[#0c1017] px-4 py-2"
          onClick={() => {
            setOpen(!open);
          }}
        >
          <div className="relative flex min-w-14 cursor-pointer items-center justify-start gap-1 overflow-hidden">
            <div className="flex items-center justify-center gap-[4px]">
              {status === 0 ? (
                <div key="default" className="wm-status-fade relative">
                  <CircleDashed className="size-4 text-slate-500" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="size-2 rounded-full border border-slate-500" />
                  </div>
                </div>
              ) : (
                <div
                  key={status}
                  className="wm-status-fade flex size-6 items-center justify-center"
                >
                  {ActiveIcon ? (
                    <ActiveIcon className="size-4 text-slate-100" />
                  ) : (
                    <span className="text-xs text-slate-100 tabular-nums">
                      {activeItem?.id}
                    </span>
                  )}
                </div>
              )}

              <span className="flex items-center justify-center text-xs font-medium text-slate-100 tabular-nums">
                <span key={status} className="wm-status-rise inline-block">
                  {status !== 0 ? activeItem?.name : 'Status'}
                </span>

                {status !== 0 && (
                  <span
                    key={`${status}-clear`}
                    className="wm-status-fade ml-2 flex items-center justify-center rounded-full bg-white/10 p-[4px] text-xs font-medium text-slate-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      setStatus(0);
                    }}
                  >
                    <X className="size-2 text-slate-100" />
                  </span>
                )}
              </span>
            </div>
          </div>

          {open && (
            <div className="wm-status-fade absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#0c1017] p-1 shadow-2xl">
              <div className="flex items-center justify-center gap-1">
                {items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => {
                        setHoveredIdx(item.id);
                      }}
                      onMouseLeave={() => {
                        setHoveredIdx(0);
                      }}
                      className="group relative flex cursor-pointer items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/5 p-2 transition-transform duration-200 ease-in-out motion-safe:hover:-translate-y-0.5"
                    >
                      {hoveredIdx === item.id && (
                        <div className="wm-status-fade absolute -top-10 left-2 rounded-xl border border-white/10 bg-[#0c1017] px-2 py-1 shadow-xl">
                          <div className="relative flex w-full flex-col items-center">
                            <div className="text-xs font-medium whitespace-nowrap text-slate-100 tabular-nums">
                              {item.name}
                            </div>
                          </div>
                        </div>
                      )}

                      <div
                        className="flex size-6 items-center justify-center transition-transform duration-200 ease-in-out group-hover:scale-110"
                        onClick={() => {
                          setStatus(item.id);
                        }}
                      >
                        {ItemIcon ? (
                          <ItemIcon className="size-4 text-slate-100" />
                        ) : (
                          <span className="text-xs text-slate-100 tabular-nums">
                            {item.id}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center justify-center gap-1 rounded-xl bg-white/5 p-2">
                  <EllipsisIcon className="size-6 text-slate-500" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatusPicker;
