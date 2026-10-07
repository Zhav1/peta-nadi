'use client';

import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Truck, 
  Building2, 
  SlidersHorizontal,
  CheckCircle2,
  Clock,
  TrendingDown,
  Layers,
  ArrowRight
} from 'lucide-react';
import type { CrisisState } from '@/lib/types';

interface SimulationSectionProps {
  crisisId?: string | null;
  selectedCrisis?: CrisisState | null;
  demoState?: Record<string, unknown> | null;
  onDeployActionPlan?: (params?: { agency: string; action: string }) => void;
}

export default function SimulationSection({ 
  selectedCrisis, 
  demoState,
  onDeployActionPlan 
}: SimulationSectionProps) {
  const [activeAgency, setActiveAgency] = useState<string>('BULOG');
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'warning' } | null>(null);

  // Scenario parameter sliders
  const [closureHours, setClosureHours] = useState<number>(12);
  const [cargoTonnage, setCargoTonnage] = useState<number>(20);
  const [dishubDiversion, setDishubDiversion] = useState<boolean>(true);
  const [bulogStockAlloc, setBulogStockAlloc] = useState<number>(75);
  const [bnpbRescueUnits, setBnpbRescueUnits] = useState<number>(12);

  const showToast = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Dynamic impact calculations based on simulation parameters
  const calculatedDelayMinutes = dishubDiversion 
    ? Math.round(25 + closureHours * 0.8) 
    : Math.round(90 + closureHours * 3.5);

  const calculatedPriceSpikePct = Math.max(
    1.5,
    Number(((closureHours * 0.6) - (bulogStockAlloc * 0.05)).toFixed(1))
  );

  const spoilageRiskPct = dishubDiversion
    ? Math.max(1.0, Number((closureHours * 0.25).toFixed(1)))
    : Math.min(45.0, Number((closureHours * 1.2).toFixed(1)));

  const handleDeploy = () => {
    const agencyName = activeAgency || 'Otoritas Gabungan';
    const actionDesc = `Alokasi Stok BULOG ${bulogStockAlloc}%, Rekayasa DISHUB ${dishubDiversion ? 'Aktif' : 'Non-Aktif'}, Unit BNPB ${bnpbRescueUnits} Tim`;
    
    showToast(`Rencana Mitigasi ${agencyName} Berhasil Diterapkan`, 'success');

    if (onDeployActionPlan) {
      onDeployActionPlan({ agency: agencyName, action: actionDesc });
    }
  };

  return (
    <div className="relative w-full min-h-full lg:h-full grid grid-cols-12 gap-6 pointer-events-auto">
      
      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[10000] px-5 py-2.5 rounded-lg bg-[#0c1017] border border-[#1c2432] shadow-xl flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="font-mono text-xs font-semibold text-white uppercase tracking-wider">
            {toast.message}
          </span>
        </div>
      )}

      {/* LEFT SECTION: Scenario Levers & Dynamic Calculated Impacts (8 Cols) */}
      <section className="col-span-12 lg:col-span-8 flex flex-col min-h-0 gap-4">
        
        {/* Scenario Overview Header */}
        <div className="grid grid-cols-12 gap-4 shrink-0">
          <div className="col-span-12 sm:col-span-6 bg-[#0c1017] border border-white/10 p-4 rounded-xl shadow-xl">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <p className="text-xs font-mono text-slate-300 uppercase font-medium">
                Skenario Disrupsi: {demoState && typeof demoState.stage === 'number' ? `Tahap ${demoState.stage}` : 'Aktif'}
              </p>
            </div>
            <h1 className="text-base font-bold text-white">
              {selectedCrisis?.title || 'Banjir Luapan & Disrupsi Jalur Logistik'}
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              {selectedCrisis?.region || 'Koridor Prioritas Sumatera'}
            </p>
          </div>

          <div className="col-span-6 sm:col-span-3 bg-[#0c1017] border border-white/10 p-4 rounded-xl shadow-xl">
            <p className="text-xs font-mono text-slate-400 mb-1">Armada Terdampak</p>
            <p className="text-xl font-mono font-bold text-white tabular-nums">~1.400 Unit</p>
            <p className="text-xs text-slate-400">Truk Logistik Harian</p>
          </div>

          <div className="col-span-6 sm:col-span-3 bg-[#0c1017] border border-white/10 p-4 rounded-xl shadow-xl">
            <p className="text-xs font-mono text-slate-400 mb-1">Waktu Estimasi Reroute</p>
            <p className="text-xl font-mono font-bold text-emerald-400 tabular-nums">+{calculatedDelayMinutes} Menit</p>
            <p className="text-xs text-slate-400">Via Tol / Jalur Alternatif</p>
          </div>
        </div>

        {/* Operational Levers & Impact Workspace */}
        <div className="flex-1 bg-[#0c1017] border border-white/10 rounded-xl p-5 flex flex-col min-h-0 shadow-xl gap-5 overflow-y-auto custom-scrollbar">
          
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-300" />
              <h2 className="text-xs font-semibold uppercase text-white tracking-wide">
                Parameter Rekayasa Skenario
              </h2>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/10 text-slate-300 border border-white/15">
              KALKULASI LANGSUNG
            </span>
          </div>

          {/* Scenario Levers Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Lever 1: Disruption Duration */}
            <div className="bg-[#121822] border border-[#1c2432] p-4 rounded-lg space-y-2.5">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-300">Estimasi Durasi Hambatan:</span>
                <span className="text-white font-bold tabular-nums">{closureHours} Jam</span>
              </div>
              <input 
                type="range" 
                min="2" 
                max="48" 
                value={closureHours}
                onChange={(e) => setClosureHours(Number(e.target.value))}
                className="w-full accent-white cursor-pointer"
              />
              <p className="text-xs text-slate-400">
                Lama penutupan ruas jalan arteri sebelum jalur dinyatakan aman dilalui.
              </p>
            </div>

            {/* Lever 2: Commodity Tonnage */}
            <div className="bg-[#121822] border border-[#1c2432] p-4 rounded-lg space-y-2.5">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-300">Muatan Komoditas Rentan:</span>
                <span className="text-white font-bold tabular-nums">{cargoTonnage} Ton</span>
              </div>
              <input 
                type="range" 
                min="5" 
                max="60" 
                value={cargoTonnage}
                onChange={(e) => setCargoTonnage(Number(e.target.value))}
                className="w-full accent-white cursor-pointer"
              />
              <p className="text-xs text-slate-400">
                Volume bahan pangan pokok (cabai merah, bawang, beras) dalam antrean koridor.
              </p>
            </div>

            {/* Lever 3: Bypass Highway Routing */}
            <div className="bg-[#121822] border border-[#1c2432] p-4 rounded-lg flex flex-col justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-white block">Pengalihan Tol / Koridor Alternatif</span>
                <p className="text-xs text-slate-400 mt-1">
                  Mengarahkan truk angkutan pangan langsung ke jalan tol untuk menghindari genangan air.
                </p>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                <span className="text-xs font-mono text-slate-400">Status Pengalihan:</span>
                <button
                  type="button"
                  onClick={() => setDishubDiversion(!dishubDiversion)}
                  className={`px-3 py-1.5 rounded text-xs font-medium font-mono transition-colors cursor-pointer ${
                    dishubDiversion
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[#0c1017] text-slate-400 border border-[#1c2432] hover:text-white'
                  }`}
                >
                  {dishubDiversion ? 'AKTIF (TOL BELMERA / MKTT)' : 'NON-AKTIF (JALUR BIASA)'}
                </button>
              </div>
            </div>

            {/* Lever 4: Emergency Buffer Allocation */}
            <div className="bg-[#121822] border border-[#1c2432] p-4 rounded-lg space-y-2.5">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-300">Buffer Stok Cadangan:</span>
                <span className="text-white font-bold tabular-nums">{bulogStockAlloc}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={bulogStockAlloc}
                onChange={(e) => setBulogStockAlloc(Number(e.target.value))}
                className="w-full accent-white cursor-pointer"
              />
              <p className="text-xs text-slate-400">
                Penyaluran cadangan pangan dari gudang terdekat guna menahan lonjakan harga.
              </p>
            </div>

          </div>

          {/* Direct Impact Readout Cards */}
          <div className="bg-[#121822] border border-white/10 rounded-lg p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase text-slate-200 tracking-wider">
              Proyeksi Dampak Berdasarkan Skenario
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3.5 rounded bg-[#0c1017] border border-white/10">
                <span className="text-xs font-mono text-slate-400 block mb-1">Perlambatan Bersih</span>
                <p className="text-xl font-mono font-bold text-white tabular-nums">+{calculatedDelayMinutes} Menit</p>
                <p className="text-xs text-slate-400 mt-1">
                  {dishubDiversion ? 'Terpangkas via pengalihan' : 'Antrean penuh tanpa rekayasa'}
                </p>
              </div>

              <div className="p-3.5 rounded bg-[#0c1017] border border-white/10">
                <span className="text-xs font-mono text-slate-400 block mb-1">Deviasi Harga Pasar</span>
                <p className={`text-xl font-mono font-bold tabular-nums ${calculatedPriceSpikePct > 10 ? 'text-rose-400' : 'text-amber-400'}`}>
                  +{calculatedPriceSpikePct}%
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Diredam buffer gudang regional
                </p>
              </div>

              <div className="p-3.5 rounded bg-[#0c1017] border border-white/10">
                <span className="text-xs font-mono text-slate-400 block mb-1">Risiko Kerusakan Kargo</span>
                <p className={`text-xl font-mono font-bold tabular-nums ${spoilageRiskPct > 15 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {spoilageRiskPct}%
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {dishubDiversion ? 'Batas aman terproteksi' : 'Waspada pembusukan'}
                </p>
              </div>
            </div>
          </div>

        </div>

      </section>

      {/* RIGHT SECTION: Multi-Department Agency Orchestration Board (4 Cols) */}
      <section className="col-span-12 lg:col-span-4 bg-[#0c1017] border border-[#1c2432] p-5 flex flex-col gap-4 overflow-y-auto no-scrollbar rounded-xl shadow-xl">
        
        <div className="flex items-center space-x-2 pb-2 border-b border-[#1c2432]">
          <Building2 className="w-4 h-4 text-slate-300" />
          <h2 className="font-semibold text-xs uppercase tracking-wider text-white">
            Koordinasi Antar-Lembaga
          </h2>
        </div>

        {/* Agency Selection Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#080d14] rounded-md border border-[#1c2432]">
          {(['BULOG', 'DISHUB', 'BNPB'] as const).map((agency) => (
            <button
              key={agency}
              onClick={() => setActiveAgency(agency)}
              className={`py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                activeAgency === agency 
                  ? 'bg-white text-[#080d14] shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {agency}
            </button>
          ))}
        </div>

        {/* Active Agency Parameters Panel */}
        <div className="space-y-4 flex-1">
          
          {/* BULOG Panel */}
          {activeAgency === 'BULOG' && (
            <div className="bg-[#121822] border border-[#1c2432] p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold uppercase text-white flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-emerald-400" /> BULOG (Logistik Pangan)
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">SIAP</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Manajemen Cadangan Beras & Minyak Goreng. Gudang regional di Medan & Tebing Tinggi siap dibuka.
              </p>
              
              <div className="space-y-1.5 pt-2 border-t border-white/5 font-mono text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Alokasi Buffer:</span>
                  <span className="text-white font-bold">{bulogStockAlloc}%</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Target Penyaluran:</span>
                  <span className="text-slate-200">Pasar Konsumen Utama</span>
                </div>
              </div>
            </div>
          )}

          {/* DISHUB Panel */}
          {activeAgency === 'DISHUB' && (
            <div className="bg-[#121822] border border-[#1c2432] p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold uppercase text-white flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-slate-300" /> DISHUB (Perhubungan)
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/10 text-slate-200 border border-white/20 font-medium">AKTIF</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Rekayasa Lalu Lintas & Prioritas Angkutan Pangan Pokok pada gerbang tol dan jalur arteri.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-white/5 font-mono text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Rekayasa Arus:</span>
                  <span className="text-emerald-400 font-bold">{dishubDiversion ? 'Aktif' : 'Non-Aktif'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Prioritas:</span>
                  <span className="text-slate-200">Truk Sembako & Pendingin</span>
                </div>
              </div>
            </div>
          )}

          {/* BNPB Panel */}
          {activeAgency === 'BNPB' && (
            <div className="bg-[#121822] border border-[#1c2432] p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold uppercase text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-400" /> BNPB / BPBD (Bencana)
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">SIAGA</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Penanganan Titik Genangan Air & Evakuasi Jalur Trans-Sumatera.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-white/5 font-mono text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Unit Reaksi Cepat:</span>
                  <span className="text-rose-400 font-bold">{bnpbRescueUnits} Tim</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Status Tanggul:</span>
                  <span className="text-slate-200">Pemantauan Pompa Air</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Action Trigger Button */}
        <button
          onClick={handleDeploy}
          className="mt-auto w-full py-2.5 bg-white hover:bg-slate-200 text-[#080d14] font-semibold text-xs uppercase tracking-wider rounded-md transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4 text-[#080d14]" /> Terapkan Skenario Terpadu
        </button>

      </section>

    </div>
  );
}
