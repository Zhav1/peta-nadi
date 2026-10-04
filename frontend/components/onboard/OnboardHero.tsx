'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';

export default function OnboardHero() {
  const scrollToCanvas = () => {
    const sequenceEl = document.getElementById('sequence');
    if (sequenceEl) {
      sequenceEl.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: window.innerHeight * 0.9, behavior: 'smooth' });
    }
  };

  return (
    <section className="relative w-full min-h-[85vh] flex flex-col items-center justify-center overflow-hidden bg-[#080d14] pt-28 pb-24 px-4 md:px-8">
      {/* Background Globe Canvas / Subtle Atmospheric Layer */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover opacity-35"
        >
          <source src="/onboard/hero-bg.mp4" type="video/mp4" />
        </video>

        {/* Ambient Dark Ground Vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#080d14] via-[#080d14]/70 to-[#080d14]" />
      </div>

      {/* Hero Content — Restrained Editorial Composition */}
      <div className="relative z-10 max-w-4xl mx-auto text-center flex flex-col items-center gap-8">
        
        {/* Editorial Headline */}
        <h1 className="font-headline text-4xl sm:text-6xl md:text-7xl font-bold text-white tracking-tight leading-[1.12]">
          Peringatan Dini & Mitigasi Gangguan Distribusi Pangan
        </h1>

        {/* Subtitle — Factual, Grounded Domain Copy */}
        <p className="font-sans text-base sm:text-lg md:text-xl text-slate-300 max-w-2xl leading-relaxed">
          Memantau kelancaran koridor logistik, memvalidasi gangguan berbasis data multi-sumber, dan merekomendasikan rute pengalihan secara dini sebelum pasokan pangan pokok terhambat.
        </p>

        {/* Dual Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-md bg-white text-[#080d14] font-semibold text-base hover:bg-slate-200 active:scale-[0.99] transition-all cursor-pointer"
          >
            <span>Buka Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <button
            type="button"
            onClick={scrollToCanvas}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-md bg-[#0c1017] border border-white/10 text-slate-200 font-medium text-base hover:border-white/25 hover:bg-[#121822] transition-all cursor-pointer"
          >
            <span>Alur Mitigasi</span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
        </div>

      </div>
    </section>
  );
}
