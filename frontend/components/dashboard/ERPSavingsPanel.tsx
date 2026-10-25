'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, RefreshCw, Scale, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { notifyToast } from '@/components/ui/Toast';
import type { ERPSummaryResponse, ERPTripRow, LaporanFilters } from '@/lib/types';
import LaporanHybridPanel from '@/components/dashboard/LaporanHybridPanel';
import LaporanAktualModal from '@/components/dashboard/LaporanAktualModal';
import type { LaporanGranularity } from '@/components/dashboard/LaporanFilterBar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/base-ui/table';

// M8 Phase 2: thin wrapper — owns ERP summary state + global laporan filters
// + aktual modal. Rendering is delegated to LaporanHybridPanel (KPI strip,
// charts, tier/period tables, rincian, ledger). Per-company aggregate table
// stays here for the Regulator role (scope REGULATOR_AGGREGATE).

function formatIDR(value?: number | null): string {
  const n = Number(value ?? 0);
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

function formatNumber(value?: number | null, digits = 1): string {
  return Number(value ?? 0).toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

const EMPTY_FILTERS: LaporanFilters = {};

interface ERPSavingsPanelProps {
  refreshKey?: number;
}

export default function ERPSavingsPanel({ refreshKey = 0 }: ERPSavingsPanelProps) {
  const { user, role } = useAuth();
  const [summary, setSummary] = useState<ERPSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solvingTripId, setSolvingTripId] = useState<string | null>(null);

  // M8 Phase 2: global laporan filter state (shared by FilterBar + HybridPanel).
  const [filters, setFilters] = useState<LaporanFilters>(EMPTY_FILTERS);
  const [granularity, setGranularity] = useState<LaporanGranularity>('weekly');
  const [aktualTrip, setAktualTrip] = useState<ERPTripRow | null>(null);

  const isDispatcher = role === 'DISPATCHER';
  const disabledHint = 'Hanya peran Dispatcher yang dapat mengubah data rit.';

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const companyId = role === 'DISPATCHER' ? user?.company_id : undefined;
      const data = await api.erp.summary(companyId);
      setSummary(data);
    } catch (err: unknown) {
      setSummary(null);
      setError(
        err instanceof Error
          ? `Gagal memuat ringkasan ERP (${err.message}).`
          : 'Gagal memuat ringkasan ERP.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [role, user?.company_id]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, refreshKey]);

  const hasActiveFilters = useMemo(
    () =>
      (filters.tier != null && filters.tier !== 'ALL') ||
      (filters.status != null && filters.status !== 'ALL') ||
      Boolean(filters.startDate) ||
      Boolean(filters.endDate) ||
      Boolean(filters.search?.trim()),
    [filters]
  );

  const handleResetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const isAggregateOnly = summary?.scope === 'REGULATOR_AGGREGATE';

  const handleSolveHedging = async (travelId: string) => {
    if (!isDispatcher) {
      notifyToast({ message: 'Aksi ditolak (403): hedging hanya untuk Dispatcher.', type: 'error' });
      return;
    }
    setSolvingTripId(travelId);
    setError(null);
    try {
      await api.fleet.solveTravelHedging(travelId, {});
      await loadSummary();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? `Gagal menghitung hedging rit ${travelId} (${err.message}).`
          : `Gagal menghitung hedging rit ${travelId}.`;
      setError(message);
      if (err instanceof Error && /403/.test(err.message)) {
        notifyToast({ message: 'Aksi ditolak (403): hedging hanya untuk Dispatcher.', type: 'error' });
      }
    } finally {
      setSolvingTripId(null);
    }
  };

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Header */}
      <div className="bg-[#0c1017] border border-white/10 rounded-xl p-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-headline font-semibold text-base text-white tracking-wide">
              ERP Penghematan Logistik
            </h2>
            {/* M8 Phase 1: verbose subtitle removed (was: Rekonsiliasi biaya per rit...).
                Ledger detail tetap tersedia pada tabel rincian per rit di bawah. */}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className={`w-1.5 h-1.5 rounded-full ${isAggregateOnly ? 'bg-amber-400' : 'bg-cyan-400'}`} />
            {isAggregateOnly ? 'Regulator' : 'Dispatcher'}
          </span>
          <button
            type="button"
            onClick={loadSummary}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-md bg-transparent hover:bg-white/5 border border-white/10 text-xs text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Muat Ulang
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isAggregateOnly && (
        <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/25 text-xs text-amber-200/90 flex items-start gap-2">
          <Scale className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Tampilan Regulator hanya memuat agregat tenant. Rincian komersial per rit tidak ditampilkan pada peran
            pengawas.
          </span>
        </div>
      )}

      {/* M8 Phase 2: hybrid composition (KPI strip + FilterBar + Charts +
          tier/period tables + rincian + ledger) */}
      <LaporanHybridPanel
        summary={summary}
        isLoading={isLoading}
        filters={filters}
        granularity={granularity}
        onFiltersChange={setFilters}
        onGranularityChange={setGranularity}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={handleResetFilters}
        canAct={isDispatcher}
        disabledHint={disabledHint}
        solvingTripId={solvingTripId}
        onSolveHedging={handleSolveHedging}
        onOpenAktual={setAktualTrip}
        onReload={loadSummary}
      />

      {/* Regulator: per-company aggregate (kept in wrapper, never per-rit detail) */}
      {isAggregateOnly && (summary?.per_company?.length ?? 0) > 0 && (
        <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-300" />
            <h3 className="text-xs font-medium text-slate-200">Agregat per perusahaan</h3>
          </div>
          <div className="overflow-x-auto">
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-11 bg-[#0c1017] font-medium">Tenant</TableHead>
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Rit</TableHead>
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Sukses</TableHead>
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Gagal</TableHead>
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Waktu hemat</TableHead>
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">BBM hemat</TableHead>
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Biaya hemat</TableHead>
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Efisiensi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.per_company || []).map((row) => (
                  <TableRow key={row.company_id} className="hover:bg-white/5">
                    <TableCell className="py-3">
                      <span className="font-medium text-white">{row.company_id}</span>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-right tabular-nums">{row.total_trips}</div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-right tabular-nums">{row.reroute_success_count}</div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center justify-end gap-1.5 tabular-nums">
                        {row.failed_trips > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
                        <span>{row.failed_trips}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-right tabular-nums">{formatNumber(row.time_saved_hours)} jam</div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-right tabular-nums">{formatNumber(row.fuel_saved_liters)} L</div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-right tabular-nums">{formatIDR(row.cost_saved_idr)}</div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-right tabular-nums">{formatNumber(row.cost_efficiency_pct)}%</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* M8 Phase 2: inline aktual modal (dispatcher-only edit) */}
      <LaporanAktualModal
        trip={aktualTrip}
        open={aktualTrip !== null}
        canEdit={isDispatcher}
        disabledHint={disabledHint}
        onClose={() => setAktualTrip(null)}
        onSuccess={loadSummary}
      />
    </div>
  );
}
