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
    <div className="flex flex-col h-full bg-[#13161c]/90 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide font-sans">
              Tolok Ukur Efisiensi Reroute CPU vs. Koridor Terblokir
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Evaluasi Penghematan Operasional Solver Dijkstra / OR-Tools (Zero GPU Cost)
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          <Clock className="w-3.5 h-3.5" />
          Solver: {curr.solver_latency_ms.toFixed(1)} ms
        </span>
      </div>

      {/* Corridor Selector Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-3 border-b border-white/5 no-scrollbar">
        {activeCorridors.map((c, idx) => {
          const isSelected = selectedIdx === idx;
          return (
            <button
              key={c.corridor_name}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`px-3 py-1 rounded-lg text-[11px] font-mono transition whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 border border-white/5'
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
        <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className="text-red-400 font-bold flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              Skenario Koridor Terblokir
            </span>
            <span className="text-slate-500 text-[10px]">Baseline Tanpa AI</span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center text-slate-300">
              <span>Estimasi Kemacetan / Antrean:</span>
              <strong className="text-red-400 text-sm">+{curr.blocked_delay_hours.toFixed(1)} Jam</strong>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>Jarak Jalinsum Normal:</span>
              <span className="text-white">{curr.baseline_distance_km.toFixed(1)} km</span>
            </div>
            <div className="flex justify-between items-center text-slate-400 text-[11px]">
              <span>Risiko Kerusakan Muatan:</span>
              <span className="text-red-300 font-semibold">Tinggi (Bahan Pangan Layu)</span>
            </div>
          </div>
        </div>

        {/* Scenario 2: Dynamic CPU Detour */}
        <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Reroute Cerdas CPU PreHub
            </span>
            <span className="text-cyan-400 text-[10px] font-mono">NetworkX + OR-Tools</span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center text-slate-300">
              <span>Waktu Tempuh Detour:</span>
              <strong className="text-emerald-400 text-sm">{curr.reroute_delay_minutes.toFixed(0)} Menit</strong>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>Jarak Reroute Optimal:</span>
              <span className="text-white">{curr.reroute_distance_km.toFixed(1)} km (+{(curr.reroute_distance_km - curr.baseline_distance_km).toFixed(1)} km)</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>Penghematan Bersih / Rit:</span>
              <span className="text-emerald-400 font-bold">-{curr.time_saved_hours.toFixed(1)} Jam</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Fleet Scaler & Cost Calculation */}
      <div className="p-4 rounded-xl bg-black/40 border border-white/10 mt-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono font-semibold text-slate-200">
              Simulasi Skala Armada Terdampak:
            </span>
          </div>

          {/* Stepper Buttons */}
          <div className="flex items-center gap-2 font-mono text-xs">
            {[1, 5, 10, 25, 50].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setFleetSize(num)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
                  fleetSize === num
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                }`}
              >
                {num} Truk
              </button>
            ))}
          </div>
        </div>

        {/* Aggregated Savings Display */}
        <div className="grid grid-cols-3 gap-3 pt-3 text-center font-mono">
          <div className="p-2 rounded-lg bg-white/5 border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Waktu Terselamatkan</span>
            <strong className="text-sm md:text-base text-emerald-400 font-bold">
              {totalFleetHoursSaved.toFixed(1)} Jam
            </strong>
          </div>

          <div className="p-2 rounded-lg bg-white/5 border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">BBM Terhemat</span>
            <strong className="text-sm md:text-base text-cyan-400 font-bold">
              {totalFleetFuelSaved.toFixed(0)} Liter
            </strong>
          </div>

          <div className="p-2 rounded-lg bg-white/5 border border-white/5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Biaya Operasional</span>
            <strong className="text-sm md:text-base text-emerald-400 font-bold">
              Rp {(totalFleetCostSaved).toLocaleString('id-ID')}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
