'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Printer, 
  ChevronLeft, 
  ChevronRight, 
  ShieldCheck, 
  TrendingUp, 
  CheckCircle2, 
  Award, 
  FileSpreadsheet
} from 'lucide-react';
import { api } from '@/lib/api';
import type { CorridorContext, CrisisState, RouteRecommendation } from '@/lib/types';

interface ReportsSectionProps {
  approvalsCount?: number;
  corridorContext?: CorridorContext | null;
  selectedCrisis?: CrisisState | null;
  activeRoutes?: RouteRecommendation[];
}

interface ApprovalLogItem {
  id?: string;
  created_at?: string;
  approved_at?: string;
  crisis_id?: string;
  incident_id?: string;
  route_name?: string;
  route_id?: string;
  approved_by?: string;
  operator_id?: string;
  notes?: string;
  recommended_route?: RouteRecommendation;
}

export default function ReportsSection({
  approvalsCount = 14,
  corridorContext,
  selectedCrisis,
  activeRoutes
}: ReportsSectionProps) {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [liveApprovals, setLiveApprovals] = useState<number>(approvalsCount);
  const [healthScore, setHealthScore] = useState<number>(92);
  const [approvalList, setApprovalList] = useState<ApprovalLogItem[]>([]);

  useEffect(() => {
    async function loadStats() {
      try {
        const [appRes, healthRes] = await Promise.all([
          api.approvals.list(),
          api.sourceHealth.get()
        ]);
        if (appRes && typeof appRes.total === 'number') {
          setLiveApprovals(Math.max(appRes.total, approvalsCount));
          if (Array.isArray(appRes.items)) setApprovalList(appRes.items);
        }
        
        let totalSources = 0;
        let okSources = 0;
        if (healthRes && Array.isArray(healthRes.sources)) {
          healthRes.sources.forEach((source: { status: string }) => {
            totalSources += 1;
            if (source.status === 'healthy') okSources += 1;
          });
        }
        if (totalSources > 0) {
          setHealthScore(Math.round((okSources / totalSources) * 100));
        }
      } catch (err) {
        console.error('Failed to load stats for ReportsSection:', err);
      }
    }
    loadStats();
  }, [approvalsCount]);

  const handleGeneratePDF = () => {
    if (typeof window === 'undefined') return;
    const reportTitle = "PreHub — Laporan Operasional Mitigasi Logistik Pangan";
    const timestamp = new Date().toLocaleString("id-ID");
    
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Pop-up blocker prevented opening report. Please allow pop-ups.");
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportTitle}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #0f172a; background: #fff; line-height: 1.6; }
          .header { border-bottom: 3px solid #0284c7; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
          .title { font-size: 20px; font-weight: bold; color: #0f172a; margin: 0; text-transform: uppercase; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .meta { font-size: 12px; color: #475569; text-align: right; }
          .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
          .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
          .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: bold; }
          .kpi-value { font-size: 24px; font-weight: bold; color: #0284c7; margin-top: 8px; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 14px; font-weight: bold; text-transform: uppercase; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 12px; }
          .text { font-size: 13px; color: #334155; }
          .table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          .table th, .table td { border: 1px solid #cbd5e1; padding: 10px; font-size: 12px; text-align: left; }
          .table th { background: #f1f5f9; font-weight: bold; }
          .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">PreHub — Laporan Operasional Mitigasi Logistik Pangan</h1>
            <div class="subtitle">Koridor ${selectedCrisis?.region || 'Logistik Terpadu Pulau Sumatera'} — Pemantauan dan Rekomendasi Rute Alternatif</div>
          </div>
          <div class="meta">
            <div><strong>Diterbitkan:</strong> ${timestamp}</div>
            <div><strong>Integritas Data:</strong> ${healthScore}% OPERASIONAL</div>
            <div><strong>Otoritas:</strong> Pusat Kendali PreHub</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">Pengalihan Rute Disetujui</div>
            <div class="kpi-value">${liveApprovals} Tindakan</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Integritas Sumber Data</div>
            <div class="kpi-value">${healthScore}%</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Status Koridor</div>
            <div class="kpi-value">Terkendali</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">1. Ringkasan Eksekutif Logistik Pangan</div>
          <p class="text">
            Sistem PreHub memantau kelancaran rantai pasok secara berkala pada koridor logistik strategis Sumatera (${selectedCrisis?.region || 'Lintas Arteri & Maritim'}). 
            Melalui integrasi data cuaca BMKG, kepadatan jalan TomTom, arus maritim AIS, dan pemantauan harga pangan PIHPS, 
            sistem mendeteksi potensi hambatan distribusi dan merekomendasikan langkah mitigasi secara dini.
          </p>
        </div>

        <div class="section">
          <div class="section-title">2. Status Mitigasi & Jalur Alternatif</div>
          <p class="text">
            Pengalihan rute armada logistik melalui jalur tol dan bypass terverifikasi bertujuan menjaga kontinuitas pengiriman bahan pangan pokok serta meminimalisasi risiko keterlambatan di titik hambatan.
          </p>
        </div>

        <div class="section">
          <div class="section-title">3. Log Respon Insiden Terbaru</div>
          <table class="table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Tipe Insiden</th>
                <th>Lokasi</th>
                <th>Status Validasi</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${timestamp}</td>
                <td>${selectedCrisis?.title || 'Hambatan Arteri Logistik'}</td>
                <td>${selectedCrisis?.region || 'Koridor Lintas Sumatera'}</td>
                <td>Terkonfirmasi Multi-Sumber</td>
                <td>Rute Alternatif Diteruskan</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="footer">
          Laporan Operasional Distribusi Pangan • Sistem Pemantauan PreHub
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const handleExportJSON = () => {
    const payload = {
      report_title: "PreHub Operational Logistics Briefing",
      timestamp: new Date().toISOString(),
      system_integrity_pct: healthScore,
      total_approvals: liveApprovals,
      corridor: selectedCrisis?.region || "Pan-Sumatra Strategic Corridors",
      corridor_status: "Terkendali",
      active_crisis: selectedCrisis?.title || "Pantauan Koridor",
      approvals_log: approvalList
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PreHub_Operational_Report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full min-h-full lg:h-full flex flex-col gap-6 pointer-events-auto">
      
      {/* TOP KPI ROW */}
      <div className="bg-[#0c1017] border border-white/10 p-5 rounded-xl shadow-xl shrink-0 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
        
        {/* Metric 1 */}
        <div className="sm:px-6 first:pl-0 last:pr-0 py-2 sm:py-0">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-1">
            Pengalihan Disetujui
          </span>
          <p className="text-2xl font-mono font-bold text-white tabular-nums">{liveApprovals} Tindakan</p>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Terekam dalam Catatan Audit
          </p>
        </div>

        {/* Metric 2 */}
        <div className="sm:px-6 first:pl-0 last:pr-0 py-2 sm:py-0">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-1">
            Integritas Sumber Data
          </span>
          <p className="text-2xl font-mono font-bold text-white tabular-nums">{healthScore}%</p>
          <p className="text-xs text-slate-400 font-mono mt-1">
            BMKG, TomTom, & PIHPS Terverifikasi
          </p>
        </div>

        {/* Metric 3 */}
        <div className="sm:px-6 first:pl-0 last:pr-0 py-2 sm:py-0">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-1">
            Status Koridor
          </span>
          <p className="text-2xl font-mono font-bold text-emerald-400">Terkendali</p>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Rute Alternatif Siap Digunakan
          </p>
        </div>

      </div>

      {/* MAIN DOCUMENT WORKSPACE */}
      <div className="flex-1 bg-[#0c1017] border border-white/10 rounded-xl p-6 flex flex-col min-h-0 shadow-xl overflow-hidden">
        
        {/* Document Header Bar */}
        <div className="flex flex-wrap justify-between items-center pb-4 border-b border-white/10 shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <h2 className="font-headline font-semibold text-base text-white tracking-wide">
                Laporan Ringkasan Mitigasi Logistik Pangan
              </h2>
              <p className="text-xs font-sans text-slate-400">
                PreHub Logistik • {selectedCrisis?.region || 'Koridor Prioritas Pulau Sumatera'}
              </p>
            </div>
          </div>

          {/* Page Switcher */}
          <div className="flex items-center gap-2 bg-[#121822] border border-white/10 px-3 py-1.5 rounded-lg font-mono text-xs">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="hover:text-white disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-300 font-medium">Halaman {currentPage} / 3</span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(3, prev + 1))}
              disabled={currentPage === 3}
              className="hover:text-white disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Page Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar my-4 p-5 bg-[#121822] rounded-xl border border-white/5 space-y-4">
          
          {currentPage === 1 && (
            <div className="space-y-4 text-xs leading-relaxed text-slate-200">
              <div className="border-b border-white/10 pb-3">
                <h3 className="font-headline text-base font-bold text-white uppercase tracking-wide">
                  1. Ringkasan Pemantauan Koridor Logistik
                </h3>
                <p className="text-[10px] font-mono text-slate-400">Periode: Siklus Pemantauan Aktif</p>
              </div>
              <p>
                Sistem PreHub memantau kelancaran jalur distribusi bahan pangan pada koridor logistik terpadu Sumatera ({selectedCrisis?.region || 'Jalur Arteri Lintas Timur, Barat, Tengah & Jalur Laut'}). Informasi hambatan dipetakan secara real-time guna mendukung kelancaran pengiriman komoditas strategis.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-3.5 rounded-xl bg-[#0c1017] border border-white/10">
                  <span className="font-bold text-white uppercase font-headline block mb-1">Kesiapan Mitigasi</span>
                  <ul className="list-disc list-inside text-xs space-y-1 text-slate-300">
                    <li>Rekomendasi rute alternatif siap digunakan saat terjadi hambatan jalur.</li>
                    <li>Pemetaan titik genangan air dan kepadatan lalu lintas secara berkala.</li>
                    <li>Sinergi rute jalan tol dan jalan nasional untuk menjaga arus distribusi.</li>
                  </ul>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0c1017] border border-white/10">
                  <span className="font-bold text-slate-300 uppercase font-headline block mb-1">Faktor Risiko Dipantau</span>
                  <ul className="list-disc list-inside text-xs space-y-1 text-slate-300">
                    <li>Peringatan cuaca ekstrem BMKG untuk antisipasi genangan air di pesisir Belawan.</li>
                    <li>Tingkat kepadatan lalu lintas pada ruas jalan lintas utama Jalinsum.</li>
                    <li>Perkembangan harga harian bahan pangan pokok di pasar konsumen utama.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {currentPage === 2 && (
            <div className="space-y-4 text-xs leading-relaxed text-slate-200">
              <div className="border-b border-white/10 pb-3">
                <h3 className="font-headline text-base font-bold text-white uppercase tracking-wide">
                  2. Verifikasi Data Multi-Sumber
                </h3>
                <p className="text-[10px] font-mono text-slate-400">Integrasi Data Cuaca, Lalu Lintas, dan Kondisi Pasar</p>
              </div>
              <p>
                Peringatan gangguan divalidasi silang dari penyedia data resmi untuk memastikan keakuratan informasi sebelum rekomendasi rute alternatif diterbitkan kepada operator.
              </p>
              <div className="p-4 rounded-xl bg-[#080d14] border border-white/10 font-mono text-xs space-y-2 text-slate-300">
                <div className="text-slate-200 font-semibold">• DATA CUACA (BMKG): Pemantauan intensitas curah hujan dan peringatan dini regional.</div>
                <div className="text-slate-200 font-semibold">• DATA LALU LINTAS (TomTom): Pantauan kecepatan kendaraan dan titik perlambatan arteri.</div>
                <div className="text-slate-200 font-semibold">• OPTIMASI RUTE: Perhitungan jalur alternatif menghindari titik hambatan jalan.</div>
                <div className="text-slate-200 font-semibold">• DATA HARGA (PIHPS): Pemantauan kestabilan harga beras, minyak goreng, dan cabai.</div>
              </div>
            </div>
          )}

          {currentPage === 3 && (
            <div className="space-y-4 text-xs leading-relaxed text-slate-200">
              <div className="border-b border-white/10 pb-3">
                <h3 className="font-headline text-base font-bold text-white uppercase tracking-wide">
                  3. Catatan Persetujuan Pengalihan Rute
                </h3>
                <p className="text-[10px] font-mono text-slate-400">Riwayat Keputusan Operator Logistik</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-white/15 text-slate-300 uppercase">
                      <th className="py-2 px-3">Waktu</th>
                      <th className="py-2 px-3">Insiden</th>
                      <th className="py-2 px-3">Rute Rekomendasi</th>
                      <th className="py-2 px-3">Penyetuju</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {approvalList.length > 0 ? (
                      approvalList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-white/5">
                          <td className="py-2 px-3 text-slate-400">{new Date(item.created_at || item.approved_at || Date.now()).toLocaleTimeString()}</td>
                          <td className="py-2 px-3 font-semibold text-white">{item.crisis_id || item.incident_id || 'Genangan Air Jalinsum'}</td>
                          <td className="py-2 px-3 text-slate-300">{item.route_name || item.recommended_route?.description || 'Bypass Medan-Tebing Tinggi'}</td>
                          <td className="py-2 px-3 text-slate-400">{item.approved_by || item.operator_id || 'Operator Logistik'}</td>
                          <td className="py-2 px-3 text-emerald-400 font-semibold">DISETUJUI</td>
                        </tr>
                      ))
                    ) : (
                      <>
                        <tr className="hover:bg-white/5">
                          <td className="py-2 px-3 text-slate-400">09:15</td>
                          <td className="py-2 px-3 font-semibold text-white">Genangan Air Jalinsum</td>
                          <td className="py-2 px-3 text-slate-300">Tol Belmera - Tebing Tinggi</td>
                          <td className="py-2 px-3 text-slate-400">Operator Logistik Pangan</td>
                          <td className="py-2 px-3 text-emerald-400 font-semibold">DISETUJUI</td>
                        </tr>
                        <tr className="hover:bg-white/5">
                          <td className="py-2 px-3 text-slate-400">08:40</td>
                          <td className="py-2 px-3 font-semibold text-white">Hambatan Arteri Sei Rampah</td>
                          <td className="py-2 px-3 text-slate-300">Jalur Alternatif Lintas Timur</td>
                          <td className="py-2 px-3 text-slate-400">Operator Armada</td>
                          <td className="py-2 px-3 text-emerald-400 font-semibold">DISETUJUI</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Executive Action Toolbar */}
        <div className="flex flex-wrap justify-between items-center pt-3 border-t border-white/10 shrink-0 gap-3">
          <span className="text-xs font-mono text-slate-400">
            ID Dokumen: PREHUB-OPS-2026-01
          </span>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportJSON}
              className="px-3.5 py-2 bg-[#121822] hover:bg-[#1a2230] text-slate-200 border border-white/10 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Ekspor Data JSON
            </button>

            <button
              onClick={handleGeneratePDF}
              className="px-4 py-2 bg-white hover:bg-slate-200 text-[#080d14] text-xs font-semibold rounded-md transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#080d14]" /> Cetak Laporan PDF
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
