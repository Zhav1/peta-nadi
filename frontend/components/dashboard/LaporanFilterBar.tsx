'use client';

import React from 'react';
import { Calendar, Filter, RotateCcw, Search, X } from 'lucide-react';
import type { LaporanFilters, LaporanTierKey, TravelStatus } from '@/lib/types';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/base-ui/select';

// M8 Phase 2: global filter bar for Laporan. Controlled props only —
// no data fetching here. Tier/status use Base-UI Select (canonical
// Analitik pattern); granularity uses pills; dates keep native inputs
// styled as pills with dark color-scheme.

export type LaporanGranularity = 'weekly' | 'monthly';

interface LaporanFilterBarProps {
  filters: LaporanFilters;
  granularity: LaporanGranularity;
  onFiltersChange: (next: LaporanFilters) => void;
  onGranularityChange: (next: LaporanGranularity) => void;
  hasActiveFilters: boolean;
  onReset: () => void;
}

const TIER_OPTIONS = [
  { value: 'ALL', label: 'Semua tier' },
  { value: 'ultra', label: 'Ultra (cabai/tomat/sayur)' },
  { value: 'cold', label: 'Dingin (daging/ikan/susu)' },
  { value: 'semi', label: 'Semi (bawang/kentang)' },
  { value: 'dry', label: 'Kering (beras/minyak/gula)' },
  { value: 'Lainnya', label: 'Lainnya' },
] as const;

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Semua status' },
  { value: 'planned', label: 'Direncanakan' },
  { value: 'moving', label: 'Berjalan' },
  { value: 'rerouted', label: 'Dialihkan' },
  { value: 'delivered', label: 'Terkirim' },
  { value: 'failed', label: 'Gagal' },
] as const;

export default function LaporanFilterBar({
  filters,
  granularity,
  onFiltersChange,
  onGranularityChange,
  hasActiveFilters,
  onReset,
}: LaporanFilterBarProps) {
  const tier = filters.tier ?? 'ALL';
  const status = filters.status ?? 'ALL';

  return (
    <div className="bg-[#0c1017] border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2.5 text-xs">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={filters.search ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Cari ID Trip, truk, rute, komoditas..."
          className="w-full bg-transparent border border-white/10 rounded-lg pl-8 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-colors tabular-nums"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => onFiltersChange({ ...filters, search: '' })}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            title="Hapus pencarian"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tier filter — Base-UI Select */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        <Select
          value={tier}
          onValueChange={(val) => {
            if (val) onFiltersChange({ ...filters, tier: val as LaporanTierKey | 'ALL' });
          }}
          items={TIER_OPTIONS}
          modal={false}
        >
          <SelectTrigger className="h-8 min-w-[130px] bg-white/5 border border-white/10 rounded-lg text-xs text-slate-200 px-2.5 py-1.5 cursor-pointer">
            <SelectValue placeholder="Semua tier" />
          </SelectTrigger>
          <SelectContent portal={false}>
            {TIER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs cursor-pointer">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status filter — Base-UI Select */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Select
          value={status}
          onValueChange={(val) => {
            if (val) onFiltersChange({ ...filters, status: val as TravelStatus | 'ALL' });
          }}
          items={STATUS_OPTIONS}
          modal={false}
        >
          <SelectTrigger className="h-8 min-w-[130px] bg-white/5 border border-white/10 rounded-lg text-xs text-slate-200 px-2.5 py-1.5 cursor-pointer">
            <SelectValue placeholder="Semua status" />
          </SelectTrigger>
          <SelectContent portal={false}>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs cursor-pointer">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date range — pill-styled native inputs */}
      <div className="flex items-center gap-1.5 shrink-0 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 backdrop-blur tabular-nums">
        <Calendar className="w-3.5 h-3.5 text-slate-400" />
        <input
          type="date"
          value={filters.startDate ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, startDate: e.target.value })}
          className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer [color-scheme:dark] tabular-nums"
          title="Tanggal mulai"
          aria-label="Tanggal mulai"
        />
        <span className="text-slate-500 text-xs">-</span>
        <input
          type="date"
          value={filters.endDate ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, endDate: e.target.value })}
          className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer [color-scheme:dark] tabular-nums"
          title="Tanggal selesai"
          aria-label="Tanggal selesai"
        />
      </div>

      {/* Granularity pills */}
      <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1 shrink-0" role="group" aria-label="Granularitas">
        {(
          [
            { id: 'weekly' as const, label: 'Mingguan' },
            { id: 'monthly' as const, label: 'Bulanan' },
          ]
        ).map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onGranularityChange(g.id)}
            aria-pressed={granularity === g.id}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer whitespace-nowrap tabular-nums ${
              granularity === g.id
                ? 'bg-white text-[#080d14] font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Reset */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onReset}
          className="px-2.5 py-2 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
          title="Reset semua filter"
        >
          <RotateCcw className="w-3 h-3 text-slate-400" />
          <span>Reset Filter</span>
        </button>
      )}
    </div>
  );
}
