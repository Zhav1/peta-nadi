'use client';

import React, { useState } from 'react';
import { Map, Bot, Navigation, Network, TrendingUp, ShieldCheck, ChevronRight } from 'lucide-react';

interface FeatureCard {
  id: string;
  title: string;
  category: string;
  badgeText: string;
  badgeBg: string;
  badgeTextColor: string;
  icon: React.ElementType;
  description: string;
  metrics: string;
}

const FEATURES: FeatureCard[] = [
  {
    id: '4d-map',
    title: '4D Spatial Map & Dynamic Polylines',
    category: 'GEOSPATIAL ENGINE',
    badgeText: 'Mapbox v3 + Deck.gl',
    badgeBg: 'bg-emerald-400',
    badgeTextColor: 'text-slate-950',
    icon: Map,
    description:
      'Visualisasi peta 3D Globe dan MapView berpresisi tinggi. Menampilkan poligon bencana organik, shockwave gempa, dan garis kontur banjir real-time.',
    metrics: '60 FPS Canvas Render',
  },
  {
    id: 'agent-swarm',
    title: 'LangGraph 6-Agent Cognitive Swarm',
    category: 'AI COGNITIVE CORE',
    badgeText: 'Dual-LLM Synergy',
    badgeBg: 'bg-cyan-400',
    badgeTextColor: 'text-slate-950',
    icon: Bot,
    description:
      'Swarm 6 agen cerdas yang bekerja secara terstruktur: Data Ingestion, OSINT Hazard, TFT Prediction, Route Optimization, Economic Intel, dan Copilot XAI.',
    metrics: 'DeepSeek V3 + Gemini 3.1',
  },
  {
    id: 'cuopt-routing',
    title: 'NVIDIA cuOpt Avoidance Rerouting',
    category: 'GPU ACCELERATION',
    badgeText: '18 OSM Intersections',
    badgeBg: 'bg-orange-400',
    badgeTextColor: 'text-slate-950',
    icon: Navigation,
    description:
      'Mesin rerouting terukur yang memproyeksikan rute pengalihan 2 km di luar radius bahaya secara tegak lurus, menyusuri arteri persimpangan jalan nyata.',
    metrics: '< 100ms Matrix Solving',
  },
  {
    id: 'graphrag-causal',
    title: 'GraphRAG Supply Chain Causal Graph',
    category: 'CAUSAL INTELLIGENCE',
    badgeText: 'Knowledge Graph',
    badgeBg: 'bg-purple-400',
    badgeTextColor: 'text-slate-950',
    icon: Network,
    description:
      'Memetakan keterhubungan sebab-akibat antar simpul logistik (Penutupan Pelabuhan Belawan ➔ Penurunan Pasokan Minyak Goreng ➔ Inflasi Kota Medan).',
    metrics: 'Multi-hop Propagation',
  },
  {
    id: 'pihps-economic',
    title: 'PIHPS Economic Intelligence',
    category: 'COMMODITY INTELLIGENCE',
    badgeText: 'Food Inflation',
    badgeBg: 'bg-amber-400',
    badgeTextColor: 'text-slate-950',
    icon: TrendingUp,
    description:
      'Integrasi data harga pangan strategis harian dari PIHPS Nasional. Mengkalkulasikan multiplier dampak inflasi pangan pasca-bencana secara prediktif.',
    metrics: '2-5 Days Lag Correlation',
  },
  {
    id: 'consensus-gate',
    title: 'Multi-Sensor Consensus Gate',
    category: 'TRUST ENGINE',
    badgeText: '> 85% Confidence',
    badgeBg: 'bg-emerald-500',
    badgeTextColor: 'text-white',
    icon: ShieldCheck,
    description:
      'Gerbang verifikasi otomatis yang mensyaratkan konfirmasi minimal dari 2 sumber independen (BMKG, TomTom, AISstream, OSINT) sebelum peringatan diterbitkan.',
    metrics: '< 10% False Positive',
  },
];

export default function KineticFeatureGrid() {
  const [activeCard, setActiveCard] = useState<string>(FEATURES[0].id);

  return (
    <section className="relative w-full bg-[#080d14] py-24 px-4 md:px-8 border-t border-white/10">
      <div className="max-w-7xl mx-auto flex flex-col gap-16">
        
        {/* Section Header */}
        <div className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-xl bg-[#0c0e12]/80 border border-white/10 text-xs font-mono text-cyan-400">
            <span>ARCHITECTURAL CAPABILITIES</span>
          </div>

          <h2 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-tight max-w-3xl">
            Discover the technology shape
            <span className="bg-cyan-400 text-slate-950 px-3 py-0.5 mx-2 rounded-full font-black inline-block transform -rotate-1">
              ing
            </span>
            national supply chain resilience.
          </h2>

          <p className="text-slate-400 text-base md:text-lg max-w-2xl">
            PreHub memadukan enam pilar teknologi mutakhir untuk memberikan visibilitas 4D menyeluruh dan mitigasi risiko logistik yang tepercaya.
          </p>
        </div>

        {/* Feature Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            const isActive = activeCard === feature.id;

            return (
              <div
                key={feature.id}
                onMouseEnter={() => setActiveCard(feature.id)}
                className={`group relative rounded-3xl p-8 backdrop-blur-xl transition-all duration-300 cursor-pointer flex flex-col justify-between border ${
                  isActive
                    ? 'bg-[#0c0e12]/90 border-cyan-400/50 shadow-2xl shadow-cyan-500/10 -translate-y-1'
                    : 'bg-[#0c0e12]/60 border-white/10 hover:border-white/20 hover:bg-[#0c0e12]/80'
                }`}
              >
                {/* Top Badge & Icon */}
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                      isActive ? 'bg-cyan-400/20 text-cyan-400' : 'bg-white/5 text-slate-400'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>

                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold font-mono ${feature.badgeBg} ${feature.badgeTextColor}`}
                  >
                    {feature.badgeText}
                  </span>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-3">
                  <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">
                    {feature.category}
                  </span>
                  <h3 className="text-xl font-bold text-white tracking-tight group-hover:text-cyan-400 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {feature.description}
                  </p>
                </div>

                {/* Footer Metric */}
                <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">{feature.metrics}</span>
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${
                      isActive ? 'text-cyan-400 translate-x-1' : 'text-slate-600'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
