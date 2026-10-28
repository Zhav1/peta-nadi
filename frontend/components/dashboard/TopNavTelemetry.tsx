'use client';

import React, { useEffect, useRef } from 'react';
import type { ChokePointItem, HazardCounterBucket, HazardCounterStatus, WeatherHazardSummary, WeatherPolygonMeta } from '@/lib/types';
import { freshnessText } from '@/components/dashboard/FreshnessBadge';

interface TopNavTelemetryProps {
  routingInfo?: { solver: string; compute_time_ms: number | null; savings_pct: number | null } | null;
  corridorContext?: import('@/lib/types').CorridorContext | null;
  isLoading?: boolean;
  /** True while a route computation is in flight — never render a stale latency. */
  isRoutingLoading?: boolean;
  onOpenHitl?: () => void;
  pendingHitlCount?: number;
  // Compact zone filter pills when left sidebar collapsed
  isLeftSidebarCollapsed?: boolean;
  showRedZones?: boolean;
  onToggleRedZones?: () => void;
  redZoneCount?: number;
  showYellowZones?: boolean;
  onToggleYellowZones?: () => void;
  yellowZoneCount?: number;
  // Q3: two independent overlay toggles, default ON (weather polygons + FIRMS dots+heat)
  // Disruption-only: Cuaca = high/critical biru (default ON); Waspada Dini (Advisory) = medium (default OFF).
  // NOTE (Phase 160): these counts are world truth from GET /weather/summary —
  // the toggles control DRAWING only, never the number.
  showWeatherPolygons?: boolean;
  onToggleWeatherPolygons?: () => void;
  weatherPolygonCount?: number | null;
  showWeatherAdvisory?: boolean;
  onToggleWeatherAdvisory?: () => void;
  weatherAdvisoryCount?: number | null;
  weatherDisruptionCount?: number | null;
  /** World-truth counter source (status/count/source/window/validity per tier). */
  weatherSummary?: WeatherHazardSummary | null;
  /** Phase 169: render-cap + retention meta from the polygon response. */
  weatherPolygonMeta?: WeatherPolygonMeta | null;
  showFireHotspots?: boolean;
  onToggleFireHotspots?: () => void;
  fireHotspotCount?: number;
  /** Phase 168: true hotspot count (pre-cap). null = unknown → "—". */
  fireCount?: number | null;
  fireStatus?: HazardCounterStatus;
  fireReason?: string | null;
  fireSource?: import('@/lib/types').FireHotspotSource | null;
  fireUpdatedAt?: string | null;
  fireWindowHours?: number;
  fireTooltip?: string;
  onSelectHub?: (hub: ChokePointItem) => void;
  onFocusRoute?: () => void;
  /** Dispatch-enriched sample from the top blue disruption polygon (hazard/corridor/delay/aksi/modalities/confidence). */
  weatherSample?: {
    hazard_type?: string;
    corridor_id?: string;
    corridor_segment?: string;
    dist_to_corridor_km?: number | string;
    delay_hours?: number | string;
    advisory_action?: string;
    affected_modalities?: string[] | string;
    confidence?: number | string;
    observed_vs_forecast?: string;
    severity?: string;
  } | null;
}

// --- Phase 175/176.6: shared pill recipe --------------------------------
// One surface, one border, one text tier. `active` means the layer is ON and
// is the only state that fills white (the selected signal). Hazard hue is
// carried by the number alone, never by the pill surface or its label.
// `grow` is the Phase 176.6 mobile treatment: the three hazard counters are the
// product's primary signal, so below `md` they share one pinned row as three
// equal columns instead of scrolling out of reach.
const PILL_BASE =
  'cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-mono tabular-nums transition-colors duration-150 snap-start';
