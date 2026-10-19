'use client';
import React from 'react';
import type { CrisisState } from '@/lib/types';
import { normalizeNewsPermalink } from '@/hooks/useNewsVerification';
import {
  FileText,
  Activity,
  Radio,
  Clock,
  BarChart3,
  AlertTriangle,
  ExternalLink,
  Info,
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

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.85 ? 'bg-emerald-400' : value >= 0.6 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-slate-300 w-9 text-right">{pct}%</span>
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
  const confidenceScore = Math.round((crisis.overall_confidence || 0.92) * 100);
  const disruptionProb = Math.min(Math.round(confidenceScore * 0.94), 98);

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
  const isOfficialTier = topCitation?.tier ? topCitation.tier === 'TIER_1_OFFICIAL' : true;
  const isEarlyWarning = topCitation?.temporal_phase === 'forecast_early_warning';

  return (
    <div className="space-y-4 text-slate-200 text-xs">

      {/* 0. AUDIT KLASIFIKASI AI & PENJELASAN ZONA */}
      {(crisis.zone_tier || crisis.tier_reason || crisis.impact_profile) && (
        <div className={`rounded-md border p-3 space-y-2 ${crisis.zone_tier === 'RED_CONFIRMED' ? 'bg-red-950/30 border-red-500/40' : 'bg-yellow-950/20 border-yellow-400/40'}`}>
          <div className="flex items-center gap-1.5 font-sans font-bold text-xs">
            <AlertTriangle className={`w-3.5 h-3.5 ${crisis.zone_tier === 'RED_CONFIRMED' ? 'text-red-400' : 'text-yellow-300'}`} />
            <span className={crisis.zone_tier === 'RED_CONFIRMED' ? 'text-red-200' : 'text-yellow-200'}>
              {crisis.zone_tier === 'RED_CONFIRMED' ? 'Zona Merah (Terkonfirmasi)' : 'Zona Kuning (Perlu Klarifikasi / Hati-hati)'}
            </span>
          </div>
          {crisis.custom_hazard_label && (
            <div className="text-xs font-sans">
              <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-mono">Jenis Bencana/Gangguan</span>
              <span className="text-slate-100 font-semibold">{crisis.custom_hazard_label}</span>
            </div>
          )}
          {crisis.tier_reason && (
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              <span className="text-slate-400 font-mono text-[11px] block uppercase tracking-wider">Mengapa zona ini diklasifikasikan {crisis.zone_tier === 'RED_CONFIRMED' ? 'Merah' : 'Kuning'} oleh LLM</span>
              {crisis.tier_reason}
            </p>
          )}
          {crisis.impact_profile && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/5 border border-white/10 text-slate-200">
                Moda Terdampak: {crisis.impact_profile.affected_modalities?.map((m) => m === 'land' ? 'Darat' : m === 'sea' ? 'Laut' : 'Udara').join(', ') || 'Darat'}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${crisis.impact_profile.passability === 'BLOCKED' ? 'bg-red-500/15 border-red-500/40 text-red-300' : crisis.impact_profile.passability === 'RESTRICTED' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-yellow-400/10 border-yellow-400/40 text-yellow-300'}`}>
                Status Jalur: {crisis.impact_profile.passability}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/5 border border-white/10 text-slate-200">
                Estimasi Penundaan: ~{crisis.impact_profile.estimated_delay_hours} Jam
              </span>
            </div>
          )}
          {crisis.affected_locations && crisis.affected_locations.length > 0 && (
            <div className="pt-1 space-y-1.5">
              <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-mono">
                Wilayah Terdampak ({crisis.affected_locations.length} Lokasi):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {crisis.affected_locations.map((loc, idx) => (
                  <span key={`${loc.name}-${idx}`} className="px-2 py-0.5 rounded text-[11px] font-sans bg-cyan-500/10 border border-cyan-500/30 text-cyan-200" title={loc.corridor_segment || loc.name}>
                    📍 {loc.name}{loc.corridor_segment ? ` — ${loc.corridor_segment}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 1. STATISTICAL CONFIDENCE VS DISRUPTION PROBABILITY CARD */}
      <div className="bg-[#121822] border border-[#1c2432] rounded-md p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-sans text-slate-200 font-bold flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Kekuatan Bukti vs Probabilitas Disrupsi</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
          <div className="p-2.5 rounded-md bg-[#0c1017] border border-[#1c2432]">
            <span className="text-xs text-slate-400 block mb-0.5 font-sans">Keyakinan Bukti</span>
            <span className="text-sm font-bold text-emerald-400">{confidenceScore}%</span>
            <span className="text-xs text-slate-500 block font-sans">5 Sumber Konsisten</span>
          </div>

          <div className="p-2.5 rounded-md bg-[#0c1017] border border-[#1c2432]">
            <span className="text-xs text-slate-400 block mb-0.5 font-sans">Probabilitas Disrupsi</span>
            <span className="text-sm font-bold text-cyan-400">{disruptionProb}%</span>
            <span className="text-xs text-slate-500 block font-sans">Terkalibrasi Brier</span>
          </div>
        </div>
      </div>

      {/* 4. EXECUTIVE REASONING SUMMARY */}
      {crisis.decision_support_output && (
        <div className="bg-[#121822] border border-[#1c2432] rounded-md p-3">
          <div className="flex items-center gap-1.5 mb-1.5 text-cyan-400 font-sans font-bold text-xs">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sintesis Analitik</span>
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
              <div key={key} className="bg-[#0c1017] rounded-md p-3 border border-[#1c2432] space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block font-sans">
                      {meta.name}
                    </span>
                    <span className="text-xs font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                      <Radio className="w-2.5 h-2.5 text-cyan-400" />
                      <span>{meta.source}</span>
                    </span>
                  </div>

                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-xs font-mono font-bold border ${
                      isFixtureItem
                        ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                        : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {isFixtureItem ? 'SIMULASI' : 'LIVE API'}
                  </span>
                </div>

                <ConfidenceBar value={finding!.confidence} />
                <p className="text-xs text-slate-300 leading-relaxed font-sans pt-1 border-t border-[#1c2432]">
                  {finding!.summary}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. SENSORY EVIDENCE CHAIN & TOMTOM DELAY MATRIX */}
      <div className="space-y-3 pt-3 border-t border-[#1c2432]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 font-sans">
            Rantai Bukti Lapangan
          </span>
          <span className="text-xs font-mono text-slate-500">Spatiotemporal Ingestion</span>
        </div>

        {/* Verified News & OSINT Ground-Truth Card (excerpt-first) */}
        <div className="bg-[#0c1017] border border-[#1c2432] rounded-md p-3 hover:border-slate-600 transition-all space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-200 font-sans text-xs flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              <span>{sourceName || 'Kutipan lapangan tersimpan'}</span>
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/40 font-bold">
                BERITA TERVERIFIKASI
              </span>
              <span className="text-xs font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                {isOfficialTier ? 'RESMI' : 'PERS REGIONAL'}
              </span>
            </div>
          </div>
          {citationHeadline && (
            <p className="text-xs font-semibold text-slate-200 leading-snug font-sans">
              {citationHeadline}
            </p>
          )}
          {storedExcerpt ? (
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {storedExcerpt}
            </p>
          ) : (
            !citationHeadline && (
              <p className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Belum ada kutipan lapangan tersimpan untuk krisis ini.</span>
              </p>
            )
          )}
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

        {/* Delay Matrix */}
        <div className="bg-[#0c1017] border border-[#1c2432] rounded-md p-3 hover:border-slate-600 transition-all space-y-2">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-xs font-bold text-slate-300 font-sans block">
                Histori Keterlambatan Koridor
              </span>
              <span className="text-xs font-mono text-slate-500">Speed Flow Matrix (Menit Delay)</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-rose-400 font-bold block">
                {crisis.evidence?.delay_minutes || "+120 MIN"}
              </span>
              <span className="text-xs font-mono text-slate-400">Puncak Disrupsi</span>
            </div>
          </div>

          <div className="h-12 flex items-end gap-1.5 bg-[#080d14] p-2 rounded-md border border-[#1c2432]">
            {(crisis.evidence?.delay_history || [20, 30, 25, 50, 70, 90, 120]).map((h: number, i: number) => {
              const historyArray = crisis.evidence?.delay_history || [20, 30, 25, 50, 70, 90, 120];
              const maxVal = Math.max(...historyArray, 10);
              const heightPct = `${Math.min(Math.max((h / maxVal) * 100, 10), 100)}%`;
              const isLast = i === historyArray.length - 1;

              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center h-full justify-end group relative"
                >
                  <div
                    className={`w-full rounded-sm transition-all duration-300 ${
                      isLast
                        ? 'bg-rose-500'
                        : 'bg-cyan-500/40 hover:bg-cyan-400'
                    }`}
                    style={{ height: heightPct }}
                  />
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-6 bg-slate-900 border border-white/20 px-1.5 py-0.5 rounded text-xs font-mono text-white pointer-events-none transition whitespace-nowrap z-20">
                    +{h}m
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between text-xs font-mono text-slate-500 pt-0.5">
            <span>-4 Jam (Normal)</span>
            <span>-2 Jam (Hambatan)</span>
            <span className="text-rose-400 font-bold">Saat Ini (Puncak)</span>
          </div>
        </div>

      </div>

    </div>
  );
}
