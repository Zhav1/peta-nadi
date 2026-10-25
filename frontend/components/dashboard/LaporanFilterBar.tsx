'use client';

import React from 'react';
import { Calendar, Filter, RotateCcw, Search, X } from 'lucide-react';
import type { LaporanFilters, LaporanTierKey, TravelStatus } from '@/lib/types';

// M8 Phase 2: global filter bar for Laporan. Controlled props only —
// no data fetching here. Reuses the toolbar pattern from ReportsSection.

export type LaporanGranularity = 'weekly' | 'monthly';

interface LaporanFilterBarProps {
  filters: LaporanFilters;
  granularity: LaporanGranularity;
  onFiltersChange: (next: LaporanFilters) => void;
  onGranularityChange: (next: LaporanGranularity) => void;
  hasActiveFilters: boolean;
  onReset: () => void;
}

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
    <div className="bg-[#0c1017] border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2.5">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={filters.search ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Cari ID rit, truk, rute, komoditas..."
          className="w-full bg-transparent border border-white/10 rounded-lg pl-8 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 transition-colors"
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

      {/* Tier filter */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        <select
          value={tier}
          onChange={(e) => onFiltersChange({ ...filters, tier: e.target.value as LaporanTierKey | 'ALL' })}
          className="bg-transparent border border-white/10 rounded-lg px-2.5 py-2 text-xs text-slate-200 focus:outline-none cursor-pointer"
          title="Filter tier komoditas"
        >
          <option value="ALL">Semua tier</option>
          <option value="ultra">Ultra (cabai/tomat/sayur)</option>
          <option value="cold">Dingin (daging/ikan/susu)</option>
          <option value="semi">Semi (bawang/kentang)</option>
          <option value="dry">Kering (beras/minyak/gula)</option>
          <option value="Lainnya">Lainnya</option>
        </select>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1.5 shrink-0">
        <select
          value={status}
          onChange={(e) => onFiltersChange({ ...filters, status: e.target.value as TravelStatus | 'ALL' })}
          className="bg-transparent border border-white/10 rounded-lg px-2.5 py-2 text-xs text-slate-200 focus:outline-none cursor-pointer"
          title="Filter status rit"
        >
          <option value="ALL">Semua status</option>
          <option value="planned">Direncanakan</option>
          <option value="moving">Berjalan</option>
          <option value="rerouted">Dialihkan</option>
          <option value="delivered">Terkirim</option>
          <option value="failed">Gagal</option>
        </select>
      </div>

      {/* Date range */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Calendar className="w-3.5 h-3.5 text-slate-400" />
        <input
          type="date"
          value={filters.startDate ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, startDate: e.target.value })}
          className="bg-transparent border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer [color-scheme:dark]"
          title="Tanggal mulai"
        />
        <span className="text-slate-500 text-xs">-</span>
        <input
          type="date"
          value={filters.endDate ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, endDate: e.target.value })}
          className="bg-transparent border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer [color-scheme:dark]"
          title="Tanggal selesai"
        />
      </div>

      {/* Granularity */}
      <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1 shrink-0">
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
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer whitespace-nowrap ${
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
