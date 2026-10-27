'use client';
import React from 'react';
import type { CrisisState } from '@/lib/types';
import { normalizeNewsPermalink, isForecastActive } from '@/hooks/useNewsVerification';
import {
  Clock,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';

interface EvidenceTabProps {
  crisis: CrisisState;
}

interface NewsCitation {
  headline?: string;
  source?: string;
  source_name?: string;
  tier?: string;
  url?: string;
  link?: string;
  link_alive?: 'alive' | 'dead' | 'unknown';
  temporal_phase?: string;
}

const AGENT_LABELS: Record<string, { name: string; source: string; defaultSourceType: 'live' | 'fixture' }> = {
  data_collection: { name: 'Koleksi Sensor Cuaca & Jalan', source: 'Sensor BMKG + TomTom Traffic', defaultSourceType: 'live' },
  osint_hazard: { name: 'Verifikasi Berita & Lapangan', source: 'LKBN ANTARA + Warta BMKG', defaultSourceType: 'live' },
  prediction: { name: 'Prakiraan Spasial & Cuaca', source: 'Model Numerik Open-Meteo & BMKG', defaultSourceType: 'fixture' },
  route_optimization: { name: 'Optimasi Rute Koridor', source: 'Solver Graf Koridor Pangan', defaultSourceType: 'live' },
  economic_intelligence: { name: 'Pemantauan Harga Pangan', source: 'Data Harga Harian PIHPS BI', defaultSourceType: 'live' },
};

function ConfidenceBar({ value }: { value: number | null | undefined }) {
  const numeric = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  const pct = numeric === null ? 0 : Math.round(numeric * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${numeric === null ? 'bg-slate-700' : 'bg-cyan-400'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-slate-300 w-9 text-right">
        {numeric === null ? '—' : `${pct}%`}
      </span>
    </div>
  );
}

export function EvidenceTab({ crisis }: EvidenceTabProps) {
  const findings = [
    { key: 'data_collection', finding: crisis.data_collection_finding },
    { key: 'osint_hazard', finding: crisis.osint_hazard_finding },
    { key: 'prediction', finding: crisis.prediction_finding },
    { key: 'route_optimization', finding: crisis.route_optimization_finding },
    { key: 'economic_intelligence', finding: crisis.economic_intelligence_finding },
  ].filter((f) => f.finding != null);

  const isSimulated = Boolean(crisis.is_simulated);
  // Early-warning forecast pinned to YELLOW_CLARIFY.
  // The tag hides itself after its 24h window; the underlying evidence stays.
  const isForecast = isForecastActive(crisis.forecast_tag, crisis.forecast_valid_until);
  // Only show a confidence number the swarm actually produced. Never invent a
  // stand-in (the old 0.92 fallback painted 92% on an empty payload).
  const rawConfidence = Number(crisis.overall_confidence);
  const hasConfidence =
    crisis.overall_confidence != null && Number.isFinite(rawConfidence) && rawConfidence > 0;
  const confidenceScore = hasConfidence ? Math.round(rawConfidence * 100) : null;
  // No separate calibrated Brier probability is carried on CrisisState. The old
  // confidence * 0.94 arithmetic was fabricated, so the card now states
  // "belum tersedia" instead of printing a fake disruption probability.
  const disruptionProb: number | null = null;

  // Estimasi penundaan dari impact profile (jam, jujur bila tak ada).
  const impactDelayHours = Number(crisis.impact_profile?.estimated_delay_hours);
  const hasImpactDelay = Number.isFinite(impactDelayHours);

  const osintFinding = findings.find((f) => f.key === 'osint_hazard')?.finding;
  const nestedCitations = (osintFinding?.data as Record<string, unknown> | undefined)?.verified_citations;
  const rootCitation = Array.isArray(crisis.verified_news_citations) ? crisis.verified_news_citations[0] : undefined;
  const topCitation: NewsCitation | undefined =
    Array.isArray(nestedCitations) && nestedCitations.length > 0
      ? (nestedCitations[0] as NewsCitation)
      : rootCitation;

  const sourceName = topCitation?.source || topCitation?.source_name || crisis.evidence?.osint_author || null;
  const citationHeadline = topCitation?.headline || null;
  const storedExcerpt = crisis.evidence?.osint_text || null;
  const rawSourceUrl = topCitation?.url || topCitation?.link || null;
  const sourceUrl = normalizeNewsPermalink(rawSourceUrl || undefined, citationHeadline || crisis.title, sourceName || undefined);
  const sourceIsDead = topCitation?.link_alive === 'dead';
  const canOpenSource = Boolean(sourceUrl) && !sourceIsDead;
  const isEarlyWarning = topCitation?.temporal_phase === 'forecast_early_warning';

  const isExcerptEcho = Boolean(
    storedExcerpt &&
    (
      (citationHeadline && storedExcerpt.trim().toLowerCase() === citationHeadline.trim().toLowerCase()) ||
      (crisis.title && storedExcerpt.trim().toLowerCase() === crisis.title.trim().toLowerCase()) ||
      storedExcerpt.trim().length < 15
    )
  );

  const resolvedLocation = crisis.affected_locations?.[0]?.name || crisis.title?.split(' - ')[0] || 'Koridor Sumatra';
  const coordsLabel =
    crisis.lat != null && crisis.lon != null
      ? `${crisis.lat.toFixed(2)}°N, ${crisis.lon.toFixed(2)}°E`
      : 'Koordinat Koridor';
  const boundingTier = crisis.radius_km && crisis.radius_km <= 1.5
    ? `Koridor Jalan ~${crisis.radius_km.toFixed(1)} km`
    : crisis.radius_km && crisis.radius_km <= 2.5
      ? `Sub-Distrik / Kec ~${crisis.radius_km.toFixed(1)} km`
      : 'Pantauan Kab/Kota';

  const passabilityLabel = crisis.impact_profile?.passability === 'BLOCKED'
    ? 'Terputus Total'
    : crisis.impact_profile?.passability === 'RESTRICTED'
      ? 'Lalin Tersendat'
      : 'Waspada Cuaca';

  const commodityLabel =
    crisis.news_affected_commodities?.join(', ') ||
    crisis.inflation_forecast?.commodity ||
    crisis.inflation_forecast?.anomalous_commodities?.join(', ') ||
    'Logistik Pangan Nasional';

  return (
    <div className="space-y-4 text-slate-200 text-xs">

      {/* 0. AUDIT KLASIFIKASI AI & PENJELASAN ZONA */}
      {(crisis.zone_tier || crisis.tier_reason || crisis.impact_profile) && (
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <div className="flex items-center gap-1.5 font-sans font-bold text-xs">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${crisis.zone_tier === 'RED_CONFIRMED' ? 'bg-red-400' : crisis.zone_tier === 'YELLOW_CLARIFY' ? 'bg-amber-400' : 'bg-cyan-300'}`} />
            <span className="text-slate-200">
              {isForecast ? 'Prakiraan — Waspada Dini' : crisis.zone_tier === 'RED_CONFIRMED' ? 'Bahaya' : 'Waspada'}
            </span>
          </div>
          {crisis.custom_hazard_label && (
            <div className="text-xs font-sans">
              <span className="text-slate-400 block text-xs font-mono">Jenis Bencana/Gangguan</span>
              <span className="text-slate-100 font-semibold">{crisis.custom_hazard_label}</span>
            </div>
          )}
          {crisis.tier_reason && (
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              <span className="text-slate-400 font-mono text-xs block">Alasan klasifikasi</span>
              {crisis.tier_reason}
            </p>
          )}
          {crisis.impact_profile && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-white/5 border border-white/10 text-slate-300">
                Moda Terdampak: {crisis.impact_profile.affected_modalities?.map((m) => m === 'land' ? 'Darat' : m === 'sea' ? 'Laut' : 'Udara').join(', ') || 'Darat'}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${crisis.impact_profile.passability === 'BLOCKED' ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-amber-500/15 border-amber-500/40 text-amber-300'}`}>
                Status Jalur: {crisis.impact_profile.passability}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-white/5 border border-white/10 text-slate-300">
                Estimasi Penundaan: {hasImpactDelay ? `~${impactDelayHours} Jam` : 'Belum terverifikasi'}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-cyan-500/10 border border-cyan-500/40 text-cyan-200">
                Radius Agen: {typeof crisis.radius_km === 'number' ? `~${crisis.radius_km.toFixed(1)} km` : 'Belum tersedia'}
              </span>
            </div>
          )}
          {(!crisis.impact_profile) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-cyan-500/10 border border-cyan-500/40 text-cyan-200">
                Radius Dampak Spesifik — Radius Agen: {typeof crisis.radius_km === 'number' ? `~${crisis.radius_km.toFixed(1)} km` : 'Belum tersedia'}
              </span>
            </div>
          )}
          <p className="text-xs text-slate-500 font-mono pt-1">
            {crisis.verification_audit?.agent_verdict_summary
              ? 'Terverifikasi agen — lihat verdict di bawah.'
              : isForecast
                ? 'Prakiraan belum terkonfirmasi — hanya tindakan TAHAN.'
                : hasConfidence
                  ? 'Menunggu ringkasan verifikasi agen.'
                  : 'Bukti belum tersedia — menunggu laporan agen.'}
          </p>
          {crisis.verification_audit?.agent_verdict_summary && (
            <p className="text-xs text-slate-300 leading-relaxed font-sans pt-1 border-t border-white/10">
              <span className="text-slate-400 font-mono text-xs block">Verdict Agen Verifikasi</span>
              {crisis.verification_audit.agent_verdict_summary}
            </p>
          )}
          {crisis.affected_locations && crisis.affected_locations.length > 0 && (
            <div className="pt-1 space-y-1.5">
              <span className="text-slate-400 block text-xs font-mono">
                Wilayah Terdampak ({crisis.affected_locations.length} Lokasi):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {crisis.affected_locations.map((loc, idx) => (
                  <span key={`${loc.name}-${idx}`} className="px-2 py-0.5 rounded text-xs font-sans bg-white/5 border border-white/10 text-slate-300" title={loc.corridor_segment || loc.name}>
                    {loc.name}{loc.corridor_segment ? ` — ${loc.corridor_segment}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 1. Bukti vs disrupsi */}
      <div className="border-t border-[#1c2432] pt-3 bg-transparent space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-sans text-slate-200 font-bold">
            Kekuatan Bukti vs Probabilitas Disrupsi
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
          <div className="border-t border-[#1c2432] pt-2 bg-transparent">
            <span className="text-xs text-slate-400 block mb-0.5 font-sans">Keyakinan Bukti</span>
            <span className="text-sm font-bold text-cyan-400">
              {confidenceScore === null ? 'Belum tersedia' : `${confidenceScore}%`}
            </span>
            <span className="text-xs text-slate-500 block font-sans">
              {findings.length > 0 ? `${findings.length} agen melaporkan` : 'Belum ada laporan agen'}
            </span>
          </div>

          <div className="border-t border-[#1c2432] pt-2 bg-transparent">
            <span className="text-xs text-slate-400 block mb-0.5 font-sans">Probabilitas Disrupsi</span>
            <span className="text-sm font-bold text-slate-500">
              {disruptionProb === null ? 'Belum tersedia' : `${disruptionProb}%`}
            </span>
            <span className="text-xs text-slate-500 block font-sans">Belum ada skor Brier terkalibrasi</span>
          </div>
        </div>
      </div>

      {/* 4. EXECUTIVE REASONING SUMMARY */}
      {crisis.decision_support_output && (
        <div className="border-t border-[#1c2432] pt-3 bg-transparent">
          <div className="mb-1.5 text-slate-200 font-sans font-bold text-xs">
            Sintesis Analitik
          </div>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            {crisis.decision_support_output}
          </p>
        </div>
      )}

      {/* 5. AGENT FINDINGS WITH PROVENANCE LABELS */}
      {findings.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[#1c2432]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 font-sans">
              Verifikasi Sensor & Sumber Resmi
            </span>
          </div>

          {findings.map(({ key, finding }) => {
            const meta = AGENT_LABELS[key] || { name: key, source: 'Internal Pipeline', defaultSourceType: 'live' };
            const isFixtureItem = isSimulated || meta.defaultSourceType === 'fixture';

            return (
              <div key={key} className="border-t border-[#1c2432] pt-3 bg-transparent space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block font-sans">
                      {meta.name}
                    </span>
                    <span className="text-xs font-mono text-slate-500 mt-0.5 block">
                      {meta.source}
                    </span>
                  </div>

                  <span
                    className="shrink-0 text-xs text-slate-500"
                  >
                    {isFixtureItem ? 'Simulasi' : 'Live'}
                  </span>
                </div>

                <ConfidenceBar value={finding!.confidence} />
                {(() => {
                  const findingData = (finding!.data || {}) as Record<string, unknown>;
                  const degradedSources = Array.isArray(findingData.degraded_sources)
                    ? (findingData.degraded_sources as unknown[]).filter(
                      (s): s is string => typeof s === 'string' && s.length > 0
                    )
                    : [];
                  const evidenceHealth = typeof findingData.evidence_health === 'string'
                    ? findingData.evidence_health
                    : null;
                  if (degradedSources.length === 0 && evidenceHealth !== 'quiet') return null;
                  const isDeadPath = degradedSources.length > 0;
                  return (
                    <div
                      className={`flex items-start gap-1.5 rounded px-2 py-1 border text-xs font-mono ${isDeadPath
                        ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                        : 'bg-slate-900/60 border-[#1c2432] text-slate-400'
                        }`}
                      title={isDeadPath ? 'Jalur data gagal atau sebagian — bukan hari tenang' : 'Semua jalur data menjawab, tanpa temuan'}
                    >
                      <AlertTriangle className={`w-3 h-3 mt-0.5 shrink-0 ${isDeadPath ? 'text-amber-400' : 'text-slate-500'}`} />
                      <span>
                        {isDeadPath
                          ? `Jalur data terdegradasi: ${degradedSources.join(', ')}`
                          : 'Hari tenang — semua jalur data menjawab, tanpa temuan'}
                      </span>
                    </div>
                  );
                })()}
                <p className="text-xs text-slate-300 leading-relaxed font-sans pt-1 border-t border-[#1c2432]">
                  {finding!.summary}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. RANTAI BUKTI LAPANGAN */}
      <div className="space-y-3 pt-3 border-t border-[#1c2432]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 font-sans">
            Rantai Bukti Lapangan
          </span>
          <span className="text-xs font-mono text-slate-500">Spatiotemporal Ingestion</span>
        </div>

        {/* Verified News & OSINT Ground-Truth Card (excerpt-first) */}
        <div className="border-t border-[#1c2432] pt-3 bg-transparent space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-200 font-sans text-xs">
              {sourceName || 'Kutipan lapangan tersimpan'}
            </span>
            <span className="text-xs font-mono text-slate-300 bg-white/5 px-2 py-0.5 rounded border border-white/10 font-bold">
              BERITA TERVERIFIKASI
            </span>
          </div>
          {citationHeadline && (
            <p className="text-xs font-semibold text-slate-200 leading-snug font-sans">
              {citationHeadline}
            </p>
          )}

          {/* Stored Excerpt (Rendered only when distinct, never echoing the headline) */}
          {storedExcerpt && !isExcerptEcho && (
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {storedExcerpt}
            </p>
          )}

          {/* Monospaced Tactical Telemetry Grid */}
          <div className="border-t border-[#1c2432] pt-2 bg-transparent font-mono text-xs space-y-1.5 leading-relaxed">
            {/* Row 1 — Lokasi */}
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-xs text-slate-500">Lokasi:</span>
              <span className="text-slate-200 font-semibold truncate max-w-[220px]">
                {resolvedLocation} · {coordsLabel} ({boundingTier})
              </span>
            </div>

            {/* Row 2 — Keyakinan */}
            <div className="flex items-center justify-between text-slate-300 border-t border-[#1c2432]/60 pt-1.5">
              <span className="text-xs text-slate-500">Keyakinan:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10 text-xs font-bold">
                  BMKG RADAR
                </span>
                <span className="text-slate-200 font-bold ml-0.5">
                  {confidenceScore === null ? 'Keyakinan belum tersedia' : `${confidenceScore}% yakin`}
                </span>
              </div>
            </div>

            {/* Row 3 — Jalur */}
            <div className="flex items-center justify-between text-slate-300 border-t border-[#1c2432]/60 pt-1.5">
              <span className="text-xs text-slate-500">Jalur:</span>
              <div className="flex items-center gap-2 truncate max-w-[220px]">
                <span className={`font-semibold shrink-0 ${crisis.impact_profile?.passability === 'BLOCKED' ? 'text-red-400' : 'text-amber-400'}`}>
                  {passabilityLabel}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-300 truncate" title={commodityLabel}>
                  {commodityLabel}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-slate-500 pt-1">
            <div className="flex items-center gap-1.5">
              <Clock className="w-2.5 h-2.5" />
              <span>Terkini</span>
            </div>
            <div className="flex items-center gap-2">
              {isEarlyWarning && <span className="text-cyan-400 font-bold">Early Warning</span>}
              {canOpenSource && (
                <a
                  href={sourceUrl ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded bg-[#121822] text-slate-300 hover:text-white border border-[#1c2432] transition-colors"
                  title={
                    topCitation?.link_alive === 'unknown'
                      ? 'Buka sumber asli (status tautan belum diverifikasi)'
                      : 'Buka sumber asli di tab baru'
                  }
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Buka sumber</span>
                </a>
              )}
              {sourceIsDead && (
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Tautan asli kedaluwarsa</span>
                </span>
              )}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
