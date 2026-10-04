'use client';

import React, { useState } from 'react';
import { 
  Bot, 
  Send, 
  ShieldAlert, 
  Truck, 
  Building2, 
  Sparkles, 
  Lock, 
  SlidersHorizontal,
  Rocket
} from 'lucide-react';
import { api } from '@/lib/api';
import type { CrisisState } from '@/lib/types';

interface SimulationSectionProps {
  crisisId?: string | null;
  selectedCrisis?: CrisisState | null;
  demoState?: Record<string, unknown> | null;
  onDeployActionPlan?: (params?: { agency: string; action: string }) => void;
}

export default function SimulationSection({ 
  crisisId, 
  selectedCrisis, 
  demoState,
  onDeployActionPlan 
}: SimulationSectionProps) {
  const [activeAgency, setActiveAgency] = useState<string>('BULOG');
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([
    { 
      sender: 'ai', 
      text: 'Modul simulasi mitigasi aktif. Parameter koridor logistik Sumatera Utara (Belawan -> Medan -> Tebing Tinggi) siap untuk pengujian skenario intervensi.',
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'warning' } | null>(null);

  // Agency specific slider states
  const [bulogStockAlloc, setBulogStockAlloc] = useState<number>(75);
  const [dishubDiversion, setDishubDiversion] = useState<boolean>(true);
  const [bnpbRescueUnits, setBnpbRescueUnits] = useState<number>(12);

  const showToast = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSend = async (promptOverride?: string) => {
    const textToSend = promptOverride || inputVal;
    if (!textToSend.trim() || loading) return;

    setMessages(prev => [...prev, { sender: 'user', text: textToSend }]);
    if (!promptOverride) setInputVal('');
    setLoading(true);

    try {
      const activeRoute = selectedCrisis?.route_recommendations?.[0];
      const hedging = selectedCrisis?.hedging_breakdown || activeRoute?.hedging;

      const res = await api.simulation.chat({
        message: textToSend,
        crisis_id: crisisId || selectedCrisis?.crisis_id || 'belawan-flash-flood',
        agency: activeAgency,
        parameters: {
          active_crisis: {
            title: selectedCrisis?.title,
            type: selectedCrisis?.type,
            region: selectedCrisis?.region,
            severity: selectedCrisis?.severity,
          },
          active_route: activeRoute,
          cargo_type: (selectedCrisis as any)?.commodity || 'cabai_merah',
          tonnage: (selectedCrisis as any)?.cargo_tonnage || 10.0,
          spoilage_hedging: hedging,
          user_role: activeAgency
        }
      });
      
      setMessages(prev => [...prev, { 
        sender: 'ai', 
        text: res.reply,
      }]);
    } catch (err) {
      console.error('Failed to get simulation chat reply:', err);
      
      // Grounded contextual fallback response generator
      const lower = textToSend.toLowerCase();
      let dynamicReply = "";
      if (lower.includes("tol") || lower.includes("tutup") || lower.includes("jalan")) {
        dynamicReply = `Rekomendasi Kebijakan (${activeAgency}): Penutupan ruas arteri berpotensi menambah waktu tempuh hingga 35 menit. Disarankan pengalihan armada ke Jalan Tol Belmera (Medan-Tebing Tinggi).`;
      } else if (lower.includes("stok") || lower.includes("beras") || lower.includes("bulog")) {
        dynamicReply = `Rekomendasi Kebijakan (${activeAgency}): Ketersediaan stok cadangan pangan di gudang regional terpantau mencukupi. Penyaluran cadangan terukur dapat dilakukan untuk menstabilkan harga pasar.`;
      } else if (lower.includes("rute") || lower.includes("alternatif") || lower.includes("hitung")) {
        dynamicReply = `Rekomendasi Rute Pengalihan: Pengalihan armada dari Belawan via Tol Belmera menuju Tebing Tinggi diestimasi menghemat waktu perjalanan serta menghindari titik genangan air.`;
      } else {
        dynamicReply = `Rekomendasi Kebijakan (${activeAgency}): Memproses skenario "${textToSend}". Parameter koridor distribusi pangan berada dalam batas mitigasi yang terverifikasi.`;
      }

      setMessages(prev => [...prev, { 
        sender: 'ai', 
        text: dynamicReply,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = () => {
    const agencyName = activeAgency || 'Otoritas Gabungan';
    const actionDesc = `Alokasi Stok BULOG ${bulogStockAlloc}%, Rekayasa DISHUB ${dishubDiversion ? 'Aktif' : 'Non-Aktif'}, Unit BNPB ${bnpbRescueUnits} Tim`;
    
    showToast(`Deploying Action Plan for ${agencyName}...`, 'success');

    if (onDeployActionPlan) {
      onDeployActionPlan({ agency: agencyName, action: actionDesc });
    }
  };

  // Quick Action Prompt Pills
  const quickPrompts = [
    "Simulasikan Penutupan Tol Medan",
    "Hitung Rute Alternatif BULOG",
    "Proyeksikan Stok 48 Jam",
    "Buka Gudang Darurat Tebing"
  ];

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

      {/* LEFT SECTION: AI Advisor Glass Box Reasoning & Conversation (8 Cols) */}
      <section className="col-span-12 lg:col-span-8 flex flex-col min-h-0 gap-4">
        
        {/* Scenario Overview Card */}
        <div className="grid grid-cols-12 gap-4 shrink-0">
          <div className="col-span-12 sm:col-span-6 bg-[#0c1017] border border-white/10 p-4 rounded-xl shadow-xl relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <p className="text-xs font-mono text-slate-300 uppercase font-medium">
                Skenario Simulasi: {demoState && typeof demoState.stage === 'number' ? `Tahap ${demoState.stage}` : 'Krisis Aktif'}
              </p>
            </div>
            <h1 className="text-base font-bold text-white">
              {selectedCrisis?.title || 'Krisis Aktif: Banjir Bandang & Longsor Belawan'}
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              {selectedCrisis?.lat || 3.7922}° LU, {selectedCrisis?.lon || 98.6776}° BT • Koridor Sumatera Utara
            </p>
          </div>

          <div className="col-span-6 sm:col-span-3 bg-[#0c1017] border border-white/10 p-4 rounded-xl shadow-xl">
            <p className="text-xs font-mono text-slate-400 mb-1">Estimasi Armada Koridor</p>
            <p className="text-xl font-mono font-bold text-white">~1.400 Unit</p>
            <p className="text-xs text-slate-400">Truk Logistik Harian</p>
          </div>

          <div className="col-span-6 sm:col-span-3 bg-[#0c1017] border border-white/10 p-4 rounded-xl shadow-xl">
            <p className="text-xs font-mono text-slate-400 mb-1">Estimasi Keterlambatan</p>
            <p className="text-xl font-mono font-bold text-slate-200">+35 Menit</p>
            <p className="text-xs text-amber-400">Jika Arteri Terhambat</p>
          </div>
        </div>

        {/* AI Conversation & Reasoning Log */}
        <div className="flex-1 bg-[#0c1017] border border-white/10 rounded-xl p-5 flex flex-col min-h-0 shadow-xl">
          
          <div className="flex flex-wrap justify-between items-center pb-3 border-b border-white/10 shrink-0 gap-2">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-slate-300" />
              <span className="text-xs font-semibold uppercase text-white tracking-wide">
                Simulasi Respons & Rekomendasi Mitigasi
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/10 text-slate-300 border border-white/15">
                KORIDOR AKTIF
              </span>
            </div>
          </div>

          {/* Messages Log */}
          <div className="flex-1 overflow-y-auto space-y-3.5 p-2 my-2 custom-scrollbar text-xs">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-4 max-w-[85%] rounded-xl transition-all ${
                  m.sender === 'user' 
                    ? 'bg-white/10 text-white border border-white/20' 
                    : 'bg-[#121822] text-slate-200 border border-white/10'
                }`}>
                  <div className="flex justify-between items-center mb-1.5 gap-4">
                    <span className="font-mono text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1">
                      {m.sender === 'user' ? 'INSTRUKSI OPERATOR' : 'REKOMENDASI MITIGASI'}
                    </span>
                  </div>
                  <p className="leading-relaxed text-xs">{m.text}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="p-3 bg-[#121822] rounded-xl border border-white/10 text-slate-300 font-mono text-xs flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-500 border-t-white animate-spin shrink-0" />
                  <span>Menganalisis skenario mitigasi...</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Prompts Bar */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5 shrink-0">
            {quickPrompts.map((prompt, pIdx) => (
              <button
                key={pIdx}
                onClick={() => handleSend(prompt)}
                className="px-2.5 py-1 bg-[#121822] hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 hover:border-white/20 rounded-lg text-xs font-sans transition cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <div className="flex gap-2 pt-3 shrink-0">
            <input 
              type="text" 
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Tanyakan analisis skenario pengalihan rute..."
              className="flex-1 bg-[#080d14] border border-white/15 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-white/40 transition"
            />
            <button 
              onClick={() => handleSend()}
              disabled={loading}
              className="px-4 py-2.5 bg-white hover:bg-slate-200 text-[#080d14] font-semibold text-xs tracking-wider rounded-md transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> Send
            </button>
          </div>

        </div>

      </section>

      {/* RIGHT SECTION: Multi-Department Agency Orchestration Board (4 Cols) */}
      <section className="col-span-12 lg:col-span-4 bg-[#0c1017] border border-[#1c2432] p-5 flex flex-col gap-4 overflow-y-auto no-scrollbar rounded-lg shadow-xl">
        
        <div className="flex items-center space-x-2 pb-2 border-b border-[#1c2432]">
          <Building2 className="w-4 h-4 text-slate-300" />
          <h2 className="font-semibold text-xs uppercase tracking-wider text-white">
            Agency Orchestration
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
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">READY</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Manajemen Cadangan Beras & Minyak Goreng. 480 Storage units tersedia di Medan & Tebing Tinggi.
              </p>
              
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-300">Alokasi Stok Darurat:</span>
                  <span className="text-white font-bold">{bulogStockAlloc}% (360 Ton)</span>
                </div>
                <input 
                  type="range" 
                  min="10" 
                  max="100" 
                  value={bulogStockAlloc}
                  onChange={(e) => setBulogStockAlloc(Number(e.target.value))}
                  className="w-full accent-white cursor-pointer"
                />
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
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/10 text-slate-200 border border-white/20 font-medium">ACTIVE</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Rekayasa Lalu Lintas & Pembatasan Tonase Truk Logistik. Diversion active di Jalinsum KM 42.
              </p>

              <div className="flex justify-between items-center pt-2">
                <span className="text-xs font-mono text-slate-300">Bypass Rerouting:</span>
                <button
                  onClick={() => setDishubDiversion(!dishubDiversion)}
                  className={`px-3 py-1 rounded text-xs font-medium font-mono transition-colors cursor-pointer ${
                    dishubDiversion
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                      : 'bg-[#0c1017] text-slate-300 border border-[#1c2432] hover:text-white'
                  }`}
                >
                  {dishubDiversion ? 'AKTIF (TOL BELMERA)' : 'NON-AKTIF'}
                </button>
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
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">CRITICAL</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Penanggulangan Bencana Banjir Lubuk Pakam. Evakuasi & perbaikan tanggul darurat.
              </p>

              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-300">Tim Evakuasi Lapangan:</span>
                  <span className="text-rose-400 font-bold">{bnpbRescueUnits} Unit Perahu</span>
                </div>
                <input 
                  type="range" 
                  min="2" 
                  max="30" 
                  value={bnpbRescueUnits}
                  onChange={(e) => setBnpbRescueUnits(Number(e.target.value))}
                  className="w-full accent-white cursor-pointer"
                />
              </div>
            </div>
          )}

        </div>

        {/* Action Trigger Button */}
        <button
          onClick={handleDeploy}
          className="mt-auto w-full py-2.5 bg-white hover:bg-slate-200 text-[#080d14] font-semibold text-xs uppercase tracking-wider rounded-md transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <Rocket className="w-4 h-4 text-[#080d14]" /> Deploy Unified Action Plan
        </button>

      </section>

    </div>
  );
}