const pillClass = (active: boolean, grow = false): string =>
  `${PILL_BASE} ${grow ? 'flex-1 basis-0 min-w-0 md:flex-none' : 'flex-none'} ${
    active
      ? 'bg-white text-[#080d14] border-white font-semibold'
      : 'bg-[#0c1017] text-[rgba(232,234,237,0.62)] border-white/[0.08] hover:border-white/15 hover:text-[#e8eaed]'
  }`;
const chipClass = (active: boolean): string =>
  active
    ? 'shrink-0 whitespace-nowrap px-1 py-0.5 rounded bg-black/10 text-xs font-bold tabular-nums'
    : 'shrink-0 whitespace-nowrap px-1 py-0.5 rounded bg-white/[0.06] text-xs font-bold tabular-nums';
/** Only a one-line-hint label may truncate; the number never does. */
const pillLabelClass = (grow: boolean): string =>
  `font-sans text-xs font-semibold ${grow ? 'truncate min-w-0' : 'whitespace-nowrap'}`;
/** Marker dot: solid on an enabled pill, hollow neutral when the layer is off. */
const dotClass = (active: boolean, hazard: 'critical' | 'warning' | null): string => {
  if (!active) return 'w-2 h-2 rounded-full border border-white/25 bg-transparent shrink-0';
  if (hazard === 'critical') return 'w-2 h-2 rounded-full bg-[#ef4444] shrink-0';
  if (hazard === 'warning') return 'w-2 h-2 rounded-full bg-[#f59e0b] shrink-0';
  return 'w-2 h-2 rounded-full bg-[#080d14] shrink-0';
};
/**
 * A hazard-bearing ok bucket: verified present hazard (not empty, not stale,
 * not unknown). Only then may the number carry hazard hue.
 */
const isPresentHazard = (status: HazardCounterStatus, count: number | null): boolean =>
  status === 'ok' && count != null && count > 0;
/** Number tone: hazard hue only for a present hazard, never for a label. */
const numberTone = (hazard: 'critical' | 'warning' | null, active: boolean): string => {
  if (hazard === 'critical') return 'text-[#ef4444]';
  if (hazard === 'warning') return 'text-[#f59e0b]';
  return active ? 'text-[#080d14]' : 'text-[rgba(232,234,237,0.62)]';
};

export interface HazardLegendPillsProps {
  showRedZones: boolean;
  onToggleRedZones?: () => void;
  redZoneCount: number;
  showYellowZones: boolean;
  onToggleYellowZones?: () => void;
  yellowZoneCount: number;
  /** Extra classes per pill — used to relocate the pills across breakpoints. */
  pillClassName?: string;
}

/**
 * Phase 176.6 — the compact Merah/Kuning legend toggles, extracted so the same
 * two pills can sit in the desktop telemetry row and in the mobile filter row
 * (below `md` the counters own their own row and the filters scroll).
 */
export const HazardLegendPills: React.FC<HazardLegendPillsProps> = ({
  showRedZones,
  onToggleRedZones,
  redZoneCount,
  showYellowZones,
  onToggleYellowZones,
  yellowZoneCount,
  pillClassName = '',
}) => (
  <>
    <button
      type="button"
      data-testid="counter-pill"
      onClick={onToggleRedZones}
      className={`${pillClass(showRedZones)} ${pillClassName}`}
      title="Filter Peta: Zona Merah (Bencana Terkonfirmasi)"
    >
      <span className={dotClass(showRedZones, 'critical')} />
      <span className={pillLabelClass(false)}>Merah</span>
      <span
        className={`${chipClass(showRedZones)} ${numberTone(redZoneCount > 0 ? 'critical' : null, showRedZones)}`}
      >
        {redZoneCount}
      </span>
    </button>
    <button
      type="button"
      data-testid="counter-pill"
      onClick={onToggleYellowZones}
      className={`${pillClass(showYellowZones)} ${pillClassName}`}
      title="Filter Peta: Zona Kuning (Perlu Klarifikasi / Waspada)"
    >
      <span className={dotClass(showYellowZones, 'warning')} />
      <span className={pillLabelClass(false)}>Kuning</span>
      <span
        className={`${chipClass(showYellowZones)} ${numberTone(yellowZoneCount > 0 ? 'warning' : null, showYellowZones)}`}
      >
        {yellowZoneCount}
      </span>
    </button>
  </>
);

