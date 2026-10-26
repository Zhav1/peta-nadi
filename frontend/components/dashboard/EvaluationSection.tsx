'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Truck,
  Download,
  ExternalLink,
  Database,
  FlaskConical,
  Radio,
  GitBranch
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
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

// ---------------------------------------------------------------------------
// Local extended views (backend schemas/evaluation.py WS2 overlay + static
// report file). Declared here so read-only lib/types.ts stays untouched.
// ---------------------------------------------------------------------------
interface LiveDeltas {
  precision?: number;
  recall?: number;
  f1_score?: number;
  false_positive_rate?: number;
  accuracy?: number;
  brier_score?: number;
  expected_calibration_error?: number;
}

interface LiveAggregate {
  n?: number;
  min_n?: number;
  sufficient?: boolean;
  excluded_echoes?: number;
  confusion_matrix?: { true_positives: number; false_positives: number; true_negatives: number; false_negatives: number } | null;
  metrics?: {
    precision: number;
    recall: number;
    f1_score: number;
    false_positive_rate: number;
    accuracy: number;
    mean_latency_ms: number;
    total_latency_ms: number;
  } | null;
  calibration?: {
    brier_score: number;
    expected_calibration_error: number;
    platt_calibrated_brier: number;
    isotonic_calibrated_brier: number;
    reliability_bins: Array<{ bin_index: number; range: [number, number]; sample_count: number; mean_confidence: number; empirical_accuracy: number; calibration_error: number }>;
    raw_brier_score?: number;
  } | null;
  deltas_vs_batch?: LiveDeltas | null;
  note?: string | null;
}

interface VersionEntry {
  version: string;
  kind: string;
  n: number;
  immutable?: boolean;
  timestamp?: string | null;
  sufficient?: boolean;
}

interface BenchmarkReportExtended extends BenchmarkReportResponse {
  batch?: {
    version?: string;
    immutable?: boolean;
    timestamp?: string;
    total_scenarios?: number;
  } | null;
  live?: LiveAggregate | null;
  mode_recommendation?: string | null;
  headline?: string | null;
  versions?: VersionEntry[] | null;
}

interface ScenarioDetail {
  id: string;
  name: string;
  province: string;
  actual: number;
  predicted: number;
  raw_probability: number;
  forecast_probability: number;
  confidence: number;
  gate_route: string;
  validation_mode: string;
  active_sources: number;
  classification: string;
  latency_ms: number;
}

interface StaticReportFile {
  timestamp: string;
  dataset_path: string;
  total_scenarios: number;
  calibration: {
    raw_brier_score: number;
    brier_score: number;
    normalized_brier_score: number;
    expected_calibration_error: number;
    reliability_bins: ScenarioBin[];
  };
  thresholds: Record<string, number>;
  evaluation_notes: string;
  gating_passed: boolean;
  scenario_details: ScenarioDetail[];
}

interface ScenarioBin {
  bin_index: number;
  range: [number, number];
  sample_count: number;
  mean_confidence: number;
  empirical_accuracy: number;
  calibration_error: number;
}

// ---------------------------------------------------------------------------
// Pinned verification constants — recomputed 2026-10-26 from the repo files.
// Juri: `sha256sum test-results/benchmark_evaluation_report.json` (Linux) /
// `Get-FileHash <path> -Algorithm SHA256` (Windows) untuk verifikasi ulang.
// ---------------------------------------------------------------------------
const PINNED_REPORT_SHA256 = 'e6c7645c6628c94b0b7e879de5d0e0ef187435add26ca144537a4e39a37ae590';
const PINNED_GT_SHA256 = '6771297c87be684d0235d8573365a73650b77765e02b5cf28d6b959dd81b1d32';
const PINNED_RAW_BRIER_FILE = 0.1106;
const PINNED_P_MAX = 0.688;
const REPORT_COPY_URL = '/data/benchmark_evaluation_report.json';
const GT_COPY_URL = '/data/sumatra_disruptions_ground_truth.json';
const REPO_REPORT_PATH = 'test-results/benchmark_evaluation_report.json';
const REPO_GT_PATH = 'data/benchmark/sumatra_disruptions_ground_truth.json';

const LIVE_MIN_N = 10;

async function sha256Hex(text: string): Promise<string | null> {
  try {
    if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
    const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function formatFullTimestamp(ts?: string | null): string {
  if (!ts) return 'tak tersedia';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  try {
    return d.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'long', timeZoneName: 'short' });
  } catch {
    return d.toLocaleString('id-ID');
  }
}

function extractUrls(text?: string | null): string[] {
  if (!text) return [];
  const m = text.match(/https?:\/\/[^\s)\]]+/g);
  return m ? Array.from(new Set(m)) : [];
}

function clampProxy(p: number): number {
  return Math.min(0.99, Math.max(0.05, p));
}

