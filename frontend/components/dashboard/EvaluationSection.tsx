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
  X,
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
import { OutcomeVerificationForm } from '@/components/dashboard/LaporanAktualModal';

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
  // N=60 ground truth kejadian nyata (BNPB / BPBD / BMKG / pemberitaan).
  corridor?: string;
  event_date?: string;
  source_agency?: string;
  source_reference?: string;
  headline?: string;
  case_notes?: string;
  brier_contribution?: number;
  channel_scores?: { weather: number; traffic: number; osint: number; economics: number };
  nlp_location?: {
    matched_node: string | null;
    corridor_segment: string;
    location_precision: string;
    is_geocoded: boolean;
    spatial_error_km: number | null;
    location_accurate: boolean;
  };
  llm_extraction?: {
    incident_type?: string;
    severity?: string;
    confidence?: number;
    extracted_location?: string;
    rationale?: string;
  };
}

interface StaticReportFile {
  timestamp: string;
  dataset_path: string;
  dataset_sha256?: string;
  total_scenarios: number;
  calibration: {
    raw_brier_score: number;
    brier_score: number;
    normalized_brier_score: number;
    expected_calibration_error: number;
    reliability_bins: ScenarioBin[];
  };
  nlp_spatial_evaluation?: {
    geocoded_scenarios?: number;
    total_scenarios?: number;
    location_resolution_rate?: number;
    mean_spatial_error_km?: number;
    max_spatial_error_km?: number;
    median_spatial_error_km?: number;
    location_tolerance_km?: number;
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
// Pinned verification constants — recomputed 2026-10-28 from the repo files.
// Juri: `sha256sum frontend/public/data/benchmark_evaluation_report.json` (Linux) /
// `Get-FileHash <path> -Algorithm SHA256` (Windows) untuk verifikasi ulang.
// ---------------------------------------------------------------------------
const PINNED_REPORT_SHA256 = 'fe927fb4deda43314a5d681a16c5a6f2ee8e01818658c429cf74052fca4f5ec7';
const PINNED_GT_SHA256 = 'ab4d5d86ba75151d11e5d492469282c5975fcd3c177676d6f2eabcfb2b7e1350';
const PINNED_RAW_BRIER_FILE = 0.1382;
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

// ---------------------------------------------------------------------------
// Bahasa pengguna helpers — angka Indonesia (koma desimal) + label kelas.
// ---------------------------------------------------------------------------
const CLASS_LABEL: Record<string, string> = {
  TP: 'Benar Gangguan',
  TN: 'Benar Normal',
  FP: 'Alarm Palsu',
  FN: 'Kebobolan',
};

const CLASS_STYLE: Record<string, string> = {
  TP: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  TN: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
  FP: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
  FN: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
};

const LOCATION_PRECISION_LABEL: Record<string, string> = {
  corridor_point: 'Titik koridor',
  kecamatan_kelurahan: 'Kecamatan/Kelurahan',
  kabupaten_kota: 'Kabupaten/Kota',
  province_only: 'Hanya provinsi',
};

function locationPrecisionLabel(value?: string | null): string {
  if (!value) return 'Tak terpetakan';
  return LOCATION_PRECISION_LABEL[value] ?? value.replace(/_/g, ' ');
}

function fmtPctID(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '–';
  return `${(value * 100).toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

function fmtNumID(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return '–';
  return value.toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

interface ConfusionMatrixLike {
  true_positives: number;
  false_positives: number;
  true_negatives: number;
  false_negatives: number;
}

interface PlainMetricsSectionProps {
  precision: number | null;
  recall: number | null;
  f1: number | null;
  brier: number | null;
  cm: ConfusionMatrixLike | null;
  n: number;
  isLive: boolean;
  thresholds: {
    min_precision?: number;
    min_recall?: number;
    min_f1?: number;
    max_brier_score?: number;
  } | null;
  location: {
    n: number;
    resolutionRate: number | null;
    meanSpatialErrorKm: number | null;
  };
}

/**
 * "Arti metrik (bahasa pengguna)" — penjelasan awam untuk Presisi, Sensitivitas,
 * F1, Brier, dan akurasi lokasi NLP. Angka mengikuti tab aktif (batch N=60 atau
 * live N), ambang target tetap ditampilkan di tiap kartu.
 */
function PlainMetricsSection({
  precision,
  recall,
  f1,
  brier,
  cm,
  n,
  isLive,
  thresholds,
  location,
}: PlainMetricsSectionProps) {
  const tp = cm?.true_positives ?? null;
  const fp = cm?.false_positives ?? null;
  const fn = cm?.false_negatives ?? null;

  const derivedPrecision =
    precision ?? (tp !== null && fp !== null && tp + fp > 0 ? tp / (tp + fp) : null);
  const derivedRecall =
    recall ?? (tp !== null && fn !== null && tp + fn > 0 ? tp / (tp + fn) : null);
  const derivedF1 =
    f1 ??
    (derivedPrecision !== null && derivedRecall !== null && derivedPrecision + derivedRecall > 0
      ? (2 * derivedPrecision * derivedRecall) / (derivedPrecision + derivedRecall)
      : null);

  const targetPrecision = thresholds?.min_precision ?? 0.85;
  const targetRecall = thresholds?.min_recall ?? 0.8;
  const targetF1 = thresholds?.min_f1 ?? 0.82;
  const targetBrier = thresholds?.max_brier_score ?? 0.1;

  const resultLabel = isLive ? 'Hasil Live' : 'Hasil Uji';

  const cards: Array<{
    title: string;
    description: string;
    formula: string;
    target: string;
    result: string;
    met: boolean | null;
  }> = [
    {
      title: 'Presisi deteksi',
      description:
        "Kalau sistem bilang 'ada gangguan', seberapa sering benar. Rendah = alarm palsu (false alarm), buang biaya reroute/BBM + lelah operator.",
      formula: 'TP/(TP+FP)',
      target: `>${fmtPctID(targetPrecision, 0)}`,
      result: `${resultLabel} N=${n}: ${fmtPctID(derivedPrecision)} (${tp ?? '–'}/${tp !== null && fp !== null ? tp + fp : '–'}, Alarm Palsu: ${fp ?? '–'}).`,
      met: derivedPrecision !== null ? derivedPrecision > targetPrecision : null,
    },
    {
      title: 'Sensitivitas (Recall)',
      description:
        'Dari semua gangguan sungguhan di lapangan, berapa yang berhasil tertangkap sistem. Rendah = kebobolan, truk terjebak macet/bencana.',
      formula: 'TP/(TP+FN)',
      target: `>${fmtPctID(targetRecall, 0)}`,
      result: `${resultLabel} N=${n}: ${fmtPctID(derivedRecall)} (${tp ?? '–'}/${tp !== null && fn !== null ? tp + fn : '–'}, Kebobolan: ${fn ?? '–'}).`,
      met: derivedRecall !== null ? derivedRecall > targetRecall : null,
    },
    {
      title: 'Skor F1',
      description:
        'Nilai keseimbangan gabungan Presisi dan Sensitivitas. Menjamin sistem tidak asal sebar alarm palsu maupun buta terhadap bencana.',
      formula: '2×P×R/(P+R)',
      target: `>${fmtNumID(targetF1, 2)}`,
      result: `${resultLabel} N=${n}: ${fmtNumID(derivedF1, 3)}.`,
      met: derivedF1 !== null ? derivedF1 > targetF1 : null,
    },
    {
      title: 'Brier Score',
      description:
        'Kejujuran angka persentase probabilitas itu sendiri. Semakin mendekati 0 semakin jujur dan terkalibrasi.',
      formula: 'rata-rata (Prediksi − Kenyataan)²',
      target: `≤${fmtNumID(targetBrier, 2)}`,
      result: `${resultLabel} N=${n} (ternormalisasi): ${fmtNumID(brier, 4)}.`,
      met: brier !== null ? brier <= targetBrier : null,
    },
    {
      title: 'Akurasi Lokasi Agen Berita (NLP)',
      description:
        'Ketepatan agen berita & LLM mengekstrak titik lokasi/koridor kejadian dari teks berita terhadap koordinat lapangan sebenarnya.',
      formula: 'jarak simpangan Haversine (km)',
      target: '≤25 km toleransi',
      result: `Hasil Uji N=${location.n}: ${fmtPctID(location.resolutionRate, 0)} terpetakan (rata-rata jarak simpangan ${fmtNumID(location.meanSpatialErrorKm, 2)} km).`,
      met:
        location.resolutionRate !== null && location.meanSpatialErrorKm !== null
          ? location.resolutionRate >= 1 && location.meanSpatialErrorKm <= 25
          : null,
    },
  ];

  return (
    <div className="flex flex-col bg-[#0c1017] border border-white/10 rounded-xl p-4 gap-3 shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 pb-3 border-b border-white/10">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide font-sans">
            Arti metrik (bahasa pengguna)
          </h3>
          <p className="text-xs text-slate-400 font-sans mt-0.5">
            Angka mengikuti tab aktif —{' '}
            {isLive
              ? `Aktual (live N=${n})`
              : `Internal Skenario (uji N=${n})`}
            . Target ambang ditampilkan di tiap kartu.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 text-slate-300 border border-white/10 text-[11px] font-medium w-fit">
          <Activity className="w-3 h-3 text-emerald-400" />
          {isLive ? `Live operasional N=${n}` : `Uji ground truth N=${n}`}
        </span>
      </div>

      {/* Matriks konfusi tab aktif — TP/FP/TN/FN dalam istilah awam */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums">
        <span className="px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-300 border-emerald-400/20">TP {tp ?? '–'} · Benar Gangguan</span>
        <span className="px-1.5 py-0.5 rounded border bg-rose-500/10 text-rose-300 border-rose-400/20">FP {fp ?? '–'} · Alarm Palsu</span>
        <span className="px-1.5 py-0.5 rounded border bg-slate-500/10 text-slate-300 border-slate-400/20">TN {cm?.true_negatives ?? '–'} · Benar Normal</span>
        <span className="px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-300 border-amber-400/20">FN {fn ?? '–'} · Kebobolan</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className="flex flex-col gap-1.5 p-3 rounded-lg bg-white/[0.02] border border-white/10"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-slate-100 font-sans">{card.title}</span>
              <span
                className={`shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-bold tabular-nums ${
                  card.met === null
                    ? 'bg-slate-500/15 text-slate-400 border-white/10'
                    : card.met
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                      : 'bg-rose-500/15 text-rose-300 border-rose-400/30'
                }`}
                title="Target ambang kelulusan"
              >
                Target {card.target}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400 font-sans">{card.description}</p>
            <p className="text-[11px] text-slate-500 tabular-nums">
              Rumus <span className="font-mono text-slate-300">{card.formula}</span>
            </p>
            <p className="text-[11px] font-semibold text-slate-200 tabular-nums">{card.result}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EvaluationSection({
  corridorContext,
  selectedCrisis,
  activeRoutes
}: EvaluationSectionProps) {
  const [activeSubTab, setActiveSubTab] = useState<'internal' | 'aktual'>('internal');
  const [report, setReport] = useState<BenchmarkReportResponse | null>(null);
  const [testMatrix, setTestMatrix] = useState<TestMatrixResponse | null>(null);
  const [efficiency, setEfficiency] = useState<CorridorEfficiencyResponse | null>(null);
  const [outcomes, setOutcomes] = useState<OutcomeResponseItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // WS2: tab "Internal Skenario" memaksa batch, tab "Aktual" memaksa live
  // (pemilih versi manual lama dihapus — seleksi via switcher internal).
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
  // PHASE5: dispatcher gate for Catat verifikasi — same rule as ReportsSection
  // (form stays read-only with hint for non-dispatcher via canEdit=false).
  const isDispatcher = authRole === 'DISPATCHER';
  const verifyDisabledHint = 'Hanya peran Dispatcher yang dapat mencatat verifikasi.';
  const [showVerifyModal, setShowVerifyModal] = useState<boolean>(false);

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

  // Tab A "Internal Skenario": read-only batch (report.*, N=60) — rumus 1:1.
  const batchMetrics = report?.metrics ?? null;
  const batchCalib = report?.calibration ?? null;
  const batchCM = report?.confusion_matrix ?? null;
  const batchN = report?.total_scenarios ?? 60;
  const batchBins = useMemo(() => {
    const b = batchCalib?.reliability_bins;
    return Array.isArray(b) ? b : [];
  }, [batchCalib]);
  const batchPrecision = batchMetrics?.precision ?? null;
  const batchRecall = batchMetrics?.recall ?? null;
  const batchF1 = batchMetrics?.f1_score ?? null;
  const batchBrier = batchCalib?.brier_score ?? null;
  const batchEce = batchCalib?.expected_calibration_error ?? null;
  const batchPlatt = batchCalib?.platt_calibrated_brier ?? null;
  const batchRawBrier: number | null =
    (batchCalib as { raw_brier_score?: number } | null)?.raw_brier_score ?? null;

  // Tab B "Aktual": agregat live (report.live.*, N) — rumus 1:1.
  const liveMetrics = live?.metrics ?? null;
  const liveCalib = live?.calibration ?? null;
  const liveCM = live?.confusion_matrix ?? null;
  const liveN = live?.n ?? outcomes.length;
  const liveBins = useMemo(() => {
    const b = liveCalib?.reliability_bins;
    return Array.isArray(b) ? b : [];
  }, [liveCalib]);
  const livePrecision = liveMetrics?.precision ?? null;
  const liveRecall = liveMetrics?.recall ?? null;
  const liveF1 = liveMetrics?.f1_score ?? null;
  const liveBrier = liveCalib?.brier_score ?? null;
  const liveEce = liveCalib?.expected_calibration_error ?? null;
  const livePlatt = liveCalib?.platt_calibrated_brier ?? null;
  const liveRawBrier: number | null =
    (liveCalib as { raw_brier_score?: number } | null)?.raw_brier_score ?? null;

  const thresholds = report?.thresholds ?? null;

  // Akurasi lokasi agen berita (NLP) — dataset uji N=60. Sumber: berkas laporan
  // (nlp_spatial_evaluation), fallback ke angka pinned bila berkas belum termuat.
  const nlpSpatial = staticReport?.nlp_spatial_evaluation ?? null;
  const nlpLocationStats = {
    n: nlpSpatial?.total_scenarios ?? 60,
    resolutionRate: nlpSpatial?.location_resolution_rate ?? 1,
    meanSpatialErrorKm: nlpSpatial?.mean_spatial_error_km ?? 6.9,
  };

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
                    Ringkasan angka validasi model — pilih uji skenario internal atau agregat aktual di bawah.
                  </p>
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

          {/* Internal switcher: Internal Skenario (batch read-only) vs Aktual (live) */}
          <div role="tablist" aria-label="Jenis evaluasi" className="flex items-center gap-1 bg-[#0c1017] p-1 rounded-lg border border-white/10 w-fit">
            <button
              type="button"
              role="tab"
              data-testid="eval-tab-skenario"
              aria-selected={activeSubTab === 'internal'}
              onClick={() => setActiveSubTab('internal')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${activeSubTab === 'internal' ? 'bg-white text-[#080d14] font-semibold' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
            >
              Internal Skenario
            </button>
            <button
              type="button"
              role="tab"
              data-testid="eval-tab-aktual"
              aria-selected={activeSubTab === 'aktual'}
              onClick={() => setActiveSubTab('aktual')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${activeSubTab === 'aktual' ? 'bg-white text-[#080d14] font-semibold' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
            >
              Aktual
            </button>
          </div>

          {activeSubTab === 'internal' ? (
          <>
          {/* Tab A "Internal Skenario" — read-only simulasi batch. Tanpa tulis outcomes. */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-500/15 text-slate-300 border border-white/10 text-[11px] font-medium"
              title="KPI Presisi/Sensitivitas/F1/Brier dihitung dari dataset ground truth kejadian nyata Sumatra (N=60) yang bersumber dari BNPB, BPBD, BMKG, dan pemberitaan (data/benchmark/sumatra_disruptions_ground_truth.json) — bukan telemetri live operasional."
            >
              Ground truth BNPB/BPBD/BMKG/Berita N=60
            </span>
          </div>
          {/* 4 Empirical Benchmark KPI Cards (Presisi / Sensitivitas / F1 / Brier) — batch */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden">
            {/* Metric 1: Precision */}
            <div className="bg-[#0c1017] p-3.5">
              <span className="text-xs font-medium text-slate-400 block mb-1">Presisi deteksi {/* PHASE3: <span className="text-slate-500">({versionTag})</span> disembunyi dari default view */}</span>
              {batchPrecision !== null ? (
                <p className="text-2xl font-bold text-white tabular-nums">{(batchPrecision * 100).toFixed(1)}%</p>
              ) : (
                <p className="text-base text-slate-500 py-1">Belum dihitung</p>
              )}
              {/* PHASE5: hint ambang KPI dihapus dari default view — angka KPI tetap. */}
            </div>

            {/* Metric 2: Recall */}
            <div className="bg-[#0c1017] p-3.5">
              <span className="text-xs font-medium text-slate-400 block mb-1">Sensitivitas {/* PHASE3: <span className="text-slate-500">({versionTag})</span> disembunyi dari default view */}</span>
              {batchRecall !== null ? (
                <p className="text-2xl font-bold text-white tabular-nums">{(batchRecall * 100).toFixed(1)}%</p>
              ) : (
                <p className="text-base text-slate-500 py-1">Belum dihitung</p>
              )}
              {/* PHASE5: hint ambang KPI dihapus dari default view — angka KPI tetap. */}
            </div>

            {/* Metric 3: F1-Score */}
            <div className="bg-[#0c1017] p-3.5">
              <span className="text-xs font-medium text-slate-400 block mb-1">Skor F1 {/* PHASE3: <span className="text-slate-500">({versionTag})</span> disembunyi dari default view */}</span>
              {batchF1 !== null ? (
                <p className="text-2xl font-bold text-white tabular-nums">{batchF1.toFixed(3)}</p>
              ) : (
                <p className="text-base text-slate-500 py-1">Belum dihitung</p>
              )}
              {/* PHASE5: hint ambang KPI dihapus dari default view — angka KPI tetap. */}
            </div>

            {/* Metric 4: Brier Score */}
            <div className="bg-[#0c1017] p-3.5">
              <span className="text-xs font-medium text-slate-400 block mb-1">Brier (ternormalisasi) {/* PHASE3: <span className="text-slate-500">({versionTag})</span> disembunyi dari default view */}</span>
              {batchBrier !== null ? (
                <p className="text-2xl font-bold text-white tabular-nums">{batchBrier.toFixed(4)}</p>
              ) : (
                <p className="text-base text-slate-500 py-1">Belum dihitung</p>
              )}
              {/* PHASE5: hint ambang KPI dihapus dari default view — angka KPI tetap. */}
            </div>
          </div>

          <PlainMetricsSection
            precision={batchPrecision}
            recall={batchRecall}
            f1={batchF1}
            brier={batchBrier}
            cm={batchCM}
            n={batchN}
            isLive={false}
            thresholds={thresholds}
            location={nlpLocationStats}
          />

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
                <p>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-500/15 text-slate-300 border border-white/10 text-[11px] font-medium normal-case tracking-normal"
                    title="Rincian batch dari dataset ground truth kejadian nyata Sumatra (N=60) bersumber BNPB, BPBD, BMKG, dan pemberitaan (data/benchmark/sumatra_disruptions_ground_truth.json) — bukan telemetri live operasional."
                  >
                    Ground truth BNPB/BPBD/BMKG/Berita N=60
                  </span>
                </p>
                <p>N = {report?.total_scenarios ?? 60} skenario · Status: {report ? (report.gating_passed ? 'LULUS' : 'BELUM') : 'Belum dihitung'}</p>
                <p>Matriks konfusi: TP {batchCM?.true_positives ?? '–'} (Benar Gangguan) / FP {batchCM?.false_positives ?? '–'} (Alarm Palsu) / TN {batchCM?.true_negatives ?? '–'} (Benar Normal) / FN {batchCM?.false_negatives ?? '–'} (Kebobolan)</p>
                <p className="text-slate-400">Sumber ground truth: laporan BNPB, BPBD, BMKG, dan pemberitaan (Antara/Tribun/Waspada) — 60 kejadian nyata di Sumatra, bukan data sintetis.</p>
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
                  <p className="break-all">Hash laporan (sha256, 2026-10-28): <code className="text-slate-200">{reportHash ? `${reportHash.slice(0, 16)}…` : 'menghitung…'}</code>{' '}
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
              bins={batchBins}
              brierScore={batchBrier ?? undefined}
              ece={batchEce ?? undefined}
              plattBrier={batchPlatt ?? undefined}
              rawBrier={batchRawBrier}
              totalN={batchN}
              isFallback={batchBins.length === 0}
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
                    Hasil per skenario SUM-SCN dari kejadian nyata (BNPB/BPBD/BMKG/berita): aktual vs prediksi, lokasi NLP, keyakinan agen, dan kontribusi Brier.
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
                  <option value="all">Semua kelas</option>
                  <option value="TP">TP — Benar Gangguan</option>
                  <option value="TN">TN — Benar Normal</option>
                  <option value="FP">FP — Alarm Palsu</option>
                  <option value="FN">FN — Kebobolan</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[1180px] text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="h-11 px-3 text-left align-bottom">ID</th>
                    <th className="h-11 px-3 text-left align-bottom">Sumber &amp; Tanggal</th>
                    <th className="h-11 px-3 text-left align-bottom">Skenario &amp; Judul Berita</th>
                    <th className="h-11 px-3 text-left align-bottom">Lokasi Aktual vs Hasil NLP</th>
                    <th className="h-11 px-3 text-left align-bottom">Keyakinan Agen (Cuaca, Lalin, Berita, Harga)</th>
                    <th className="h-11 px-3 text-right align-bottom">Probabilitas Gangguan (%)</th>
                    <th className="h-11 px-3 text-center align-bottom">Aktual</th>
                    <th className="h-11 px-3 text-center align-bottom">Prediksi</th>
                    <th className="h-11 px-3 text-center align-bottom">Kelas</th>
                    <th className="h-11 px-3 text-right align-bottom">Brier Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 tabular-nums">
                  {fileState === 'loading' && (
                    <tr><td colSpan={10} className="py-8 text-center text-slate-500">Memuat salinan berkas laporan…</td></tr>
                  )}
                  {fileState === 'error' && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-500">
                        Belum ada data skenario — bukan 0% maupun 100%.
                      </td>
                    </tr>
                  )}
                  {fileState === 'ready' && scenPageRows.length === 0 && (
                    <tr><td colSpan={10} className="py-8 text-center text-slate-500">Tidak ada skenario pada filter ini (bin {String(scenBinFilter)}, klas {scenClassFilter}).</td></tr>
                  )}
                  {fileState === 'ready' && scenPageRows.map((s) => (
                    <tr key={s.id} className="hover:bg-white/5 transition-colors align-top">
                      <td className="py-3 px-3 whitespace-nowrap align-top">
                        <span className="block text-cyan-300 font-bold">{s.id}</span>
                        <span className="block text-[11px] text-slate-500">{s.province}</span>
                      </td>
                      <td className="py-3 px-3 align-top max-w-[190px]">
                        <span
                          className="block text-[11px] text-slate-200 leading-snug"
                          title={s.source_reference ?? s.source_agency ?? ''}
                        >
                          {s.source_agency ?? '–'}
                        </span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">{s.event_date ?? '–'}</span>
                      </td>
                      <td className="py-3 px-3 align-top max-w-[320px]">
                        <span className="block text-slate-100 font-semibold text-xs leading-snug">{s.name}</span>
                        <span className="block text-[11px] text-slate-400 mt-0.5 leading-snug" title={s.headline ?? ''}>
                          {s.headline ?? '–'}
                        </span>
                        {(s.classification === 'FP' || s.classification === 'FN') && s.case_notes && (
                          <span className="block mt-1 text-[11px] text-amber-300/90 leading-snug">{s.case_notes}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top max-w-[260px]">
                        <span className="block text-[11px] text-slate-200 leading-snug">
                          Aktual: {s.corridor ?? '–'}
                        </span>
                        <span className="block text-[11px] text-slate-400 mt-0.5 leading-snug">
                          NLP: {s.nlp_location?.matched_node ?? 'tak terpetakan'}
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5 leading-snug">
                          {s.nlp_location?.spatial_error_km != null
                            ? `Simpangan ${fmtNumID(s.nlp_location.spatial_error_km, 2)} km · `
                            : ''}
                          {locationPrecisionLabel(s.nlp_location?.location_precision)}
                          {s.nlp_location?.is_geocoded === false ? ' · tak tergeocode' : ''}
                        </span>
                      </td>
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        {s.channel_scores ? (
                          <span className="block text-[11px] text-slate-200 leading-snug">
                            Cuaca {Math.round(s.channel_scores.weather * 100)}% · Lalin{' '}
                            {Math.round(s.channel_scores.traffic * 100)}% · Berita{' '}
                            {Math.round(s.channel_scores.osint * 100)}% · Harga{' '}
                            {Math.round(s.channel_scores.economics * 100)}%
                          </span>
                        ) : (
                          <span className="text-slate-500">–</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right align-top whitespace-nowrap">
                        <span className="block text-white font-bold tabular-nums">
                          {(s.forecast_probability * 100).toFixed(1)}%
                        </span>
                        <span className="block text-[10px] text-slate-500 tabular-nums">
                          skor mentah {s.raw_probability.toFixed(4)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center align-top whitespace-nowrap">
                        <span className={s.actual === 1 ? 'text-emerald-300 font-semibold' : 'text-slate-300'}>
                          {s.actual === 1 ? 'Gangguan (1)' : 'Normal (0)'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center align-top whitespace-nowrap">
                        <span className={s.predicted === 1 ? 'text-emerald-300 font-semibold' : 'text-slate-300'}>
                          {s.predicted === 1 ? 'Gangguan (1)' : 'Normal (0)'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center align-top whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded border text-[11px] font-bold ${CLASS_STYLE[s.classification] ?? 'bg-slate-500/15 text-slate-300 border-slate-400/30'}`}>
                          {CLASS_LABEL[s.classification] ?? s.classification}
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5">{s.classification}</span>
                      </td>
                      <td className="py-3 px-3 text-right align-top text-slate-200 whitespace-nowrap">
                        {(s.brier_contribution ?? Math.pow(s.forecast_probability - s.actual, 2)).toFixed(4)}
                      </td>
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
          </>
          ) : (
          <>
          {/* Tab B "Aktual" — agregat live operasional (report.live.*). Tulis via alur Laporan. */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium"
              title={`KPI Presisi/Sensitivitas/F1/Brier dari agregat live operasional N=${liveN} — bukan simulasi.`}
            >
              Live N={liveN}
            </span>
            {!liveSufficient && (
              <span className="text-xs text-slate-500">
                Belum ada data live yang cukup (N&lt;{LIVE_MIN_N}) — bukan 0% maupun 100%.
              </span>
            )}
          </div>
          {/* 4 Live KPI Cards (Presisi / Sensitivitas / F1 / Brier) — live */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden">
            <div className="bg-[#0c1017] p-3.5">
              <span className="text-xs font-medium text-slate-400 block mb-1">Presisi deteksi</span>
              {livePrecision !== null ? (
                <p className="text-2xl font-bold text-white tabular-nums">{(livePrecision * 100).toFixed(1)}%</p>
              ) : (
                <p className="text-base text-slate-500 py-1">Belum dihitung</p>
              )}
              {/* PHASE5: hint ambang KPI dihapus dari default view — angka KPI tetap. */}
            </div>
            <div className="bg-[#0c1017] p-3.5">
              <span className="text-xs font-medium text-slate-400 block mb-1">Sensitivitas</span>
              {liveRecall !== null ? (
                <p className="text-2xl font-bold text-white tabular-nums">{(liveRecall * 100).toFixed(1)}%</p>
              ) : (
                <p className="text-base text-slate-500 py-1">Belum dihitung</p>
              )}
              {/* PHASE5: hint ambang KPI dihapus dari default view — angka KPI tetap. */}
            </div>
            <div className="bg-[#0c1017] p-3.5">
              <span className="text-xs font-medium text-slate-400 block mb-1">Skor F1</span>
              {liveF1 !== null ? (
                <p className="text-2xl font-bold text-white tabular-nums">{liveF1.toFixed(3)}</p>
              ) : (
                <p className="text-base text-slate-500 py-1">Belum dihitung</p>
              )}
              {/* PHASE5: hint ambang KPI dihapus dari default view — angka KPI tetap. */}
            </div>
            <div className="bg-[#0c1017] p-3.5">
              <span className="text-xs font-medium text-slate-400 block mb-1">Brier (ternormalisasi)</span>
              {liveBrier !== null ? (
                <p className="text-2xl font-bold text-white tabular-nums">{liveBrier.toFixed(4)}</p>
              ) : (
                <p className="text-base text-slate-500 py-1">Belum dihitung</p>
              )}
              {/* PHASE5: hint ambang KPI dihapus dari default view — angka KPI tetap. */}
            </div>
          </div>

          <PlainMetricsSection
            precision={livePrecision}
            recall={liveRecall}
            f1={liveF1}
            brier={liveBrier}
            cm={liveCM}
            n={liveN}
            isLive={true}
            thresholds={thresholds}
            location={nlpLocationStats}
          />

          {/* PHASE5: strip delta live-vs-batch disembunyi dari tab Aktual —
              data logic agregat live tetap utuh di atas. */}
          {/*
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

          {/* Live canvas: ReliabilityDiagram (live) + Catat verifikasi entry */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-6 min-w-0">
            <ReliabilityDiagram
              bins={liveBins}
              brierScore={liveBrier ?? undefined}
              ece={liveEce ?? undefined}
              plattBrier={livePlatt ?? undefined}
              rawBrier={liveRawBrier}
              totalN={liveN}
              isFallback={liveBins.length === 0}
            />
            </div>
            <div className="col-span-12 lg:col-span-6 min-w-0">
            <div className="flex flex-col bg-[#0c1017] border border-white/10 rounded-xl p-4 gap-3 shadow-xl h-full justify-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-md bg-white/5 border border-white/10 text-slate-300">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-wide font-sans">
                    Catat verifikasi lapangan
                  </h3>
                  <p className="text-xs text-slate-400 font-sans mt-0.5">
                    Pencatatan memakai OutcomeVerificationForm yang sama dengan tab Laporan — dibuka inline di sini.
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-testid="catat-verifikasi-button"
                title={isDispatcher ? 'Catat verifikasi lapangan (OutcomeVerificationForm)' : verifyDisabledHint}
                disabled={!isDispatcher}
                onClick={() => setShowVerifyModal(true)}
                className="cursor-pointer px-4 py-2 rounded-md bg-white text-[#080d14] text-xs font-semibold hover:bg-slate-200 transition w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                Catat verifikasi
              </button>
            </div>
            </div>
          </div>

          {/* PHASE5: Catat verifikasi modal inline — OutcomeVerificationForm yang sama
              dengan tab Laporan. Pengganti dispatch 'pidi:open-verifikasi' yang tak punya
              listener (no-op). Gate dispatcher: tombol disabled + form read-only bila
              non-dispatcher (canEdit=false). */}
          {showVerifyModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
              onClick={() => setShowVerifyModal(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Catat verifikasi lapangan"
            >
              <div
                className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#0c1017] border border-white/10 rounded-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-white">Verifikasi lapangan</h3>
                    <p className="text-xs text-slate-500 tabular-nums font-mono">OutcomeVerificationForm</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowVerifyModal(false)}
                    className="p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-white cursor-pointer"
                    title="Tutup"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="px-4 py-4">
                  <OutcomeVerificationForm
                    initialIncidentId=""
                    initialObservedDelay={null}
                    baselineKnown={false}
                    canEdit={isDispatcher}
                    disabledHint={verifyDisabledHint}
                    onSubmitted={() => {
                      setShowVerifyModal(false);
                      loadAllEvaluationData();
                    }}
                  />
                </div>
                <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setShowVerifyModal(false)}
                    className="px-4 py-2 bg-transparent hover:bg-white/5 text-slate-200 border border-white/10 rounded-md text-xs font-medium cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          )}

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
          )}
      </>
    </div>
  );
}
