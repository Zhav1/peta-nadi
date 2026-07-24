'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Play, Cpu, Sparkles, Activity, ShieldCheck } from 'lucide-react';

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
    <section className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#080d14] pt-24 pb-20 px-4 md:px-8">
      {/* 1. 100% Uncovered Vivid 3D Globe Background Video */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover scale-105 opacity-95 transition-opacity duration-1000"
        >
          <source src="/onboard/hero-bg.mp4" type="video/mp4" />
        </video>

        {/* Multi-stage Subtle Ambient Dark Vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#080d14]/60 via-transparent to-[#080d14]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#080d14_95%)]" />

        {/* Ambient Glow Halos */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-cyan-500/15 rounded-full blur-[160px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-emerald-500/15 rounded-full blur-[140px] pointer-events-none" />
      </div>

      {/* 2. Hero Content (Wide Open Video - Creative Full-Word Badges) */}
      <div className="relative z-10 max-w-5xl mx-auto text-center flex flex-col items-center gap-8">

        {/* Status Pill Badge with PetaNadi Logo & Neon Glow Border */}
        <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full backdrop-blur-2xl bg-[#080d14]/80 border border-emerald-400/40 text-xs font-mono shadow-[0_0_25px_rgba(52,211,153,0.3)]">
          <img src="/logo_petanadi.png" alt="PetaNadi" className="w-4 h-4 object-contain animate-pulse" />
          <span className="text-emerald-400 font-bold uppercase tracking-widest">PetaNadi Live</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-200">4D Crisis Command Center</span>
        </div>

        {/* Google Flow / Apple Event Style Full-Word Kinetic Typography */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white tracking-tight leading-[1.08] max-w-5xl drop-shadow-[0_4px_24px_rgba(0,0,0,0.95)]">
          Empowering National
          <br className="hidden sm:inline" />
          <span className="bg-cyan-400 text-slate-950 px-4 md:px-6 py-1 mx-2 rounded-3xl font-extrabold inline-block transform -rotate-1 hover:rotate-0 transition-transform cursor-pointer border-2 border-cyan-300 shadow-[0_0_35px_rgba(34,211,238,0.6)]">
            Supply Chain
          </span>
          with
          <span className="bg-emerald-400 text-slate-950 px-4 md:px-6 py-1 mx-2 rounded-3xl font-extrabold inline-block transform rotate-1 hover:rotate-0 transition-transform cursor-pointer border-2 border-emerald-300 shadow-[0_0_35px_rgba(52,211,153,0.6)]">
            4D Intelligence.
          </span>
        </h1>

        {/* Subtitle with High Contrast Shadow */}
        <p className="text-base sm:text-xl md:text-2xl text-slate-100 max-w-3xl font-medium leading-relaxed drop-shadow-[0_2px_16px_rgba(0,0,0,0.95)]">
          Platform intelijen krisis logistik nasional terpadu. Menggabungkan{' '}
          <span className="text-cyan-400 font-bold underline decoration-cyan-400 decoration-2 underline-offset-4 drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]">
            LangGraph 6-Agent Swarm
          </span>
          , optimasi rute{' '}
          <span className="text-emerald-400 font-bold underline decoration-emerald-400 decoration-2 underline-offset-4 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]">
            NVIDIA cuOpt
          </span>
          , dan pemetaan spasial 4D real-time.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mt-2 w-full sm:w-auto">
          {/* Launch Dashboard Primary Button */}
          <Link
            href="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 text-slate-950 font-extrabold text-lg shadow-[0_0_35px_rgba(34,211,238,0.4)] hover:shadow-[0_0_50px_rgba(34,211,238,0.6)] hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer group border border-cyan-300"
          >
            <img src="/logo_petanadi.png" alt="PetaNadi Logo" className="w-6 h-6 object-contain" />
            <span>Launch Command Center 4D</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>

          {/* Secondary Scroll Button */}
          <button
            onClick={scrollToCanvas}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl backdrop-blur-2xl bg-[#080d14]/80 border border-white/30 text-white font-bold text-lg hover:bg-white/20 hover:border-white/50 transition-all cursor-pointer group shadow-2xl"
          >
            <Play className="w-4 h-4 text-cyan-400 fill-cyan-400 group-hover:scale-110 transition-transform" />
            <span>Explore 4D Sequence</span>
          </button>
        </div>

        {/* Highlight Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 mt-8 w-full max-w-4xl pt-8 border-t border-white/20 backdrop-blur-md px-6 py-4 rounded-2xl bg-[#080d14]/40">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-cyan-400 font-mono text-2xl font-black drop-shadow-[0_0_15px_rgba(34,211,238,0.6)]">
              <Activity className="w-5 h-5 text-cyan-400" />
              <span>&lt; 15 min</span>
            </div>
            <span className="text-xs text-slate-300 font-medium mt-1">Anomaly Detection Time</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-2xl font-black drop-shadow-[0_0_15px_rgba(52,211,153,0.6)]">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>&gt; 85%</span>
            </div>
            <span className="text-xs text-slate-300 font-medium mt-1">Consensus Gate Threshold</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-amber-400 font-mono text-2xl font-black drop-shadow-[0_0_15px_rgba(251,191,36,0.6)]">
              <Cpu className="w-5 h-5 text-amber-400" />
              <span>18 Nodes</span>
            </div>
            <span className="text-xs text-slate-300 font-medium mt-1">OSM Verified Arterials</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-purple-400 font-mono text-2xl font-black drop-shadow-[0_0_15px_rgba(192,132,252,0.6)]">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <span>10-15%</span>
            </div>
            <span className="text-xs text-slate-300 font-medium mt-1">Cost Reduction Target</span>
          </div>
        </div>

      </div>
    </section>
  );
}