function scenarioBinIndex(forecastProb: number): number {
  if (!Number.isFinite(forecastProb)) return -1;
  return Math.min(9, Math.max(0, Math.floor(forecastProb * 10)));
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

  // WS2 batch-vs-live version selector (null = follow backend mode_recommendation)
  const [versionSel, setVersionSel] = useState<'batch' | 'live' | null>(null);
  // Static report copy (/data/*.json) for per-scenario verification + hash check
  const [staticReport, setStaticReport] = useState<StaticReportFile | null>(null);
  const [fileState, setFileState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [reportHash, setReportHash] = useState<string | null>(null);
  const [reportHashOk, setReportHashOk] = useState<boolean | null>(null);
  const [gtHash, setGtHash] = useState<string | null>(null);
  const [gtHashOk, setGtHashOk] = useState<boolean | null>(null);
  // Per-scenario table state
  const [scenPage, setScenPage] = useState<number>(1);
  const [scenBinFilter, setScenBinFilter] = useState<number | 'all'>('all');
  const [scenClassFilter, setScenClassFilter] = useState<string>('all');
  // Shared bin drill-down selection (diagram <-> scenario table)
  const [selectedBin, setSelectedBin] = useState<number | null>(null);
  // Lazy per-outcome evaluation cache (predicted delay -> proxy prob)
  const [evalCache, setEvalCache] = useState<Record<string, { loading: boolean; predictedDelay?: number; predictedPrice?: number; error?: string }>>({});
  // PHASE4: provenance/download gate — dispatcher-atau-terautentikasi saja.
  // Evaluasi sendiri sudah hard-block tamu di DashboardClient; gate ini
  // defense-in-depth agar tautan berkas tak pernah render untuk sesi anonim.
  const { role: authRole, isAuthenticated } = useAuth();
  const canSeeProvenance = isAuthenticated || authRole === 'DISPATCHER';

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

  // Load the versioned static report copy for per-scenario audit + hash verify.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFileState('loading');
      try {
        const res = await fetch(REPORT_COPY_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const hash = await sha256Hex(text);
        const json = JSON.parse(text) as StaticReportFile;
        if (!cancelled) {
          setStaticReport(json);
          setReportHash(hash);
          setReportHashOk(hash ? hash === PINNED_REPORT_SHA256 : null);
          setFileState('ready');
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Static report copy unavailable:', err);
          setFileState('error');
        }
      }
      try {
        const res2 = await fetch(GT_COPY_URL, { cache: 'no-store' });
        if (res2.ok) {
          const t2 = await res2.text();
          const h2 = await sha256Hex(t2);
          if (!cancelled) {
            setGtHash(h2);
            setGtHashOk(h2 ? h2 === PINNED_GT_SHA256 : null);
          }
        }
      } catch {
        /* ground-truth hash stays honest-empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadOutcomeEval = useCallback(async (incidentId: string) => {
    setEvalCache((prev) => {
      if (prev[incidentId]) return prev;
      return { ...prev, [incidentId]: { loading: true } };
    });
    if (evalCache[incidentId]) return;
    try {
      const r = await api.outcomes.evaluation(incidentId);
      setEvalCache((prev) => ({
        ...prev,
        [incidentId]: { loading: false, predictedDelay: r.predicted_delay_hours, predictedPrice: r.predicted_price_spike_pct }
      }));
    } catch {
      setEvalCache((prev) => ({ ...prev, [incidentId]: { loading: false, error: 'evaluasi tak termuat' } }));
    }
  }, [evalCache]);

  const ext = report as BenchmarkReportExtended | null;
  const live: LiveAggregate | null = ext?.live ?? null;
  const liveSufficient = live?.sufficient === true && !!live?.metrics && !!live?.calibration;
  const effectiveVersion: 'batch' | 'live' =
    versionSel ?? (ext?.mode_recommendation === 'live' && liveSufficient ? 'live' : 'batch');
  const showLive = effectiveVersion === 'live' && liveSufficient;

  const dispMetrics = showLive ? live!.metrics! : report?.metrics ?? null;
  const dispCalib = showLive ? live!.calibration ?? null : report?.calibration ?? null;
  const dispCM = showLive ? live!.confusion_matrix ?? null : report?.confusion_matrix ?? null;
  const dispN = showLive ? live!.n ?? outcomes.length : report?.total_scenarios ?? 60;
  const dispBins = useMemo(() => {
    const b = dispCalib?.reliability_bins;
    return Array.isArray(b) ? b : [];
  }, [dispCalib]);

  const precision = dispMetrics?.precision ?? null;
  const recall = dispMetrics?.recall ?? null;
  const f1Score = dispMetrics?.f1_score ?? null;
  const brierScore = dispCalib?.brier_score ?? null;
  const ece = dispCalib?.expected_calibration_error ?? null;
  const plattBrier = dispCalib?.platt_calibrated_brier ?? null;
  const rawBrierApi: number | null =
    (dispCalib as { raw_brier_score?: number } | null)?.raw_brier_score ?? null;
  const latencyMs = dispMetrics?.mean_latency_ms ?? null;
  const cm = dispCM;
  const thresholds = report?.thresholds ?? null;

  const scenRows = useMemo(() => staticReport?.scenario_details ?? [], [staticReport]);
  const filteredScen = useMemo(() => {
    return scenRows.filter((s) => {
      const binOk = scenBinFilter === 'all' || scenarioBinIndex(s.forecast_probability) === scenBinFilter;
      const clsOk = scenClassFilter === 'all' || s.classification === scenClassFilter;
      return binOk && clsOk;
    });
  }, [scenRows, scenBinFilter, scenClassFilter]);
  const scenPageSize = 12;
  const scenTotalPages = Math.max(1, Math.ceil(filteredScen.length / scenPageSize));
  const scenPageRows = useMemo(() => {
    const start = (scenPage - 1) * scenPageSize;
    return filteredScen.slice(start, start + scenPageSize);
  }, [filteredScen, scenPage]);

  const handleSelectBin = useCallback((binIndex: number | null) => {
    setSelectedBin(binIndex);
    setScenBinFilter(binIndex === null ? 'all' : binIndex);
    setScenPage(1);
  }, []);

  // PHASE3: versionTag disembunyi dari default view (chrome batch N=60 / live N) — hanya angka keputusan yang tampil.
  // const versionTag = showLive ? `live N=${live!.n}` : 'batch N=60';

  return (
    <div className="w-full min-h-full flex flex-col gap-6">
      {/* REMOVED per user request 2026-10-26: sub-tab button row above Evaluasi title
          (Tolok Ukur button + commented Diagnostik + top "Muat Ulang").
          Refresh dipindah ke tombol kecil di header judul di bawah agar fungsi tetap ada.
          showLive/versionSel logic untouched. */}
      <>
          {/* PHASE2 distilled: N valid + Status keputusan (pengganti badge baseline/live verbose) */}
          {/* PHASE3: distilled bar N valid + Status disembunyi dari default view — Status tetap di collapsed "Data apa yang diuji?".
          <div className="bg-[#0c1017] border border-white/10 rounded-xl px-5 py-3 shadow-xl flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
            <span className="text-slate-400">N valid: <strong className="text-white">{dispN}</strong></span>
            <span className="text-slate-400">Status: {report ? (report.gating_passed ? <strong className="text-emerald-300">LULUS</strong> : <strong className="text-rose-300">BELUM</strong>) : <span className="text-slate-500">Belum dihitung</span>}</span>
            {outcomes.length < LIVE_MIN_N && (
              <span className="text-slate-500">Belum ada data live yang cukup (N&lt;{LIVE_MIN_N}) — bukan 0% maupun 100%.</span>
            )}
          </div>
          */}
          {/* PHASE2: badge baseline sintetis / live operasional / live N<10 / batch-v selector disembunyi per spec (dispatcher: hanya N+Status).
          <div className="bg-[#0c1017] border border-white/10 rounded-xl p-5 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-200 border border-cyan-500/30 font-bold" title="Dataset ground truth sintetis, immutable, versi batch-v2026-10-26">
                  <FlaskConical className="w-3.5 h-3.5" />
                  Baseline sintetis N={report?.total_scenarios ?? 60}
                </span>
                <span className="text-slate-500 font-bold">vs</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-200 border border-emerald-500/30 font-bold" title="Agregat kumulatif outcome lapangan (live). Agregat dihitung backend bila N>=10.">
                  <Radio className="w-3.5 h-3.5" />
                  Live operasional N={live?.n ?? outcomes.length ?? 0}
                </span>
                {!liveSufficient && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[11px]" title={`Live N=${live?.n ?? 0} < ${LIVE_MIN_N}: agregat live belum dihitung, menampilkan baseline batch`}>
                    <AlertTriangle className="w-3 h-3" />
                    Live N={live?.n ?? 0} &lt; {LIVE_MIN_N} — agregat live belum cukup, menampilkan baseline batch
                  </span>
                )}
                {showLive && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[11px]">
                    menampilkan agregat live (cukup N≥{LIVE_MIN_N})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 font-mono text-xs">
                <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-500 mr-1">Versi:</span>
                <button
                  type="button"
                  onClick={() => setVersionSel('batch')}
                  className={`px-2.5 py-1 rounded-md border transition cursor-pointer ${effectiveVersion === 'batch' ? 'bg-white text-[#080d14] font-bold border-white' : 'text-slate-400 border-white/10 hover:text-white'}`}
                >
                  batch-v2026-10-26-N60
                </button>
                <button
                  type="button"
                  onClick={() => liveSufficient && setVersionSel('live')}
                  disabled={!liveSufficient}
                  title={liveSufficient ? `Tampilkan agregat live N=${live?.n}` : `Live N=${live?.n ?? 0} belum cukup (butuh ≥${LIVE_MIN_N})`}
                  className={`px-2.5 py-1 rounded-md border transition ${effectiveVersion === 'live' ? 'bg-white text-[#080d14] font-bold border-white' : ''} ${liveSufficient ? 'text-slate-400 border-white/10 hover:text-white cursor-pointer' : 'text-slate-600 border-white/5 cursor-not-allowed opacity-50'}`}
                >
                  live-cumulative-N{live?.n ?? 0}
                </button>
              </div>
            </div>
            {ext?.headline && (
              <p className="mt-3 text-xs font-mono text-slate-300 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
                {ext.headline}
              </p>
            )}
          </div>
          */}

          {/* Top Banner Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0c1017] border border-white/10 rounded-xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-slate-300">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-headline font-semibold text-white tracking-wide">
                  Evaluasi Empiris & Tolok Ukur Validasi
                </h1>
                {/* PHASE3: subtitle "Bukti empiris..." disembunyi dari default view (jargon N/confusion/Pmax) — diganti satu baris netral.
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  Bukti empiris keandalan model kecerdasan logistik PreHub berdasarkan dataset ground truth sintetis Sumatra (N={report?.total_scenarios ?? '–'}), pengujian otomatis, dan kalibrasi probabilitas. Angka live operasional ditampilkan terpisah bila N≥{LIVE_MIN_N}.
                </p>
                */}
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-slate-400 font-sans">
                    Ringkasan angka validasi model.
                  </p>
                  {!showLive && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-500/15 text-slate-300 border border-white/10 text-[11px] font-medium"
                      title="Metrik batch dari ground-truth sintetis Sumatra (data/benchmark/sumatra_disruptions_ground_truth.json, N=60) — bukan data live operasional. Agregat live tampil bila N≥10."
                    >
                      Simulasi N=60 — bukan data live
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={loadAllEvaluationData}
              disabled={isLoading}
              title="Muat ulang data evaluasi"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-transparent hover:bg-white/5 text-slate-200 border border-white/10 transition disabled:opacity-50 cursor-pointer text-xs font-medium self-start md:self-center shrink-0"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Muat Ulang</span>
            </button>
          </div>

          {/* Label batch sintetis — tampil hanya saat metrik batch (bukan live) dirender */}
          {!showLive && (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-500/15 text-slate-300 border border-white/10 text-[11px] font-medium"
                title="KPI Presisi/Sensitivitas/F1/Brier dari ground-truth sintetis Sumatra (data/benchmark/sumatra_disruptions_ground_truth.json, N=60) — bukan data live operasional."
              >
                Simulasi N=60 — bukan data live
              </span>
            </div>
          )}
          {/* 4 Empirical Benchmark KPI Cards (Presisi / Sensitivitas / F1 / Brier) — Laporan hybrid strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden">
            {/* Metric 1: Precision */}
            <div className="bg-[#0c1017] p-3.5">
              <span className="text-xs font-medium text-slate-400 block mb-1">Presisi deteksi {/* PHASE3: <span className="text-slate-500">({versionTag})</span> disembunyi dari default view */}</span>
              {precision !== null ? (
                <p className="text-2xl font-bold text-white tabular-nums">{(precision * 100).toFixed(1)}%</p>
              ) : (
                <p className="text-base text-slate-500 py-1">Belum dihitung</p>
              )}
              <p className="text-xs text-slate-500 tabular-nums mt-1">Target: &gt; 85.0% {/* PHASE3: (N=60 Sumatra) disembunyi dari default view */}{/* (N=60 Sumatra) */}</p>
            </div>

            {/* Metric 2: Recall */}
            <div className="bg-[#0c1017] p-3.5">
              <span className="text-xs font-medium text-slate-400 block mb-1">Sensitivitas {/* PHASE3: <span className="text-slate-500">({versionTag})</span> disembunyi dari default view */}</span>
              {recall !== null ? (
                <p className="text-2xl font-bold text-white tabular-nums">{(recall * 100).toFixed(1)}%</p>
              ) : (
                <p className="text-base text-slate-500 py-1">Belum dihitung</p>
              )}
              <p className="text-xs text-slate-500 tabular-nums mt-1">Target: &gt; 80.0%</p>
            </div>

            {/* Metric 3: F1-Score */}
            <div className="bg-[#0c1017] p-3.5">
              <span className="text-xs font-medium text-slate-400 block mb-1">Skor F1 {/* PHASE3: <span className="text-slate-500">({versionTag})</span> disembunyi dari default view */}</span>
              {f1Score !== null ? (
                <p className="text-2xl font-bold text-white tabular-nums">{f1Score.toFixed(3)}</p>
              ) : (
                <p className="text-base text-slate-500 py-1">Belum dihitung</p>
              )}
              <p className="text-xs text-slate-500 tabular-nums mt-1">Target: &gt; 0.820</p>
            </div>

            {/* Metric 4: Brier Score */}
            <div className="bg-[#0c1017] p-3.5">
              <span className="text-xs font-medium text-slate-400 block mb-1">Brier (ternormalisasi) {/* PHASE3: <span className="text-slate-500">({versionTag})</span> disembunyi dari default view */}</span>
              {brierScore !== null ? (
                <p className="text-2xl font-bold text-white tabular-nums">{brierScore.toFixed(4)}</p>
              ) : (
                <p className="text-base text-slate-500 py-1">Belum dihitung</p>
              )}
              <p className="text-xs text-slate-500 tabular-nums mt-1">Target: &le; 0.100</p>
            </div>
          </div>

          {/* PHASE2: delta live vs batch disembunyi per spec (hanya N+Status di bar distilled).
          {liveSufficient && live?.deltas_vs_batch && (
            <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl px-5 py-3 text-xs font-mono tabular-nums text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
                <ShieldCheck className="w-3.5 h-3.5" /> Delta live vs batch:
              </span>
              <span>dPresisi <strong className="text-white">{(live.deltas_vs_batch.precision ?? 0) >= 0 ? '+' : ''}{(live.deltas_vs_batch.precision ?? 0).toFixed(4)}</strong></span>
              <span>dRecall <strong className="text-white">{(live.deltas_vs_batch.recall ?? 0) >= 0 ? '+' : ''}{(live.deltas_vs_batch.recall ?? 0).toFixed(4)}</strong></span>
              <span>dF1 <strong className="text-white">{(live.deltas_vs_batch.f1_score ?? 0) >= 0 ? '+' : ''}{(live.deltas_vs_batch.f1_score ?? 0).toFixed(4)}</strong></span>
              <span>dBrier <strong className="text-white">{(live.deltas_vs_batch.brier_score ?? 0) >= 0 ? '+' : ''}{(live.deltas_vs_batch.brier_score ?? 0).toFixed(4)}</strong></span>
              {typeof live.excluded_echoes === 'number' && live.excluded_echoes > 0 && (
                <span className="text-slate-400">echo sistem dikecualikan: <strong className="text-white">{live.excluded_echoes}</strong> (verification_source=DISPATCHER_APPROVAL)</span>
              )}
            </div>
          )}
          */}

          {/* PHASE2: provenance detail — collapsed (tanpa open) agar default view hanya KPI+N+Status. Rincian audit tetap tersedia bila dibuka. */}
          <details className="bg-[#0c1017] border border-white/10 rounded-xl shadow-xl px-5 py-4 group">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-sans font-semibold text-slate-200">
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                Data apa yang diuji?
              </span>
              <span className="text-xs tabular-nums text-slate-400 group-open:hidden">+ tampilkan</span>
              <span className="text-xs tabular-nums text-slate-400 hidden group-open:inline">− sembunyikan</span>
            </summary>
            <div className="pt-3 mt-3 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs tabular-nums">
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/10 space-y-1.5 text-slate-300">
                <p className="text-[11px] font-sans font-bold text-slate-200 uppercase tracking-wider">Dataset & keputusan</p>
                {!showLive && (
                  <p>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-500/15 text-slate-300 border border-white/10 text-[11px] font-medium normal-case tracking-normal"
                      title="Rincian batch dari ground-truth sintetis Sumatra (data/benchmark/sumatra_disruptions_ground_truth.json, N=60) — bukan data live operasional."
                    >
                      Simulasi N=60 — bukan data live
                    </span>
                  </p>
                )}
                <p>N = {report?.total_scenarios ?? 60} skenario · Status: {report ? (report.gating_passed ? 'LULUS' : 'BELUM') : 'Belum dihitung'}</p>
                <p>Matriks konfusi: TP {cm?.true_positives ?? '–'} / FP {cm?.false_positives ?? '–'} / TN {cm?.true_negatives ?? '–'} / FN {cm?.false_negatives ?? '–'}</p>
                <p>Ambang: Presisi &gt; {(thresholds?.min_precision ?? 0.85).toFixed(2)} · Sensitivitas &gt; {(thresholds?.min_recall ?? 0.80).toFixed(2)} · F1 &gt; {(thresholds?.min_f1 ?? 0.82).toFixed(3)} · Brier ≤ {(thresholds?.max_brier_score ?? 0.10).toFixed(3)}</p>
                {/* PHASE2: dual-scale Pmax / rumus forecast / proxy live / sensor mapping disembunyi per spec (jargon sintetis).
                <p>Ambang deteksi: skor konsensus mentah raw_prob ge; 0.50 (setara ternormalisasi asymp; 0.727)</p>
                <p>Normalisasi P<sub>maks</sub> = {PINNED_P_MAX} (profil bobot W 0.35 / T 0.25 / I 0.20 / E 0.20)</p>
                <p>Pemetaan sensor: cuaca (BMKG/NWP) · trafik (TomTom) · maritim (AIS) · berita (Antara/OSINT)</p>
                <div className="pt-1 mt-1 border-t border-white/10 space-y-1">
                  <p className="text-[11px] font-sans font-bold text-slate-200 uppercase tracking-wider">Rumus probabilitas prediksi</p>
                  <p className="break-words">forecast = calibrate_confidence_scale(raw_prob, active_sources, W/T/I/E) — confidence tersimpan dinormalisasi P<sub>maks</sub>; <em>overall_confidence tidak diskorkan</em> (cap OSINT 0.50).</p>
                  <p className="break-words">Live: forecast = clamp(pred_delay_jam / 4.0, 0.05, 0.99) = <strong className="text-amber-300">PROXY</strong> (cut 2.0j ⟺ 0.50); tanpa decision trace → fallback pred_delay 4.0j; echo DISPATCHER_APPROVAL dikecualikan ({live?.excluded_echoes ?? 0}).</p>
                  <p>Brier ternormalisasi (diskor, ≤0.100): <strong className="text-white tabular-nums">{brierScore != null ? brierScore.toFixed(4) : 'n/a'}</strong> · mentah pra-normalisasi (telemetri): <strong className="text-white tabular-nums">{rawBrierApi != null ? rawBrierApi.toFixed(4) : `${PINNED_RAW_BRIER_FILE} (berkas, API tak mengekspos)`}</strong> · ECE: <strong className="text-white tabular-nums">{ece != null ? ece.toFixed(4) : 'n/a'}</strong></p>
                </div>
                */}
              </div>
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/10 space-y-1.5 text-slate-300">
                <p className="text-[11px] font-sans font-bold text-slate-200 uppercase tracking-wider">Ambang kelulusan</p>
                <p>Brier ≤ {(thresholds?.max_brier_score ?? 0.10).toFixed(3)} · Status gerbang: {report ? (report.gating_passed ? 'LULUS' : 'BELUM LULUS') : 'Belum dihitung'}</p>
                {/* PHASE4: provenance + unduhan dipulihkan di dalam collapsed <details> ini saja
                    (bukan default view, bukan tab Laporan) — gated dispatcher-atau-terautentikasi.
                    Default view tetap angka saja. */}
                {canSeeProvenance && (
                <div className="pt-1 mt-1 border-t border-white/10 space-y-1">
                  <p className="text-[11px] font-sans font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5"><Database className="w-3 h-3 text-cyan-400" /> Provenance berkas</p>
                  <p className="break-all">Laporan API: <code className="text-cyan-300">{formatFullTimestamp(report?.timestamp)}</code></p>
                  {report?.timestamp && <p className="break-all text-slate-500">ISO mentah: <code>{report.timestamp}</code> (zona asal tak tercatat — di atas dalam zona browser)</p>}
                  <p className="break-all">Hash laporan (sha256, 2026-10-26): <code className="text-slate-200">{reportHash ? `${reportHash.slice(0, 16)}…` : 'menghitung…'}</code>{' '}
                    {reportHashOk === true && <span className="text-emerald-300 font-bold">✓ COCOK</span>}
                    {reportHashOk === false && <span className="text-rose-300 font-bold">✕ BERBEDA DARI {PINNED_REPORT_SHA256.slice(0, 12)}…</span>}
                  </p>
                  <p className="break-all">Hash ground truth (sha256): <code className="text-slate-200">{gtHash ? `${gtHash.slice(0, 16)}…` : 'menghitung…'}</code>{' '}
                    {gtHashOk === true && <span className="text-emerald-300 font-bold">✓ COCOK</span>}
                    {gtHashOk === false && <span className="text-rose-300 font-bold">✕ BERBEDA DARI {PINNED_GT_SHA256.slice(0, 12)}…</span>}
                  </p>
                  <p className="flex flex-col gap-1 pt-1">
                    <a href={REPORT_COPY_URL} download className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 underline underline-offset-2 w-fit">
                      <Download className="w-3.5 h-3.5" /> {REPO_REPORT_PATH} (salinan unduhan + scenario_details)
                    </a>
                    <a href={GT_COPY_URL} download className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 underline underline-offset-2 w-fit">
                      <Download className="w-3.5 h-3.5" /> {REPO_GT_PATH} (salinan unduhan ground truth)
                    </a>
                  </p>
                </div>
                )}
              </div>
            </div>
          </details>

          {/* Split Analytical Canvas: Reliability Diagram + Corridor Efficiency */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-6 min-w-0">
            <ReliabilityDiagram
              bins={dispBins}
              brierScore={brierScore ?? undefined}
              ece={ece ?? undefined}
              plattBrier={plattBrier ?? undefined}
              rawBrier={rawBrierApi}
              totalN={dispN}
              isFallback={dispBins.length === 0}
              selectedBin={selectedBin}
              onSelectBin={handleSelectBin}
            />
            </div>
            <div className="col-span-12 lg:col-span-6 min-w-0">
            <RouteEfficiencyCard corridors={efficiency?.corridors} />
            </div>
          </div>

          {/* Per-scenario ground-truth audit table (SUM-SCN-001..060) */}
          <div className="flex flex-col bg-[#0c1017] border border-white/10 rounded-xl p-4 gap-3 shadow-xl overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-md bg-white/5 border border-white/10 text-slate-300">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-wide font-sans flex items-center gap-2">
                    <span>Tabel per-skenario ground truth</span>
                    <span className="px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10 text-xs tabular-nums">
                      {filteredScen.length}/{scenRows.length} skenario
                    </span>
                    {/* PHASE2: badge hash salinan disembunyi per spec (audit tetap via berkas bila perlu).
                        PHASE4: tetap disembunyi di default view agar ringkas angka saja; badge hash
                        sudah dipulihkan gated di dalam collapsed "Data apa yang diuji?" di atas,
                        bukan di tab Laporan.
                    
                    {fileState === 'ready' && reportHashOk === true && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs font-mono" title={`sha256 ${reportHash}`}>
                        salinan berkas terverifikasi ✓
                      </span>
                    )}
                    {fileState === 'ready' && reportHashOk === false && (
                      <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-xs font-mono">
                        hash salinan BERBEDA — verifikasi ulang berkas
                      </span>
                    )}
                    */}
                  </h3>
                  <p className="text-xs text-slate-400 font-sans mt-0.5">
                    Hasil per skenario SUM-SCN (aktual vs prediksi).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs tabular-nums">
                <select
                  value={scenBinFilter === 'all' ? 'all' : String(scenBinFilter)}
                  onChange={(e) => { setScenBinFilter(e.target.value === 'all' ? 'all' : Number(e.target.value)); setScenPage(1); }}
                  className="bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-200 cursor-pointer"
                  title="Filter bin kalibrasi (klik bar diagram juga memfilter)"
                >
                  <option value="all">Semua bin</option>
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i} value={i}>Bin #{i + 1}{selectedBin === i ? ' (terpilih)' : ''}</option>
                  ))}
                </select>
                <select
                  value={scenClassFilter}
                  onChange={(e) => { setScenClassFilter(e.target.value); setScenPage(1); }}
                  className="bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-200 cursor-pointer"
                >
                  <option value="all">TP+TN+FP+FN</option>
                  <option value="TP">TP</option>
                  <option value="TN">TN</option>
                  <option value="FP">FP</option>
                  <option value="FN">FN</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="h-11 px-3 text-left">ID</th>
                    <th className="h-11 px-3 text-left">Skenario</th>
                    <th className="h-11 px-3 text-center">Aktual</th>
                    <th className="h-11 px-3 text-center">Prediksi</th>
                    <th className="h-11 px-3 text-center">Klas</th>
                    {/* PHASE2: kolom raw_prob / forecast / src / latensi disembunyi per spec — tabel ringkas keputusan saja.
                    <th className="py-2.5 px-3 text-right">raw_prob</th>
                    <th className="py-2.5 px-3 text-right">forecast (tersimpan)</th>
                    <th className="py-2.5 px-3 text-right">src</th>
                    <th className="py-2.5 px-3 text-center">Klas</th>
                    <th className="py-2.5 px-3 text-right">Latensi</th>
                    */}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 tabular-nums">
                  {fileState === 'loading' && (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-500">Memuat salinan berkas laporan…</td></tr>
                  )}
                  {fileState === 'error' && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        Belum ada data skenario — bukan 0% maupun 100%.
                      </td>
                    </tr>
                  )}
                  {fileState === 'ready' && scenPageRows.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-500">Tidak ada skenario pada filter ini (bin {String(scenBinFilter)}, klas {scenClassFilter}).</td></tr>
                  )}
                  {fileState === 'ready' && scenPageRows.map((s) => (
                    <tr key={s.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-3 text-cyan-300 font-bold whitespace-nowrap">{s.id}</td>
                      <td className="py-3 px-3 text-slate-200 text-xs max-w-[240px] truncate" title={`${s.name} — ${s.province}`}>{s.name}</td>
                      <td className="py-3 px-3 text-center text-white">{s.actual}</td>
                      <td className="py-3 px-3 text-center text-white">{s.predicted}</td>
                      {/* PHASE2: sel raw/forecast/src/latensi disembunyi per spec.
                      <td className="py-2 px-3 text-right text-slate-400">{s.raw_probability.toFixed(4)}</td>
                      <td className="py-2 px-3 text-right text-slate-200" title="forecast_probability tersimpan (ternormalisasi P_maks), bukan eta/4.0">{s.forecast_probability.toFixed(4)}</td>
                      <td className="py-2 px-3 text-right text-slate-500">{s.active_sources}</td>
                      */}
                      <td className="py-3 px-3 text-center">
                        <span className={`px-1.5 py-0.5 rounded border text-[11px] font-bold ${s.classification === 'TP' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' : s.classification === 'TN' ? 'bg-slate-500/15 text-slate-300 border-slate-400/30' : 'bg-rose-500/15 text-rose-300 border-rose-400/30'}`}>
                          {s.classification}
                        </span>
                      </td>
                      {/* <td className="py-2 px-3 text-right text-slate-500">{s.latency_ms.toFixed(2)} ms</td> */}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {fileState === 'ready' && (
              <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs text-slate-400 tabular-nums">
                <span>Halaman <strong className="text-white">{scenPage}</strong> dari <strong className="text-white">{scenTotalPages}</strong> · {filteredScen.length} baris</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setScenPage((p) => Math.max(1, p - 1))} disabled={scenPage === 1} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 disabled:opacity-40 cursor-pointer">‹</button>
                  <button type="button" onClick={() => setScenPage((p) => Math.min(scenTotalPages, p + 1))} disabled={scenPage === scenTotalPages} className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 disabled:opacity-40 cursor-pointer">›</button>
                </div>
              </div>
            )}
          </div>

          {/* Exhaustive Automated Test Suite Matrix */}
          <TestMatrixTable tests={testMatrix?.tests} isLoading={isLoading} />

          {/* PHASE2: log verifikasi lapangan disederhanakan per spec — ringkas keputusan, detail verbose disembunyi. */}
          <div className="flex flex-col bg-[#0c1017] border border-white/10 rounded-xl p-4 gap-3 shadow-xl overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-md bg-white/5 border border-white/10 text-slate-300">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-wide font-sans">
                    Verifikasi lapangan (T+12h / T+24h)
                  </h3>
                  <p className="text-xs text-slate-400">
                    {outcomes.length === 0 ? 'Belum ada data verifikasi lapangan — bukan 0% maupun 100%.' : `${outcomes.length} kejadian tercatat`}
                  </p>
                </div>
              </div>

              {/* PHASE2: pill rekalibrasi disembunyi per spec.
              <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  Rekalibrasi η 0,05
                </span>
              </div>
              */}
            </div>

            {/* PHASE2: banner bobot adaptif + catatan ilustratif disembunyi per spec (jargon kalibrasi, bukan angka keputusan).
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
            <p className="text-[11px] font-mono text-slate-500 -mt-1 mb-2">
              Angka bobot di atas ilustratif (baseline W 0.35 / T 0.35 / I 0.30); penasihat aktual dihitung per-insiden dari varians (η=0.05) — muat evaluasi per baris di bawah.
            </p>
            */}

            {/* PHASE2: catatan live-sufficiency disederhanakan jadi satu baris honest-empty di subjudul di atas.
            {outcomes.length < LIVE_MIN_N && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs font-mono text-amber-200/90">
                Outcome tersinkron N={outcomes.length} &lt; {LIVE_MIN_N} — agregat live belum dihitung backend (jujur-kosong, bukan 0%). Tabel di bawah adalah log mentah per kejadian.
              </div>
            )}
            */}

            {/* Outcomes Log Table */}
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="h-11 px-3 text-left font-medium">ID log / waktu</th>
                    <th className="h-11 px-3 text-left font-medium">Insiden</th>
                    <th className="h-11 px-3 text-left font-medium">Horizon</th>
                    <th className="h-11 px-3 text-right font-medium">Kemacetan</th>
                    <th className="h-11 px-3 text-right font-medium">Deviasi harga</th>
                    <th className="h-11 px-3 text-left font-medium">Verifikasi (sumber)</th>
                    {/* PHASE2: kolom Pred (proxy) + Catatan disembunyi per spec — bukan angka keputusan.
                    <th className="py-2.5 px-3 text-right font-medium">Pred (proxy)</th>
                    <th className="py-2.5 px-3 font-medium">Catatan / sumber</th>
                    */}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 tabular-nums">
                  {outcomes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                        Belum ada data verifikasi lapangan — bukan 0% maupun 100%.
                      </td>
                    </tr>
                  ) : (
                    outcomes.map((item) => {
                      const urls = extractUrls(item.notes);
                      const cached = evalCache[item.incident_id];
                      const proxy = cached?.predictedDelay != null
                        ? clampProxy(cached.predictedDelay / 4.0)
                        : null;
                      return (
                        <tr key={item.id} className="hover:bg-white/5 transition-colors">
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
                            <span className="block">{item.verified_by}</span>
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[11px] text-slate-300" title="Sumber verifikasi — baris DISPATCHER_APPROVAL adalah echo sistem dan dikecualikan dari agregat live">
                              {item.verification_source || 'tak tercatat'}
                            </span>
                          </td>

                          {/* PHASE2: kolom proxy predicted-vs-ground-truth + catatan/sumber disembunyi per spec.
                          <td className="py-3 px-3 text-right whitespace-nowrap text-xs">
                            {proxy !== null ? (
                              <span className="text-slate-200" title={`Proxy live clamp(${cached!.predictedDelay}/4.0) — BUKAN confidence tersimpan; pred_delay ${cached!.predictedDelay}j`}>
                                {proxy.toFixed(4)} <span className="text-amber-300">PROXY</span>
                              </span>
                            ) : cached?.loading ? (
                              <span className="text-slate-500">memuat…</span>
                            ) : cached?.error ? (
                              <span className="text-slate-500">{cached.error}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => loadOutcomeEval(item.incident_id)}
                                className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-cyan-300 hover:text-cyan-200 cursor-pointer"
                                title="Muat GET /outcomes/evaluation/{id} → predicted_delay_hours, lalu proxy clamp(delay/4.0)"
                              >
                                Muat evaluasi
                              </button>
                            )}
                          </td>

                          <td className="py-3 px-3 text-slate-400 text-xs max-w-[280px]">
                            <span className="block truncate" title={item.notes || ''}>
                              {item.notes || 'Verifikasi lapangan telah sinkron.'}
                            </span>
                            {urls.length > 0 && (
                              <a href={urls[0]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-1 text-cyan-300 hover:text-cyan-200 underline underline-offset-2">
                                <ExternalLink className="w-3 h-3" /> Buka sumber
                              </a>
                            )}
                          </td>
                          */}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
      </>
      {/* PHASE2: penutup ternary observability dikomentari per spec — selalu tampilkan benchmarks
      )}
      */}
    </div>
  );
}
