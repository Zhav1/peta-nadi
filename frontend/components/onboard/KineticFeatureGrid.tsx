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
    category: 'PEMANTAUAN KORIDOR',
    title: 'Pemetaan Spasial Jalur Logistik & Titik Rawan',
    engine: 'Visualisasi Spasial',
    description:
      'Memantau jalur distribusi darat, kawasan rawan genangan banjir, dan kepadatan lalu lintas secara terpadu pada peta interaktif.',
    metricLabel: 'Wilayah Pantauan',
    metricValue: 'Sumatera Utara & Jalinsum',
    icon: Map,
  },
  {
    id: 'agent-swarm',
    category: 'VALIDASI GANGGUAN',
    title: 'Verifikasi Silang Laporan & Sensor Lapangan',
    engine: 'Penyaringan Multi-Sumber',
    description:
      'Mencocokkan informasi lapangan dengan data resmi BMKG dan pantauan lalu lintas guna menyaring laporan palsu sebelum peringatan diterbitkan.',
    metricLabel: 'Standar Validasi',
    metricValue: 'Konsensus Multi-Sumber',
    icon: Bot,
  },
  {
    id: 'routing',
    category: 'PENGALIHAN RUTE',
    title: 'Kalkulasi Rute Alternatif Bebas Hambatan',
    engine: 'Optimasi Jalur Logistik',
    description:
      'Menghitung rute pengalihan di luar area terdampak bencana atau kemacetan agar armada distribusi tetap bergerak lancar.',
    metricLabel: 'Sasaran Pengalihan',
    metricValue: 'Keamanan Jalur & Efisiensi Waktu',
    icon: Navigation,
  },
  {
    id: 'causal-graph',
    category: 'DAMPAK PASAR',
    title: 'Proyeksi Keterlambatan Pasokan & Harga Pokok',
    engine: 'Analisis Rantai Pasok',
    description:
      'Menghubungkan hambatan di simpul pelabuhan atau jalur darat dengan proyeksi ketersediaan dan harga komoditas pangan di pasar lokal.',
    metricLabel: 'Komoditas Pantauan',
    metricValue: 'Beras, Minyak Goreng, Cabai',
    icon: Network,
  },
];

export default function KineticFeatureGrid() {
  return (
    <section id="capabilities" className="relative w-full bg-[#080d14] py-28 px-4 md:px-8 border-t border-white/8">
      <div className="max-w-7xl mx-auto flex flex-col gap-16">
        
        {/* Editorial Section Header */}
        <div className="max-w-3xl flex flex-col gap-4">
          <h2 className="font-headline text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
            Fitur Utama Pemantauan & Mitigasi
          </h2>
          <p className="font-sans text-base sm:text-lg text-slate-300 leading-relaxed">
            PreHub memadukan pemantauan jalur distribusi pangan, validasi gangguan otomatis, dan rekomendasi rute pengalihan untuk menjaga kestabilan pasokan.
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
