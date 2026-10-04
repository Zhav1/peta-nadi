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
    category: 'CUACA & BENCANA',
    detail: 'Peringatan dini cuaca ekstrem, pantauan intensitas hujan, dan katalog gempa sesar tektonik regional.',
    protocol: 'Data Cuaca & Hidrologi',
    cadence: 'Pembaruan Berkala',
    icon: CloudLightning,
  },
  {
    id: 'tomtom',
    name: 'TomTom Traffic Index',
    category: 'LALU LINTAS DARAT',
    detail: 'Kecepatan segmen jalur arteri Jalinsum, indeks perlambatan kendaraan logistik, dan insiden penutupan jalan.',
    protocol: 'Arus & Hambatan Jalan',
    cadence: 'Waktu Nyata',
    icon: Navigation2,
  },
  {
    id: 'aisstream',
    name: 'AISstream.io Maritim',
    category: 'LOGISTIK MARITIM',
    detail: 'Posisi kapal kargo dan tongkang pengangkut bahan pangan di Pelabuhan Belawan.',
    protocol: 'Telemetri Kapal',
    cadence: 'Waktu Nyata',
    icon: Ship,
  },
  {
    id: 'firms',
    name: 'NASA FIRMS',
    category: 'PANTAUAN WILAYAH',
    detail: 'Deteksi titik panas di sekitar koridor transportasi darat untuk antisipasi gangguan asap atau kebakaran.',
    protocol: 'Citra Satelit Terbuka',
    cadence: 'Pembaruan Harian',
    icon: Flame,
  },
  {
    id: 'pihps',
    name: 'PIHPS Nasional (Bank Indonesia)',
    category: 'HARGA PANGAN',
    detail: 'Pemantauan harga harian beras, minyak goreng, cabai, dan bahan pangan pokok di pasar konsumen utama.',
    protocol: 'Pencatatan Pasar',
    cadence: 'Pembaruan Harian',
    icon: DollarSign,
  },
  {
    id: 'osint',
    name: 'Laporan Resmi & Berita Terverifikasi',
    category: 'LAPORAN LAPANGAN',
    detail: 'Verifikasi kejadian bencana dan pengumuman kedaruratan dari instansi pemerintah daerah dan kantor berita resmi.',
    protocol: 'Laporan Kedinasan',
    cadence: 'Sesuai Kejadian',
    icon: Newspaper,
  },
];

export default function LiveTelemetryShowcase() {
  return (
    <section id="telemetry" className="relative w-full bg-[#080d14] py-28 px-4 md:px-8 border-t border-white/8">
      <div className="max-w-7xl mx-auto flex flex-col gap-16">
        
        {/* Editorial Header */}
        <div className="max-w-3xl flex flex-col gap-4">
          <h2 className="font-headline text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
            Integrasi Sumber Data Resmi
          </h2>
          <p className="font-sans text-base sm:text-lg text-slate-300 leading-relaxed">
            PreHub mengintegrasikan data cuaca, kondisi jalan, pergerakan maritim, dan harga pangan dari berbagai lembaga resmi guna memastikan akurasi analisis sebelum rekomendasi mitigasi diterbitkan.
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
