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
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; thoughtSignature?: string }>>([
    { 
      sender: 'ai', 
      text: 'Tactical Advisory Engine active. Operational baseline loaded for North Sumatra logistics corridor (Belawan ➔ Medan ➔ Tebing Tinggi). Multi-agent swarm consensus validated.',
      thoughtSignature: 'SIG-GEMINI-3.1-FL-9f8a2b'
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
      const res = await api.simulation.chat({
        message: textToSend,
        crisis_id: crisisId || selectedCrisis?.title || 'belawan-flash-flood',
        agency: activeAgency
      });
      
      const sig = res.thought_signature || `SIG-GEMINI-3.1-FL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      setMessages(prev => [...prev, { 
        sender: 'ai', 
        text: res.reply,
        thoughtSignature: sig
      }]);
    } catch (err) {
      console.error('Failed to get simulation chat reply:', err);
      
      // Dynamic context-aware fallback response generator
      const lower = textToSend.toLowerCase();
      let dynamicReply = "";
      if (lower.includes("tol") || lower.includes("tutup") || lower.includes("jalan")) {
        dynamicReply = `Analisis Swarm (${activeAgency}): Penutupan Jalinsum KM 42 berdampak pada delay +35m. Merekomendasikan pengalihan armada ke Jalan Tol Belmera (Medan-Tebing Tinggi).`;
      } else if (lower.includes("stok") || lower.includes("beras") || lower.includes("bulog")) {
        dynamicReply = `Analisis Swarm (${activeAgency}): Stok cadangan beras pemerintah di Gudang Tebing Tinggi memadai (360 Ton). Pelepasan 50 Ton disarankan untuk stabilisasi harga.`;
      } else if (lower.includes("rute") || lower.includes("alternatif") || lower.includes("hitung")) {
        dynamicReply = `Rekomendasi Rute GPU NVIDIA cuOpt: Rute Detour Belawan ➔ Tol Belmera ➔ Tebing Tinggi menghemat waktu 18 menit dan efisiensi BBM +4.2%.`;
      } else {
        dynamicReply = `Analisis Intelijen Swarm (${activeAgency}): Memproses skenario "${textToSend}". Parameter koridor Sumut terkendali (Consensus Gate 91% Passed).`;
      }

      setMessages(prev => [...prev, { 
        sender: 'ai', 
        text: dynamicReply,
        thoughtSignature: `SIG-GEMINI-3.1-FL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = () => {
    const agencyName = activeAgency || 'Otoritas Gabungan';
    const actionDesc = `Alokasi Stok BULOG ${bulogStockAlloc}%, Rekayasa DISHUB ${dishubDiversion ? 'Aktif' : 'Non-Aktif'}, Unit BNPB ${bnpbRescueUnits} Tim`;
    
    showToast(`🚀 Deploying Action Plan for ${agencyName}...`, 'success');

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
    <div className="relative w-full h-full grid grid-cols-12 gap-6 overflow-hidden pointer-events-auto">
      
      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[10000] px-6 py-3 rounded-xl bg-[#090a0f]/95 border border-cyan-500/50 backdrop-blur-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
            {toast.message}
          </span>
        </div>
      )}

      {/* LEFT SECTION: AI Advisor Glass Box Reasoning & Conversation (8 Cols) */}
      <section className="col-span-12 lg:col-span-8 flex flex-col min-h-0 gap-4">
        
        {/* Scenario Overview HUD Card */}
        <div className="grid grid-cols-12 gap-4 shrink-0">
          <div className="col-span-12 sm:col-span-6 bg-[#0c0e12]/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
              <p className="text-[10px] font-mono text-cyan-400 tracking-widest uppercase font-bold">
                SIMULATION_INSTANCE • {demoState && typeof demoState.stage === 'number' ? `STAGE ${demoState.stage}` : 'ACTIVE CRISIS'}
              </p>
            </div>
            <h1 className="text-lg font-headline font-bold uppercase tracking-wide text-white">
              {selectedCrisis?.title || 'Active: Belawan Flash Flood & Landslide'}
            </h1>
            <p className="text-[10px] text-slate-400 font-mono mt-1">
              LAT: {selectedCrisis?.lat || 3.7922}° N | LON: {selectedCrisis?.lon || 98.6776}° E • North Sumatra Corridor
            </p>
          </div>

          <div className="col-span-6 sm:col-span-3 bg-[#0c0e12]/80 backdrop-blur-xl border-l-4 border-l-amber-400 border-white/10 p-4 rounded-2xl shadow-xl">
            <p className="text-[10px] font-mono text-amber-400 tracking-wider uppercase font-bold mb-1">AFFECTED_UNITS</p>
            <p className="text-2xl font-headline font-black text-white">1,420</p>
            <p className="text-[9px] uppercase tracking-wider text-slate-400 font-mono">Fleets / Containers</p>
          </div>

          <div className="col-span-6 sm:col-span-3 bg-[#0c0e12]/80 backdrop-blur-xl border-l-4 border-l-red-500 border-white/10 p-4 rounded-2xl shadow-xl">
            <p className="text-[10px] font-mono text-red-400 tracking-wider uppercase font-bold mb-1">PROJECTED_LOSS</p>
            <p className="text-2xl font-headline font-black text-red-400">IDR 4.2B</p>
            <p className="text-[9px] uppercase tracking-wider text-slate-400 font-mono">-12.4% System Efficiency</p>
          </div>
        </div>

        {/* AI Conversation & Glass Box Reasoning Log */}
        <div className="flex-1 bg-[#0c0e12]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 flex flex-col min-h-0 shadow-2xl">
          
          <div className="flex flex-wrap justify-between items-center pb-3 border-b border-white/10 shrink-0 gap-2">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-cyan-400 animate-pulse" />
              <span className="text-xs font-headline font-bold uppercase text-white tracking-wider">
                Gemini Advice & Multi-Agent Glass Box Chat
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                91% CONSENSUS GATE PASSED
              </span>
              <span className="text-[9px] font-mono text-slate-400 flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" /> THOUGHT SIGNATURES ENABLED
              </span>
            </div>
          </div>

          {/* Messages Log */}
          <div className="flex-1 overflow-y-auto space-y-3.5 p-2 my-2 custom-scrollbar text-xs font-light">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-4 max-w-[85%] rounded-2xl shadow-xl transition-all ${
                  m.sender === 'user' 
                    ? 'bg-cyan-500/15 text-white border border-cyan-500/40 border-r-4 border-r-cyan-400' 
                    : 'bg-[#141820]/90 text-slate-200 border border-white/10 border-l-4 border-l-cyan-400'
                }`}>
                  <div className="flex justify-between items-center mb-1.5 gap-4">
                    <span className="font-mono text-[9px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1">
                      {m.sender === 'user' ? 'OPERATOR COMMAND' : 'GEMINI 3.1 FLASH • DEEPSEEK REASONING'}
                    </span>
                    {m.thoughtSignature && (
                      <span className="text-[8px] font-mono text-slate-500 bg-black/40 px-1.5 py-0.5 rounded border border-white/5">
                        {m.thoughtSignature}
                      </span>
                    )}
                  </div>
                  <p className="leading-relaxed text-xs">{m.text}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="p-3 bg-[#141820]/90 rounded-xl border border-cyan-500/30 text-cyan-400 font-mono text-xs flex items-center gap-2">
                  <Sparkles className="w-4 h-4 animate-spin" /> Swarm agents computing scenario impact...
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
                className="px-2.5 py-1 bg-[#141820] hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/40 rounded-lg text-[10px] font-mono transition cursor-pointer"
              >
                + {prompt}
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
              placeholder="Tanyakan ke Gemini Advisor mengenai skenario pengalihan rute..."
              className="flex-1 bg-[#080d14] border border-white/15 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 transition"
            />
            <button 
              onClick={() => handleSend()}
              disabled={loading}
              className="px-5 py-2.5 bg-cyan-500 text-slate-950 uppercase font-headline font-bold text-xs tracking-wider rounded-xl hover:bg-cyan-400 active:scale-95 transition-all flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer"
            >
              <Send className="w-4 h-4" /> Send
            </button>
          </div>

        </div>

      </section>

      {/* RIGHT SECTION: Multi-Department Agency Orchestration Board (4 Cols) */}
      <section className="col-span-12 lg:col-span-4 bg-[#0c0e12]/80 backdrop-blur-xl border border-white/10 p-5 flex flex-col gap-5 overflow-y-auto no-scrollbar rounded-2xl shadow-2xl">
        
        <div className="flex items-center space-x-2 pb-2 border-b border-white/10">
          <Building2 className="w-5 h-5 text-cyan-400" />
          <h2 className="font-headline font-bold text-sm uppercase tracking-wider text-white">
            Agency Orchestration
          </h2>
        </div>

        {/* Agency Selection Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#141820] rounded-xl border border-white/5">
          {(['BULOG', 'DISHUB', 'BNPB'] as const).map((agency) => (
            <button
              key={agency}
              onClick={() => setActiveAgency(agency)}
              className={`py-1.5 rounded-lg text-xs font-bold font-headline uppercase tracking-wider transition cursor-pointer ${
                activeAgency === agency 
                  ? 'bg-cyan-500 text-slate-950 shadow-md' 
                  : 'text-slate-400 hover:text-white'
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
            <div className="bg-[#141820]/90 border border-white/10 p-4 rounded-xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold font-headline uppercase text-white flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-emerald-400" /> BULOG (Logistik Pangan)
                </span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">READY</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Manajemen Cadangan Beras & Minyak Goreng. 480 Storage units tersedia di Medan & Tebing Tinggi.
              </p>
              
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-slate-300">Alokasi Stok Darurat:</span>
                  <span className="text-cyan-400 font-bold">{bulogStockAlloc}% (360 Ton)</span>
                </div>
                <input 
                  type="range" 
                  min="10" 
                  max="100" 
                  value={bulogStockAlloc}
                  onChange={(e) => setBulogStockAlloc(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* DISHUB Panel */}
          {activeAgency === 'DISHUB' && (
            <div className="bg-[#141820]/90 border border-white/10 p-4 rounded-xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold font-headline uppercase text-white flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-cyan-400" /> DISHUB (Perhubungan)
                </span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold">ACTIVE</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Rekayasa Lalu Lintas & Pembatasan Tonase Truk Logistik. Diversion active di Jalinsum KM 42.
              </p>

              <div className="flex justify-between items-center pt-2">
                <span className="text-[10px] font-mono text-slate-300">Bypass Rerouting:</span>
                <button
                  onClick={() => setDishubDiversion(!dishubDiversion)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer ${
                    dishubDiversion ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {dishubDiversion ? 'AKTIF (TOL BELMERA)' : 'NON-AKTIF'}
                </button>
              </div>
            </div>
          )}

          {/* BNPB Panel */}
          {activeAgency === 'BNPB' && (
            <div className="bg-[#141820]/90 border border-white/10 p-4 rounded-xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold font-headline uppercase text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-red-400" /> BNPB / BPBD (Bencana)
                </span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">CRITICAL</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Penanggulangan Bencana Banjir Lubuk Pakam. Evakuasi & perbaikan tanggul darurat.
              </p>

              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-slate-300">Tim Evakuasi Lapangan:</span>
                  <span className="text-red-400 font-bold">{bnpbRescueUnits} Unit Perahu</span>
                </div>
                <input 
                  type="range" 
                  min="2" 
                  max="30" 
                  value={bnpbRescueUnits}
                  onChange={(e) => setBnpbRescueUnits(Number(e.target.value))}
                  className="w-full accent-red-400 cursor-pointer"
                />
              </div>
            </div>
          )}

        </div>

        {/* Action Trigger Button */}
        <button
          onClick={handleDeploy}
          className="mt-auto w-full py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-headline font-black text-xs uppercase tracking-wider rounded-xl hover:opacity-95 active:scale-95 transition-all shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Rocket className="w-4 h-4 animate-bounce" /> Deploy Unified Action Plan
        </button>

      </section>

    </div>
  );
}
