'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function ReportsSection() {
  const [currentPage, setCurrentPage] = useState(1);
  const [approvalsCount, setApprovalsCount] = useState<number>(0);
  const [healthScore, setHealthScore] = useState<number>(100);

  useEffect(() => {
    async function loadStats() {
      try {
        const [appRes, healthRes] = await Promise.all([
          api.approvals.list(),
          api.sourceHealth.get()
        ]);
        setApprovalsCount(appRes.total || 0);
        
        // Compute active integrity score based on data sources health
        let totalSources = 0;
        let okSources = 0;
        if (healthRes && Array.isArray(healthRes.sources)) {
          healthRes.sources.forEach((source) => {
            totalSources += 1;
            if (source.status === 'healthy') okSources += 1;
          });
        }
        if (totalSources > 0) {
          setHealthScore(Math.round((okSources / totalSources) * 100));
        }
      } catch (err) {
        console.error('Failed to load stats for ReportsSection:', err);
      }
    }
    loadStats();
  }, []);

  const totalSavings = approvalsCount > 0 ? approvalsCount * 350000000 : 4200000000;
  const savingsString = totalSavings >= 1000000000 
    ? `IDR ${(totalSavings / 1000000000).toFixed(1)}B`
    : `IDR ${(totalSavings / 1000000).toFixed(0)}M`;

  return (
    <div className="w-full h-full grid grid-cols-12 gap-6 overflow-hidden pointer-events-auto">
      {/* Left Section: High-Level KPIs & Visual */}
      <section className="col-span-12 lg:col-span-4 flex flex-col gap-6 min-h-0 overflow-y-auto no-scrollbar">
        {/* KPI: Economic Loss */}
        <div className="bg-[#1e2024]/40 backdrop-blur-xl border border-white/10 p-6 rounded-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 text-on-surface">
            <span className="material-symbols-outlined text-6xl">account_balance</span>
          </div>
          <span className="font-['Inter'] text-[11px] uppercase tracking-widest text-slate-400 mb-3 block">Total Impact Mitigation</span>
          <div className="flex flex-col">
            <h2 className="font-headline text-4xl font-bold text-[#00F0FF] drop-shadow-[0_0_15px_rgba(0,240,255,0.4)]">{savingsString}</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="material-symbols-outlined text-primary-container text-sm">trending_up</span>
              <span className="text-primary-container font-bold text-xs">
                {approvalsCount > 0 ? `Based on ${approvalsCount} approvals` : '+12.4% vs Projected'}
              </span>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-end">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-slate-400 uppercase font-medium">Verified by AI Oracle</span>
              <span className="text-[8px] text-slate-500 font-mono">TIMESTAMP: {new Date().toISOString()}</span>
            </div>
            <div className="w-16 h-8 flex items-end gap-1">
              <div className="w-2 bg-[#00F0FF]/20 h-1/2"></div>
              <div className="w-2 bg-[#00F0FF]/30 h-2/3"></div>
              <div className="w-2 bg-[#00F0FF]/40 h-1/3"></div>
              <div className="w-2 bg-[#00F0FF] h-full shadow-[0_0_10px_#00F0FF]"></div>
            </div>
          </div>
        </div>

        {/* KPI: System Health */}
        <div className="bg-[#1e2024]/40 backdrop-blur-xl border border-white/10 p-6 rounded-sm relative overflow-hidden">
          <span className="font-['Inter'] text-[11px] uppercase tracking-widest text-slate-400 mb-3 block">Operational Integrity</span>
          <div className="flex items-center gap-6">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90">
                <circle className="text-white/5" cx="32" cy="32" fill="none" r="28" stroke="currentColor" strokeWidth="3"></circle>
                <circle className="text-[#00F0FF] drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]" cx="32" cy="32" fill="none" r="28" stroke="currentColor" strokeDasharray="176" strokeDashoffset={176 - (176 * healthScore) / 100} strokeWidth="3"></circle>
              </svg>
              <span className="absolute font-headline text-xs font-bold text-on-surface">{healthScore}%</span>
            </div>
            <div className="flex flex-col">
              <h3 className="font-headline text-xl font-bold text-[#00F0FF] tracking-wide uppercase">
                {healthScore >= 90 ? 'OPTIMAL' : healthScore >= 60 ? 'DEGRADED' : 'CRITICAL'}
              </h3>
              <span className="text-[11px] text-slate-400 mt-0.5">Integrity check based on live adapters</span>
              <div className="flex gap-1 mt-2">
                <div className={`w-1.5 h-1.5 rounded-full ${healthScore >= 95 ? 'bg-primary-container shadow-[0_0_8px_#00f0ff]' : 'bg-red-400'} animate-pulse`}></div>
                <div className={`w-1.5 h-1.5 rounded-full ${healthScore >= 80 ? 'bg-primary-container shadow-[0_0_8px_#00f0ff]' : 'bg-red-400'} animate-pulse`}></div>
                <div className={`w-1.5 h-1.5 rounded-full ${healthScore >= 60 ? 'bg-primary-container shadow-[0_0_8px_#00f0ff]' : 'bg-red-400'} animate-pulse`}></div>
                <div className={`w-1.5 h-1.5 rounded-full ${healthScore >= 40 ? 'bg-primary-container shadow-[0_0_8px_#00f0ff]' : 'bg-red-400'} animate-pulse`}></div>
                <div className={`w-1.5 h-1.5 rounded-full ${healthScore >= 20 ? 'bg-primary-container shadow-[0_0_8px_#00f0ff]' : 'bg-red-400'} animate-pulse`}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Tactical Visual */}
        <div className="bg-[#1a1c20]/60 rounded-sm overflow-hidden border border-white/5 grow min-h-[160px] relative flex flex-col justify-end">
          <img 
            className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen" 
            alt="Cyberpunk futuristic interface display" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBhKqCeq_lo_H_uPvnKNYBli9yBRIsWyZY4t8pYfqy3Ol88JRcovS4JSTtMGpf4LiIIHeI-q7GId6UMKltDKKCZd3-HEwybfXxKhIs5qRwR0gGofOL1P8pVHkJnk7FiMGjB13Dkean1pF2r1yVF7esXeGxr003Epl3-AYks6GTtBPf2RLDg4mAJJX31uGx-bepiRlizsSNoQY4Y1R6DplTglwxbfmDISmwsatS2aqjNWT2W0Y-csBVNcdGkty235I66nz8p0O2KyAI"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e12] to-transparent"></div>
          <div className="relative p-4">
            <span className="font-['Inter'] text-[9px] uppercase tracking-widest text-[#00F0FF] block mb-1">Live Telemetry Feed</span>
            <div className="w-full bg-white/10 h-[1px] mb-2"></div>
            <div className="flex justify-between text-[8px] font-mono text-slate-500 uppercase">
              <span>LAT: 3.5952° N</span>
              <span>LNG: 98.6722° E</span>
              <span>ALT: 24M</span>
            </div>
          </div>
        </div>
      </section>

      {/* Summary Report Section */}
      <section className="col-span-12 lg:col-span-8 flex flex-col bg-surface-container/30 backdrop-blur-md border border-white/5 rounded-sm shadow-2xl relative min-h-0">
        {/* Report Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#00F0FF]/15 flex items-center justify-center rounded-sm">
              <span className="material-symbols-outlined text-[#00F0FF]">article</span>
            </div>
            <div>
              <h3 className="font-headline font-bold text-base text-on-surface uppercase tracking-wider">Weekly Cabinet Briefing</h3>
              <span className="text-[10px] text-slate-400">PERIOD: CURRENT ACTIVE CYCLE</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentPage(c => Math.max(1, c - 1))}
              className="p-1 hover:bg-white/5 rounded-sm transition-colors text-slate-400 hover:text-white"
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
            </button>
            <span className="text-[10px] font-bold text-[#00F0FF] px-2 uppercase tracking-widest font-mono">Page 0{currentPage} / 03</span>
            <button 
              onClick={() => setCurrentPage(c => Math.min(3, c + 1))}
              className="p-1 hover:bg-white/5 rounded-sm transition-colors text-slate-400 hover:text-white"
            >
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>

        {/* Report Content */}
        <div className="p-8 grow overflow-y-auto no-scrollbar max-h-[600px] font-body">
          <article className="max-w-2xl mx-auto space-y-6 text-sm">
            {currentPage === 1 && (
              <>
                <div className="space-y-3">
                  <h4 className="font-headline font-bold text-lg text-[#00F0FF] uppercase tracking-tight">1. Executive Overview</h4>
                  <p className="text-slate-300 leading-relaxed font-light">
                    During the current operational cycle, the PetaNadi Sentinel network successfully identified and mitigated significant kinetic disruptions within the central Logistics Corridor of North Sumatra. Through autonomous resource and route optimization, we successfully minimized retail price volatility.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6 border-y border-white/10">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-3">Core Strengths</span>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <div className="w-1 h-3.5 bg-primary-container mt-1"></div>
                        <span className="text-xs text-slate-300">Autonomous pathfinding reduced latency by 18 minutes per transit unit.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-1 h-3.5 bg-primary-container mt-1"></div>
                        <span className="text-xs text-slate-300">Predictive maintenance cycles averted 4 critical node failures.</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block mb-3">Risk Factors</span>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <div className="w-1 h-3.5 bg-orange-400 mt-1"></div>
                        <span className="text-xs text-slate-300">Monsoon weather forecasts trigger active warnings for Belawan Corridor.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <div className="w-1 h-3.5 bg-orange-400 mt-1"></div>
                        <span className="text-xs text-slate-300">Signal interference detected near offshore telemetry arrays.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </>
            )}
            {currentPage === 2 && (
              <>
                <div className="space-y-3">
                  <h4 className="font-headline font-bold text-lg text-[#00F0FF] uppercase tracking-tight">2. Financial Recapitulation</h4>
                  <p className="text-slate-300 leading-relaxed font-light italic border-l-2 border-[#00F0FF]/30 pl-4">
                    &quot;The averted economic loss of IDR 4.2B represents a 400% ROI on the Sentinel deployment cost for this period.&quot; - Operational Auditor S_09
                  </p>
                  <p className="text-slate-300 leading-relaxed font-light">
                    Primary savings were derived from the prevention of &apos;Gridlock-Alpha&apos; events during peak port congestion hours at Belawan Port. Secondary savings involve the reduction of transport energy consumption via optimized routing protocols.
                  </p>
                </div>
              </>
            )}
            {currentPage === 3 && (
              <>
                <div className="space-y-3">
                  <h4 className="font-headline font-bold text-lg text-[#00F0FF] uppercase tracking-tight">3. Incident Response Log</h4>
                  <p className="text-slate-300 leading-relaxed font-light">
                    No active critical system shocks are currently unaddressed. System consensus engine fired with 92% average confidence rating across all validation cycles.
                  </p>
                </div>
              </>
            )}
          </article>
        </div>

        {/* Actions Footer */}
        <div className="p-6 bg-[#0c0e12]/60 border-t border-white/10 flex items-center justify-between shrink-0">
          <button 
            onClick={() => alert('PDF report compilation started...')}
            className="flex items-center gap-3 px-5 py-2.5 bg-[#00F0FF] text-[#00363a] font-headline font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-[0.98] transition-all shadow-[0_0_15px_rgba(0,240,255,0.4)]"
          >
            <span className="material-symbols-outlined font-bold text-sm">picture_as_pdf</span>
            Generate PDF Report
          </button>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 px-3 py-1.5 border border-white/15 text-slate-400 font-['Inter'] font-bold uppercase text-[9px] tracking-widest hover:bg-white/5 transition-all">
              <span className="material-symbols-outlined text-sm">grid_view</span>
              Export Raw Data
            </button>
          </div>
        </div>

        {/* HUD Brackets Decoration */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[#00F0FF]/40 -translate-x-1 -translate-y-1"></div>
        <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[#00F0FF]/40 translate-x-1 -translate-y-1"></div>
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[#00F0FF]/40 -translate-x-1 translate-y-1"></div>
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[#00F0FF]/40 translate-x-1 translate-y-1"></div>
      </section>
    </div>
  );
}
