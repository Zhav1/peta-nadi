'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
 FileText, 
 Printer, 
 FileSpreadsheet,
 Search,
 Calendar,
 Filter,
 X,
 RotateCcw
} from 'lucide-react';
import { api } from '@/lib/api';
import type { CorridorContext, CrisisState, RouteRecommendation, DecisionAction, TacticalManeuver } from '@/lib/types';
import ERPSavingsPanel from '@/components/dashboard/ERPSavingsPanel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/base-ui/table';

interface ReportsSectionProps {
 approvalsCount?: number;
 corridorContext?: CorridorContext | null;
 selectedCrisis?: CrisisState | null;
 activeRoutes?: RouteRecommendation[];
 onCreateMitigation?: () => void;
}

interface ApprovalLogItem {
 id?: string;
 created_at?: string;
 approved_at?: string;
 crisis_id?: string;
 incident_id?: string;
 route_name?: string;
 route_id?: string;
 action?: DecisionAction | string;
 tactical_action?: TacticalManeuver | string;
 approved_by?: string;
 operator_id?: string;
 notes?: string;
 sync_status?: string;
 is_demo?: boolean;
 recommended_route?: RouteRecommendation;
}

function isDemoApproval(item: { id?: string; incident_id?: string; notes?: string; is_demo?: boolean }): boolean {
 if (item.is_demo === true) return true;
 const hay = `${item.id || ''} ${item.incident_id || ''} ${item.notes || ''}`.toUpperCase();
 return hay.includes('DEMO');
}

function escapeHtml(str: string): string {
 return String(str)
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#039;');
}

function formatDateTime(isoString?: string): string {
 if (!isoString) return '-';
 const d = new Date(isoString);
 if (isNaN(d.getTime())) return String(isoString);
 return d.toLocaleString('id-ID', {
 day: '2-digit',
 month: 'short',
 year: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 second: '2-digit',
 timeZoneName: 'short',
 });
}

