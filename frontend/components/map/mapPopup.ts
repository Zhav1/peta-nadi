/**
 * Distilled map popup builders — M9 phase 176.
 *
 * DESIGN.md → "Distilled Command Surface" → "Tooltip and popover contract" is
 * the normative spec: one surface (#0c1017), 10px radius, one hairline border,
 * label/value rows with `tabular-nums`, a rule before a source + freshness
 * footer at 38% opacity, max 320px, no ornament.
 *
 * These are pure functions returning HTML strings because Mapbox popups render
 * outside the React tree (`Popup.setHTML`). That makes escaping mandatory: every
 * interpolated value is passed through `escapeHtml`, so a field such as
 * `<img src=x onerror=alert(1)>` renders as literal text instead of executing.
 *
 * Row budgets: a single zone gets at most 6 rows, a cluster at most 4. When more
 * facts exist they are summarised into a row (or into the title meta line)
 * rather than dropped — no field that used to be shown may disappear.
 */

export const POPUP_LIMITS = { zone: 6, cluster: 4 } as const;

/** Unknown-value glyph. Never "?" or a fabricated 0. */
const UNKNOWN = '—';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** Escape every HTML-significant character. Idempotent per call, never trust input. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Escape + length-cap a prose field (names, segments, sources). Truncation is
 * presentation, not a fact drop: the field is still present, just bounded.
 */
export function cap(value: unknown, max = 120): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const clipped = raw.length > max ? `${raw.slice(0, Math.max(1, max - 1))}…` : raw;
  return escapeHtml(clipped);
}

/**
 * Format a metric. Numeric input is rounded to `digits`; anything unusable
 * becomes the em dash so "unknown" can never masquerade as zero.
 */
export function formatNumber(value: unknown, digits = 1): string {
  if (value === null || value === undefined) return UNKNOWN;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return UNKNOWN;
    const fixed = value.toFixed(digits);
    return digits > 0 ? fixed.replace(/\.0+$/, '') : fixed;
  }
  const raw = String(value).trim();
  if (!raw || raw === '?' || raw.toLowerCase() === 'nan' || raw.toLowerCase() === 'null') {
    return UNKNOWN;
  }
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) return formatNumber(asNumber, digits);
  return escapeHtml(raw);
}

interface RowOptions {
  /** Adds `ds-popup__value--num` so the value is laid out with tabular figures. */
  numeric?: boolean;
}

/** Shared label/value row. Both sides are escaped. */
function row(label: string, value: string, options: RowOptions = {}): string {
  const numeric = options.numeric ? ' ds-popup__value--num' : '';
  return (
    `<div class="ds-popup__row">` +
    `<span class="ds-popup__label">${escapeHtml(label)}</span>` +
    `<span class="ds-popup__value${numeric}">${value}</span>` +
    `</div>`
  );
}

/**
 * Rule + footer. `source` is mandatory by contract: an empty source still
 * renders an explicit "sumber tidak diketahui" so a tooltip can never present a
 * number with no provenance line at all.
 */
function footer(source: unknown, updatedAt: unknown, label = 'valid_until'): string {
  const rawSource = String(source ?? '').trim();
  const sourceText = rawSource || 'sumber tidak diketahui';
  const rawUpdated = String(updatedAt ?? '').trim();
  const updatedText = rawUpdated && rawUpdated !== '-' ? rawUpdated : 'waktu tidak diketahui';
  return (
    `<div class="ds-popup__rule"></div>` +
    `<div class="ds-popup__footer">` +
    `<span class="ds-popup__source">sumber: ${cap(sourceText, 120)}</span>` +
    `<span class="ds-popup__updated">${escapeHtml(label)}: ${cap(updatedText, 64)}</span>` +
    `</div>`
  );
}

function title(name: string, meta: string[]): string {
  const metaHtml = meta
    .filter((line) => line && line.trim().length > 0)
    .map((line) => `<span class="ds-popup__meta">${line}</span>`)
    .join('');
  return (
    `<div class="ds-popup__title">` +
    `<span class="ds-popup__name">${name}</span>` +
    metaHtml +
    `</div>`
  );
}

function shell(titleHtml: string, rows: string[], footerHtml: string): string {
  return (
    `<div class="ds-popup" role="dialog">` +
    titleHtml +
    `<div class="ds-popup__rows">${rows.join('')}</div>` +
    footerHtml +
    `</div>`
  );
}

/** Join non-empty fragments with the middle dot separator used across the surface. */
function joinParts(parts: Array<string | null | undefined>, separator = ' · '): string {
  return parts.filter((part) => part != null && String(part).trim().length > 0).join(separator);
}

/** Modalities arrive as an array, a JSON string, or already-joined prose. */
function modalityText(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).join(', ');
    } catch {
      /* keep raw */
    }
  }
  return raw;
}

export interface WeatherPopupProps {
  name?: unknown;
  severity?: unknown;
  bmkgCode?: unknown;
  hazardType?: unknown;
  precipitationMm24h?: unknown;
  floodRiskPct?: unknown;
  windspeedKmh?: unknown;
  corridorId?: unknown;
  corridorSegment?: unknown;
  distToCorridorKm?: unknown;
  delayHours?: unknown;
  action?: unknown;
  modalities?: unknown;
  confidence?: unknown;
  observedVsForecast?: unknown;
  source?: unknown;
  updatedAt?: unknown;
}

