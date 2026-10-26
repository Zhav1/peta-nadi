'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Fuel,
  RefreshCw,
  Route,
  Truck,
  Wallet,
  XCircle,
} from 'lucide-react';
import type {
  CommodityTierGroup,
  ERPSummaryResponse,
  ERPTripRow,
  LaporanFilters,
  PeriodBucket,
  TravelStatus,
} from '@/lib/types';
import {
  applyLaporanFilters,
  averageTripEconomy,
  formatJtM,
  groupByCommodityTier,
  groupByPeriod,
  resolveTripEconomy,
} from '@/lib/laporanAggregations';
import {
  formatEconomyKmpl,
  formatLitersPer100Km,
} from '@/lib/tripCostCalculator';
import LaporanFilterBar, { type LaporanGranularity } from '@/components/dashboard/LaporanFilterBar';
import LaporanCharts from '@/components/dashboard/LaporanCharts';
import { exportLaporanCSV, exportLaporanJSON, printLaporanPDF } from '@/lib/laporanExport';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/base-ui/table';

// M8 Phase 2: hybrid composition — KPI strip + filter bar + charts +
// per-tier / per-periode aggregation tables + collapsible rincian per-rit +
// collapsible audit ledger. Presentational except for callbacks up to parent.

const STATUS_LABEL: Record<TravelStatus, string> = {
  planned: 'Direncanakan',
  moving: 'Berjalan',
  rerouted: 'Dialihkan',
  delivered: 'Terkirim',
  failed: 'Gagal',
};

const TIER_LABEL: Record<string, string> = {
  ultra: 'Ultra',
  cold: 'Dingin',
  semi: 'Semi',
  dry: 'Kering',
  Lainnya: 'Lainnya',
};

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

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Gagal tegas: status failed dari ledger (backend _compute_totals: failed). */
function isFailedTrip(trip: ERPTripRow): boolean {
  return trip.status === 'failed';
}

/**
 * Rugi tercatat: saved_total negatif (ledger math tidak diubah — hanya display).
 * Mencakup kasus reroute-merugi backend (rerouted + delivered + saved<0)
 * maupun delivered negatif lainnya agar -55jt tidak tampil sebagai angka
 * minus polos.
 */
function isRugiTrip(trip: ERPTripRow): boolean {
  return Number(trip.saved_cost_idr ?? 0) < 0;
}

/** Reroute-merugi versi backend: rerouted && (failed || saved<0). */
function isRerouteRugiTrip(trip: ERPTripRow): boolean {
  return Boolean(trip.rerouted) && (trip.status === 'failed' || Number(trip.saved_cost_idr ?? 0) < 0);
}

export interface LaporanHybridPanelProps {
  summary: ERPSummaryResponse | null;
  isLoading: boolean;
  filters: LaporanFilters;
  granularity: LaporanGranularity;
  onFiltersChange: (next: LaporanFilters) => void;
  onGranularityChange: (next: LaporanGranularity) => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  /** Dispatcher-only. When false, action buttons render disabled with tooltip. */
  canAct: boolean;
  disabledHint: string;
  solvingTripId: string | null;
  onSolveHedging: (travelId: string) => void;
  onOpenAktual: (trip: ERPTripRow) => void;
  onReload: () => void;
}