export default function ReportsSection({
 approvalsCount = 0,
 corridorContext,
 selectedCrisis,
 activeRoutes,
 onCreateMitigation
}: ReportsSectionProps) {
 const [liveApprovals, setLiveApprovals] = useState<number>(approvalsCount);
 const [healthScore, setHealthScore] = useState<number>(92);
 const [approvalList, setApprovalList] = useState<ApprovalLogItem[]>([]);
 const [isLoading, setIsLoading] = useState<boolean>(true);
 const [reportView, setReportView] = useState<'erp' | 'audit'>('erp');
 const [erpRefreshKey, setErpRefreshKey] = useState(0);
 const [reloadTick, setReloadTick] = useState(0);

 // Client-side filter states
 const [searchQuery, setSearchQuery] = useState<string>('');
 const [statusFilter, setStatusFilter] = useState<string>('ALL');
 const [startDate, setStartDate] = useState<string>('');
 const [endDate, setEndDate] = useState<string>('');

 useEffect(() => {
 let isMounted = true;
 async function loadStats() {
 setIsLoading(true);
 try {
 const [appRes, healthRes] = await Promise.all([
 api.approvals.list(),
 api.sourceHealth.get()
 ]);
 if (!isMounted) return;

 if (appRes && typeof appRes.total === 'number') {
 setLiveApprovals(appRes.total);
 if (Array.isArray(appRes.items)) setApprovalList(appRes.items.map((it) => ({ ...it, is_demo: isDemoApproval(it) })));
 } else if (appRes && Array.isArray(appRes.items)) {
 setLiveApprovals(appRes.items.length);
 setApprovalList(appRes.items.map((it) => ({ ...it, is_demo: isDemoApproval(it) })));
 } else {
 setLiveApprovals(0);
 setApprovalList([]);
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
 } finally {
 if (isMounted) setIsLoading(false);
 }
 }
 loadStats();
 return () => {
 isMounted = false;
 };
 }, [reloadTick]);

 // Derive corridor status from actual crisis and corridor metrics
 const corridorStatus = useMemo(() => {
 if (selectedCrisis) {
 const sev = selectedCrisis.severity?.toLowerCase();
 if (sev === 'critical') {
 return { text: 'Kritis', color: 'text-rose-400', sub: 'Hambatan Mayor Terdeteksi' };
 }
 if (sev === 'high') {
 return { text: 'Waspada Tinggi', color: 'text-amber-400', sub: 'Mitigasi Aktif Diperlukan' };
 }
 if (sev === 'medium') {
 return { text: 'Perhatian', color: 'text-amber-300', sub: 'Pemantauan Koridor Diperketat' };
 }
 return { text: 'Terkendali', color: 'text-emerald-400', sub: 'Rute Alternatif Aktif' };
 }
 if (corridorContext?.traffic?.status) {
 const s = corridorContext.traffic.status.toLowerCase();
 if (s.includes('kritis') || s.includes('lumpuh')) {
 return { text: 'Kritis', color: 'text-rose-400', sub: 'Gangguan Arteri Logistik' };
 }
 if (s.includes('padat') || s.includes('terhambat')) {
 return { text: 'Waspada', color: 'text-amber-400', sub: 'Kepadatan Arus Lalu Lintas' };
 }
 if (s.includes('degraded') || s.includes('fallback') || s.includes('offline') || s.includes('terbatas')) {
 return { text: 'Waspada', color: 'text-amber-400', sub: 'Data Terbatas — Fallback Aktif' };
 }
 return { text: 'Normal', color: 'text-emerald-400', sub: 'Arus Koridor Lancar' };
 }
 return { text: 'Stabil', color: 'text-emerald-400', sub: 'Koridor Beroperasi Normal' };
 }, [selectedCrisis, corridorContext]);

 // Client-side filtering logic
 const filteredList = useMemo(() => {
 return approvalList.filter((item) => {
 // 1. Status filter (by DecisionAction)
 if (statusFilter !== 'ALL') {
 const itemAction = (item.action || 'ACCEPT').toUpperCase();
 if (itemAction !== statusFilter) return false;
 }

 // 2. Date range filter
 const dateStr = item.created_at || item.approved_at;
 if (dateStr) {
 const itemTime = new Date(dateStr).getTime();
 if (!isNaN(itemTime)) {
 if (startDate) {
 const start = new Date(startDate);
 start.setHours(0, 0, 0, 0);
 if (itemTime < start.getTime()) return false;
 }
 if (endDate) {
 const end = new Date(endDate);
 end.setHours(23, 59, 59, 999);
 if (itemTime > end.getTime()) return false;
 }
 }
 }

 // 3. Search query filter
 if (searchQuery.trim()) {
 const q = searchQuery.toLowerCase().trim();
 const inc = (item.crisis_id || item.incident_id || '').toLowerCase();
 const route = (item.route_name || item.recommended_route?.description || `rute ${item.route_id || ''}`).toLowerCase();
 const op = (item.approved_by || item.operator_id || '').toLowerCase();
 const notes = (item.notes || '').toLowerCase();
 const action = (item.action || '').toLowerCase();
 const tactical = (item.tactical_action || '').toLowerCase();
 const sync = (item.sync_status || '').toLowerCase();

 const matches =
 inc.includes(q) ||
 route.includes(q) ||
 op.includes(q) ||
 notes.includes(q) ||
 action.includes(q) ||
 tactical.includes(q) ||
 sync.includes(q);

 if (!matches) return false;
 }

 return true;
 });
 }, [approvalList, statusFilter, startDate, endDate, searchQuery]);

 const hasActiveFilters = statusFilter !== 'ALL' || Boolean(startDate) || Boolean(endDate) || Boolean(searchQuery.trim());

 const demoCount = useMemo(() => approvalList.filter((it) => it.is_demo).length, [approvalList]);
 const realCount = useMemo(() => approvalList.filter((it) => !it.is_demo).length, [approvalList]);

 const handleResetFilters = () => {
 setStatusFilter('ALL');
 setStartDate('');
 setEndDate('');
 setSearchQuery('');
 };

 const handleReloadAudit = () => setReloadTick((k) => k + 1);

 const handleGeneratePDF = () => {
 if (typeof window === 'undefined') return;
 const reportTitle = "PreHub: Laporan Operasional Mitigasi Logistik Pangan";
 const timestamp = new Date().toLocaleString("id-ID", {
 day: '2-digit',
 month: 'short',
 year: 'numeric',
 hour: '2-digit',
 minute: '2-digit',
 second: '2-digit',
 timeZoneName: 'short'
 });
 
 const printWindow = window.open("", "_blank");
 if (!printWindow) {
 alert("Pop-up blocker prevented opening report. Please allow pop-ups.");
 return;
 }

 const tableRows = filteredList.length > 0
 ? filteredList.map((item) => {
 const dt = formatDateTime(item.created_at || item.approved_at);
 const inc = escapeHtml(item.crisis_id || item.incident_id || 'INC-DEFAULT');
 const route = escapeHtml(item.route_name || item.recommended_route?.description || `Rute #${item.route_id || '0'}`);
 const tactical = item.tactical_action ? ` <span style="font-size: 10px; color: #64748b;">(${escapeHtml(item.tactical_action)})</span>` : '';
 const op = escapeHtml(item.approved_by || item.operator_id || 'Operator');
 const act = (item.action || 'ACCEPT').toUpperCase();
 const actColor = act === 'ACCEPT' ? '#059669' : act === 'REJECT' ? '#e11d48' : '#b45309';
 const sync = escapeHtml((item.sync_status || 'synced').toUpperCase());
 const notes = item.notes ? `<div style="font-size: 10px; color: #64748b; margin-top: 3px; font-style: italic;">Catatan: ${escapeHtml(item.notes)}</div>` : '';

 return `
 <tr>
 <td style="white-space: nowrap;">${dt}</td>
 <td><strong>${inc}</strong></td>
 <td>${route}${tactical}${notes}</td>
 <td>${op}</td>
 <td>
 <span style="font-weight: bold; color: ${actColor};">${act}</span>
 <span style="font-size: 10px; color: #64748b; display: block;">[${sync}]</span>
 </td>
 </tr>
 `;
 }).join('')
 : `
 <tr>
 <td colspan="5" style="text-align: center; color: #94a3b8; padding: 24px;">
 Tidak ada catatan audit yang sesuai dengan filter yang dipilih.
 </td>
 </tr>
 `;

 const htmlContent = `
 <!DOCTYPE html>
 <html>
 <head>
 <title>${reportTitle}</title>
 <style>
 body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #0f172a; background: #fff; line-height: 1.6; }
 .header { border-bottom: 3px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
 .title { font-size: 20px; font-weight: bold; color: #0f172a; margin: 0; text-transform: uppercase; }
 .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
 .meta { font-size: 12px; color: #475569; text-align: right; }
 .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
 .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
 .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: bold; }
 .kpi-value { font-size: 22px; font-weight: bold; color: #047857; margin-top: 8px; }
 .section { margin-bottom: 30px; }
 .section-title { font-size: 14px; font-weight: bold; text-transform: uppercase; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 12px; }
 .text { font-size: 13px; color: #334155; }
 .filter-badge { display: inline-block; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 4px; font-size: 11px; margin-bottom: 12px; }
 .table { width: 100%; border-collapse: collapse; margin-top: 12px; }
 .table th, .table td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 11px; text-align: left; vertical-align: top; }
 .table th { background: #f1f5f9; font-weight: bold; color: #334155; }
 .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center; }
 @media print { body { padding: 20px; } }
 </style>
 </head>
 <body>
 <div class="header">
 <div>
 <h1 class="title">PreHub: Laporan Operasional Mitigasi Logistik Pangan</h1>
 <div class="subtitle">Koridor ${escapeHtml(selectedCrisis?.region || corridorContext?.corridor_name || 'Logistik Terpadu Pulau Sumatera')} - Pemantauan dan Rekomendasi Rute Alternatif</div>
 </div>
 <div class="meta">
 <div><strong>Diterbitkan:</strong> ${timestamp}</div>
 <div><strong>Integritas Data:</strong> ${healthScore}% OPERASIONAL</div>
 <div><strong>Otoritas:</strong> Pusat Kendali PreHub</div>
 </div>
 </div>

 <div class="kpi-grid">
 <div class="kpi-card">
 <div class="kpi-label">Pengalihan tercatat</div>
 <div class="kpi-value">${filteredList.length} <span style="font-size: 13px; font-weight: normal; color: #64748b;">/ ${liveApprovals} Total</span></div>
 </div>
 <div class="kpi-card">
 <div class="kpi-label">Integritas sumber</div>
 <div class="kpi-value">${healthScore}%</div>
 </div>
 <div class="kpi-card">
 <div class="kpi-label">Status koridor</div>
 <div class="kpi-value">${escapeHtml(corridorStatus.text)}</div>
 </div>
 </div>

 <div class="section">
 <div class="section-title">1. Ringkasan Eksekutif Logistik Pangan</div>
 <p class="text">
 Sistem PreHub memantau kelancaran rantai pasok secara berkala pada koridor logistik strategis Sumatera (${escapeHtml(selectedCrisis?.region || corridorContext?.corridor_name || 'Lintas Arteri & Maritim')}). 
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
 <div class="section-title">3. Catatan Audit Tindakan Operator (${filteredList.length} Tindakan)</div>
 ${hasActiveFilters ? `<div class="filter-badge">Filter Aktif: Status=${escapeHtml(statusFilter)}${startDate ? `, Mulai=${escapeHtml(startDate)}` : ''}${endDate ? `, Selesai=${escapeHtml(endDate)}` : ''}${searchQuery ? `, Kata Kunci="${escapeHtml(searchQuery)}"` : ''}</div>` : ''}
 <table class="table">
 <thead>
 <tr>
 <th style="width: 20%;">Waktu</th>
 <th style="width: 18%;">Insiden</th>
 <th style="width: 32%;">Rute Rekomendasi</th>
 <th style="width: 15%;">Penyetuju</th>
 <th style="width: 15%;">Keputusan & Status</th>
 </tr>
 </thead>
 <tbody>
 ${tableRows}
 </tbody>
 </table>
 </div>

 <div class="footer">
 Laporan Operasional Distribusi Pangan • Sistem Pemantauan PreHub • Catatan Audit Terverifikasi
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
 filtered_approvals_count: filteredList.length,
 filters_applied: {
 status: statusFilter,
 start_date: startDate || null,
 end_date: endDate || null,
 search: searchQuery || null
 },
 corridor: selectedCrisis?.region || corridorContext?.corridor_name || "Pan-Sumatra Strategic Corridors",
 corridor_status: corridorStatus.text,
 active_crisis: selectedCrisis?.title || "Pantauan Koridor",
 approvals_log: filteredList
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

 {/* VIEW TABS: ERP savings vs mitigation audit ledger */}
 <div className="flex items-center gap-1 bg-[#0c1017] border border-white/10 rounded-lg p-1 shrink-0 w-fit">
 {[
 { id: 'erp' as const, label: 'Laporan' },
 { id: 'audit' as const, label: 'Catatan Audit Mitigasi' },
 ].map((tab) => (
 <button
 key={tab.id}
 type="button"
 onClick={() => {
 setReportView(tab.id);
 if (tab.id === 'erp') setErpRefreshKey((k) => k + 1);
 }}
 className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer whitespace-nowrap ${
 reportView === tab.id
 ? 'bg-white text-[#080d14] font-semibold'
 : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
 }`}
 >
 {tab.label}
 </button>
 ))}
 </div>

 {reportView === 'erp' ? (
 <ERPSavingsPanel refreshKey={erpRefreshKey} />
 ) : (
 <>
 {/* TOP KPI ROW */}
 <div className="bg-[#0c1017] border border-white/10 p-5 rounded-xl shrink-0 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
 
 {/* Metric 1 */}
 <div className="sm:px-6 first:pl-0 last:pr-0 py-2 sm:py-0">
 <span className="text-xs font-medium text-slate-400 block mb-1">
 Pengalihan tercatat
 </span>
 <p className="text-2xl font-bold text-white tabular-nums">
 {liveApprovals} Tindakan
 </p>
 <p className="text-xs text-slate-400 tabular-nums mt-1">
 {hasActiveFilters && filteredList.length !== liveApprovals
 ? `${filteredList.length} ditampilkan pada filter`
 : 'Terekam dalam Catatan Audit'}
 </p>
 </div>

 {/* Metric 2 */}
 <div className="sm:px-6 first:pl-0 last:pr-0 py-2 sm:py-0">
 <span className="text-xs font-medium text-slate-400 block mb-1">
 Integritas sumber
 </span>
 <p className="text-2xl font-bold text-white tabular-nums">{healthScore}%</p>
 <p className="text-xs text-slate-400 tabular-nums mt-1">
 BMKG, TomTom, & PIHPS Terverifikasi
 </p>
 </div>

 {/* Metric 3 */}
 <div className="sm:px-6 first:pl-0 last:pr-0 py-2 sm:py-0">
 <span className="text-xs font-medium text-slate-400 block mb-1">
 Status koridor
 </span>
 <p className={`text-2xl font-bold tabular-nums ${corridorStatus.color}`}>
 {corridorStatus.text}
 </p>
 <p className="text-xs text-slate-400 tabular-nums mt-1">
 {corridorStatus.sub}
 </p>
 </div>

 </div>

 {/* MAIN AUDIT LEDGER WORKSPACE */}
 <div className="flex-1 bg-[#0c1017] border border-white/10 rounded-xl p-6 flex flex-col min-h-0 overflow-hidden">
 
 {/* Document Header Bar */}
 <div className="flex flex-wrap justify-between items-center pb-4 border-b border-white/10 shrink-0 gap-3">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
 <FileText className="w-5 h-5 text-slate-300" />
 </div>
 <div>
 <h2 className="font-headline font-semibold text-base text-white tracking-wide">
 Catatan Audit Mitigasi Logistik Pangan
 </h2>
 <p className="text-xs font-sans text-slate-400">
 Riwayat persetujuan tindakan pengalihan dan verifikasi koridor • {selectedCrisis?.region || corridorContext?.corridor_name || 'Pulau Sumatera'}
 </p>
 </div>
 </div>
 <div className="text-right flex flex-col items-end gap-1.5">
 <span className="text-xs text-slate-400 tabular-nums">
 {filteredList.length} dari {liveApprovals} Catatan
 </span>
 {approvalList.length > 0 && (
 <span className="flex items-center gap-1.5" aria-label="Label keaslian data">
 {demoCount > 0 && (
 <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-mono tabular-nums" title="Baris seed demonstrasi — bukan transaksi operasional nyata">
 Demo {demoCount}
 </span>
 )}
 <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs font-mono tabular-nums" title="Baris commit operator nyata via POST /approvals">
 Real {realCount}
 </span>
 </span>
 )}
 </div>
 </div>

 {/* Filters Toolbar */}
 <div className="pt-4 pb-2 flex flex-wrap items-center gap-2.5 shrink-0">
 {/* Search Input */}
 <div className="relative flex-1 min-w-[200px]">
 <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
 <input
 id="audit-filter-search"
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Cari ID insiden, rute, operator, catatan..."
 className="w-full bg-transparent border border-white/10 rounded-lg pl-8 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-emerald-400/60 transition-colors"
 />
 {searchQuery && (
 <button
 onClick={() => setSearchQuery('')}
 className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
 title="Hapus pencarian"
 >
 <X className="w-3.5 h-3.5" />
 </button>
 )}
 </div>

 {/* Status Filter */}
 <div className="flex items-center gap-1.5 shrink-0">
 <Filter className="w-3.5 h-3.5 text-slate-400" />
 <select
 value={statusFilter}
 onChange={(e) => setStatusFilter(e.target.value)}
 className="bg-transparent border border-white/10 rounded-lg px-2.5 py-2 text-xs text-slate-200 focus:outline-none cursor-pointer"
 >
 <option value="ALL">Semua Keputusan</option>
 <option value="ACCEPT">ACCEPT (Disetujui)</option>
 <option value="REJECT">REJECT (Ditolak)</option>
 <option value="OVERRIDE">OVERRIDE (Penyesuaian)</option>
 </select>
 </div>

 {/* Date Range Filters */}
 <div className="flex items-center gap-1.5 shrink-0">
 <Calendar className="w-3.5 h-3.5 text-slate-400" />
 <input
 type="date"
 value={startDate}
 onChange={(e) => setStartDate(e.target.value)}
 className="bg-transparent border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer [color-scheme:dark]"
 title="Tanggal Mulai"
 />
 <span className="text-slate-500 text-xs">-</span>
 <input
 type="date"
 value={endDate}
 onChange={(e) => setEndDate(e.target.value)}
 className="bg-transparent border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer [color-scheme:dark]"
 title="Tanggal Selesai"
 />
 </div>

 {/* Reset Filters Button */}
 {hasActiveFilters && (
 <button
 onClick={handleResetFilters}
 className="px-2.5 py-2 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
 title="Reset semua filter"
 >
 <RotateCcw className="w-3 h-3 text-slate-400" />
 <span>Reset Filter</span>
 </button>
 )}
 </div>

 {/* Audit Ledger Table View */}
 <div className="flex-1 overflow-y-auto custom-scrollbar my-3 border-t border-white/10 pt-4">
 <div className="overflow-x-auto">
 <Table className="w-full">
 <TableHeader>
 <TableRow>
 <TableHead className="h-11 bg-[#0c1017] font-medium">Waktu</TableHead>
 <TableHead className="h-11 bg-[#0c1017] font-medium">Insiden</TableHead>
 <TableHead className="h-11 bg-[#0c1017] font-medium">Rute rekomendasi</TableHead>
 <TableHead className="h-11 bg-[#0c1017] font-medium">Penyetuju</TableHead>
 <TableHead className="h-11 bg-[#0c1017] font-medium">Keputusan</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {isLoading ? (
 <TableRow>
 <TableCell colSpan={5} className="py-12 text-center text-slate-400">
 <div className="flex flex-col items-center justify-center gap-2">
 <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
 <span className="text-xs">Memuat catatan audit...</span>
 </div>
 </TableCell>
 </TableRow>
 ) : filteredList.length > 0 ? (
 filteredList.map((item, idx) => {
 const actionUpper = (item.action || 'ACCEPT').toUpperCase();
 const isSynced = (item.sync_status === 'synced' || !item.sync_status);
 const syncLabel = (item.sync_status || 'synced').toUpperCase();

 return (
 <TableRow key={item.id || idx} className="hover:bg-white/5">
 <TableCell className="py-3 whitespace-nowrap tabular-nums">
 {formatDateTime(item.created_at || item.approved_at)}
 </TableCell>
 <TableCell className="py-3 font-medium text-white tabular-nums">
 <span className="flex items-center gap-1.5 flex-wrap">
 {item.crisis_id || item.incident_id || 'INC-DEFAULT'}
 {item.is_demo && (
 <span className="px-1 py-px rounded bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-mono" title="Baris seed demonstrasi — bukan transaksi operasional nyata">
 Demo
 </span>
 )}
 </span>
 </TableCell>
 <TableCell className="py-3">
 <div className="font-medium text-slate-200">
 {item.route_name || item.recommended_route?.description || `Rute #${item.route_id || '0'}`}
 </div>
 {item.tactical_action && (
 <div className="text-xs text-slate-400 tabular-nums mt-0.5">
 Taktis: {item.tactical_action}
 </div>
 )}
 {item.notes && (
 <div className="text-xs text-slate-400 italic mt-1 pt-1 border-t border-white/10">
 Catatan: {item.notes}
 </div>
 )}
 </TableCell>
 <TableCell className="py-3 text-slate-400">
 {item.approved_by || item.operator_id || 'Operator Logistik'}
 </TableCell>
 <TableCell className="py-3">
 <div className="flex flex-col gap-1 items-start">
 <span className="flex items-center gap-1.5 text-xs">
 {actionUpper === 'ACCEPT' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
 {actionUpper === 'REJECT' && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />}
 {actionUpper === 'OVERRIDE' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
 <span className={actionUpper === 'ACCEPT' ? 'text-emerald-300 font-semibold' : actionUpper === 'REJECT' ? 'text-rose-300 font-semibold' : 'text-amber-300 font-semibold'}>
 {actionUpper}
 </span>
 </span>
 <span className="text-xs text-slate-500 flex items-center gap-1.5 tabular-nums">
 {!isSynced && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
 {syncLabel}
 </span>
 </div>
 </TableCell>
 </TableRow>
 );
 })
 ) : (
 <TableRow>
 <TableCell colSpan={5} className="py-12 text-center">
 <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
 {hasActiveFilters ? (
 <>
 <Filter className="w-8 h-8 text-slate-600 mb-1" />
 <p className="text-sm font-medium text-slate-300">Tidak ada catatan yang cocok dengan filter</p>
 <p className="text-xs text-slate-500 max-w-sm">
 Coba sesuaikan kata kunci pencarian, rentang tanggal, atau opsi status keputusan.
 </p>
 <button
 onClick={handleResetFilters}
 className="mt-3 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 rounded-md text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
 >
 <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
 Reset Semua Filter
 </button>
 </>
 ) : (
 <>
 <FileText className="w-8 h-8 text-slate-600 mb-1" aria-hidden="true" />
 <p className="text-sm font-medium text-slate-300">Belum ada catatan persetujuan mitigasi</p>
 <p className="text-xs text-slate-500 max-w-md leading-relaxed">
 Audit terisi otomatis setelah Dispatcher melakukan commit keputusan
 (Accept / Reject / Override) dari Peta Operasi melalui POST /approvals.
 Mode Sandbox tamu tidak dapat mengisi audit — masuk sebagai Dispatcher untuk mencatat mitigasi.
 </p>
 <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
 <button
 onClick={() => { if (onCreateMitigation) onCreateMitigation(); }}
 className="px-4 py-2 bg-white hover:bg-slate-200 text-[#080d14] text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
 >
 Buat mitigasi — buka Peta
 </button>
 <button
 onClick={handleReloadAudit}
 className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-md text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
 >
 <RotateCcw className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
 Muat ulang data
 </button>
 </div>
 <a
 href="#audit-filter-search"
 onClick={(e) => { e.preventDefault(); handleResetFilters(); handleReloadAudit(); }}
 className="mt-1 text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 rounded"
 >
 Reset filter & tampilkan semua
 </a>
 </>
 )}
 </div>
 </TableCell>
 </TableRow>
 )}
 </TableBody>
 </Table>
 </div>
 </div>

 {/* Executive Action Toolbar */}
 <div className="flex flex-wrap justify-between items-center pt-3 border-t border-white/10 shrink-0 gap-3">
 <span className="text-xs text-slate-400 tabular-nums">
 ID Dokumen: PREHUB-OPS-2026-01
 </span>

 <div className="flex items-center gap-3">
 <button
 onClick={handleExportJSON}
 className="px-3.5 py-2 bg-transparent hover:bg-white/5 text-slate-200 border border-white/10 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
 >
 <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Ekspor Data JSON
 </button>

 <button
 onClick={handleGeneratePDF}
 className="px-4 py-2 bg-white hover:bg-slate-200 text-[#080d14] text-xs font-medium rounded-md transition-colors flex items-center gap-2 cursor-pointer"
 >
 <Printer className="w-4 h-4 text-[#080d14]" /> Cetak Laporan PDF
 </button>
 </div>
 </div>

 </div>

 </>
 )}

 </div>
 );
}
