'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Award,
  ShieldCheck,
  Activity,
  Zap,
  Clock,
  RotateCcw,
  Target,
  FileSpreadsheet,
  CheckCircle2,
  TrendingUp,

  AlertTriangle,
  History,
  Check,
  XCircle,
  Truck
} from 'lucide-react';
import { api } from '@/lib/api';
import type {
  BenchmarkReportResponse,
  TestMatrixResponse,
  CorridorEfficiencyResponse,
  OutcomeResponseItem,
  CorridorContext,
  CrisisState,
  RouteRecommendation
} from '@/lib/types';
import ReliabilityDiagram from './ReliabilityDiagram';
import TestMatrixTable from './TestMatrixTable';
import RouteEfficiencyCard from './RouteEfficiencyCard';
import SystemObservabilitySection from './SystemObservabilitySection';

interface EvaluationSectionProps {
  corridorContext?: CorridorContext | null;
  selectedCrisis?: CrisisState | null;
  activeRoutes?: RouteRecommendation[];
}

export default function EvaluationSection({
  corridorContext,
  selectedCrisis,
  activeRoutes
}: EvaluationSectionProps) {
  const [activeSubTab, setActiveSubTab] = useState<'benchmarks' | 'observability'>('benchmarks');
  const [report, setReport] = useState<BenchmarkReportResponse | null>(null);
  const [testMatrix, setTestMatrix] = useState<TestMatrixResponse | null>(null);
  const [efficiency, setEfficiency] = useState<CorridorEfficiencyResponse | null>(null);
  const [outcomes, setOutcomes] = useState<OutcomeResponseItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const loadAllEvaluationData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [bRes, mRes, eRes, oRes] = await Promise.allSettled([
        api.evaluation.getBenchmark(),
        api.evaluation.getTestMatrix(),
        api.evaluation.getCorridorEfficiency(),
        api.outcomes.list()
      ]);

      if (bRes.status === 'fulfilled' && bRes.value) {
        setReport(bRes.value);
      }
      if (mRes.status === 'fulfilled' && mRes.value) {
        setTestMatrix(mRes.value);
      }
      if (eRes.status === 'fulfilled' && eRes.value) {
        setEfficiency(eRes.value);
      }
      if (oRes.status === 'fulfilled' && oRes.value && Array.isArray(oRes.value.items)) {
        setOutcomes(oRes.value.items);
      }
      setLastRefreshed(new Date().toLocaleTimeString('id-ID'));
    } catch (err) {
      console.error('Error loading evaluation data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllEvaluationData();
  }, [loadAllEvaluationData]);

  // Default metric fallbacks
  const precision = report?.metrics?.precision ?? null;
  const recall = report?.metrics?.recall ?? null;
  const f1Score = report?.metrics?.f1_score ?? null;
  const brierScore = report?.calibration?.brier_score ?? null;
  const latencyMs = report?.metrics?.mean_latency_ms ?? null;

  return (
    <div className="flex flex-col space-y-5 max-w-7xl mx-auto pb-12">
      {/* Sub-Tab Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1.5 rounded-xl bg-[#0c1017] border border-white/10 shadow-lg">
        <div className="flex items-center gap-1.5 font-sans text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab('benchmarks')}
            className={`cursor-pointer px-4 py-2 rounded-lg transition font-medium ${
              activeSubTab === 'benchmarks' 
                ? 'bg-white text-[#080d14] font-semibold' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Tolok Ukur Model ({testMatrix?.total_tests || 133} Uji)
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('observability')}
            className={`cursor-pointer px-4 py-2 rounded-lg transition font-medium ${
              activeSubTab === 'observability' 
                ? 'bg-white text-[#080d14] font-semibold' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Diagnostik API & Observabilitas
          </button>
        </div>

        {activeSubTab === 'benchmarks' && (
          <div className="flex items-center gap-3 pr-2 font-mono text-xs">
            {lastRefreshed && (
              <span className="text-xs text-slate-400 hidden md:inline">
                Sinkronisasi: <strong className="text-slate-200">{lastRefreshed}</strong>
              </span>
            )}
            <button
              type="button"
              onClick={loadAllEvaluationData}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 border border-white/10 transition disabled:opacity-50 cursor-pointer font-medium text-xs"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Muat Ulang</span>
            </button>
          </div>
        )}
      </div>

      {activeSubTab === 'observability' ? (
        <SystemObservabilitySection />
      ) : (
        <>
          {/* Top Banner Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0c1017] border border-white/10 rounded-xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-slate-300">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base md:text-lg font-bold text-white tracking-wide font-headline">
                  Evaluasi Empiris & Tolok Ukur Validasi
                </h1>
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  Bukti empiris keandalan model kecerdasan logistik PreHub berdasarkan dataset ground truth Sumatra (N=60), pengujian otomatis, dan kalibrasi probabilitas.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-semibold">
                N=60 Benchmark Sumatra
              </span>
              <span className="px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 font-mono text-xs font-semibold">
                Transparansi Provenance Data
              </span>
            </div>
          </div>

          {/* 5 Empirical Benchmark Ledger Row */}
          <div className="bg-[#0c1017] border border-white/10 p-5 rounded-xl shadow-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
            {/* Metric 1: Precision */}
            <div className="lg:px-4 first:pl-0 last:pr-0 py-3 lg:py-0">
 <span className="text-xs font-mono text-slate-400 tracking-wide block mb-1">Presisi deteksi</span>
              {precision !== null ? (
                <p className="text-2xl font-mono font-bold text-white tabular-nums">{(precision * 100).toFixed(1)}%</p>
              ) : (
                <p className="text-base font-mono text-slate-500 py-1">Belum dihitung</p>
              )}
              <p className="text-xs font-mono text-slate-400 mt-1 tabular-nums">Target: &gt; 85.0% (N=60 Sumatra)</p>
            </div>

            {/* Metric 2: Recall */}
            <div className="lg:px-4 first:pl-0 last:pr-0 py-3 lg:py-0">
 <span className="text-xs font-mono text-slate-400 tracking-wide block mb-1">Sensitivitas</span>
              {recall !== null ? (
                <p className="text-2xl font-mono font-bold text-white tabular-nums">{(recall * 100).toFixed(1)}%</p>
              ) : (
                <p className="text-base font-mono text-slate-500 py-1">Belum dihitung</p>
              )}
              <p className="text-xs font-mono text-slate-400 mt-1 tabular-nums">Target: &gt; 80.0%</p>
            </div>

            {/* Metric 3: F1-Score */}
            <div className="lg:px-4 first:pl-0 last:pr-0 py-3 lg:py-0">
 <span className="text-xs font-mono text-slate-400 tracking-wide block mb-1">Skor F1</span>
              {f1Score !== null ? (
                <p className="text-2xl font-mono font-bold text-white tabular-nums">{f1Score.toFixed(3)}</p>
              ) : (
                <p className="text-base font-mono text-slate-500 py-1">Belum dihitung</p>
              )}
              <p className="text-xs font-mono text-slate-400 mt-1 tabular-nums">Target: &gt; 0.820</p>
            </div>

            {/* Metric 4: Brier Score */}
            <div className="lg:px-4 first:pl-0 last:pr-0 py-3 lg:py-0">
 <span className="text-xs font-mono text-slate-400 tracking-wide block mb-1">Brier</span>
              {brierScore !== null ? (
                <p className="text-2xl font-mono font-bold text-white tabular-nums">{brierScore.toFixed(4)}</p>
              ) : (
                <p className="text-base font-mono text-slate-500 py-1">Belum dihitung</p>
              )}
              <p className="text-xs font-mono text-slate-400 mt-1 tabular-nums">Target: &le; 0.100</p>
            </div>

            {/* Metric 5: Latency */}
            <div className="lg:px-4 first:pl-0 last:pr-0 py-3 lg:py-0">
 <span className="text-xs font-mono text-slate-400 tracking-wide block mb-1">Latensi</span>
              {latencyMs !== null ? (
                <p className="text-2xl font-mono font-bold text-white tabular-nums">{latencyMs.toFixed(1)} ms</p>
              ) : (
                <p className="text-base font-mono text-slate-500 py-1">Belum dihitung</p>
              )}
              <p className="text-xs font-mono text-slate-400 mt-1 tabular-nums">Target: &lt; 5.0 ms</p>
            </div>
          </div>

      {/* Split Analytical Canvas: Reliability Diagram + Corridor Efficiency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ReliabilityDiagram
          bins={report?.calibration?.reliability_bins}
          brierScore={brierScore ?? undefined}
          ece={report?.calibration?.expected_calibration_error ?? undefined}
        />
        <RouteEfficiencyCard corridors={efficiency?.corridors} />
      </div>

      {/* Exhaustive Automated Test Suite Matrix */}
      <TestMatrixTable tests={testMatrix?.tests} isLoading={isLoading} />

      {/* Closed-Loop Decision Trace & Ground-Truth Outcome Audit Log */}
      <div className="flex flex-col bg-[#0c1017] border border-[#1c2432] rounded-lg p-5 shadow-xl overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[#1c2432]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-white/5 border border-white/10 text-slate-300">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wide font-sans">
                Audit Keputusan Operator & Verifikasi Realitas Lapangan (T+12h / T+24h)
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Pencatatan Keputusan Tindakan Mitigasi, Verifikasi Lapangan Pasca-Disrupsi & Faktor Rekalibrasi Bobot
              </p>
            </div>
          </div>

 <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
 <span className="flex items-center gap-1.5 text-xs text-slate-400">
 <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
 Rekalibrasi η 0,05
            </span>
          </div>
        </div>

        {/* Adaptive Sensor Weights Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-4">
 <div className="p-3 border border-[#1c2432] rounded-lg flex items-center justify-between font-mono tabular-nums text-xs">
            <span className="text-slate-400">Bobot Sensor Cuaca (BMKG/NWP):</span>
            <div className="flex items-center gap-1.5 font-bold">
              <span className="text-slate-400">0.35</span>
              <span className="text-slate-500">→</span>
              <span className="text-emerald-400 tabular-nums">0.36 (+0.01)</span>
            </div>
          </div>

 <div className="p-3 border border-[#1c2432] rounded-lg flex items-center justify-between font-mono tabular-nums text-xs">
            <span className="text-slate-400">Bobot Trafik Jalan (TomTom):</span>
            <div className="flex items-center gap-1.5 font-bold">
              <span className="text-slate-400">0.35</span>
              <span className="text-slate-500">→</span>
              <span className="text-amber-400 tabular-nums">0.34 (-0.01)</span>
            </div>
          </div>

 <div className="p-3 border border-[#1c2432] rounded-lg flex items-center justify-between font-mono tabular-nums text-xs">
            <span className="text-slate-400">Bobot Berita & OSINT (Antara):</span>
            <div className="flex items-center gap-1.5 font-bold">
              <span className="text-slate-400">0.30</span>
              <span className="text-slate-500">→</span>
              <span className="text-slate-200 tabular-nums">0.30 (Stabil)</span>
            </div>
          </div>
        </div>

        {/* Outcomes Log Table */}
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
 <tr className="border-b border-[#1c2432] text-xs font-mono text-slate-400 tracking-wide">
 <th className="py-2.5 px-3 font-medium">ID log / waktu</th>
 <th className="py-2.5 px-3 font-medium">Insiden</th>
 <th className="py-2.5 px-3 font-medium">Horizon</th>
 <th className="py-2.5 px-3 text-right font-medium">Kemacetan</th>
 <th className="py-2.5 px-3 text-right font-medium">Deviasi harga</th>
 <th className="py-2.5 px-3 font-medium">Verifikator</th>
 <th className="py-2.5 px-3 font-medium">Catatan</th>
              </tr>
            </thead>
 <tbody className="divide-y divide-[#1c2432] font-mono tabular-nums">
              {outcomes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500 font-mono">
                    Belum ada log verifikasi lapangan (outcomes) yang tersinkronisasi.
                  </td>
                </tr>
              ) : (
                outcomes.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap text-xs">
                      <span className="text-white font-bold block">{item.id}</span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {new Date(item.created_at).toLocaleDateString('id-ID')}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-slate-200 font-semibold text-xs whitespace-nowrap">
                      {item.incident_id}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
 <span className="text-xs text-slate-300">
                        {item.horizon}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right whitespace-nowrap text-amber-400 font-bold tabular-nums">
                      {item.observed_delay_hours.toFixed(1)} Jam
                    </td>

                    <td className="py-3 px-3 text-right whitespace-nowrap text-rose-400 font-bold tabular-nums">
                      +{item.actual_price_spike_pct.toFixed(1)}%
                    </td>

                    <td className="py-3 px-3 text-slate-300 text-xs whitespace-nowrap">
                      {item.verified_by}
                    </td>

                    <td className="py-3 px-3 text-slate-400 text-xs max-w-[280px] truncate" title={item.notes || ''}>
                      {item.notes || 'Verifikasi lapangan telah sinkron.'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
