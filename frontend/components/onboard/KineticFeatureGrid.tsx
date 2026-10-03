'use client';

import React from 'react';
import { Map, Bot, Navigation, Network } from 'lucide-react';

interface CapabilityItem {
  id: string;
  category: string;
  title: string;
  engine: string;
  description: string;
  metricLabel: string;
  metricValue: string;
  icon: React.ElementType;
}

const CAPABILITIES: CapabilityItem[] = [
  {
    id: 'geospatial',
    category: 'SISTEM SPASIAL 4D',
    title: 'Pemetaan Spasial Multilapis & Pemodelan Koridor',
    engine: 'Mapbox GL v3 + Deck.gl v9.3',
    description:
      'Memetakan kontur jalan arteri nasional, perimeter genangan banjir, gelombang kejut seismik, dan kepadatan lalu lintas secara real-time pada kanvas GPU berkinerja tinggi.',
    metricLabel: 'Performa Visualisasi',
    metricValue: '60 FPS Native Canvas',
    icon: Map,
  },
  {
    id: 'agent-swarm',
    category: 'INTELIJEN KOGNITIF',
    title: 'LangGraph 6-Agent Swarm & Gerbang Konsensus',
    engine: 'DeepSeek V3 + Gemini 3.1 Flash',
    description:
      'Enam agen cerdas memvalidasi silang laporan lapangan OSINT, pantauan satelit, dan sensor hidrologi. Peringatan krisis diterbitkan hanya jika memenuhi ambang konsensus >85%.',
    metricLabel: 'Ambang Batas Verifikasi',
    metricValue: '> 85% Multi-Sensor',
    icon: Bot,
  },
  {
    id: 'routing',
    category: 'OPTIMASI DETERMINISTIK',
    title: 'Kalkulasi Rute Pengalihan Tangensial (Bypass)',
    engine: 'NetworkX & Google OR-Tools',
    description:
      'Algoritma CPU menghitung rute alternatif di luar radius bahaya secara tangensial, mengarahkan armada komoditas melalui simpul persimpangan jalan arteri OSM terverifikasi.',
    metricLabel: 'Latensi Solver CPU',
    metricValue: '< 2 ms per Kalkulasi',
    icon: Navigation,
  },
  {
    id: 'causal-graph',
    category: 'SIMULASI EKONOMI',
    title: 'Analisis Causal Graph & Proyeksi Inflasi Pangan',
    engine: 'Supply Chain Graph Engine + PIHPS',
    description:
      'Melacak propagasi dampak disrupsi dari simpul pelabuhan terhadap pasokan pasar lokal, memproyeksikan lonjakan harga komoditas strategis sebelum kelangkaan terjadi.',
    metricLabel: 'Integrasi Komoditas',
    metricValue: 'Beras, Minyak Goreng, Cabai',
    icon: Network,
  },
];

export default function KineticFeatureGrid() {
  return (
    <section id="capabilities" className="relative w-full bg-[#080d14] py-28 px-4 md:px-8 border-t border-white/8">
      <div className="max-w-7xl mx-auto flex flex-col gap-16">
        
        {/* Editorial Section Header — No Eyebrow Pill */}
        <div className="max-w-3xl flex flex-col gap-4">
          <h2 className="font-headline text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
            Kemampuan Inti Arsitektur PreHub
          </h2>
          <p className="font-sans text-base sm:text-lg text-slate-300 leading-relaxed">
            PreHub memadukan visualisasi spasial presisi tinggi, penalaran agen berbasis data resmi, dan optimasi rute terukur untuk melindungi stabilitas rantai pasok pangan nasional.
          </p>
        </div>

        {/* 2-Column Clean Editorial Grid — No Nested Cards, Pure Flat Charcoal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {CAPABILITIES.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="bg-[#0c1017] border border-white/8 rounded-lg p-8 flex flex-col justify-between gap-6"
              >
                <div className="flex flex-col gap-4">
                  {/* Category Header */}
                  <div className="flex items-center justify-between border-b border-white/8 pb-4">
                    <span className="font-mono text-xs font-semibold text-slate-400 tracking-wider">
                      {item.category}
                    </span>
                    <Icon className="w-4 h-4 text-slate-400" />
                  </div>

                  {/* Title & Engine */}
                  <div>
                    <h3 className="font-headline text-xl font-bold text-white tracking-tight leading-snug">
                      {item.title}
                    </h3>
                    <span className="font-mono text-xs text-slate-400 mt-1 block">
                      {item.engine}
                    </span>
                  </div>

                  {/* Narrative Body */}
                  <p className="font-sans text-sm text-slate-300 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {/* Footer Metric Line */}
                <div className="pt-4 border-t border-white/8 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">{item.metricLabel}</span>
                  <span className="text-white font-semibold">{item.metricValue}</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
