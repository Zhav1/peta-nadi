'use client';

import React, { useState } from 'react';
import {
  TrendingUp,
  Clock,
  Truck,
  ShieldAlert,
  DollarSign,
  Zap,
  CheckCircle2,
  Anchor,
  Plane,
  ArrowRight
} from 'lucide-react';
import type { CorridorEfficiencyItem } from '@/lib/types';

interface RouteEfficiencyCardProps {
  corridors?: CorridorEfficiencyItem[];
}

const DEFAULT_CORRIDORS: CorridorEfficiencyItem[] = [
  {
    corridor_name: 'Koridor Utama Trans-Sumatera (Belawan - Medan - Tebing Tinggi)',
    origin: 'Pelabuhan Belawan',
    destination: 'Hub Logistik Tebing Tinggi',
    modality: 'truck',
    baseline_distance_km: 86.4,
    blocked_delay_hours: 8.5,
    reroute_distance_km: 100.6,
    reroute_delay_minutes: 42.0,
    time_saved_hours: 7.8,
    fuel_saved_liters: 38.5,
    cost_saved_idr: 1450000,
    solver_latency_ms: 1.4
  },
  {
    corridor_name: 'Koridor Jalinsum Barat (Padang - Solok - Bukittinggi Bypass Sitinjau)',
    origin: 'Pelabuhan Teluk Bayur',
    destination: 'Hub Distribusi Bukittinggi',
    modality: 'truck',
    baseline_distance_km: 92.0,
    blocked_delay_hours: 12.0,
    reroute_distance_km: 114.5,
    reroute_delay_minutes: 55.0,
    time_saved_hours: 11.1,
    fuel_saved_liters: 46.0,
    cost_saved_idr: 1820000,
    solver_latency_ms: 1.8
  },
  {
    corridor_name: 'Koridor Jalintim Sumatera Selatan (Palembang - Betung KM 68 Bypass)',
    origin: 'Hub Logistik Palembang',
    destination: 'Hub Musi Banyuasin',
    modality: 'truck',
    baseline_distance_km: 68.2,
    blocked_delay_hours: 6.5,
    reroute_distance_km: 82.0,
    reroute_delay_minutes: 35.0,
    time_saved_hours: 5.9,
    fuel_saved_liters: 28.0,
    cost_saved_idr: 1120000,
    solver_latency_ms: 1.2
  },
  {
    corridor_name: 'Koridor Pesisir Lampung (Bakauheni - Terbanggi Besar - Kotabumi)',
    origin: 'Pelabuhan Bakauheni',
    destination: 'Hub Kotabumi Lampung',
    modality: 'truck',
    baseline_distance_km: 142.0,
    blocked_delay_hours: 7.0,
    reroute_distance_km: 158.0,
    reroute_delay_minutes: 40.0,
    time_saved_hours: 6.3,
    fuel_saved_liters: 34.0,
    cost_saved_idr: 1380000,
    solver_latency_ms: 1.5
  },
  {
    corridor_name: 'Koridor Pesisir Barat Aceh (Banda Aceh - Calang - Meulaboh)',
    origin: 'Hub Banda Aceh',
    destination: 'Hub Meulaboh Aceh Barat',
    modality: 'truck',
    baseline_distance_km: 245.0,
    blocked_delay_hours: 14.0,
    reroute_distance_km: 272.0,
    reroute_delay_minutes: 60.0,
    time_saved_hours: 13.0,
    fuel_saved_liters: 58.0,
    cost_saved_idr: 2350000,
    solver_latency_ms: 1.9
  }
];

