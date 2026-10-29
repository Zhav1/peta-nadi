/**
 * Operational map data-paint (M9).
 *
 * The ONLY place the sanctioned layer hues and the Mapbox paint expressions
 * built from them live, so a fast Node test can validate them without a browser.
 *
 * Why this module exists: Mapbox GL silently rejects a layer whose paint
 * expression uses `['zoom']` anywhere but the top level of a `step`/`interpolate`.
 * `addLayer` throws, the caller's `try/catch` swallows it, and the layer simply
 * never exists — the map renders nothing while every counter still reads a
 * healthy count. Keeping the expressions importable lets
 * `scripts/test_fleet_paint.ts` prove they parse before they ship.
 *
 * Palette (mirrors `DS.layer` in lib/designTokens.ts):
 *   Truck emerald #34d399 · Vessel teal #2dd4bf · Aircraft silver #e2e8f0
 *   Waspada Dini violet #a855f7 · Cuaca blue #2f81f7 · Titik Panas red #ef4444
 */

/** Neutral dark keyline — the only stroke for solid dots. Severity is size, never hue. */
export const MAP_KEYLINE = 'rgba(12,16,23,0.9)';

/** Modality hue — the same values as `DS.layer.{truck,vessel,aircraft}`. */
export const MODALITY_COLOR: Record<string, string> = {
  truck: '#34d399',
  maritime: '#2dd4bf',
  air: '#e2e8f0',
};

/**
 * `fleet-vehicle-dots` paint.
 *
 * Signal quality is opacity + fill (estimated units are hollow at 45%), the
 * alert ring is amber on any modality, and hue is purely modality.
 */
export const FLEET_DOTS_PAINT: Record<string, unknown> = {
  'circle-radius': [
    'interpolate',
    ['linear'],
    ['zoom'],
    4, 4,
    8, 5.5,
    14, 8,
  ],
  'circle-color': [
    'case',
    ['==', ['get', 'tracking_mode'], 'ROUTE_ESTIMATED'], 'rgba(0,0,0,0)',
    ['==', ['get', 'modality'], 'truck'], MODALITY_COLOR.truck,
    ['==', ['get', 'modality'], 'maritime'], MODALITY_COLOR.maritime,
    ['==', ['get', 'modality'], 'air'], MODALITY_COLOR.air,
    MODALITY_COLOR.air,
  ],
  'circle-stroke-width': [
    'interpolate',
    ['linear'],
    ['zoom'],
    4, ['case', ['==', ['get', 'isImpacted'], true], 2.5, 1.5],
    8, ['case', ['==', ['get', 'isImpacted'], true], 2.5, 1.5],
    12, ['case', ['==', ['get', 'isImpacted'], true], 2.5, 1.25],
  ],
  'circle-stroke-color': [
    'case',
    ['==', ['get', 'isImpacted'], true], '#f59e0b',
    // ROUTE_ESTIMATED hollow units keep their modality-hued faint ring so
    // tracking mode stays readable; they must not become dark hollow circles.
    ['all', ['==', ['get', 'tracking_mode'], 'ROUTE_ESTIMATED'], ['==', ['get', 'modality'], 'truck']], MODALITY_COLOR.truck,
    ['all', ['==', ['get', 'tracking_mode'], 'ROUTE_ESTIMATED'], ['==', ['get', 'modality'], 'maritime']], MODALITY_COLOR.maritime,
    ['all', ['==', ['get', 'tracking_mode'], 'ROUTE_ESTIMATED'], ['==', ['get', 'modality'], 'air']], MODALITY_COLOR.air,
    ['==', ['get', 'tracking_mode'], 'ROUTE_ESTIMATED'], MODALITY_COLOR.air,
    // Normal solid dots get the neutral dark keyline, never a self-coloured stroke.
    MAP_KEYLINE,
  ],
  'circle-opacity': [
    'interpolate', ['linear'], ['zoom'],
    3.2, 0.0,
    4.0, 1.0,
  ],
  // Zoom may ONLY sit at the top level of an interpolate. The estimated-unit
  // dimming is a data-driven output of the 4.0 stop, never a nested zoom ramp.
  'circle-stroke-opacity': [
    'interpolate', ['linear'], ['zoom'],
    3.2, 0.0,
    4.0, [
      'case',
      ['all',
        ['==', ['get', 'tracking_mode'], 'ROUTE_ESTIMATED'],
        ['!=', ['get', 'isImpacted'], true],
      ], 0.45,
      1.0,
    ],
  ],
};

/**
 * `waspada-dots` paint — the Waspada Dini advisory as a violet point, sibling
 * to the Titik Panas red dot. Severity is SIZE (4/5/6 px), never hue.
 */
export const WASPADA_DOTS_PAINT: Record<string, unknown> = {
  'circle-radius': [
    'match', ['get', 'severity'],
    'critical', 6,
    'high', 5,
    4,
  ],
  'circle-color': '#a855f7',
  'circle-opacity': 0.9,
  'circle-stroke-width': [
    'interpolate', ['linear'], ['zoom'],
    4, 1.25,
    7, 1.25,
    8, 1,
  ],
  'circle-stroke-color': MAP_KEYLINE,
};

/** Soft violet halo under each Waspada dot (same treatment as FIRMS dots). */
export const WASPADA_DOTS_HALO_PAINT: Record<string, unknown> = {
  'circle-radius': [
    'interpolate', ['linear'], ['zoom'],
    4, 6,
    8, 8,
    12, 9,
  ],
  // Solid violet fill; the zoom opacity ramp is the effective halo alpha
  // (0.12 → 0.22). Keeping the alpha in one place avoids the old
  // 0.22 × 0.22 = 0.048 double-multiply that made the wash nearly invisible.
  'circle-color': 'rgba(168,85,247,1)',
  'circle-opacity': [
    'interpolate', ['linear'], ['zoom'],
    4, 0.12,
    8, 0.18,
    12, 0.22,
  ],
  'circle-stroke-width': 1,
  'circle-stroke-color': 'rgba(168,85,247,0.45)',
  'circle-stroke-opacity': [
    'interpolate', ['linear'], ['zoom'],
    4, 0.35,
    8, 0.5,
  ],
};
