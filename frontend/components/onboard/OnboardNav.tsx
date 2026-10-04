'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function OnboardNav() {
  return (
    <header className="sticky top-0 z-50 w-full bg-[#080d14] border-b border-white/8 transition-colors">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-[72px] flex items-center justify-between gap-4">
        
        {/* Brand Logo & Name */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-md bg-[#0c1017] border border-white/10 p-1 flex items-center justify-center">
            <img src="/logo_prehub.png" alt="PreHub Logo" className="w-6 h-6 object-contain" />
          </div>

          <div className="flex flex-col">
            <span className="font-headline font-bold text-lg tracking-tight text-white group-hover:text-slate-200 transition-colors">
              PreHub
            </span>
            <span className="text-[12px] text-slate-400 font-sans leading-none">
              Mitigasi Distribusi Pangan
            </span>
          </div>
        </Link>

        {/* Editorial Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          <a href="#sequence" className="hover:text-white transition-colors cursor-pointer">
            Alur Mitigasi
          </a>
          <a href="#capabilities" className="hover:text-white transition-colors cursor-pointer">
            Fitur Utama
          </a>
          <a href="#telemetry" className="hover:text-white transition-colors cursor-pointer">
            Sumber Data
          </a>
        </nav>

        {/* Primary Action Button */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-white text-[#080d14] font-semibold text-sm hover:bg-slate-200 active:scale-[0.99] transition-all cursor-pointer"
        >
          <span>Dashboard</span>
          <ArrowRight className="w-4 h-4" />
        </Link>

      </div>
    </header>
  );
}
