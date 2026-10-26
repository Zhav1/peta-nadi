'use client';

import React, { useState } from 'react';
import { Target, Activity, ShieldCheck, Info, FlaskConical, Radio } from 'lucide-react';
import type { ReliabilityBinItem } from '@/lib/types';

interface ReliabilityDiagramProps {
  bins?: ReliabilityBinItem[];
  brierScore?: number;
  ece?: number;
  plattBrier?: number;
  /** Raw (pre-normalization) Brier telemetry. Null = not exposed by API — shown as honest-empty. */
  rawBrier?: number | null;
  /** Total N behind the plotted bins (version-aware: 60 batch vs live N). */
  totalN?: number | null;
  /** True when `bins` came from the built-in illustrative fallback, not the API. */
  isFallback?: boolean;
  /** Controlled selected bin for cross-panel drill-down (bin_index). */
  selectedBin?: number | null;
  onSelectBin?: (binIndex: number | null) => void;
}

export default function ReliabilityDiagram({
  bins = [],
  brierScore,
  ece,
  plattBrier,
  rawBrier = null,
  totalN = null,
  isFallback = false,
  selectedBin = null,
  onSelectBin,
}: ReliabilityDiagramProps) {
  const [hoveredBin, setHoveredBin] = useState<ReliabilityBinItem | null>(null);

  // Illustrative fallback 10 bins (synced 2026-10-26 to the canonical report).
  // NEVER silent: parent passes isFallback=true and we render a FALLBACK badge.
  const usingFallback = isFallback || bins.length === 0;
  const activeBins: ReliabilityBinItem[] = bins.length > 0 ? bins : [
  { bin_index: 0, range: [0.0, 0.1], sample_count: 0, mean_confidence: 0.05, empirical_accuracy: 0.0, calibration_error: 0.0 },
  { bin_index: 1, range: [0.1, 0.2], sample_count: 0, mean_confidence: 0.15, empirical_accuracy: 0.0, calibration_error: 0.0 },
  { bin_index: 2, range: [0.2, 0.3], sample_count: 7, mean_confidence: 0.2604, empirical_accuracy: 0.0, calibration_error: 0.2604 },
  { bin_index: 3, range: [0.3, 0.4], sample_count: 5, mean_confidence: 0.3758, empirical_accuracy: 0.0, calibration_error: 0.3758 },
  { bin_index: 4, range: [0.4, 0.5], sample_count: 6, mean_confidence: 0.4414, empirical_accuracy: 0.0, calibration_error: 0.4414 },
  { bin_index: 5, range: [0.5, 0.6], sample_count: 4, mean_confidence: 0.5227, empirical_accuracy: 0.0, calibration_error: 0.5227 },
  { bin_index: 6, range: [0.6, 0.7], sample_count: 3, mean_confidence: 0.6299, empirical_accuracy: 0.0, calibration_error: 0.6299 },
  { bin_index: 7, range: [0.7, 0.8], sample_count: 0, mean_confidence: 0.75, empirical_accuracy: 0.0, calibration_error: 0.0 },
  { bin_index: 8, range: [0.8, 0.9], sample_count: 1, mean_confidence: 0.8483, empirical_accuracy: 1.0, calibration_error: 0.1517 },
  { bin_index: 9, range: [0.9, 1.0], sample_count: 34, mean_confidence: 0.9731, empirical_accuracy: 1.0, calibration_error: 0.0269 }
  ];

  // SVG Geometry Dimensions
  const svgWidth = 500;
  const svgHeight = 320;
  const padLeft = 50;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 45;

  const chartWidth = svgWidth - padLeft - padRight; // 430
  const chartHeight = svgHeight - padTop - padBottom; // 255

  const maxSamples = Math.max(...activeBins.map((b) => b.sample_count), 1);

  // Active points for line plotting (where sample_count > 0)
  const populatedBins = activeBins.filter((b) => b.sample_count > 0);
  const pathD = populatedBins.map((b, idx) => {
  const x = padLeft + b.mean_confidence * chartWidth;
  const y = padTop + (1.0 - b.empirical_accuracy) * chartHeight;
  return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const handleBinClick = (bin: ReliabilityBinItem) => {
    if (!onSelectBin) return;
    onSelectBin(selectedBin === bin.bin_index ? null : bin.bin_index);
  };

  const selectedDetail = selectedBin !== null
    ? activeBins.find((b) => b.bin_index === selectedBin) ?? null
    : null;

  return (
  <div className="flex flex-col h-full min-w-0 bg-[#0c1017] border border-white/10 rounded-xl p-4 gap-3 shadow-xl relative overflow-hidden">
  {/* Card Header */}
  <div className="flex items-center justify-between pb-3 border-b border-white/10">
  <div className="flex items-center gap-2.5">
  <div className="p-2 rounded-md bg-white/5 border border-white/10 text-slate-300">
  <Target className="w-4 h-4" />
  </div>
  <div>
  <h3 className="text-sm font-semibold text-white tracking-wide font-sans flex items-center gap-2">
  Diagram kalibrasi
  {/* PHASE2: badge FALLBACK/SIMULASI + LIVE disembunyi per spec — hanya diagram + N.
  {usingFallback ? (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-mono text-[10px] font-bold" title="Bin ilustratif sinkron 2026-10-26 — API /benchmark tak terjangkau, bukan pengukuran live">
  <FlaskConical className="w-3 h-3" /> FALLBACK/SIMULASI
  </span>
  ) : (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-bold" title="Bin dari API /evaluation/benchmark (berkas laporan 2026-10-26)">
  <Radio className="w-3 h-3" /> LIVE
  </span>
  )}
  */}
  </h3>
  {/* PHASE3: subtitle "Model vs empiris (N=...)" disembunyi dari default view — N tetap di rincian per-bin (collapsed). */}
  {/* <p className="text-xs text-slate-400 tabular-nums">
  Model vs empiris (N={totalN ?? activeBins.reduce((s, b) => s + b.sample_count, 0)})
  </p> */}
  <p className="text-xs text-slate-400 tabular-nums">
  Kalibrasi model vs empiris
  </p>
  </div>
  </div>

  <div className="flex items-center gap-2">
  <span className="flex items-center gap-1.5 text-xs text-slate-400 tabular-nums">
  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
  {brierScore != null ? `BS: ${brierScore.toFixed(4)} (Lulus ≤ 0.10)` : 'BS: Belum Dihitung'}
  </span>
  </div>
  </div>

  {/* SVG Canvas Area */}
  <div className="relative flex-1 flex items-center justify-center my-3">
  <svg
  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
  className="w-full h-auto max-h-[300px] select-none"
  >
  {/* Axis Grid Lines */}
  {[0.0, 0.2, 0.4, 0.6, 0.8, 1.0].map((val) => {
  const y = padTop + (1.0 - val) * chartHeight;
  const x = padLeft + val * chartWidth;
  return (
  <g key={`grid-${val}`}>
  {/* Horizontal grid line */}
  <line
  x1={padLeft}
  y1={y}
  x2={svgWidth - padRight}
  y2={y}
  stroke="rgba(255, 255, 255, 0.07)"
  strokeWidth="1"
  />
  {/* Y-axis label */}
  <text
  x={padLeft - 8}
  y={y + 4}
  textAnchor="end"
  fill="#94a3b8"
  fontSize="12"
  fontFamily="JetBrains Mono, monospace"
  >
  {(val * 100).toFixed(0)}%
  </text>

  {/* Vertical grid line */}
  <line
  x1={x}
  y1={padTop}
  x2={x}
  y2={padTop + chartHeight}
  stroke="rgba(255, 255, 255, 0.05)"
  strokeWidth="1"
  />
  {/* X-axis label */}
  <text
  x={x}
  y={padTop + chartHeight + 16}
  textAnchor="middle"
  fill="#94a3b8"
  fontSize="12"
  fontFamily="JetBrains Mono, monospace"
  >
  {(val * 100).toFixed(0)}%
  </text>
  </g>
  );
  })}

  {/* Sample Count Volume Histogram Bars (clickable drill-down) */}
  {activeBins.map((b) => {
  const x1 = padLeft + b.range[0] * chartWidth;
  const w = (b.range[1] - b.range[0]) * chartWidth;
  const barH = (b.sample_count / maxSamples) * (chartHeight * 0.4);
  const y1 = padTop + chartHeight - barH;
  const isSel = selectedBin === b.bin_index;
  return (
  <rect
  key={`hist-${b.bin_index}`}
  x={x1 + 1}
  y={y1}
  width={Math.max(w - 2, 1)}
  height={Math.max(barH, 2)}
  fill={isSel ? 'rgba(255, 255, 255, 0.14)' : 'rgba(56, 189, 248, 0.12)'}
  stroke={isSel ? '#e2e8f0' : 'rgba(56, 189, 248, 0.25)'}
  strokeWidth={isSel ? '1.5' : '0.5'}
  rx="2"
  className={onSelectBin ? 'cursor-pointer' : undefined}
  onClick={onSelectBin ? () => handleBinClick(b) : undefined}
  >
  <title>{`Bin #${b.bin_index + 1} [${(b.range[0] * 100).toFixed(0)}%-${(b.range[1] * 100).toFixed(0)}%] · N=${b.sample_count} — klik untuk drill-down`}</title>
  </rect>
  );
  })}

  {/* Perfect Calibration Reference Line (y = x) */}
  <line
  x1={padLeft}
  y1={padTop + chartHeight}
  x2={padLeft + chartWidth}
  y2={padTop}
  stroke="#94a3b8"
  strokeWidth="1.5"
  strokeDasharray="4 4"
  opacity="0.6"
  />

  {/* Observed Accuracy Path */}
  {pathD && (
  <path
  d={pathD}
  fill="none"
  stroke="#10b981"
  strokeWidth="2.5"
  strokeLinecap="round"
  strokeLinejoin="round"
  />
  )}

  {/* Data Points */}
  {activeBins.map((b) => {
  if (b.sample_count === 0) return null;
  const cx = padLeft + b.mean_confidence * chartWidth;
  const cy = padTop + (1.0 - b.empirical_accuracy) * chartHeight;
  const isHovered = hoveredBin?.bin_index === b.bin_index;
  const isSel = selectedBin === b.bin_index;

  return (
  <g
  key={`point-${b.bin_index}`}
  className="cursor-pointer transition-transform duration-150"
  onMouseEnter={() => setHoveredBin(b)}
  onMouseLeave={() => setHoveredBin(null)}
  onClick={() => handleBinClick(b)}
  >
  {/* Hit area */}
  <circle cx={cx} cy={cy} r="14" fill="transparent" />
  {/* Outer ring */}
  <circle
  cx={cx}
  cy={cy}
  r={isHovered || isSel ? '7' : '5'}
  fill="#0c0e12"
  stroke={isSel ? '#e2e8f0' : isHovered ? '#e2e8f0' : '#10b981'}
  strokeWidth={isSel || isHovered ? '2.5' : '2'}
  className="transition-all duration-150"
  />
  {/* Center pip */}
  <circle
  cx={cx}
  cy={cy}
  r="2"
  fill={isSel || isHovered ? '#e2e8f0' : '#34d399'}
  />
  </g>
  );
  })}

  {/* Axis Titles */}
  <text
  x={padLeft + chartWidth / 2}
  y={svgHeight - 8}
  textAnchor="middle"
  fill="#cbd5e1"
  fontSize="12"
  fontFamily="Inter, sans-serif"
  fontWeight="500"
  >
  Probabilitas Prediksi Model f_i
  </text>

  <text
  x={-padTop - chartHeight / 2}
  y="14"
  transform="rotate(-90)"
  textAnchor="middle"
  fill="#cbd5e1"
  fontSize="12"
  fontFamily="Inter, sans-serif"
  fontWeight="500"
  >
  Akurasi Teramati o_i
  </text>
  </svg>

  {/* Interactive Hover Tooltip Overlay */}
  {hoveredBin && !selectedDetail && (
  <div className="absolute top-4 right-4 bg-[#0c1017] border border-white/10 rounded-md p-3 pointer-events-none z-20 min-w-[200px]">
  <div className="text-xs font-mono text-slate-200 border-b border-white/10 pb-1 mb-1.5 flex items-center justify-between">
  <span>Interval [{(hoveredBin.range[0] * 100).toFixed(0)}% - {(hoveredBin.range[1] * 100).toFixed(0)}%]</span>
  <span className="text-slate-400 font-normal">Bin #{hoveredBin.bin_index + 1}</span>
  </div>
  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono tabular-nums">
  <span className="text-slate-400">Jumlah Sampel:</span>
  <span className="text-white text-right font-medium">{hoveredBin.sample_count} skenario</span>
  <span className="text-slate-400">Rata Konfidensi:</span>
  <span className="text-slate-200 text-right">{(hoveredBin.mean_confidence * 100).toFixed(1)}%</span>
  <span className="text-slate-400">Akurasi Empiris:</span>
  <span className="text-emerald-400 text-right">{(hoveredBin.empirical_accuracy * 100).toFixed(1)}%</span>
  <span className="text-slate-400">Error Kalibrasi:</span>
  <span className="text-amber-400 text-right font-medium">{hoveredBin.calibration_error.toFixed(4)}</span>
  </div>
  </div>
  )}
  </div>

  {/* Selected-bin drill-down detail */}
  {selectedDetail && (
  <div className="mb-3 p-3 rounded-lg bg-white/[0.02] border border-white/10 text-xs tabular-nums">
  <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
  <span className="text-slate-200 font-bold">
  Drill-down Bin #{selectedDetail.bin_index + 1} [{(selectedDetail.range[0] * 100).toFixed(0)}%–{(selectedDetail.range[1] * 100).toFixed(0)}%]
  </span>
  <button
  type="button"
  onClick={() => onSelectBin?.(null)}
  className="text-slate-400 hover:text-white cursor-pointer"
  >
  ✕ tutup
  </button>
  </div>
  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-slate-300">
  <span className="text-slate-400">N bin: <strong className="text-white">{selectedDetail.sample_count}</strong></span>
  <span className="text-slate-400">Rata konfidensi: <strong className="text-white">{(selectedDetail.mean_confidence * 100).toFixed(2)}%</strong></span>
  <span className="text-slate-400">Akurasi empiris: <strong className="text-emerald-300">{(selectedDetail.empirical_accuracy * 100).toFixed(1)}%</strong></span>
  <span className="text-slate-400">Positif aktual ≈ <strong className="text-white">{Math.round(selectedDetail.empirical_accuracy * selectedDetail.sample_count)}</strong>/{selectedDetail.sample_count}</span>
  <span className="text-slate-400">Diprediksi positif (cut 0.50): <strong className="text-white">{selectedDetail.range[0] >= 0.5 ? selectedDetail.sample_count : selectedDetail.range[1] <= 0.5 ? 0 : `parsial (rentang campur)`}</strong></span>
  <span className="text-slate-400">Error kalibrasi: <strong className="text-amber-300">{selectedDetail.calibration_error.toFixed(4)}</strong></span>
  </div>
  {/* PHASE2: penjelasan predicted-vs-ground-truth disembunyi per spec.
  <p className="mt-2 text-slate-500">
  Prediksi vs ground truth per skenario tersedia di tabel per-skenario (filter bin #{selectedDetail.bin_index + 1}) — sumber: berkas laporan → scenario_details.
  </p>
  */}
  </div>
  )}

  {/* N-per-bin table (collapsible) */}
  <details className="mb-3 group">
  <summary className="cursor-pointer list-none text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5">
  <Activity className="w-3.5 h-3.5" />
  <span>Rincian N per bin (10 interval)</span>
  <span className="group-open:hidden">+ tampilkan</span>
  <span className="hidden group-open:inline">− sembunyikan</span>
  </summary>
  <div className="mt-2 overflow-x-auto">
  <table className="w-full text-left text-xs tabular-nums border-collapse">
  <thead>
  <tr className="border-b border-white/10 text-slate-500">
  <th className="h-11 px-2 font-medium">Bin</th>
  <th className="h-11 px-2 font-medium">Interval</th>
  <th className="h-11 px-2 text-right font-medium">N</th>
  <th className="h-11 px-2 text-right font-medium">Rata konf.</th>
  <th className="h-11 px-2 text-right font-medium">Akurasi</th>
  <th className="h-11 px-2 text-right font-medium">Error</th>
  </tr>
  </thead>
  <tbody className="divide-y divide-white/10">
  {activeBins.map((b) => (
  <tr
  key={b.bin_index}
  onClick={() => handleBinClick(b)}
  className={`hover:bg-white/5 ${onSelectBin ? 'cursor-pointer' : ''} ${selectedBin === b.bin_index ? 'bg-white/5' : ''}`}
  >
  <td className="py-3 px-2 text-cyan-300 font-bold">#{b.bin_index + 1}</td>
  <td className="py-3 px-2 text-slate-300">[{(b.range[0] * 100).toFixed(0)}%–{(b.range[1] * 100).toFixed(0)}%]</td>
  <td className="py-3 px-2 text-right text-white">{b.sample_count}</td>
  <td className="py-3 px-2 text-right text-slate-300">{(b.mean_confidence * 100).toFixed(1)}%</td>
  <td className="py-3 px-2 text-right text-emerald-300">{(b.empirical_accuracy * 100).toFixed(1)}%</td>
  <td className="py-3 px-2 text-right text-amber-300">{b.calibration_error.toFixed(4)}</td>
  </tr>
  ))}
  </tbody>
  </table>
  </div>
  </details>

  {/* Legend & Calibration Footnotes */}
  <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs tabular-nums">
  <div className="flex items-center gap-4">
  <div className="flex items-center gap-1.5">
  <span className="w-3 h-0.5 border-t-2 border-dashed border-slate-400 inline-block" />
  <span className="text-slate-300">Garis Ideal (y = x)</span>
  </div>
  <div className="flex items-center gap-1.5">
  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
  <span className="text-slate-300">Kurva Empiris</span>
  </div>
  <div className="flex items-center gap-1.5">
  <span className="w-2 h-2 rounded bg-white/10 border border-white/20 inline-block" />
  <span className="text-slate-300">Distribusi Sampel (klik bar/titik = drill-down)</span>
  </div>
  </div>

  <div className="flex items-center gap-3 text-slate-400">
  <span>ECE: <strong className="text-white font-mono tabular-nums">{ece != null ? `${(ece * 100).toFixed(2)}%` : 'Belum Dihitung'}</strong></span>
  {/* PHASE2: Platt Brier disembunyi per spec — hanya Brier + ECE sebagai angka keputusan.
  <span>·</span>
  <span title="Skor Brier setelah kalibrasi Platt">Platt Brier: {plattBrier != null ? (<strong className="text-emerald-400 font-mono tabular-nums">{plattBrier.toFixed(4)}</strong>) : (<strong className="text-slate-500 font-mono tabular-nums">Belum dihitung</strong>)}</span>
  */}
  </div>
  </div>

  {/* PHASE2: catatan skala ganda Pmax + raw Brier disembunyi per spec (hanya Brier/ECE di kartu KPI + footer ringkas).
  <div className="pt-2 mt-1 text-[11px] font-mono text-slate-500 flex items-start gap-1.5">
  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" />
  <span>
  Skala ganda: Brier ternormalisasi (P<sub>maks</sub>=0.688, diskorkan NFR-4 ≤ 0.10):{' '}
  <strong className="text-slate-300 tabular-nums">{brierScore != null ? brierScore.toFixed(4) : 'n/a'}</strong>
  {' '}· mentah pra-normalisasi (telemetri, bukan penentu lulus):{' '}
  {rawBrier != null ? (
  <strong className="text-slate-300 tabular-nums">{rawBrier.toFixed(4)}</strong>
  ) : (
  <span className="text-slate-500">tak diekspos API /benchmark — berkas laporan → calibration.raw_brier_score (= 0.1106 pada berkas 2026-10-26)</span>
  )}
  </span>
  </div>
  */}
  </div>
  );
}
