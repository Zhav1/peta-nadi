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
      <div className="bg-[#0c1017] border border-white/10 rounded-xl p-5 shadow-xl flex flex-wrap items-start justify-between gap-3">
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
          <span
            className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold border ${
              isAggregateOnly
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
            }`}
          >
            {isAggregateOnly ? 'AGREGAT REGULATOR' : 'DETAIL DISPATCHER'}
          </span>
          <button
            type="button"
            onClick={loadSummary}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-md bg-[#121822] hover:bg-[#1a2230] border border-white/10 text-xs text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
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
            Buat aset truk lalu buat rit pengiriman melalui tombol <strong>Onboard Armada</strong>. Angka
            penghematan baru muncul setelah waktu/BBM aktual diisi — sistem tidak menampilkan persentase karangan.
          </p>
        </div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              {
                label: 'Total Rit',
                value: `${totals?.total_trips ?? 0}`,
                sub: `${totals?.active_trips ?? 0} aktif • ${totals?.delivered_trips ?? 0} terkirim`,
                icon: Truck,
                color: 'text-slate-200',
              },
              {
                label: 'Reroute Sukses',
                value: `${totals?.reroute_success_count ?? 0}`,
                sub: `Rasio ${formatNumber(totals?.reroute_success_rate_pct)}%`,
                icon: CheckCircle2,
                color: 'text-emerald-400',
              },
              {
                label: 'Rit Gagal',
                value: `${totals?.failed_trips ?? 0}`,
                sub: `${totals?.reroute_failed_count ?? 0} reroute merugi`,
                icon: XCircle,
                color: 'text-rose-400',
              },
              {
                label: 'Waktu Hemat',
                value: `${formatNumber(totals?.time_saved_hours)} jam`,
                sub: `SLA terpenuhi ${formatNumber(totals?.sla_compliance_pct)}%`,
                icon: Clock,
                color: 'text-amber-300',
              },
              {
                label: 'BBM Hemat',
                value: `${formatNumber(totals?.fuel_saved_liters)} L`,
                sub: 'Biosolar/Dexlite Pertamina',
                icon: Fuel,
                color: 'text-cyan-300',
              },
              {
                label: 'Biaya Hemat',
                value: formatIDR(totals?.cost_saved_idr),
                sub: `Efisiensi ${formatNumber(totals?.cost_efficiency_pct)}%`,
                icon: Wallet,
                color: 'text-emerald-300',
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-[#0c1017] border border-white/10 rounded-xl p-3.5 shadow-lg"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{kpi.label}</span>
                  <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                </div>
                <p className={`text-lg font-mono font-bold tabular-nums leading-tight ${kpi.color}`}>{kpi.value}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Savings split + business explanation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-[#0c1017] border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Rincian Penghematan (Split Biaya)
                </h3>
                <span className="text-[10px] font-mono text-slate-500">
                  Baseline {formatIDR(totals?.baseline_cost_idr)} → Aktual {formatIDR(totals?.actual_cost_idr)}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {[
                  { label: 'BBM', value: totals?.savings_breakdown.fuel_idr, hint: 'Volume × harga Pertamina' },
                  { label: 'Tol BPJT', value: totals?.savings_breakdown.toll_idr, hint: 'Tarif resmi per golongan' },
                  { label: 'Susut Pangan', value: totals?.savings_breakdown.spoilage_idr, hint: '1 − e^(−δ·t) per tier' },
                  { label: 'Waktu Sopir', value: totals?.savings_breakdown.labor_idr, hint: 'Jam × upah lembur' },
                ].map((item) => (
                  <div key={item.label} className="p-2.5 rounded-lg bg-[#121822] border border-white/5">
                    <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      {item.label}
                    </span>
                    <span
                      className={`block text-sm font-mono font-bold tabular-nums mt-0.5 ${
                        Number(item.value ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {formatIDR(item.value)}
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">{item.hint}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400" />
                  Rata-rata hemat per rit: <strong className="text-emerald-300">{formatIDR(totals?.avg_cost_saved_per_trip_idr)}</strong>
                </span>
                <span>Terakhir dihitung: {formatDateTime(summary?.generated_at)}</span>
              </div>
            </div>

            <div className="bg-[#0c1017] border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Cara Membaca</h3>
              </div>
              <ul className="space-y-2 text-[11px] text-slate-400 leading-relaxed">
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
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Agregat per Perusahaan
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-[#121822] text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">Tenant</th>
                      <th className="py-2.5 px-3">Rit</th>
                      <th className="py-2.5 px-3">Sukses</th>
                      <th className="py-2.5 px-3">Gagal</th>
                      <th className="py-2.5 px-3">Waktu Hemat</th>
                      <th className="py-2.5 px-3">BBM Hemat</th>
                      <th className="py-2.5 px-3">Biaya Hemat</th>
                      <th className="py-2.5 px-3">Efisiensi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {(summary?.per_company || []).map((row) => (
                      <tr key={row.company_id} className="hover:bg-white/5">
                        <td className="py-2.5 px-3 text-white font-semibold">{row.company_id}</td>
                        <td className="py-2.5 px-3 tabular-nums">{row.total_trips}</td>
                        <td className="py-2.5 px-3 tabular-nums text-emerald-300">{row.reroute_success_count}</td>
                        <td className="py-2.5 px-3 tabular-nums text-rose-300">{row.failed_trips}</td>
                        <td className="py-2.5 px-3 tabular-nums">{formatNumber(row.time_saved_hours)} jam</td>
                        <td className="py-2.5 px-3 tabular-nums">{formatNumber(row.fuel_saved_liters)} L</td>
                        <td className="py-2.5 px-3 tabular-nums text-emerald-300">{formatIDR(row.cost_saved_idr)}</td>
                        <td className="py-2.5 px-3 tabular-nums">{formatNumber(row.cost_efficiency_pct)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Dispatcher: per-rit detail */}
          {!isAggregateOnly && (
            <div className="bg-[#0c1017] border border-white/10 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Route className="w-4 h-4 text-cyan-300" />
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                    Rincian per Rit ({filteredTrips.length})
                  </h3>
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'ALL' | TravelStatus)}
                  className="bg-[#121822] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="planned">Direncanakan</option>
                  <option value="moving">Berjalan</option>
                  <option value="rerouted">Dialihkan</option>
                  <option value="delivered">Terkirim</option>
                  <option value="failed">Gagal</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-[#121822] text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">ID Rit / Waktu</th>
                      <th className="py-2.5 px-3">Truk</th>
                      <th className="py-2.5 px-3">Rute</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Reroute</th>
                      <th className="py-2.5 px-3">Waktu</th>
                      <th className="py-2.5 px-3">BBM</th>
                      <th className="py-2.5 px-3">Biaya</th>
                      <th className="py-2.5 px-3">Efisiensi</th>
                      <th className="py-2.5 px-3">Hedging</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredTrips.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-10 text-center text-slate-500">
                          Tidak ada rit dengan status ini.
                        </td>
                      </tr>
                    ) : (
                      filteredTrips.map((trip) => (
                        <tr key={trip.id} className="hover:bg-white/5 align-top">
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="block text-white font-semibold">{trip.id}</span>
                            <span className="block text-[10px] text-slate-500">{formatDateTime(trip.created_at)}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="block text-slate-200">{trip.truck_id}</span>
                            <span className="block text-[10px] text-slate-500 truncate max-w-[140px]">
                              {trip.truck_name || '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="block text-slate-200">
                              {trip.origin_name} → {trip.destination_name}
                            </span>
                            <span className="block text-[10px] text-slate-500">
                              {trip.commodity_key} • {formatNumber(trip.cargo_tonnage)} ton
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                trip.status === 'delivered'
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                                  : trip.status === 'failed'
                                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/25'
                                  : trip.status === 'rerouted'
                                  ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25'
                                  : 'bg-slate-500/10 text-slate-300 border-slate-500/25'
                              }`}
                            >
                              {STATUS_LABEL[trip.status] || trip.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {trip.rerouted ? (
                              <span className="text-cyan-300">Ya</span>
                            ) : (
                              <span className="text-slate-500">Tidak</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums">
                            <span className={trip.saved_time_hours >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                              {formatNumber(trip.saved_time_hours)} jam
                            </span>
                          </td>
                          <td className="py-2.5 px-3 tabular-nums">
                            <span className={trip.saved_fuel_liters >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                              {formatNumber(trip.saved_fuel_liters)} L
                            </span>
                          </td>
                          <td className="py-2.5 px-3 tabular-nums">
                            <span className={trip.saved_cost_idr >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                              {formatIDR(trip.saved_cost_idr)}
                            </span>
                            <span className="block text-[10px] text-slate-500">
                              BBM {formatIDR(trip.savings_breakdown.fuel_idr)} • Tol{' '}
                              {formatIDR(trip.savings_breakdown.toll_idr)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 tabular-nums">
                            <span className={trip.efficiency_pct >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                              {formatNumber(trip.efficiency_pct)}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {trip.hedging_policy ? (
                              <span className="text-[10px] text-slate-300">{trip.hedging_policy}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSolveHedging(trip.id)}
                                disabled={solvingTripId === trip.id}
                                className="px-2 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[10px] font-semibold hover:bg-cyan-500/20 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                title="Hitung matriks Continue / Reroute / Hold untuk rit ini"
                              >
                                {solvingTripId === trip.id && (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                )}
                                Hitung
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 border-t border-white/5 text-[10px] font-mono text-slate-500">
                Nilai negatif ditampilkan sebagai kerugian aktual, bukan disembunyikan.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