/**
 * Weather polygon tooltip. Facts kept: severity, BMKG code, hazard type,
 * precipitation, flood risk, wind, corridor id + segment + distance, delay,
 * advisory action, modalities, confidence + observed/forecast, source and
 * validity. Nine of them would exceed the 6-row budget, so severity/code/hazard/
 * confidence/freshness are summarised into the title meta + footer and the
 * per-metric rows stay one fact per row.
 */
export function buildWeatherPopup(props: WeatherPopupProps): string {
  const name = cap(props.name || 'Waspada Dini', 120);
  const severity = props.severity == null || props.severity === '' ? UNKNOWN : cap(props.severity, 16);
  const code = props.bmkgCode == null || props.bmkgCode === '' || props.bmkgCode === '-' ? '' : cap(props.bmkgCode, 16);
  const hazard = props.hazardType == null || props.hazardType === '' || props.hazardType === '-' ? '' : cap(props.hazardType, 24);
  const confidence = props.confidence == null || props.confidence === '' ? UNKNOWN : cap(props.confidence, 16);
  const observed = props.observedVsForecast == null || props.observedVsForecast === '' || props.observedVsForecast === '-'
    ? ''
    : cap(props.observedVsForecast, 24);

  const titleHtml = title(name, [
    joinParts([
      `severity ${severity}`,
      code ? `BMKG ${code}` : null,
      hazard ? `hazard ${hazard}` : null,
    ]),
    joinParts([
      `confidence ${confidence}`,
      observed || null,
    ]),
  ]);

  const corridor = joinParts([
    props.corridorId == null || props.corridorId === '' || props.corridorId === '-' ? null : cap(props.corridorId, 80),
    props.corridorSegment == null || props.corridorSegment === '' || props.corridorSegment === '-' ? null : cap(props.corridorSegment, 80),
    props.distToCorridorKm == null || props.distToCorridorKm === ''
      ? null
      : `${formatNumber(props.distToCorridorKm, 1)} km`,
  ]) || UNKNOWN;

  const rows = [
    row('presipitasi', `${formatNumber(props.precipitationMm24h, 1)} mm/24j`, { numeric: true }),
    row('banjir', `${formatNumber(props.floodRiskPct, 0)}%`, { numeric: true }),
    row('angin', `${formatNumber(props.windspeedKmh, 0)} km/j`, { numeric: true }),
    row('koridor', corridor),
    row('dampak', `+${formatNumber(props.delayHours, 1)} jam`, { numeric: true }),
    row(
      'aksi',
      joinParts([
        props.action == null || props.action === '' || props.action === '-' ? null : cap(props.action, 32),
        modalityText(props.modalities) ? `moda ${cap(modalityText(props.modalities), 60)}` : null,
      ]) || UNKNOWN,
    ),
  ].slice(0, POPUP_LIMITS.zone);

  return shell(titleHtml, rows, footer(props.source || 'BMKG / Open-Meteo', props.updatedAt, 'valid_until'));
}

export interface FirmsPopupProps {
  title?: unknown;
  frp?: unknown;
  conf?: unknown;
  confidence?: unknown;
  severity?: unknown;
  distToCorridorKm?: unknown;
  radiusKm?: unknown;
  nearSegment?: unknown;
  source?: unknown;
  updatedAt?: unknown;
}

/** Single FIRMS detection tooltip. Five rows — within the 6-row budget. */
export function buildFirmsPopup(props: FirmsPopupProps): string {
  const name = cap(props.title || 'Titik Panas VIIRS', 120);
  const severity = props.severity == null || props.severity === '' || props.severity === '-' ? UNKNOWN : cap(props.severity, 24);
  const conf = props.conf ?? props.confidence;

  const rows = [
    row('FRP', `${formatNumber(props.frp, 1)} MW`, { numeric: true }),
    row('conf', formatNumber(conf, 0), { numeric: true }),
    row('jarak koridor', `${formatNumber(props.distToCorridorKm, 1)} km`, { numeric: true }),
    row('radius', `${formatNumber(props.radiusKm, 1)} km`, { numeric: true }),
    row('segmen', props.nearSegment == null || props.nearSegment === '' || props.nearSegment === '-' ? UNKNOWN : cap(props.nearSegment, 120)),
  ].slice(0, POPUP_LIMITS.zone);

  return shell(
    title(name, [`severity ${severity}`]),
    rows,
    footer(props.source || 'VIIRS_SNPP_NRT', props.updatedAt, 'ts'),
  );
}

export interface FirmsClusterPopupProps {
  count?: unknown;
  maxFrp?: unknown;
  maxConfidence?: unknown;
  minDistKm?: unknown;
  radiusKm?: unknown;
  source?: unknown;
  updatedAt?: unknown;
}

/** Clustered FIRMS highlight tooltip. Four rows maximum by contract. */
export function buildFirmsClusterPopup(props: FirmsClusterPopupProps): string {
  const count = Math.max(0, Math.round(Number(props.count ?? 0) || 0));
  const name = cap(`Zona Titik Panas (Satelit) — ${count} titik`, 120);
  const rows = [
    row('FRP maks', `${formatNumber(props.maxFrp, 1)} MW`, { numeric: true }),
    row('conf maks', formatNumber(props.maxConfidence, 0), { numeric: true }),
    row('jarak koridor terdekat', `${formatNumber(props.minDistKm, 1)} km`, { numeric: true }),
    row('radius', `${formatNumber(props.radiusKm, 1)} km`, { numeric: true }),
  ].slice(0, POPUP_LIMITS.cluster);

  return shell(
    title(name, ['sorotan ≥3 titik keyakinan tinggi dalam 5 km']),
    rows,
    footer(props.source || 'VIIRS_SNPP_NRT', props.updatedAt, 'ts'),
  );
}