export default function LaporanHybridPanel({
  summary,
  isLoading,
  filters,
  granularity,
  onFiltersChange,
  onGranularityChange,
  hasActiveFilters,
  onResetFilters,
  canAct,
  disabledHint,
  solvingTripId,
  onSolveHedging,
  onOpenAktual,
  onReload,
}: LaporanHybridPanelProps) {
  const [rincianOpen, setRincianOpen] = useState(true);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  const totals = summary?.totals;
  const isAggregateOnly = summary?.scope === 'REGULATOR_AGGREGATE';

  const filteredTrips = useMemo<ERPTripRow[]>(
    () => applyLaporanFilters(summary?.trips ?? [], filters),
    [summary?.trips, filters]
  );

  const tierGroups = useMemo<CommodityTierGroup[]>(
    () => groupByCommodityTier(filteredTrips),
    [filteredTrips]
  );

  const periodBuckets = useMemo<PeriodBucket[]>(
    () => groupByPeriod(filteredTrips, granularity),
    [filteredTrips, granularity]
  );

  const fleetEconomy = useMemo(() => averageTripEconomy(filteredTrips), [filteredTrips]);

  const hasTrips = (totals?.total_trips ?? 0) > 0;

  // Komposisi kebijakan hedging (frontend-only count dari trips terfilter).
  const keputusanCounts = useMemo(() => {
    let lanjut = 0;
    let ubahRute = 0;
    let tahan = 0;
    let adaOpsi = 0;
    for (const t of filteredTrips) {
      const raw = (t.hedging_policy ?? '').toString().trim();
      if (!raw) continue;
      adaOpsi += 1;
      const u = raw.toUpperCase();
      if (u.includes('REROUTE') || u.includes('UBAH') || u.includes('RUTE') || u.includes('ALIH')) {
        ubahRute += 1;
      } else if (u.includes('HOLD') || u.includes('TAHAN') || u.includes('TUNDA')) {
        tahan += 1;
      } else if (u.includes('CONTINUE') || u.includes('LANJUT')) {
        lanjut += 1;
      }
    }
    return { lanjut, ubahRute, tahan, adaOpsi };
  }, [filteredTrips]);

  if (isLoading && !summary) {
    return (
      <div className="bg-[#0c1017] border border-white/10 rounded-xl p-12 flex flex-col items-center justify-center gap-2 text-slate-400">
        <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Memuat laporan...</span>
      </div>
    );
  }

  if (!hasTrips) {
    return (
      <div className="w-full flex flex-col gap-5">
        <LaporanFilterBar
          filters={filters}
          granularity={granularity}
          onFiltersChange={onFiltersChange}
          onGranularityChange={onGranularityChange}
          hasActiveFilters={hasActiveFilters}
          onReset={onResetFilters}
        />
        <div className="bg-[#0c1017] border border-white/10 rounded-xl p-12 flex flex-col items-center justify-center gap-2 text-slate-400">
          <Route className="w-8 h-8 text-slate-600 mb-1" />
          <p className="text-sm font-medium text-slate-300">Belum ada Trip pada perusahaan ini</p>
          <p
            className="text-xs text-slate-500 max-w-md text-center"
            title="Buat aset truk lalu buat Trip pengiriman. Angka penghematan baru muncul setelah waktu/BBM aktual diisi — sistem tidak menampilkan persentase karangan."
          >
            Isi waktu/BBM aktual agar penghematan terhitung.
          </p>
          <button
            type="button"
            onClick={onReload}
            className="mt-2 px-3 py-1.5 rounded-md bg-transparent hover:bg-white/5 border border-white/10 text-xs text-slate-200 cursor-pointer"
          >
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-5" data-testid="reports-erp-panel">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden">
        {[
          {
            label: 'Total Trip',
            value: `${totals?.total_trips ?? 0}`,
            sub: `${totals?.active_trips ?? 0} aktif • ${totals?.delivered_trips ?? 0} terkirim`,
            icon: Truck,
            color: 'text-slate-200',
          },
          {
            label: 'Reroute sukses',
            value: `${totals?.reroute_success_count ?? 0}`,
            sub: `Rasio ${formatNumber(totals?.reroute_success_rate_pct)}%`,
            icon: CheckCircle2,
            color: 'text-emerald-400',
          },
          {
            label: 'Trip gagal',
            value: `${totals?.failed_trips ?? 0}`,
            sub: `${totals?.reroute_failed_count ?? 0} reroute merugi`,
            icon: XCircle,
            color: 'text-rose-400',
          },
          {
            label: 'Waktu hemat',
            value: `${formatNumber(totals?.time_saved_hours)} jam`,
            sub: `SLA terpenuhi ${formatNumber(totals?.sla_compliance_pct)}%`,
            icon: Clock,
            color: 'text-amber-300',
          },
          {
            label: 'BBM hemat',
            value: `${formatNumber(totals?.fuel_saved_liters)} L`,
            sub: 'Biosolar/Dexlite Pertamina',
            icon: Fuel,
            color: 'text-slate-300',
          },
          {
            label: 'Biaya hemat',
            value: formatIDR(totals?.cost_saved_idr),
            sub: `Efisiensi ${formatNumber(totals?.cost_efficiency_pct)}%`,
            icon: Wallet,
            color: 'text-emerald-300',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-[#0c1017] p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-400">{kpi.label}</span>
              <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
            </div>
            <p className={`text-lg font-bold tabular-nums leading-tight ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-slate-500 tabular-nums mt-0.5 truncate">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Savings split */}
      <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-xs font-medium text-slate-200">Rincian penghematan</h3>
          <span className="text-xs text-slate-500 tabular-nums">
            Baseline {formatIDR(totals?.baseline_cost_idr)} → Aktual {formatIDR(totals?.actual_cost_idr)}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10">
          {[
            { label: 'BBM', value: totals?.savings_breakdown.fuel_idr, hint: 'Volume × harga Pertamina' },
            { label: 'Tol BPJT', value: totals?.savings_breakdown.toll_idr, hint: 'Tarif resmi per golongan' },
            { label: 'Susut pangan', value: totals?.savings_breakdown.spoilage_idr, hint: '1 − e^(−δ·t) per tier' },
            { label: 'Waktu sopir', value: totals?.savings_breakdown.labor_idr, hint: 'Jam × upah lembur' },
          ].map((item) => (
            <div key={item.label} className="bg-[#0c1017] px-3 py-2.5">
              <span className="block text-xs font-medium text-slate-400">{item.label}</span>
              <span
                className={`block text-sm font-bold tabular-nums mt-0.5 ${
                  Number(item.value ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {formatIDR(item.value)}
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">{item.hint}</span>
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span className="flex items-center gap-1.5 tabular-nums">
            <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400" />
            Rata-rata hemat per Trip:{' '}
            <strong className="text-emerald-300 tabular-nums">
              {formatIDR(totals?.avg_cost_saved_per_trip_idr)}
            </strong>
          </span>
          <span className="tabular-nums">Terakhir dihitung: {formatDateTime(summary?.generated_at)}</span>
        </div>
        <div
          className="px-4 py-2 border-t border-white/5 text-xs text-slate-400 tabular-nums truncate"
          data-testid="fleet-economy-footer"
          title="Rata-rata km/L hanya dari Trip dengan aktual terisi"
        >
          {fleetEconomy.avgKmpl != null
            ? `Efisiensi armada ${formatEconomyKmpl(fleetEconomy.avgKmpl)} • ${fleetEconomy.measuredCount} Trip terukur • ${fleetEconomy.unmeasuredCount} belum diinput`
            : `Efisiensi armada Belum ada Trip terukur • ${fleetEconomy.measuredCount} Trip terukur • ${fleetEconomy.unmeasuredCount} belum diinput`}
        </div>
      </div>

      {/* Global filter bar */}
      <LaporanFilterBar
        filters={filters}
        granularity={granularity}
        onFiltersChange={onFiltersChange}
        onGranularityChange={onGranularityChange}
        hasActiveFilters={hasActiveFilters}
        onReset={onResetFilters}
      />

      {/* Export toolbar (M8 Phase 3: filtered by global filter state) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="export-json"
          onClick={() =>
            exportLaporanJSON({ filtered: filteredTrips, filters, granularity, totals: totals ?? null, summary })
          }
          className="px-3 py-1.5 rounded-md bg-transparent hover:bg-white/5 border border-white/10 text-xs text-slate-200 cursor-pointer"
        >
          Ekspor JSON
        </button>
        <button
          type="button"
          data-testid="export-csv"
          onClick={() =>
            exportLaporanCSV({ filtered: filteredTrips, filters, granularity, totals: totals ?? null, summary })
          }
          className="px-3 py-1.5 rounded-md bg-transparent hover:bg-white/5 border border-white/10 text-xs text-slate-200 cursor-pointer"
        >
          Ekspor CSV
        </button>
        <button
          type="button"
          data-testid="export-pdf"
          onClick={() =>
            printLaporanPDF({ filtered: filteredTrips, filters, granularity, totals: totals ?? null, summary })
          }
          className="px-3 py-1.5 rounded-md bg-white hover:bg-slate-200 text-[#080d14] text-xs font-medium cursor-pointer"
        >
          Cetak PDF
        </button>
      </div>

      {/* Charts */}
      <LaporanCharts
        tierGroups={tierGroups}
        periodBuckets={periodBuckets}
        granularityLabel={granularity === 'weekly' ? 'mingguan' : 'bulanan'}
      />

      {/* Keputusan: komposisi kebijakan + reroute split (samping agregasi tier) */}
      <div className="bg-[#0c1017] border border-white/10 rounded-xl px-4 py-3" data-testid="keputusan-strip">
        <h3 className="text-xs font-medium text-slate-200">Keputusan</h3>
        {keputusanCounts.adaOpsi === 0 ? (
          <p className="mt-1 text-xs text-slate-500">Belum ada opsi dihitung</p>
        ) : (
          <p className="mt-1 text-xs text-slate-300 tabular-nums">
            Lanjut {keputusanCounts.lanjut} • Ubah Rute {keputusanCounts.ubahRute} • Tahan {keputusanCounts.tahan}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500 tabular-nums">
          Reroute sukses {totals?.reroute_success_count ?? 0} / gagal {totals?.reroute_failed_count ?? 0}
          {(totals?.failed_trips ?? 0) > 0 && (
            <span
              data-testid="keputusan-gagal-badge"
              title="Trip gagal (status failed dari ledger)"
              className="ml-2 inline-block px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/15 text-rose-300 text-[11px] font-semibold"
            >
              Gagal {totals?.failed_trips}
            </span>
          )}
        </p>
      </div>

      {/* Aggregation tables per-tier + per-periode */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <h3 className="text-xs font-medium text-slate-200">
              Agregasi per tier ({filteredTrips.length} Trip terfilter)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-11 bg-[#0c1017] font-medium">Tier</TableHead>
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Trip</TableHead>
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Hemat (IDR)</TableHead>
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Kom ringkas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tierGroups.map((g) => (
                  <TableRow key={g.tier} className="hover:bg-white/5">
                    <TableCell className="py-2.5">
                      <span className="text-slate-200 text-xs font-medium">{TIER_LABEL[g.tier] ?? g.tier}</span>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="text-right tabular-nums text-xs text-slate-300">{g.tripCount}</div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="text-right tabular-nums text-xs text-slate-300" title={formatIDR(g.totalSavedIdr)}>
                        {formatJtM(g.totalSavedIdr)}
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="text-right tabular-nums text-xs text-slate-500">
                        {formatNumber(g.totalSavedFuelLiters)} L • {formatNumber(g.totalSavedHours)} jam
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <h3 className="text-xs font-medium text-slate-200">
              Agregasi per periode ({granularity === 'weekly' ? 'mingguan' : 'bulanan'})
            </h3>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-11 bg-[#0c1017] font-medium">Periode</TableHead>
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Trip</TableHead>
                  <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Hemat (IDR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodBuckets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-xs text-slate-500">
                      Tidak ada bucket periode pada filter ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  periodBuckets.map((b) => (
                    <TableRow key={b.key} className="hover:bg-white/5">
                      <TableCell className="py-2.5">
                        <span className="text-slate-200 text-xs tabular-nums">{b.label}</span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="text-right tabular-nums text-xs text-slate-300">{b.tripCount}</div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="text-right tabular-nums text-xs text-slate-300" title={formatIDR(b.totalSavedIdr)}>
                          {formatJtM(b.totalSavedIdr)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Collapsible rincian per-rit (dispatcher detail only) */}
      {!isAggregateOnly && (
        <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setRincianOpen((v) => !v)}
            className="w-full px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
          >
            <span className="flex items-center gap-2 text-xs font-medium text-slate-200 tabular-nums">
              <Route className="w-4 h-4 text-slate-400" />
              Rincian per Trip ({filteredTrips.length})
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${rincianOpen ? 'rotate-180' : ''}`} />
          </button>
          {rincianOpen && (
            <div className="overflow-x-auto border-t border-white/10">
              <Table className="w-full" data-testid="audit-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-11 bg-[#0c1017] font-medium">ID Trip / waktu</TableHead>
                    <TableHead className="h-11 bg-[#0c1017] font-medium">Truk</TableHead>
                    <TableHead className="h-11 bg-[#0c1017] font-medium">Rute</TableHead>
                    <TableHead className="h-11 bg-[#0c1017] font-medium">Status</TableHead>
                    <TableHead className="h-11 bg-[#0c1017] font-medium">Ekonomi</TableHead>
                    <TableHead className="h-11 bg-[#0c1017] font-medium">SK BBM</TableHead>
                    <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Hemat</TableHead>
                    <TableHead className="h-11 bg-[#0c1017] font-medium">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrips.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-xs text-slate-500">
                        Tidak ada Trip yang cocok dengan filter ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTrips.map((trip) => (
                      <TableRow key={trip.id} className="hover:bg-white/5 align-top">
                        <TableCell className="py-3 whitespace-nowrap">
                          <span className="block text-white font-medium text-xs">{trip.id}</span>
                          <span className="block text-xs text-slate-500 tabular-nums">
                            {formatDateTime(trip.created_at)}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="block text-slate-200 text-xs">{trip.truck_id}</span>
                          <span className="block text-xs text-slate-500 truncate max-w-[140px]">
                            {trip.truck_name || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="block text-slate-200 text-xs">
                            {trip.origin_name} → {trip.destination_name}
                          </span>
                          <span className="block text-xs text-slate-500 tabular-nums">
                            {trip.commodity_key} • {formatNumber(trip.cargo_tonnage)} ton
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="flex items-center gap-1.5 text-xs text-slate-300">
                            {(trip.status === 'failed' || isRerouteRugiTrip(trip)) && (
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                            )}
                            {STATUS_LABEL[trip.status] || trip.status}
                            {isFailedTrip(trip) ? (
                              <span
                                data-testid={`gagal-badge-${trip.id}`}
                                title="Trip gagal (status failed dari ledger)"
                                className="inline-block px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/15 text-rose-300 text-[11px] font-semibold"
                              >
                                Gagal
                              </span>
                            ) : (
                              isRugiTrip(trip) && (
                                <span
                                  data-testid={`rugi-badge-${trip.id}`}
                                  title={
                                    trip.status === 'delivered' && trip.rerouted
                                      ? 'Reroute merugi: delivered namun saved_total negatif (kerugian tercatat)'
                                      : 'Rugi tercatat: saved_total negatif (kerugian tercatat)'
                                  }
                                  className="inline-block px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/15 text-rose-300 text-[11px] font-semibold"
                                >
                                  Rugi
                                </span>
                              )
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          {(() => {
                            const econ = resolveTripEconomy(trip);
                            if (!econ.hasActual || econ.economyKmpl == null) {
                              return (
                                <span className="text-xs text-slate-500 italic">belum diinput</span>
                              );
                            }
                            return (
                              <span className="block text-xs text-slate-200 tabular-nums">
                                {formatEconomyKmpl(econ.economyKmpl)}
                                <span className="block text-slate-500">
                                  {formatLitersPer100Km(econ.litersPer100Km)}
                                </span>
                              </span>
                            );
                          })()}
                          {trip.reefer_fuel_lph_used != null && Number(trip.reefer_fuel_lph_used) > 0 && (
                            <span className="block text-xs text-slate-400 tabular-nums">
                              reefer {Number(trip.reefer_fuel_lph_used).toLocaleString('id-ID')} L/jam
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          {trip.fuel_sk_number ? (
                            <span className="inline-block px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-mono">
                              {trip.fuel_sk_number}
                            </span>
                          ) : (trip.fuel_is_fallback === true || trip.fuel_source === 'PERTAMINA_FALLBACK') ? (
                            <span className="inline-block px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">
                              fallback
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                          {trip.fuel_rate_used_idr != null && (
                            <span className="block text-xs text-slate-500 tabular-nums">
                              Rp {Math.round(Number(trip.fuel_rate_used_idr)).toLocaleString('id-ID')}/L
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <div
                            data-testid={`hemat-${trip.id}`}
                            title={
                              Number(trip.saved_cost_idr) < 0
                                ? `Rugi tercatat ${formatIDR(Number(trip.saved_cost_idr))} (negatif = kerugian tercatat)`
                                : formatIDR(trip.saved_cost_idr)
                            }
                            className={`text-right text-xs tabular-nums ${
                              Number(trip.saved_cost_idr) < 0 ? 'text-rose-300' : 'text-slate-300'
                            }`}
                          >
                            {Number(trip.saved_cost_idr) < 0
                              ? `Rugi ${formatIDR(Math.abs(Number(trip.saved_cost_idr)))}`
                              : formatIDR(trip.saved_cost_idr)}
                          </div>
                          {trip.savings_breakdown != null && (
                            <div
                              className="text-right text-[11px] text-slate-500 tabular-nums"
                              title={`BBM ${formatIDR(trip.savings_breakdown?.fuel_idr)} • Tol ${formatIDR(trip.savings_breakdown?.toll_idr)} • Susut ${formatIDR(trip.savings_breakdown?.spoilage_idr)} • Sopir ${formatIDR(trip.savings_breakdown?.labor_idr)}`}
                            >
                              BBM {formatJtM(trip.savings_breakdown?.fuel_idr)} • Tol{' '}
                              {formatJtM(trip.savings_breakdown?.toll_idr)} • Susut{' '}
                              {formatJtM(trip.savings_breakdown?.spoilage_idr)} • Sopir{' '}
                              {formatJtM(trip.savings_breakdown?.labor_idr)}
                            </div>
                          )}
                          {Number(trip.saved_cost_idr) < 0 && (
                            <div className="text-right text-xs text-rose-300 font-medium">
                              Rugi tercatat
                            </div>
                          )}
                          <div className="text-right text-xs text-slate-500 tabular-nums">
                            {formatNumber(trip.efficiency_pct)}%
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          {/* M8 Phase 5: single 'Selesaikan Trip' action. Legacy Aktual/Hitung
                              handlers (onOpenAktual/onSolveHedging) are kept in props for E2E
                              compat but hidden from the visible table. */}
                          <div className="flex items-center gap-1.5">
                            {trip.hedging_policy ? (
                              <span className="text-xs text-slate-300">{trip.hedging_policy}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => canAct && onOpenAktual(trip)}
                                disabled={!canAct || solvingTripId === trip.id}
                                className="px-2 py-1 rounded border border-white/10 text-slate-200 text-xs font-medium hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                title={canAct ? 'Selesaikan Trip: isi aktual lalu hitung opsi' : disabledHint}
                                data-testid={`selesaikan-trip-${trip.id}`}
                              >
                                {solvingTripId === trip.id && (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                )}
                                Selesaikan Trip
                              </button>
                            )}
                            {/* Legacy handlers kept mounted (hidden) for E2E compat — not visible in table. */}
                            <span className="hidden" aria-hidden="true" data-testid={`legacy-aktual-${trip.id}`}>
                              <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => onOpenAktual(trip)}
                              >
                                Aktual
                              </button>
                              <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => onSolveHedging(trip.id)}
                              >
                                Hitung
                              </button>
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {rincianOpen && (
            <div
              className="px-4 py-2.5 border-t border-white/10 text-xs text-slate-500"
              title="Nilai negatif ditampilkan sebagai kerugian aktual, bukan disembunyikan."
            >
              Negatif = kerugian tercatat.
            </div>
          )}
        </div>
      )}

      {/* Collapsible audit ledger */}
      <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setLedgerOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-xs font-medium text-slate-200">Audit ledger</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${ledgerOpen ? 'rotate-180' : ''}`} />
        </button>
        {ledgerOpen && (
          <div className="px-4 pb-4 border-t border-white/10 pt-3 flex flex-col gap-2">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {[
                { label: 'Cakupan', value: summary?.scope ?? '—' },
                { label: 'Penyimpanan', value: summary?.storage ?? '—' },
                { label: 'Dihitung', value: formatDateTime(summary?.generated_at) },
                { label: 'Tenant', value: summary?.company_id ?? (isAggregateOnly ? 'semua (regulator)' : '—') },
              ].map((m) => (
                <div key={m.label} className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
                  <dt className="text-slate-500">{m.label}</dt>
                  <dd className="text-slate-200 tabular-nums mt-0.5 truncate" title={String(m.value)}>
                    {m.value}
                  </dd>
                </div>
              ))}
            </dl>
            {(summary?.business_notes ?? []).length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {(summary?.business_notes ?? []).map((note, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-400 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2"
                  >
                    {note}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">Tidak ada catatan bisnis pada snapshot ini.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