export default function RouteEfficiencyCard({
  corridors = DEFAULT_CORRIDORS
}: RouteEfficiencyCardProps) {
  const activeCorridors = corridors.length > 0 ? corridors : DEFAULT_CORRIDORS;
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [fleetSize, setFleetSize] = useState<number>(5);

  const curr = activeCorridors[selectedIdx] || activeCorridors[0];

  // Dynamic Fleet Aggregation
  const totalFleetCostSaved = curr.cost_saved_idr * fleetSize;
  const totalFleetHoursSaved = curr.time_saved_hours * fleetSize;
  const totalFleetFuelSaved = curr.fuel_saved_liters * fleetSize;

  return (
    <div className="flex flex-col h-full bg-[#0c1017] border border-[#1c2432] rounded-lg p-5 shadow-xl relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#1c2432]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-md bg-[#121822] border border-[#1c2432] text-slate-300">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide font-sans">
              Efisiensi Reroute vs Koridor Terblokir
            </h3>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              Evaluasi Penghematan Operasional Pengalihan Rute
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-[#121822] text-slate-200 border border-[#1c2432] tabular-nums">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          Solver: {curr.solver_latency_ms.toFixed(1)} ms
        </span>
      </div>

      {/* Corridor Selector Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-3 border-b border-[#1c2432] no-scrollbar">
        {activeCorridors.map((c, idx) => {
          const isSelected = selectedIdx === idx;
          return (
            <button
              key={c.corridor_name}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`px-3 py-1 rounded-md text-xs font-sans transition whitespace-nowrap cursor-pointer border ${
                isSelected
                  ? 'bg-white text-[#080d14] font-semibold border-white shadow-sm'
                  : 'bg-[#121822] text-slate-400 hover:text-white border-[#1c2432]'
              }`}
            >
              {c.origin} → {c.destination}
            </button>
          );
        })}
      </div>

      {/* Comparison Grid: Blocked vs CPU Reroute */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-3">
        {/* Scenario 1: Terjebak Disrupsi */}
        <div className="p-3.5 rounded-md bg-[#1a0f12] border border-red-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-red-400 font-medium flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              Skenario Koridor Terblokir
            </span>
            <span className="text-slate-400 text-xs">Baseline</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center text-slate-300">
              <span>Estimasi Kemacetan:</span>
              <strong className="text-red-400 text-sm font-mono tabular-nums">+{curr.blocked_delay_hours.toFixed(1)} Jam</strong>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>Jarak Normal:</span>
              <span className="text-slate-200 font-mono tabular-nums">{curr.baseline_distance_km.toFixed(1)} km</span>
            </div>
            <div className="flex justify-between items-center text-slate-400 text-xs">
              <span>Risiko Muatan:</span>
              <span className="text-red-300 font-medium">Tinggi (Pangan Rentan Rusak)</span>
            </div>
          </div>
        </div>

        {/* Scenario 2: Dynamic Detour */}
        <div className="p-3.5 rounded-md bg-[#121822] border border-[#1c2432] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Rute Pengalihan Optimal
            </span>
            <span className="text-slate-400 text-xs font-mono">Solver Graf</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center text-slate-300">
              <span>Waktu Tempuh Detour:</span>
              <strong className="text-emerald-400 text-sm font-mono tabular-nums">{curr.reroute_delay_minutes.toFixed(0)} Menit</strong>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>Jarak Reroute Optimal:</span>
              <span className="text-slate-200 font-mono tabular-nums">{curr.reroute_distance_km.toFixed(1)} km (+{(curr.reroute_distance_km - curr.baseline_distance_km).toFixed(1)} km)</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>Penghematan Bersih / Rit:</span>
              <span className="text-emerald-400 font-mono tabular-nums font-semibold">-{curr.time_saved_hours.toFixed(1)} Jam</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Fleet Scaler & Cost Calculation */}
      <div className="p-3.5 rounded-md bg-[#121822] border border-[#1c2432] mt-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1c2432]">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-200">
              Simulasi Skala Armada Terdampak:
            </span>
          </div>

          {/* Stepper Buttons */}
          <div className="flex items-center gap-1.5 font-mono text-xs">
            {[1, 5, 10, 25, 50].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setFleetSize(num)}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium transition cursor-pointer ${
                  fleetSize === num
                    ? 'bg-white text-[#080d14] border-white font-semibold shadow-sm'
                    : 'bg-[#0c1017] text-slate-400 border-[#1c2432] hover:text-white'
                }`}
              >
                {num} Truk
              </button>
            ))}
          </div>
        </div>

        {/* Aggregated Savings Display */}
        <div className="grid grid-cols-3 gap-2.5 pt-3 text-center">
          <div className="p-2.5 rounded-md bg-[#0c1017] border border-[#1c2432]">
            <span className="text-xs text-slate-400 block mb-1">Waktu Terselamatkan</span>
            <strong className="text-sm md:text-base text-emerald-400 font-semibold font-mono tabular-nums">
              {totalFleetHoursSaved.toFixed(1)} Jam
            </strong>
          </div>

          <div className="p-2.5 rounded-md bg-[#0c1017] border border-[#1c2432]">
            <span className="text-xs text-slate-400 block mb-1">BBM Terhemat</span>
            <strong className="text-sm md:text-base text-slate-200 font-semibold font-mono tabular-nums">
              {totalFleetFuelSaved.toFixed(0)} Liter
            </strong>
          </div>

          <div className="p-2.5 rounded-md bg-[#0c1017] border border-[#1c2432]">
            <span className="text-xs text-slate-400 block mb-1">Estimasi Penghematan Biaya</span>
            <strong className="text-sm md:text-base text-emerald-400 font-semibold font-mono tabular-nums">
              Rp {(totalFleetCostSaved).toLocaleString('id-ID')}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
