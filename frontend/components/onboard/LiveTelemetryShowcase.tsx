'use client';

import React from 'react';
import { CloudLightning, Navigation2, Ship, Flame, DollarSign, Newspaper } from 'lucide-react';

interface DataSource {
  id: string;
  name: string;
  category: string;
  detail: string;
  protocol: string;
  cadence: string;
  icon: React.ElementType;
}

const DATA_SOURCES: DataSource[] = [
  {
    id: 'bmkg',
    name: 'BMKG Indonesia',
    category: 'CUACA & HIDROLOGI',
    detail: 'Peringatan dini cuaca ekstrem regional, poligon genangan banjir, dan katalog gempa sesar tektonik Sumatra.',
    protocol: 'REST API GeoJSON',
    cadence: 'Polling 60s',
    icon: CloudLightning,
  },
  {
    id: 'tomtom',
    name: 'TomTom Traffic Index',
    category: 'KEPADATAN ARTERI',
    detail: 'Kecepatan segmen jalan raya Jalinsum, indeks perlambatan truk logistik, dan insiden penyempitan jalur.',
    protocol: 'Flow & Incident API',
    cadence: 'Streaming Real-time',
    icon: Navigation2,
  },
  {
    id: 'aisstream',
    name: 'AISstream.io Maritim',
    category: 'ANTREAN PELABUHAN',
    detail: 'Posisi kapal kontainer dan tongkang CPO, kedalaman antrean dermaga Pelabuhan Internasional Belawan.',
    protocol: 'WSS Telemetry',
    cadence: 'Live WebSocket',
    icon: Ship,
  },
  {
    id: 'firms',
    name: 'NASA FIRMS',
    category: 'DETEKSI TERMAL',
    detail: 'Deteksi titik api kebakaran hutan/lahan di sepanjang koridor distribusi via sensor satelit MODIS & VIIRS.',
    protocol: 'Satellite GeoTIFF',
    cadence: 'Siklus Satelit Harian',
    icon: Flame,
  },
  {
    id: 'pihps',
    name: 'PIHPS Nasional (Bank Indonesia)',
    category: 'HARGA KOMODITAS',
    detail: 'Pemantauan harga harian beras, minyak goreng, cabai merah, dan bawang merah di pasar konsumen utama.',
    protocol: 'Central Bank Feed',
    cadence: 'Sinkronisasi Harian',
    icon: DollarSign,
  },
  {
    id: 'osint',
    name: 'OSINT & Kantor Berita Terverifikasi',
    category: 'VERIFIKASI LAPANGAN',
    detail: 'Ekstraksi entitas lokasi (NER spaCy) dari warta resmi LKBN ANTARA dan laporan darurat pemerintah daerah.',
    protocol: 'News Ingest Engine',
    cadence: 'Analisis Tiap 5 Menit',
    icon: Newspaper,
  },
];

export default function LiveTelemetryShowcase() {
  return (
    <section id="telemetry" className="relative w-full bg-[#080d14] py-28 px-4 md:px-8 border-t border-white/8">
      <div className="max-w-7xl mx-auto flex flex-col gap-16">
        
        {/* Editorial Header — No Eyebrow Pill, No Highlighter Chips */}
        <div className="max-w-3xl flex flex-col gap-4">
          <h2 className="font-headline text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
            Integrasi Data Resmi Lintas Lembaga
          </h2>
          <p className="font-sans text-base sm:text-lg text-slate-300 leading-relaxed">
            PreHub tidak beroperasi di atas data tunggal atau sintetis. Setiap proyeksi krisis divalidasi silang dari enam penyedia data resmi untuk menjamin akurasi sebelum rekomendasi intervensi diterbitkan.
          </p>
        </div>

        {/* 2-Column Disciplined Data Ledger */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {DATA_SOURCES.map((source) => {
            const Icon = source.icon;
            return (
              <div
                key={source.id}
                className="bg-[#0c1017] border border-white/8 rounded-lg p-6 flex flex-col justify-between gap-6"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-white/8 pb-3">
                    <span className="font-mono text-xs font-semibold text-slate-400 tracking-wider">
                      {source.category}
                    </span>
                    <Icon className="w-4 h-4 text-slate-400" />
                  </div>

                  <h3 className="font-headline text-lg font-bold text-white">
                    {source.name}
                  </h3>

                  <p className="font-sans text-sm text-slate-300 leading-relaxed">
                    {source.detail}
                  </p>
                </div>

                <div className="pt-3 border-t border-white/8 flex items-center justify-between font-mono text-xs text-slate-400">
                  <span>{source.protocol}</span>
                  <span className="text-white font-medium">{source.cadence}</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
