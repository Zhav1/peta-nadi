'use client';

import React from 'react';
import Link from 'next/link';

export default function OnboardFooter() {
  return (
    <footer className="relative w-full bg-[#080d14] py-16 px-4 md:px-8 border-t border-white/8">
      <div className="max-w-7xl mx-auto flex flex-col gap-12">
        
        {/* Main Footer Info */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-10">
          
          {/* Brand & Context */}
          <div className="max-w-md flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-[#0c1017] border border-white/10 p-1 flex items-center justify-center">
                <img src="/logo_prehub.png" alt="PreHub" className="w-5 h-5 object-contain" />
              </div>
              <span className="font-headline font-bold text-white text-base">
                PreHub
              </span>
            </div>
            <p className="font-sans text-xs text-slate-400 leading-relaxed">
              Sistem Peringatan Dini dan Rekomendasi Mitigasi Gangguan Distribusi Pangan Nasional. Membantu menjaga kelancaran rantai pasok komoditas pangan pokok.
            </p>
          </div>

          {/* Navigation Links */}
          <div className="flex flex-wrap gap-8 text-xs text-slate-400">
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-white font-semibold uppercase tracking-wider">
                Navigasi
              </span>
              <Link href="/dashboard" className="hover:text-white transition-colors">
                Dashboard
              </Link>
              <a href="#sequence" className="hover:text-white transition-colors">
                Alur Mitigasi
              </a>
              <a href="#capabilities" className="hover:text-white transition-colors">
                Fitur Utama
              </a>
              <a href="#telemetry" className="hover:text-white transition-colors">
                Sumber Data
              </a>
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-white font-semibold uppercase tracking-wider">
                Cakupan Koridor
              </span>
              <span className="text-slate-400">Seluruh Pulau Sumatera (8 Provinsi)</span>
              <span className="text-slate-400">Tol Trans-Sumatera & Jalinsum (Timur, Tengah, Barat)</span>
              <span className="text-slate-400">Gerbang Maritim & Selat Sunda (ALKI I)</span>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-slate-400">
          <span>&copy; 2026 PreHub. Hak Cipta Dilindungi Undang-Undang.</span>
          <span className="text-slate-400">Platform Mitigasi Distribusi Pangan</span>
        </div>

      </div>
    </footer>
  );
}
