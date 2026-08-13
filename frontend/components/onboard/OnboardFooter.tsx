'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export default function OnboardFooter() {
  return (
    <footer className="relative w-full bg-[#080d14] py-20 px-4 md:px-8 border-t border-white/10 overflow-hidden">
      <div className="max-w-7xl mx-auto flex flex-col gap-16">
        
        {/* Top Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 text-slate-400 text-sm">
          {/* Col 1: About */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo_petanadi.png" alt="PetaNadi" className="w-8 h-8 object-contain" />
              <div className="text-white font-bold text-lg">PetaNadi (LRIP)</div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Platform Intelijen Krisis Logistik Nasional Multi-Sensor. Menjaga ketahanan pangan dan kelancaran distribusi logistik koridor strategis.
            </p>
          </div>

          {/* Col 2: Navigation */}
          <div className="flex flex-col gap-3">
            <div className="text-white font-semibold text-xs font-mono uppercase tracking-wider">
              Quick Routes
            </div>
            <Link href="/dashboard" className="hover:text-cyan-400 transition-colors flex items-center gap-1">
              <span>4D Command Center</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
            <Link href="/demo-remote" className="hover:text-cyan-400 transition-colors flex items-center gap-1">
              <span>Mobile Presenter Remote</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Col 3: Stack */}
          <div className="flex flex-col gap-3">
            <div className="text-white font-semibold text-xs font-mono uppercase tracking-wider">
              Core Tech Stack
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-mono">
              <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-slate-300">Next.js 14</span>
              <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-slate-300">Mapbox v3</span>
              <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-slate-300">Deck.gl v9.3</span>
              <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-slate-300">NVIDIA cuOpt</span>
              <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-slate-300">LangGraph</span>
              <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-slate-300">Supabase</span>
            </div>
          </div>

          {/* Col 4: Status */}
          <div className="flex flex-col gap-3">
            <div className="text-white font-semibold text-xs font-mono uppercase tracking-wider">
              Deployment Status
            </div>
            <div className="text-xs text-slate-300 leading-relaxed font-mono">
              Milestone 1 — Hackathon MVP<br />
              Corridor: North Sumatra (Medan - Belawan - Tebing Tinggi)
            </div>
          </div>
        </div>

        {/* Google Labs Style Massive Typography Footer */}
        <div className="w-full flex items-center justify-center pt-8 border-t border-white/5">
          <h2 className="text-[14vw] font-black text-white/10 tracking-tighter leading-none select-none uppercase font-mono">
            PetaNadi
          </h2>
        </div>

        {/* Bottom Copyright */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-slate-500 pt-4">
          <span>&copy; 2026 PetaNadi Team. All rights reserved.</span>
          <span>Anti-AI-Slop &bull; Glassmorphism 2.0 &bull; 60 FPS Canvas</span>
        </div>

      </div>
    </footer>
  );
}
