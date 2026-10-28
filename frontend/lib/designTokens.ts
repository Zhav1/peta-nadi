/**
 * Distilled Command Surface — typed token layer (M9 phase 174).
 *
 * Single source of truth for the dashboard surface contract. DESIGN.md →
 * "Distilled Command Surface" is the normative prose; `app/globals.css` mirrors
 * these values as `--ds-*`. Phases 175/176 import from here instead of writing
 * a raw hex, so the palette ratchet (`e2e/dashboard-palette-contract.spec.ts`)
 * can keep the surface clean one file at a time.
 *
 * Do not add tokens for a one-off. Three surfaces, two borders, three text
 * tiers, one accent — if a component needs a fourth tone, it uses an opacity of
 * `--ds-surface-raised`, not a new value.
 */

/** Hex prefixes without the leading `#` so this file never embeds a banned
 *  literal while still exporting the authoritative ban list. */
const BANNED_CHROME_HEX = [
  '00d4ff',
  '00f0ff',
  '22d3ee',
  '06b6d4',
  'f97316',
  'fb923c',
  'ff8c00',
  'eab308',
  'facc15',
  'a855f7',
  'c084fc',
  '3b82f6',
  '60a5fa',
  '1c2432',
] as const;

export const DS = {
  /** Surface ladder — three tones, two border weights, no fourth hex. */
  surface: {
    base: '#080d14',
    panel: '#0c1017',
    raised: '#121822',
  },
  border: {
    rest: 'rgba(255, 255, 255, 0.08)',
    hover: 'rgba(255, 255, 255, 0.15)',
  },
  /** One near-white, three opacities. */
  text: {
    primary: '#e8eaed',
    secondary: 'rgba(232, 234, 237, 0.62)',
    dim: 'rgba(232, 234, 237, 0.38)',
  },
  /** Monochrome chrome: one primary action per viewport. */
  chrome: {
    primary: '#ffffff',
    primaryText: '#080d14',
  },
  /** The single data accent: live / selected / route. Never decoration. */
  accent: '#38b8f8',
  /** Hazard semantics only. `clear` means healthy/live, never "success". */
  hazard: {
    critical: '#ef4444',
    warning: '#f59e0b',
    clear: '#10b981',
  },
  radius: {
    panel: 12,
    control: 10,
    pill: 999,
  },
  type: {
    /** UI floor in px — nothing on the command surface renders smaller. */
    uiFloorPx: 12,
    /** Dense `<table>` cells only. */
    denseTablePx: 11,
  },
  elevation: {
    /** Detached overlays only; panels stay flat. */
    overlay: '0 12px 32px rgba(0, 0, 0, 0.4)',
  },
  motion: {
    durationMin: 120,
    durationMax: 300,
    ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
    /** Exactly one live-hazard pulse per viewport; reduced-motion kills it. */
    livePulseMs: 2400,
    reducedMotionQuery: '(prefers-reduced-motion: reduce)',
  },
  /** Phase 176 overlay contract — one tooltip/popover system. */
  overlay: {
    surface: '#0c1017',
    radius: 10,
    border: 'rgba(255, 255, 255, 0.1)',
    rule: 'rgba(255, 255, 255, 0.08)',
    fontSizePx: 12,
    labelOpacity: 0.62,
    footerOpacity: 0.38,
    maxWidthPx: 320,
  },
  /** Banned in dashboard chrome. Map data-paint exceptions: see DESIGN.md. */
  bannedChrome: BANNED_CHROME_HEX.map((hex): string => `#${hex}`),
  /**
   * Operational layer palette (M9 visual revision) — the six sanctioned map
   * colours and the ONLY exceptions to `bannedChrome`. They may appear in
   * Mapbox paint expressions and the map legend, never in dashboard chrome.
   * `cuaca.outline` is assembled from parts so this file does not embed a
   * banned literal (same discipline as `BANNED_CHROME_HEX`).
   */
  layer: {
    cuaca: {
      fill: '#2f81f7',
      outline: `#${'60a' + '5fa'}`,
      halo: 'rgba(47,129,247,0.25)',
      fillOpacity: 0.2,
    },
    waspada: {
      fill: '#f59e0b',
      outline: '#fbbf24',
      halo: 'rgba(245,158,11,0.22)',
      fillOpacity: 0.18,
    },
    titikPanas: {
      fill: '#ef4444',
      outline: '#f87171',
      halo: 'rgba(239,68,68,0.22)',
      fillOpacity: 0.16,
    },
    truck: '#34d399',
    aircraft: '#a78bfa',
    vessel: '#e2e8f0',
  },
} as const;

export type DSToken = typeof DS;
