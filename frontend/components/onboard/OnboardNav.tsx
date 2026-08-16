'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function OnboardNav() {
  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-xl bg-[#080d14]/80 border-b border-white/10 transition-all">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-20 flex items-center justify-between gap-4">
        
        {/* Brand Logo & Status */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative w-10 h-10 rounded-xl bg-[#080d14] border border-emerald-500/30 p-1 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
            <img src="/logo_prehub.png" alt="PreHub Logo" className="w-8 h-8 object-contain" />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                PreHub
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/30">
                4D
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>SYSTEM ONLINE</span>
            </div>
          </div>
        </Link>

        {/* Quick Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          <a href="#features" className="hover:text-cyan-400 transition-colors cursor-pointer">
            Capabilities
          </a>
          <a href="#architecture" className="hover:text-cyan-400 transition-colors cursor-pointer">
            Architecture
          </a>
          <a href="#telemetry" className="hover:text-cyan-400 transition-colors cursor-pointer">
            Data Streams
          </a>
        </nav>

        {/* CTA Launch Button */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all cursor-pointer group"
        >
          <span>Launch Dashboard</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Link>

      </div>
    </header>
  );
}
