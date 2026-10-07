'use client';

import React from 'react';
import { Map, ShieldCheck, Navigation, Network } from 'lucide-react';

interface CapabilityItem {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

const CAPABILITIES: CapabilityItem[] = [
  {
    id: 'geospatial',
    title: 'Pemetaan Koridor Logistik & Titik Rawan',
    description:
      'Memantau jalur distribusi darat, kawasan rawan genangan banjir, dan kepadatan lalu lintas secara terpadu pada peta interaktif.',
    icon: Map,
  },
  {
    id: 'validation',
    title: 'Verifikasi Silang Sensor & Laporan Resmi',
    description:
      'Mencocokkan informasi lapangan dengan data resmi BMKG dan pantauan lalu lintas guna menyaring laporan palsu sebelum peringatan diterbitkan.',
    icon: ShieldCheck,
  },
  {
    id: 'routing',
    title: 'Kalkulasi Rute Pengalihan Bebas Hambatan',
    description:
      'Menghitung rute pengalihan di luar area terdampak bencana atau kemacetan agar armada distribusi tetap bergerak lancar.',
    icon: Navigation,
  },
  {
    id: 'causal-graph',
    title: 'Proyeksi Dampak Pasokan & Harga Pokok',
    description:
      'Menghubungkan hambatan di simpul pelabuhan atau jalur darat dengan proyeksi ketersediaan dan harga komoditas pangan di pasar lokal.',
    icon: Network,
  },
];

export default function KineticFeatureGrid() {
  return (
    <section id="capabilities" className="relative w-full bg-[#080d14] py-24 px-4 md:px-8 border-t border-white/8">
      <div className="max-w-7xl mx-auto flex flex-col gap-12">
        
        {/* Section Header */}
        <div className="max-w-3xl flex flex-col gap-3">
          <h2 className="font-headline text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
            Fitur Utama Pemantauan & Mitigasi
          </h2>
          <p className="font-sans text-base text-slate-300 leading-relaxed">
            PreHub memadukan pemantauan jalur distribusi pangan, validasi gangguan otomatis, dan rekomendasi rute pengalihan untuk menjaga kestabilan pasokan.
          </p>
        </div>

        {/* 2-Column Clean Editorial Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CAPABILITIES.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="bg-[#0c1017] border border-white/8 rounded-lg p-6 flex flex-col gap-4"
              >
                <div className="w-9 h-9 rounded-md bg-[#121822] border border-white/10 flex items-center justify-center text-slate-300">
                  <Icon className="w-4 h-4 text-white" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="font-headline text-lg font-bold text-white tracking-tight leading-snug">
                    {item.title}
                  </h3>
                  <p className="font-sans text-sm text-slate-300 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
