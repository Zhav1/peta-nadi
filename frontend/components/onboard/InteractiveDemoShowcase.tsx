'use client';

import React, { useState } from 'react';
import { Map, Bot, Cpu, CheckCircle2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface PreviewTab {
  id: string;
  name: string;
  badge: string;
  icon: React.ElementType;
  title: string;
  description: string;
  imageSrc: string;
  stats: { label: string; value: string; color: string }[];
  features: string[];
}

const PREVIEW_TABS: PreviewTab[] = [
  {
    id: '4d-map',
    name: '4D Spatial Command Map',
    badge: 'Mapbox GL v3 + Deck.gl v9.3',
    icon: Map,
    title: 'Real-time 4D Multi-Layer Spatial Ingestion',
    description:
      'Peta visualisasi spasial 3D Globe dan MapView. Menampilkan poligon bahaya banjir organik, gelombang kejut gempa tektonik, dan kontur kemacetan TomTom secara simultan.',
    imageSrc: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=1200&q=80',
    stats: [
      { label: 'Render Speed', value: '60 FPS Canvas', color: 'text-emerald-400' },
      { label: 'Spatial Engine', value: 'PostGIS + Deck.gl', color: 'text-cyan-400' },
      { label: 'Avoidance Clearance', value: 'R + 2.0 km Buffer', color: 'text-amber-400' },
    ],
    features: [
      'Garis retakan sesar gempa & 3 ring shockwave terintegrasi',
      'Poligon genangan air banjir organik tanpa kotak sintetis',
      'Garis kemacetan TomTom berwarna hijau, kuning, dan merah',
    ],
  },
  {
    id: 'agent-swarm',
    name: 'LangGraph 6-Agent Swarm',
    badge: 'DeepSeek V3 + Gemini 3.1',
    icon: Bot,
    title: 'Deterministic Cognitive Swarm & Consensus Gate',
    description:
      'Enam agen cerdas LangGraph mengeksekusi analisis sebab-akibat secara berurutan. Menerapkan Consensus Gate (>85% keyakinan) dari 2+ sumber independen sebelum notifikasi diterbitkan.',
    imageSrc: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
    stats: [
      { label: 'Agent Pipeline', value: '6 LangGraph Agents', color: 'text-cyan-400' },
      { label: 'Consensus Threshold', value: '> 85% Confidence', color: 'text-emerald-400' },
      { label: 'False Alarm Rate', value: '< 10% FPR Target', color: 'text-purple-400' },
    ],
    features: [
      'Analisis OSINT Lightpanda dengan spaCy NER location parser',
      'Chain-of-Thought (CoT) reasoning trace yang dapat diaudit',
      'Integrasi WhatsApp alert otomatis ke operator armada logistik',
    ],
  },
  {
    id: 'cuopt-gpu',
    name: 'NVIDIA cuOpt GPU Rerouting',
    badge: '< 100ms GPU Accelerated',
    icon: Cpu,
    title: 'Pure Agentic Tangential Danger Avoidance Router',
    description:
      'Mesin optimasi rute GPU NVIDIA cuOpt memproyeksikan pengalihan jalan raya melalui 18 arteri persimpangan jalan OSM terverifikasi di Koridor Sumatera Utara.',
    imageSrc: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80',
    stats: [
      { label: 'Solver Latency', value: '< 100ms Matrix', color: 'text-emerald-400' },
      { label: 'OSM Intersections', value: '18 Verified Nodes', color: 'text-amber-400' },
      { label: 'Detour Cost Model', value: '0% Hardcode', color: 'text-cyan-400' },
    ],
    features: [
      'Forced Waypoint Encoding (Origin ➔ Waypoint ➔ Destination)',
      'Algoritma Tangential Clearance tegak lurus lingkaran krisis',
      'Kombinasi moda transportasi otomatis (Truk / Laut / Udara)',
    ],
  },
];

export default function InteractiveDemoShowcase() {
  const [activeTabId, setActiveTabId] = useState<string>('4d-map');
  const activeTab = PREVIEW_TABS.find((t) => t.id === activeTabId) || PREVIEW_TABS[0];

  return (
    <section id="architecture" className="relative w-full bg-[#080d14] py-24 px-4 md:px-8 border-t border-white/10 overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-cyan-500/10 rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-7xl mx-auto flex flex-col gap-12 relative z-10">
        
        {/* Section Title */}
        <div className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full backdrop-blur-xl bg-[#0c0e12]/90 border border-cyan-500/30 text-xs font-mono text-cyan-400 shadow-xl">
            <img src="/logo_prehub.png" alt="PreHub" className="w-4 h-4 object-contain" />
            <span>INTERACTIVE SYSTEM PREVIEW</span>
          </div>

          <h2 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-tight max-w-4xl">
            Experience the 4D Command Center
            <span className="bg-emerald-400 text-slate-950 px-3 py-0.5 mx-2 rounded-3xl font-extrabold inline-block transform rotate-1">
              in action
            </span>
          </h2>
          <p className="text-slate-400 text-base md:text-lg max-w-2xl">
            Pilih modul sistem di bawah untuk melihat bagaimana PreHub mengolah data spasial, nalar agen AI, dan optimasi GPU dalam satu layar terpadu.
          </p>
        </div>

        {/* Interactive Tab Switcher */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {PREVIEW_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTabId;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl text-sm font-bold transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-xl shadow-cyan-500/20 scale-105'
                    : 'bg-[#0c0e12]/80 border-white/10 text-slate-400 hover:text-white hover:border-white/30'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>

        {/* Interactive Preview Showcase Card */}
        <div className="rounded-3xl backdrop-blur-2xl bg-[#0c0e12]/90 border border-white/15 p-6 md:p-10 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Specs & Features */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 font-mono text-xs font-bold w-fit">
              {activeTab.badge}
            </div>

            <h3 className="text-2xl md:text-3xl font-bold text-white tracking-tight leading-snug">
              {activeTab.title}
            </h3>

            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              {activeTab.description}
            </p>

            {/* Feature List */}
            <div className="flex flex-col gap-3 py-2">
              {activeTab.features.map((feat, idx) => (
                <div key={idx} className="flex items-start gap-3 text-xs md:text-sm text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>

            {/* Key Metrics Strip */}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
              {activeTab.stats.map((stat, idx) => (
                <div key={idx} className="flex flex-col">
                  <span className={`text-sm md:text-base font-bold font-mono ${stat.color}`}>
                    {stat.value}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>

            <Link
              href="/dashboard"
              className="mt-2 inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 hover:scale-[1.02] active:scale-98 transition-all cursor-pointer group"
            >
              <span>Test Module Live in Dashboard</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* Right Column: Visual Preview Canvas Image Box */}
          <div className="lg:col-span-7 relative rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-slate-950 group h-[320px] md:h-[420px]">
            <img
              src={activeTab.imageSrc}
              alt={activeTab.name}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-85"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e12] via-transparent to-transparent opacity-80" />
            
            {/* Top Bar Floating Mockup Tag */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg backdrop-blur-xl bg-[#080d14]/80 border border-white/10 text-xs font-mono text-cyan-400">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>PreHub 4D Command Center Window</span>
              </div>
              <div className="px-3 py-1 rounded-lg backdrop-blur-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-mono font-bold">
                LIVE STAGING
              </div>
            </div>

            {/* Bottom Caption Overlay */}
            <div className="absolute bottom-4 left-4 right-4 p-4 rounded-xl backdrop-blur-xl bg-[#0c0e12]/85 border border-white/10 flex items-center justify-between text-xs font-mono">
              <span className="text-white font-semibold">{activeTab.name} Active Frame</span>
              <span className="text-cyan-400 font-bold">Click Launch to Operate ➔</span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
