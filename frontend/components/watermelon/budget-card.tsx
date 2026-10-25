// Watermelon registry: budget-card (budget overview card)
// Source: https://registry.watermelon.sh/r/budget-card.json
// Adapted for PreHub dark theme: single surface bg-[#0c1017], borders
// border-white/10, min text size text-xs (12px) tabular-nums. Hand-rolled:
// mock transactions stripped to real `transactions` props, motion/react
// springs (duration 1.5 ease) replaced with CSS motion-safe transitions +
// static reduced-motion final state (motion-reduce:transition-none).
// Progress track bg-white/10, indicator emerald/sky. Absolute dropdown and
// modal (no Portal, Mapbox-safe). Buttons per dialog-1 pattern:
// rounded-xl border-white/10, primary bg-white text-[#080d14] text-xs.
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface BudgetBreakdownItem {
  label: string;
  amount: number;
  color: string;
}

export interface BudgetTransaction {
  id: string | number;
  date: string;
  name: string;
  category: string;
  amount: number;
}

interface BudgetCardProps {
  month: string;
  totalBudget: number;
  spentAmount: number;
  breakdown: BudgetBreakdownItem[];
  transactions?: BudgetTransaction[];
  onViewDetails?: () => void;
  onMonthChange?: (month: string) => void;
}

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const BudgetCard: React.FC<BudgetCardProps> = ({
  month: initialMonth,
  totalBudget,
  spentAmount,
  breakdown,
  transactions = [],
  onViewDetails,
  onMonthChange,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const spentPercentage = Math.min(
    100,
    Math.round((spentAmount / totalBudget) * 100),
  );
  const remainingAmount = totalBudget - spentAmount;

  // Click outside logic
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMonthSelect = (m: string) => {
    setSelectedMonth(m);
    setIsDropdownOpen(false);
    if (onMonthChange) onMonthChange(m);
  };

  return (
    <div className="relative mx-auto w-full max-w-130">
      <style>{`@media (prefers-reduced-motion: no-preference) {
  @keyframes wm-budget-fade { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .wm-budget-fade { animation: wm-budget-fade 0.3s ease both; }
}`}</style>
      <div className="wm-budget-fade">
        <div className="relative w-full overflow-visible rounded-2xl border border-white/10 bg-[#0c1017] font-sans text-slate-100 shadow-2xl">
          {/* Top Section */}
          <div className="p-6 pb-4 sm:p-8">
            <div className="mb-1 flex items-start justify-between">
              <p className="text-xs font-normal text-slate-400 tabular-nums">
                Monthly Budget
              </p>

              {/* --- Month Dropdown (absolute, no Portal) --- */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex min-w-30 items-center justify-between gap-2 rounded-xl border border-white/10 bg-transparent px-3 py-1 text-xs font-normal text-slate-400 tabular-nums transition-colors hover:bg-white/5 sm:gap-4"
                >
                  {selectedMonth}
                  <span
                    className={cn(
                      'transition-transform duration-200 motion-reduce:transition-none',
                      isDropdownOpen && 'rotate-180',
                    )}
                  >
                    <ChevronDown size={16} className="text-slate-500" />
                  </span>
                </button>

                {isDropdownOpen && (
                  <div className="wm-budget-fade absolute top-full right-0 z-50 mt-1 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#0c1017] shadow-2xl">
                    <div className="custom-scrollbar max-h-60 overflow-y-auto py-1">
                      {months.map((m) => (
                        <button
                          key={m}
                          onClick={() => handleMonthSelect(m)}
                          className={cn(
                            'flex w-full items-center justify-between px-4 py-2.5 text-left text-xs tabular-nums transition-colors',
                            selectedMonth === m
                              ? 'bg-white/5 font-medium text-slate-100'
                              : 'text-slate-400 hover:bg-white/5',
                          )}
                        >
                          {m}
                          {selectedMonth === m && (
                            <Check size={14} className="text-slate-100" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <h2 className="mb-6 text-4xl leading-none font-medium tracking-tight text-slate-100 tabular-nums sm:mb-10 sm:text-5xl">
              ${totalBudget.toLocaleString()}
            </h2>

            <div className="space-y-3">
              <p className="text-xs font-normal text-slate-400 tabular-nums">
                Monthly spending limit
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-[width] duration-1000 ease-out motion-reduce:transition-none"
                  style={{ width: mounted ? `${spentPercentage}%` : '0%' }}
                />
              </div>
              <div className="flex items-end justify-between pt-1">
                <div className="space-y-1.5">
                  <span className="block text-xs font-normal text-slate-500 capitalize tabular-nums">
                    Spent
                  </span>
                  <div className="flex items-center gap-2 sm:gap-4">
                    <span className="text-sm font-normal text-slate-300 tabular-nums">
                      ${spentAmount.toLocaleString()}
                    </span>
                    <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-[1.75px] text-xs font-normal text-slate-300 tabular-nums">
                      {spentPercentage}%
                    </span>
                  </div>
                </div>
                <div className="space-y-2 text-right">
                  <span className="block text-xs font-normal text-slate-500 capitalize tabular-nums">
                    Remaining
                  </span>
                  <span className="text-sm font-normal text-slate-300 tabular-nums">
                    ${remainingAmount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-white/10" />

          {/* Bottom Section  */}
          <div className="space-y-6 p-6 pt-7 sm:p-8">
            <div className="space-y-3">
              <p className="block text-xs font-normal text-slate-500 capitalize tabular-nums">
                Spending breakdown
              </p>
              <div className="flex h-2 gap-2">
                {breakdown.map((item, idx) => (
                  <div
                    key={idx}
                    className="h-full origin-left rounded-full transition-transform duration-1000 ease-out motion-reduce:transition-none"
                    style={{
                      flex: item.amount,
                      background: item.color,
                      transform: mounted ? 'scaleX(1)' : 'scaleX(0)',
                      transitionDelay: `${idx * 100}ms`,
                    }}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {breakdown.map((item, idx) => (
                  <div className="flex flex-col gap-1" key={idx}>
                    <p className="block truncate text-xs font-normal text-slate-500 capitalize tabular-nums">
                      {item.label}
                    </p>
                    <p className="text-xs font-normal text-slate-300 tabular-nums">
                      ${item.amount.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => {
                setIsDetailsOpen(true);
                if (onViewDetails) onViewDetails();
              }}
              className="w-full rounded-xl border border-white/10 bg-transparent py-3 text-xs font-normal text-slate-100 transition-colors hover:bg-white/5"
            >
              View Details
            </button>
          </div>
        </div>
      </div>

      {/* --- Details Modal (absolute, no Portal) --- */}
      {isDetailsOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setIsDetailsOpen(false)}
            className="wm-budget-fade absolute inset-0 rounded-2xl bg-black/80 backdrop-blur-md"
          />
          <div className="wm-budget-fade relative flex max-h-[90%] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c1017] shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 p-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Budget Details
                </h3>
                <p className="text-xs text-slate-400 tabular-nums">
                  Deep dive into your {selectedMonth} spending
                </p>
              </div>
              <button
                onClick={() => setIsDetailsOpen(false)}
                className="rounded-full p-2 transition-colors hover:bg-white/5"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="custom-scrollbar flex-1 space-y-8 overflow-y-auto p-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 transition-colors sm:p-4">
                  <p className="mb-1 truncate text-xs tracking-wide text-slate-500 uppercase tabular-nums">
                    Total Budget
                  </p>
                  <p className="text-lg leading-tight font-medium text-slate-100 tabular-nums sm:text-xl">
                    ${totalBudget.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 transition-colors sm:p-4">
                  <p className="mb-1 truncate text-xs tracking-wide text-slate-500 uppercase tabular-nums">
                    Amount Spent
                  </p>
                  <p className="text-lg leading-tight font-medium text-slate-300 tabular-nums sm:text-xl">
                    ${spentAmount.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Category Breakdown (Detailed) */}
              <div className="space-y-4">
                <h4 className="text-xs font-semibold tracking-widest text-slate-500 uppercase tabular-nums">
                  Category Breakdown
                </h4>
                <div className="space-y-4">
                  {breakdown.map((item, idx) => {
                    const percentage = Math.round(
                      (item.amount / spentAmount) * 100,
                    );
                    return (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-between text-xs tabular-nums">
                          <span className="font-medium text-slate-300">
                            {item.label}
                          </span>
                          <span className="text-slate-500">{percentage}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full transition-[width] duration-1000 ease-out motion-reduce:transition-none"
                            style={{
                              width: mounted ? `${percentage}%` : '0%',
                              background: item.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Transactions History (real props) */}
              <div className="space-y-4">
                <h4 className="text-xs font-semibold tracking-widest text-slate-500 uppercase tabular-nums">
                  Recent Transactions
                </h4>
                {transactions.length === 0 ? (
                  <p className="text-xs text-slate-500 tabular-nums">
                    No transactions yet.
                  </p>
                ) : (
                  <div className="divide-y divide-white/10 border-t border-white/10">
                    {transactions.map((t) => (
                      <div
                        key={t.id}
                        className="group -mx-2 flex items-center justify-between gap-2 overflow-hidden rounded-md px-2 py-3 transition-colors hover:bg-white/5 sm:gap-4"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/5 text-xs font-bold text-slate-500 tabular-nums">
                            {t.name[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium tracking-tight text-slate-100 uppercase tabular-nums">
                              {t.name}
                            </p>
                            <p className="truncate text-xs text-slate-500 tabular-nums">
                              {t.category} • {t.date}
                            </p>
                          </div>
                        </div>
                        <span className="flex-shrink-0 text-xs font-medium text-slate-300 tabular-nums">
                          -${t.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-white/10 p-6">
              <button
                onClick={() => setIsDetailsOpen(false)}
                className="w-full rounded-xl bg-white py-3 text-xs font-semibold text-[#080d14] transition hover:bg-slate-200 active:scale-[0.98]"
              >
                Close Insights
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetCard;
