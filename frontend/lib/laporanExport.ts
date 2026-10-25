// M8 Phase 3: frontend-only export helpers for Laporan.
// No API calls, no side effects except the explicit download/print triggers.

import type {
  ERPSummaryResponse,
  ERPTripRow,
  ERPTotals,
  LaporanFilters,
} from './types';
import type { LaporanGranularity } from '@/components/dashboard/LaporanFilterBar';

export function escapeLaporanHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface LaporanExportContext {
  filtered: ERPTripRow[];
  filters: LaporanFilters;
  granularity: LaporanGranularity;
  totals: ERPTotals | null;
  summary: ERPSummaryResponse | null;
}

function formatIDR(value?: number | null): string {
  const n = Number(value ?? 0);
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

function periodeLabel(filters: LaporanFilters): string {
  const s = filters.startDate ?? '';
  const e = filters.endDate ?? '';
  if (s && e) return `${s}..${e}`;
  if (s) return `>=${s}`;
  if (e) return `<=${e}`;
  return 'semua';
}

/** Canonical export payload. Regulator sees aggregate-only trips. */
export function buildLaporanPayload(ctx: LaporanExportContext): Record<string, unknown> {
  const { filtered, filters, granularity, totals, summary } = ctx;
  const scope = summary?.scope ?? 'DISPATCHER_DETAIL';
  const isAggregateOnly = scope === 'REGULATOR_AGGREGATE';
  return {
    report_title: 'PreHub Laporan Penghematan Logistik',
    generated_at: summary?.generated_at ?? new Date().toISOString(),
    scope,
    company_id: summary?.company_id ?? null,
    storage: summary?.storage ?? null,
    filters_applied: {
      periode: periodeLabel(filters),
      start_date: filters.startDate ?? null,
      end_date: filters.endDate ?? null,
      tier: filters.tier ?? 'ALL',
      status: filters.status ?? 'ALL',
      search: filters.search ?? null,
      granularity,
    },
    totals,
    trip_count: filtered.length,
    // Regulator payload carries per-company aggregates only, never per-rit detail.
    ...(isAggregateOnly
      ? { per_company: summary?.per_company ?? [] }
      : { trips: filtered }),
    business_notes: summary?.business_notes ?? [],
  };
}

export function exportLaporanJSON(ctx: LaporanExportContext): Record<string, unknown> {
  const payload = buildLaporanPayload(ctx);
  if (typeof document === 'undefined') return payload;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PreHub_Laporan_${Date.now()}.json`;
  a.setAttribute('data-testid', 'export-json-link');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return payload;
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Regulator CSV: per-company aggregate only. Dispatcher CSV: full per-rit rows. */
export function buildLaporanCSV(ctx: LaporanExportContext): string {
  const { filtered, summary } = ctx;
  const isAggregateOnly = summary?.scope === 'REGULATOR_AGGREGATE';
  if (isAggregateOnly) {
    const header = [
      'company_id',
      'total_trips',
      'delivered_trips',
      'failed_trips',
      'reroute_success_count',
      'time_saved_hours',
      'fuel_saved_liters',
      'cost_saved_idr',
      'cost_efficiency_pct',
    ];
    const lines = [header.join(',')];
    for (const row of summary?.per_company ?? []) {
      lines.push(
        [
          row.company_id,
          row.total_trips,
          row.delivered_trips,
          row.failed_trips,
          row.reroute_success_count,
          row.time_saved_hours,
          row.fuel_saved_liters,
          row.cost_saved_idr,
          row.cost_efficiency_pct,
        ]
          .map(csvCell)
          .join(',')
      );
    }
    return lines.join('\n');
  }
  const header = [
    'id',
    'truck_id',
    'origin_name',
    'destination_name',
    'commodity_key',
    'status',
    'saved_cost_idr',
    'saved_fuel_liters',
    'saved_time_hours',
    'efficiency_pct',
    'created_at',
  ];
  const lines = [header.join(',')];
  for (const t of filtered) {
    lines.push(
      [
        t.id,
        t.truck_id,
        t.origin_name,
        t.destination_name,
        t.commodity_key,
        t.status,
        t.saved_cost_idr,
        t.saved_fuel_liters,
        t.saved_time_hours,
        t.efficiency_pct,
        t.created_at ?? '',
      ]
        .map(csvCell)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function exportLaporanCSV(ctx: LaporanExportContext): string {
  const csv = buildLaporanCSV(ctx);
  if (typeof document === 'undefined') return csv;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PreHub_Laporan_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return csv;
}

/** Print view reusing the ReportsSection pattern: printWindow + escapeHtml + filter badge. */
export function printLaporanPDF(ctx: LaporanExportContext): boolean {
  if (typeof window === 'undefined') return false;
  const { filtered, filters, granularity, totals, summary } = ctx;
  const scope = summary?.scope ?? 'DISPATCHER_DETAIL';
  const isAggregateOnly = scope === 'REGULATOR_AGGREGATE';
  const timestamp = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
  const badge = `Tier=${escapeLaporanHtml(String(filters.tier ?? 'ALL'))} • Status=${escapeLaporanHtml(
    String(filters.status ?? 'ALL')
  )}${filters.startDate ? ` • Mulai=${escapeLaporanHtml(filters.startDate)}` : ''}${
    filters.endDate ? ` • Selesai=${escapeLaporanHtml(filters.endDate)}` : ''
  }${filters.search ? ` • Kata Kunci="${escapeLaporanHtml(filters.search)}"` : ''} • ${
    granularity === 'weekly' ? 'Mingguan' : 'Bulanan'
  } • Cakupan=${escapeLaporanHtml(scope)}`;

  const tripRows =
    filtered.length > 0 && !isAggregateOnly
      ? filtered
          .map(
            (t) => `
      <tr>
        <td>${escapeLaporanHtml(t.id)}</td>
        <td>${escapeLaporanHtml(t.truck_id)}${t.truck_name ? ` (${escapeLaporanHtml(t.truck_name)})` : ''}</td>
        <td>${escapeLaporanHtml(t.origin_name)} → ${escapeLaporanHtml(t.destination_name)}<div style="font-size:10px;color:#64748b;">${escapeLaporanHtml(t.commodity_key)} • ${Number(t.cargo_tonnage ?? 0).toLocaleString('id-ID')} ton • ${escapeLaporanHtml(t.status)}</div></td>
        <td style="text-align:right;">${escapeLaporanHtml(formatIDR(t.saved_cost_idr))}</td>
      </tr>`
          )
          .join('')
      : `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px;">${
          isAggregateOnly
            ? 'Rincian per rit disembunyikan pada peran pengawas (agregat saja).'
            : 'Tidak ada rit yang cocok dengan filter ini.'
        }</td></tr>`;

  const html = `<!DOCTYPE html><html><head><title>PreHub Laporan Penghematan Logistik</title><style>
  body{font-family:'Segoe UI',Tahoma,sans-serif;padding:40px;color:#0f172a;background:#fff;line-height:1.6;}
  .header{border-bottom:3px solid #059669;padding-bottom:20px;margin-bottom:30px;}
  .title{font-size:20px;font-weight:bold;text-transform:uppercase;margin:0;}
  .subtitle{font-size:13px;color:#64748b;margin-top:4px;}
  .meta{font-size:12px;color:#475569;}
  .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:30px;}
  .kpi-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;}
  .kpi-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:bold;}
  .kpi-value{font-size:22px;font-weight:bold;color:#059669;margin-top:8px;}
  .filter-badge{display:inline-block;background:#f1f5f9;border:1px solid #cbd5e1;padding:4px 8px;border-radius:4px;font-size:11px;margin-bottom:12px;}
  .table{width:100%;border-collapse:collapse;margin-top:12px;}
  .table th,.table td{border:1px solid #cbd5e1;padding:8px 10px;font-size:11px;text-align:left;vertical-align:top;}
  .table th{background:#f1f5f9;}
  .footer{margin-top:50px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:11px;color:#94a3b8;text-align:center;}
  @media print{body{padding:20px;}}
  </style></head><body>
  <div class="header"><h1 class="title">PreHub Laporan Penghematan Logistik</h1>
  <div class="subtitle">Ringkasan hemat bersih per rit terverifikasi (negatif = kerugian tercatat)</div>
  <div class="meta">Diterbitkan: ${timestamp} • Dihitung: ${escapeLaporanHtml(summary?.generated_at ?? '—')}</div></div>
  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-label">Total rit</div><div class="kpi-value">${totals?.total_trips ?? 0}</div></div>
    <div class="kpi-card"><div class="kpi-label">Biaya hemat</div><div class="kpi-value">${escapeLaporanHtml(formatIDR(totals?.cost_saved_idr))}</div></div>
    <div class="kpi-card"><div class="kpi-label">Rit gagal</div><div class="kpi-value">${totals?.failed_trips ?? 0}</div></div>
  </div>
  <div class="filter-badge">Filter Aktif: ${badge}</div>
  <table class="table"><thead><tr><th>ID rit</th><th>Truk</th><th>Rute</th><th style="text-align:right;">Hemat</th></tr></thead><tbody>${tripRows}</tbody></table>
  <div class="footer">Laporan Penghematan Logistik • PreHub • Nilai negatif ditampilkan sebagai kerugian aktual</div>
  </body></html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
  return true;
}
