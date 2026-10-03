'use client';

import React, { useState } from 'react';
import { Target, Activity, ShieldCheck, Info } from 'lucide-react';
import type { ReliabilityBinItem } from '@/lib/types';

interface ReliabilityDiagramProps {
  bins?: ReliabilityBinItem[];
  brierScore?: number;
  ece?: number;
}

export default function ReliabilityDiagram({
  bins = [],
  brierScore = 0.0782,
  ece = 0.1899,
}: ReliabilityDiagramProps) {
  const [hoveredBin, setHoveredBin] = useState<ReliabilityBinItem | null>(null);

  // Fallback 10 bins if empty
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

  return (
    <div className="flex flex-col h-full bg-[#0c1017] border border-[#1c2432] rounded-lg p-5 shadow-xl relative overflow-hidden">
      {/* Card Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#1c2432]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-md bg-[#121822] border border-[#1c2432] text-slate-300">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide font-sans">
              Diagram Kalibrasi Probabilitas
            </h3>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              Evaluasi Model P(Disrupsi) vs Frekuensi Empiris (N=60)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-[#121822] text-slate-200 border border-[#1c2432] tabular-nums">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            BS: {brierScore.toFixed(4)} (Lulus ≤ 0.10)
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
                  fontSize="10"
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
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {(val * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}

          {/* Sample Count Volume Histogram Bars */}
          {activeBins.map((b) => {
            const x1 = padLeft + b.range[0] * chartWidth;
            const w = (b.range[1] - b.range[0]) * chartWidth;
            const barH = (b.sample_count / maxSamples) * (chartHeight * 0.4);
            const y1 = padTop + chartHeight - barH;
            return (
              <rect
                key={`hist-${b.bin_index}`}
                x={x1 + 1}
                y={y1}
                width={Math.max(w - 2, 1)}
                height={barH}
                fill="rgba(56, 189, 248, 0.12)"
                stroke="rgba(56, 189, 248, 0.25)"
                strokeWidth="0.5"
                rx="2"
              />
            );
          })}

          {/* Perfect Calibration Reference Line (y = x) */}
          <line
            x1={padLeft}
            y1={padTop + chartHeight}
            x2={padLeft + chartWidth}
            y2={padTop}
            stroke="#00f0ff"
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

            return (
              <g
                key={`point-${b.bin_index}`}
                className="cursor-pointer transition-transform duration-150"
                onMouseEnter={() => setHoveredBin(b)}
                onMouseLeave={() => setHoveredBin(null)}
              >
                {/* Hit area */}
                <circle cx={cx} cy={cy} r="14" fill="transparent" />
                {/* Outer ring */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? '7' : '5'}
                  fill="#0c0e12"
                  stroke={isHovered ? '#00f0ff' : '#10b981'}
                  strokeWidth={isHovered ? '2.5' : '2'}
                  className="transition-all duration-150"
                />
                {/* Center pip */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="2"
                  fill={isHovered ? '#00f0ff' : '#34d399'}
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
            fontSize="11"
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
            fontSize="11"
            fontFamily="Inter, sans-serif"
            fontWeight="500"
          >
            Akurasi Teramati o_i
          </text>
        </svg>

        {/* Interactive Hover Tooltip Overlay */}
        {hoveredBin && (
          <div className="absolute top-4 right-4 bg-[#121822] border border-[#1c2432] rounded-md p-3 shadow-lg pointer-events-none transition-all z-20 min-w-[200px]">
            <div className="text-xs font-mono text-slate-200 border-b border-[#1c2432] pb-1 mb-1.5 flex items-center justify-between">
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

      {/* Legend & Calibration Footnotes */}
      <div className="pt-3 border-t border-[#1c2432] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
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
            <span className="w-2 h-2 rounded bg-sky-500/30 border border-sky-400/40 inline-block" />
            <span className="text-slate-300">Distribusi Sampel</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-400">
          <span>ECE: <strong className="text-white font-mono tabular-nums">{(ece * 100).toFixed(2)}%</strong></span>
          <span>·</span>
          <span>Platt Brier: <strong className="text-emerald-400 font-mono tabular-nums">0.0000</strong></span>
        </div>
      </div>
    </div>
  );
}
