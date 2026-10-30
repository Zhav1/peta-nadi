'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Building2, RefreshCw, Scale, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { DashboardRequestSignals, dashboardDataKey, dashboardIdentityKey } from '@/lib/dashboardMemoryCache';
import { useDashboardCachedResource } from '@/hooks/useDashboardCachedResource';
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
  const companyId = role === 'DISPATCHER' ? user?.company_id : undefined;
  const identityScope = dashboardIdentityKey({ id: user?.id, role, companyId: user?.company_id });
  const summaryKey = dashboardDataKey(identityScope, 'reports.erp-summary', { companyId: companyId ?? null });
  const requestSignalsRef = useRef(new DashboardRequestSignals());
  const requestSignals = requestSignalsRef.current;
  useEffect(() => {
    requestSignals.activate();
    return () => requestSignals.dispose();
  }, [requestSignals]);
  const summaryResource = useDashboardCachedResource<ERPSummaryResponse>(
    summaryKey,
    () => api.erp.summary(companyId, requestSignals.signal('reports.erp-summary', summaryKey)),
  );
  const summary = summaryResource.data;
  const isLoading = summaryResource.isLoading;
  const [actionError, setActionError] = useState<string | null>(null);
  const [solvingTripId, setSolvingTripId] = useState<string | null>(null);
  // Double-submit guard sinkron untuk handler hedging legacy (hidden E2E):
  // state solvingTripId update async, ref menahan klik kedua langsung.
  const solvingGuardRef = useRef<string | null>(null);
  const previousRefreshKeyRef = useRef(refreshKey);

  const refreshSummary = summaryResource.refresh;

  useEffect(() => {
    if (previousRefreshKeyRef.current === refreshKey) return;
    previousRefreshKeyRef.current = refreshKey;
    refreshSummary();
  }, [refreshKey, refreshSummary]);

  // M8 Phase 2: global laporan filter state (shared by FilterBar + HybridPanel).
  const [filters, setFilters] = useState<LaporanFilters>(EMPTY_FILTERS);
  const [granularity, setGranularity] = useState<LaporanGranularity>('weekly');
  const [aktualTrip, setAktualTrip] = useState<ERPTripRow | null>(null);

  const isDispatcher = role === 'DISPATCHER';
  const disabledHint = 'Hanya peran Dispatcher yang dapat mengubah data Trip.';

  const loadSummary = refreshSummary;
  const error = actionError ?? (summaryResource.error
    ? `Gagal memuat laporan (${summaryResource.error}). Data terakhir yang tersedia tetap ditampilkan.`
    : null);

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

  // M8 Phase 5 (legacy, hidden from table): standalone hedging kept for E2E
  // compat — the visible 'Selesaikan Trip' flow now chains
  // updateTravel -> solveTravelHedging inside LaporanAktualModal.
  // Do not delete this export/handler.
  const handleSolveHedging = async (travelId: string) => {
    if (!isDispatcher) {
      notifyToast({ message: 'Aksi ditolak (403): hedging hanya untuk Dispatcher.', type: 'error' });
      return;
    }
    // Guard sinkron: abaikan klik kedua saat POST hedging masih berjalan.
    if (solvingGuardRef.current === travelId) return;
    solvingGuardRef.current = travelId;
    setSolvingTripId(travelId);
    setActionError(null);
    try {
      await api.fleet.solveTravelHedging(travelId, {});
      await loadSummary();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? `Gagal menghitung hedging Trip ${travelId} (${err.message}).`
          : `Gagal menghitung hedging Trip ${travelId}.`;
      setActionError(message);
      if (err instanceof Error && /403/.test(err.message)) {
        notifyToast({ message: 'Aksi ditolak (403): hedging hanya untuk Dispatcher.', type: 'error' });
      }
    } finally {
      solvingGuardRef.current = null;
      setSolvingTripId(null);
    }
  };

  // M8 Phase 5: single 'Selesaikan Trip' entry — Dispatcher-only.
  const handleOpenAktual = useCallback(
    (trip: ERPTripRow) => {
      if (!isDispatcher) {
        notifyToast({ message: 'Aksi ditolak (403): Selesaikan Trip hanya untuk Dispatcher.', type: 'error' });
        return;
      }
      setAktualTrip(trip);
    },
    [isDispatcher]
  );

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
              Laporan Penghematan Operasional
            </h2>
            {/* M8 Phase 1: verbose subtitle removed (was: Rekonsiliasi biaya per rit...).
                Ledger detail tetap tersedia pada tabel rincian per rit di bawah. */}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className={`w-1.5 h-1.5 rounded-full ${isAggregateOnly ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            {isAggregateOnly ? 'Regulator' : 'Dispatcher'}
          </span>
          <button
            type="button"
            onClick={loadSummary}
            disabled={summaryResource.isRefreshing}
            className="px-3 py-1.5 rounded-md bg-transparent hover:bg-white/5 border border-white/10 text-xs text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${summaryResource.isRefreshing ? 'animate-spin' : ''}`} />
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
      <p className="text-xs text-slate-500" aria-live="polite" data-testid="erp-refresh-status">
        {summaryResource.isRefreshing
          ? 'Memperbarui ringkasan…'
          : summaryResource.updatedAt !== null
            ? `Data terakhir diperbarui ${new Date(summaryResource.updatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
            : 'Ringkasan belum tersedia'}
      </p>

      {isAggregateOnly && (
        <div
          className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/25 text-xs text-amber-200/90 flex items-start gap-2"
          title="Tampilan Regulator hanya memuat agregat tenant. Rincian komersial per Trip tidak ditampilkan pada peran pengawas."
        >
          <Scale className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>Agregat saja untuk pengawas.</span>
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
        onOpenAktual={handleOpenAktual}
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
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Trip</TableHead>
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
