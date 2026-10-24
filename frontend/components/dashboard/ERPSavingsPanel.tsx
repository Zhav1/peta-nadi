'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Fuel,
  RefreshCw,
  Route,
  ShieldCheck,
  Truck,
  Wallet,
  XCircle,
  ArrowDownRight,
  Scale,
  ClipboardList,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import type { ERPSummaryResponse, ERPTripRow, TravelStatus } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/base-ui/table';

const STATUS_LABEL: Record<TravelStatus, string> = {
  planned: 'Direncanakan',
  moving: 'Berjalan',
  rerouted: 'Dialihkan',
  delivered: 'Terkirim',
  failed: 'Gagal',
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

interface ERPSavingsPanelProps {
  refreshKey?: number;
}

export default function ERPSavingsPanel({ refreshKey = 0 }: ERPSavingsPanelProps) {
  const { user, role } = useAuth();
  const [summary, setSummary] = useState<ERPSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | TravelStatus>('ALL');
  const [solvingTripId, setSolvingTripId] = useState<string | null>(null);

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

  const totals = summary?.totals;
  const isAggregateOnly = summary?.scope === 'REGULATOR_AGGREGATE';

  const filteredTrips = useMemo<ERPTripRow[]>(() => {
    const trips = summary?.trips || [];
    if (statusFilter === 'ALL') return trips;
    return trips.filter((t) => t.status === statusFilter);
  }, [summary?.trips, statusFilter]);

  const hasTrips = (totals?.total_trips ?? 0) > 0;

  const handleSolveHedging = async (travelId: string) => {
    setSolvingTripId(travelId);
    setError(null);
    try {
      await api.fleet.solveTravelHedging(travelId, {});
      await loadSummary();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? `Gagal menghitung hedging rit ${travelId} (${err.message}).`
          : `Gagal menghitung hedging rit ${travelId}.`
      );
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
            <p className="text-xs text-sans text-slate-400 mt-0.5 max-w-2xl">
              Rekonsiliasi biaya per rit: BBM Pertamina, tarif tol BPJT Golongan I–V, susut komoditas 4-tier,
              dan biaya waktu sopir. Setiap rupiah berasal dari ledger rit, bukan persentase asumsi.
            </p>
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

      {isLoading && !summary ? (
        <div className="bg-[#0c1017] border border-white/10 rounded-xl p-12 flex flex-col items-center justify-center gap-2 text-slate-400">
          <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Memuat ledger ERP...</span>
        </div>
      ) : !hasTrips ? (
        <div className="bg-[#0c1017] border border-white/10 rounded-xl p-12 flex flex-col items-center justify-center gap-2 text-slate-400">
          <ClipboardList className="w-8 h-8 text-slate-600 mb-1" />
          <p className="text-sm font-medium text-slate-300">Belum ada rit pada tenant ini</p>
          <p className="text-xs text-slate-500 max-w-md text-center">
            Buat aset truk lalu buat rit pengiriman melalui tombol <strong>Tambah armada</strong>. Angka
            penghematan baru muncul setelah waktu/BBM aktual diisi — sistem tidak menampilkan persentase karangan.
          </p>
        </div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden">
            {[
              {
                label: 'Total rit',
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
                label: 'Rit gagal',
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
                color: 'text-cyan-300',
              },
              {
                label: 'Biaya hemat',
                value: formatIDR(totals?.cost_saved_idr),
                sub: `Efisiensi ${formatNumber(totals?.cost_efficiency_pct)}%`,
                icon: Wallet,
                color: 'text-emerald-300',
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-[#0c1017] p-3.5"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-400">{kpi.label}</span>
                  <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                </div>
                <p className={`text-lg font-bold tabular-nums leading-tight ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-slate-500 tabular-nums mt-0.5 truncate">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Savings split + business explanation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h3 className="text-xs font-medium text-slate-200">
                  Rincian penghematan
                </h3>
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
                    <span className="block text-xs font-medium text-slate-400">
                      {item.label}
                    </span>
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
                  Rata-rata hemat per rit: <strong className="text-emerald-300 tabular-nums">{formatIDR(totals?.avg_cost_saved_per_trip_idr)}</strong>
                </span>
                <span className="tabular-nums">Terakhir dihitung: {formatDateTime(summary?.generated_at)}</span>
              </div>
            </div>

            <div className="bg-[#0c1017] border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-medium text-slate-200">Cara membaca</h3>
              </div>
              <ul className="space-y-2 text-xs text-slate-400 leading-relaxed">
                {(summary?.business_notes || []).map((note, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span>{note}</span>
                  </li>
                ))}
                <li className="flex items-start gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span>
                    Efisiensi = penghematan bersih ÷ biaya baseline. Nilai negatif berarti rute aktual lebih mahal
                    dan tetap ditampilkan apa adanya.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Regulator: per-company aggregate */}
          {isAggregateOnly && (
            <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-300" />
                <h3 className="text-xs font-medium text-slate-200">
                  Agregat per perusahaan
                </h3>
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

          {/* Dispatcher: per-rit detail */}
          {!isAggregateOnly && (
            <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Route className="w-4 h-4 text-slate-400" />
                  <h3 className="text-xs font-medium text-slate-200 tabular-nums">
                    Rincian per rit ({filteredTrips.length})
                  </h3>
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'ALL' | TravelStatus)}
                  className="bg-transparent border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Semua status</option>
                  <option value="planned">Direncanakan</option>
                  <option value="moving">Berjalan</option>
                  <option value="rerouted">Dialihkan</option>
                  <option value="delivered">Terkirim</option>
                  <option value="failed">Gagal</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <Table className="w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-11 bg-[#0c1017] font-medium">ID rit / waktu</TableHead>
                      <TableHead className="h-11 bg-[#0c1017] font-medium">Truk</TableHead>
                      <TableHead className="h-11 bg-[#0c1017] font-medium">Rute</TableHead>
                      <TableHead className="h-11 bg-[#0c1017] font-medium">Status</TableHead>
                      <TableHead className="h-11 bg-[#0c1017] font-medium">Reroute</TableHead>
                      <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Waktu</TableHead>
                      <TableHead className="h-11 bg-[#0c1017] text-right font-medium">BBM</TableHead>
                      <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Biaya</TableHead>
                      <TableHead className="h-11 bg-[#0c1017] text-right font-medium">Efisiensi</TableHead>
                      <TableHead className="h-11 bg-[#0c1017] font-medium">Hedging</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrips.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="py-10 text-center text-slate-500">
                          Tidak ada rit dengan status ini.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTrips.map((trip) => (
                        <TableRow key={trip.id} className="hover:bg-white/5 align-top">
                          <TableCell className="py-3 whitespace-nowrap">
                            <span className="block text-white font-medium">{trip.id}</span>
                            <span className="block text-xs text-slate-500 tabular-nums">{formatDateTime(trip.created_at)}</span>
                          </TableCell>
                          <TableCell className="py-3">
                            <span className="block text-slate-200">{trip.truck_id}</span>
                            <span className="block text-xs text-slate-500 truncate max-w-[140px]">
                              {trip.truck_name || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="py-3">
                            <span className="block text-slate-200">
                              {trip.origin_name} → {trip.destination_name}
                            </span>
                            <span className="block text-xs text-slate-500 tabular-nums">
                              {trip.commodity_key} • {formatNumber(trip.cargo_tonnage)} ton
                            </span>
                          </TableCell>
                          <TableCell className="py-3">
                            <span className="flex items-center gap-1.5 text-xs text-slate-300">
                              {trip.status === 'failed' && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />}
                              {STATUS_LABEL[trip.status] || trip.status}
                            </span>
                          </TableCell>
                          <TableCell className="py-3">
                            <span className="text-xs text-slate-300">
                              {trip.rerouted ? 'Ya' : 'Tidak'}
                            </span>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="text-right text-xs tabular-nums text-slate-300">
                              {formatNumber(trip.saved_time_hours)} jam
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="text-right text-xs tabular-nums text-slate-300">
                              {formatNumber(trip.saved_fuel_liters)} L
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="text-right text-xs tabular-nums text-slate-300">
                              {formatIDR(trip.saved_cost_idr)}
                            </div>
                            <div className="text-right text-xs text-slate-500 tabular-nums">
                              BBM {formatIDR(trip.savings_breakdown.fuel_idr)} • Tol{' '}
                              {formatIDR(trip.savings_breakdown.toll_idr)}
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="text-right text-xs tabular-nums text-slate-300">
                              {formatNumber(trip.efficiency_pct)}%
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            {trip.hedging_policy ? (
                              <span className="text-xs text-slate-300">{trip.hedging_policy}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSolveHedging(trip.id)}
                                disabled={solvingTripId === trip.id}
                                className="px-2 py-1 rounded border border-white/10 text-slate-200 text-xs font-medium hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                title="Hitung matriks Continue / Reroute / Hold untuk rit ini"
                              >
                                {solvingTripId === trip.id && (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                )}
                                Hitung
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="px-4 py-2.5 border-t border-white/10 text-xs text-slate-500">
                Nilai negatif ditampilkan sebagai kerugian aktual, bukan disembunyikan.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