/**
 * Minimalist map-critical header: Merah/Kuning filters (collapsed drawer),
 * Cuaca disruption (default ON), Waspada Dini advisory (default OFF),
 * and Titik Panas satelit. Rute/latency, lalin, BMKG, intermodal hub, and
 * Tinjau pills stay dormant — the 15s `api.news.hitlPending` poll +
 * `HitlDecisionDrawer` + `hitlAction` wiring in `DashboardClient` are
 * untouched.
 *
 * Phase 175 — one neutral pill recipe for all five counters. Chrome is
 * monochrome: the enabled layer is the white pill (selected state), the rest are
 * near-black with a white-alpha border. Hue appears only on the number, and only
 * when a hazard is actually being represented (DESIGN.md → Distilled Command
 * Surface). No cyan/orange/yellow chrome survives here.
 */
export const TopNavTelemetry: React.FC<TopNavTelemetryProps> = ({
  isLeftSidebarCollapsed = false,
  showRedZones = true,
  onToggleRedZones,
  redZoneCount = 0,
  showYellowZones = true,
  onToggleYellowZones,
  yellowZoneCount = 0,
  showWeatherPolygons = true,
  onToggleWeatherPolygons,
  weatherPolygonCount,
  weatherDisruptionCount,
  showWeatherAdvisory = false,
  onToggleWeatherAdvisory,
  weatherAdvisoryCount,
  weatherSummary,
  weatherPolygonMeta,
  showFireHotspots = true,
  onToggleFireHotspots,
  fireHotspotCount = 0,
  fireCount,
  fireStatus = 'ok',
  fireReason,
  fireSource,
  fireUpdatedAt,
  fireWindowHours,
  fireTooltip: _fireTooltip,
  // Dormant P2 props — accepted for API compatibility, rendered nowhere.
  routingInfo: _routingInfo,
  corridorContext: _corridorContext,
  isLoading: _isLoading,
  isRoutingLoading: _isRoutingLoading,
  onOpenHitl: _onOpenHitl,
  pendingHitlCount: _pendingHitlCount,
  onSelectHub: _onSelectHub,
  onFocusRoute: _onFocusRoute,
  weatherSample: _weatherSample,
}) => {
  void _routingInfo;
  void _corridorContext;
  void _isLoading;
  void _isRoutingLoading;
  void _onOpenHitl;
  void _pendingHitlCount;
  void _onSelectHub;
  void _onFocusRoute;
  void _weatherSample;
  void _fireTooltip;

  // Phase 176.5 — the compact Merah/Kuning pills are inserted ahead of the
  // weather counters when the sidebar collapses on mobile. Scroll anchoring
  // would otherwise keep Cuaca in place and park the strip mid-list (a partial
  // pill at rest). Reset to the first pill whenever that set changes.
  const stripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    stripRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  }, [isLeftSidebarCollapsed]);

  // --- Phase 160: counters are world truth, never toggle-gated ---------------
  // Degraded/unknown renders "—"; verified-empty renders 0. The layer toggles
  // below change what the map draws, never these numbers.
  const cuacaCount = weatherSummary?.cuaca.count ?? weatherDisruptionCount ?? weatherPolygonCount ?? null;
  const cuacaStatus: HazardCounterStatus =
    weatherSummary?.cuaca.status ?? (cuacaCount == null ? 'degraded' : 'ok');
  const waspadaCount = weatherSummary?.waspada.count ?? weatherAdvisoryCount ?? null;
  const waspadaStatus: HazardCounterStatus =
    weatherSummary?.waspada.status ?? (waspadaCount == null ? 'degraded' : 'ok');

  const counterText = (status: HazardCounterStatus, count: number | null): string =>
    status === 'degraded' || count == null ? '—' : String(count);

  const bbox = weatherSummary?.bbox;
  const bboxLabel =
    bbox && bbox.length === 4
      ? `${bbox[0]}–${bbox[2]} BT, ${bbox[1]}–${bbox[3]} LS`
      : '94–108 BT, -6–6 LS';
  const updatedLabel = (iso?: string | null): string => {
    if (!iso) return 'belum ada data';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
  };

  const bucketTooltip = (
    bucket: HazardCounterBucket | null | undefined,
    what: string,
    options?: { updatedAt?: string | null; capNotice?: string | null },
  ): string => {
    const status = bucket?.status ?? 'degraded';
    const lines = [
      what,
      `Area: Sumatra ${bboxLabel}`,
      `Jendela: ${bucket?.window_hours ?? 24} jam`,
      `Sumber: ${bucket?.source ?? 'BMKG + Open-Meteo NWP'}`,
      `Diperbarui: ${updatedLabel(options?.updatedAt ?? weatherSummary?.generated_at)}`,
      `Kesegaran: ${freshnessText(status, options?.updatedAt ?? weatherSummary?.generated_at ?? null)}`,
    ];
    if (options?.capNotice) lines.push(options.capNotice);
    if (status === 'degraded') {
      lines.push(`Status: tidak diketahui — ${bucket?.reason ?? 'sumber tidak tersedia'}`);
    } else if (status === 'stale') {
      lines.push(`Status: data lama${bucket?.reason ? ` — ${bucket.reason}` : ''}`);
    } else if (status === 'empty') {
      lines.push('Status: kosong terverifikasi');
    }
    return lines.join('\n');
  };

  // --- Phase 168: Titik Panas uses the same tri-state rule as cuaca/waspada.
  // Number for ok/stale/empty; "—" only when unknown (degraded). The tooltip
  // must always name source + window + last-updated.
  const titikPanasCount = fireCount ?? (fireStatus === 'degraded' ? null : fireHotspotCount);
  const fireSourceLabel =
    fireSource === 'nasa-firms-api'
      ? 'NASA FIRMS API (MAP_KEY)'
      : fireSource === 'cache'
        ? 'Cache data terakhir (last-known-good)'
        : 'NASA FIRMS CSV publik (keyless)';
  const fireTooltipText = (() => {
    const lines = [
      'Titik Panas (Satelit): titik panas aktif seluruh Sumatra',
      `Area: Sumatra ${bboxLabel}`,
      `Jendela: ${fireWindowHours ?? 24} jam`,
      `Sumber: ${fireSourceLabel}`,
      `Diperbarui: ${updatedLabel(fireUpdatedAt)}`,
      `Kesegaran: ${freshnessText(fireStatus, fireUpdatedAt)}`,
    ];
    if (fireStatus === 'degraded') {
      lines.push(`Status: tidak diketahui — ${fireReason ?? 'sumber tidak tersedia'}`);
    } else if (fireStatus === 'stale') {
      lines.push(`Status: data lama${fireReason ? ` — ${fireReason}` : ''}`);
    } else if (fireStatus === 'empty') {
      lines.push('Status: kosong terverifikasi');
    }
    return lines.join('\n');
  })();

  return (
    <div
      ref={stripRef}
      data-testid="counter-strip"
      className="relative flex flex-wrap items-center gap-1.5 text-xs font-mono select-none [overflow-anchor:none] w-full min-w-0 md:w-auto"
    >
      {/*
        Phase 176.6 — Row 1 below `md`: the three hazard counters, pinned and
        non-scrolling, three equal columns so none of them can be clipped or
        require a swipe. At `md`+ this wrapper disappears (`display: contents`)
        and the pills rejoin the single desktop row exactly as before.
      */}
      <div
        data-testid="counter-row"
        className="flex w-full min-w-0 items-center gap-1.5 md:contents"
      >
        {/* Disruption-only weather (biru, default ON) — the single map-critical hazard count. */}
        {onToggleWeatherPolygons && (
          <button
            type="button"
            data-testid="counter-pill"
            onClick={onToggleWeatherPolygons}
            className={pillClass(showWeatherPolygons, true)}
            title={bucketTooltip(weatherSummary?.cuaca, 'Cuaca: zona gangguan aktif (high/critical)', {
              updatedAt: weatherSummary?.generated_at ?? weatherPolygonMeta?.updated_at ?? null,
              capNotice:
                weatherPolygonMeta?.capped
                  ? `Render: menampilkan ${weatherPolygonMeta.count ?? 0} dari ${weatherPolygonMeta.total ?? 0} poligon`
                  : null,
            })}
          >
            <span className={dotClass(showWeatherPolygons, null)} />
            <span className={pillLabelClass(true)}>Cuaca</span>
            <span
              data-testid="counter-cuaca"
              className={`${chipClass(showWeatherPolygons)} ${numberTone(
                isPresentHazard(cuacaStatus, cuacaCount) ? 'critical' : null,
                showWeatherPolygons,
              )}`}
            >
              {counterText(cuacaStatus, cuacaCount)}
            </span>
          </button>
        )}

        {/* Waspada Dini advisory (medium drizzle, default OFF, info-only). */}
        {onToggleWeatherAdvisory && (
          <button
            type="button"
            data-testid="counter-pill"
            onClick={onToggleWeatherAdvisory}
            className={pillClass(showWeatherAdvisory, true)}
            title={bucketTooltip(weatherSummary?.waspada, 'Waspada Dini: zona pantau medium (advisory), dihitung walau layer OFF', {
              updatedAt: weatherSummary?.generated_at ?? null,
            })}
          >
            <span className={dotClass(showWeatherAdvisory, null)} />
            <span className={pillLabelClass(true)}>Waspada Dini</span>
            <span
              data-testid="counter-waspada"
              className={`${chipClass(showWeatherAdvisory)} ${numberTone(
                isPresentHazard(waspadaStatus, waspadaCount) ? 'warning' : null,
                showWeatherAdvisory,
              )}`}
            >
              {counterText(waspadaStatus, waspadaCount)}
            </span>
          </button>
        )}

        {/* Titik Panas satelit (FIRMS VIIRS). */}
        {onToggleFireHotspots && (
          <button
            type="button"
            data-testid="counter-pill"
            onClick={onToggleFireHotspots}
            className={pillClass(showFireHotspots, true)}
            title={fireTooltipText}
          >
            <span className={dotClass(showFireHotspots, null)} />
            <span className={pillLabelClass(true)}>Titik Panas</span>
            <span
              data-testid="counter-titik-panas"
              className={`${chipClass(showFireHotspots)} ${numberTone(
                titikPanasCount != null && titikPanasCount > 0 ? 'warning' : null,
                showFireHotspots,
              )}`}
            >
              {counterText(fireStatus, titikPanasCount)}
            </span>
          </button>
        )}
      </div>

      {/*
        Desktop legend (md+): the Merah/Kuning toggles keep their old slot at the
        head of the single row (`order-first`). Below `md` they render in the
        mobile filter row instead, next to the modality filters.
      */}
      {isLeftSidebarCollapsed && (
        <div data-testid="counter-legend-desktop" className="hidden md:contents">
          <HazardLegendPills
            showRedZones={showRedZones}
            onToggleRedZones={onToggleRedZones}
            redZoneCount={redZoneCount}
            showYellowZones={showYellowZones}
            onToggleYellowZones={onToggleYellowZones}
            yellowZoneCount={yellowZoneCount}
            pillClassName="md:order-first"
          />
        </div>
      )}
    </div>
  );
};
