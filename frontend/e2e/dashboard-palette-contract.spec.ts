import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { DS } from '../lib/designTokens';

/**
 * Dashboard palette ratchet — M9 phase 174.
 *
 * DESIGN.md → "Distilled Command Surface" is the contract: monochrome chrome,
 * one data accent (#38b8f8), hazard red/amber/emerald only for hazard state,
 * and a fixed ban list of legacy neon hues.
 *
 * RATCHET RULES
 * - `CLEANED_FILES` starts with the files that are genuinely clean today. It is
 *   a one-way ratchet: phase 175 (shell) and phase 176 (overlays) APPEND every
 *   file they clean. A listed file that regresses fails this spec.
 * - The list may never shrink. The only legal removal is deleting the file
 *   itself (rename = remove + append in the same commit), because a shrinking
 *   list silently un-enforces a file that still exists.
 * - The spec deliberately does NOT scan the whole dashboard yet: most of it is
 *   still full of banned chrome that phases 175/176 remove. A whole-tree scan
 *   today would fail the suite and teach everyone to ignore a red gate.
 * - Mapbox paint expressions in `components/map/` are the only place banned
 *   hues may survive, and only in the exact ranges listed in DESIGN.md.
 */

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const DESIGN_MD_PATH = path.resolve(FRONTEND_ROOT, '..', 'DESIGN.md');

/** Independent oracle: the ban list as published in DESIGN.md. */
const EXPECTED_BANNED = [
  '#00d4ff',
  '#00f0ff',
  '#22d3ee',
  '#06b6d4',
  '#f97316',
  '#fb923c',
  '#ff8c00',
  '#eab308',
  '#facc15',
  '#a855f7',
  '#c084fc',
  '#3b82f6',
  '#60a5fa',
  '#1c2432',
];

/**
 * Files already clean on the command surface. Append-only — see RATCHET RULES.
 * Keep the array sorted and deduplicated (asserted below).
 */
const CLEANED_FILES = [
  'app/globals.css',
  'components/auth/AuthModal.tsx',
  'components/base-ui/alert-dialog.tsx',
  'components/base-ui/dialog.tsx',
  'components/dashboard/DashboardClient.tsx',
  'components/dashboard/FreshnessBadge.tsx',
  'components/dashboard/HitlDecisionDrawer.tsx',
  'components/dashboard/TopNavTelemetry.tsx',
  'components/dashboard/analytics/AnalyticsTip.tsx',
  'components/dashboard/analytics/KpiStrip.tsx',
  'components/fleet/TenantFleetRoster.tsx',
  'components/map/CrisisMap.tsx',
  'components/map/FleetVehicleLayer.tsx',
  'components/map/mapPopup.ts',
  'components/sidebar/RouteDetailModal.tsx',
  'lib/designTokens.ts',
];

/** Every required marker in the normative section, with the reason it matters. */
const DESIGN_MARKERS: Array<[marker: string, why: string]> = [
  ['## Distilled Command Surface', 'section exists'],
  ['#080d14', 'base surface'],
  ['#0c1017', 'panel surface'],
  ['#121822', 'raised surface'],
  ['rgba(255, 255, 255, 0.08)', 'resting border'],
  ['rgba(255, 255, 255, 0.15)', 'hover border'],
  ['#e8eaed', 'primary text'],
  ['rgba(232, 234, 237, 0.62)', 'secondary text'],
  ['rgba(232, 234, 237, 0.38)', 'dim text'],
  ['#38b8f8', 'single data accent'],
  ['#ef4444', 'hazard critical'],
  ['#f59e0b', 'hazard warning'],
  ['#10b981', 'hazard clear / live'],
  ['12px', 'UI text floor'],
  ['11px', 'dense-table only exception'],
  ['tabular-nums', 'numerals'],
  ['cubic-bezier(.4, 0, .2, 1)', 'motion easing'],
  ['prefers-reduced-motion', 'reduced-motion honoured'],
  ['320px', 'overlay max width'],
  ['No arrow', 'tooltip ornament ban'],
];

test('DESIGN.md documents the distilled command surface contract', () => {
  expect(fs.existsSync(DESIGN_MD_PATH), `DESIGN.md missing at ${DESIGN_MD_PATH}`).toBe(true);
  const designMd = fs.readFileSync(DESIGN_MD_PATH, 'utf-8');

  const missing = DESIGN_MARKERS.filter(([marker]) => !designMd.includes(marker)).map(
    ([marker, why]) => `${marker} (${why})`,
  );
  expect(missing).toEqual([]);

  const missingBanned = EXPECTED_BANNED.filter((hex) => !designMd.includes(hex));
  expect(missingBanned).toEqual([]);

  // The ban must be stated as a ban, not merely mentioned.
  expect(designMd).toContain('### Banned in dashboard UI chrome');
  // Map data paint is the only exception, and it is enumerated.
  expect(designMd).toContain('**Map data-paint exceptions.**');
  expect(designMd).toContain('components/map/CrisisMap.tsx');
  expect(designMd).toContain('components/map/FleetVehicleLayer.tsx');
});

test('token layer mirrors the design contract', () => {
  expect(DS.surface).toEqual({ base: '#080d14', panel: '#0c1017', raised: '#121822' });
  expect(DS.border.rest).toBe('rgba(255, 255, 255, 0.08)');
  expect(DS.border.hover).toBe('rgba(255, 255, 255, 0.15)');
  expect(DS.text).toEqual({
    primary: '#e8eaed',
    secondary: 'rgba(232, 234, 237, 0.62)',
    dim: 'rgba(232, 234, 237, 0.38)',
  });
  expect(DS.accent).toBe('#38b8f8');
  expect(DS.hazard).toEqual({ critical: '#ef4444', warning: '#f59e0b', clear: '#10b981' });
  expect(DS.radius.panel).toBe(12);
  expect(DS.radius.control).toBe(10);
  expect(DS.radius.pill).toBe(999);
  expect(DS.type.uiFloorPx).toBe(12);
  expect(DS.motion.ease).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
  expect(DS.motion.durationMin).toBe(120);
  expect(DS.motion.durationMax).toBe(300);
  expect(DS.overlay.maxWidthPx).toBe(320);

  // The ban list is one list, not two: the token layer must not drift from the doc.
  expect(DS.bannedChrome.map((hex) => hex.toLowerCase()).sort()).toEqual(
    [...EXPECTED_BANNED].sort(),
  );
});

test('CLEANED_FILES is sorted, deduplicated, and every path exists', () => {
  expect(CLEANED_FILES).toEqual([...CLEANED_FILES].sort());
  expect(new Set(CLEANED_FILES).size).toBe(CLEANED_FILES.length);

  const missing = CLEANED_FILES.filter(
    (rel) => !fs.existsSync(path.join(FRONTEND_ROOT, rel)),
  );
  expect(missing).toEqual([]);
});

test('CLEANED_FILES contain no banned chrome hex', () => {
  const banned = EXPECTED_BANNED.map((hex) => hex.toLowerCase());
  const offenders: string[] = [];

  for (const rel of CLEANED_FILES) {
    const abs = path.join(FRONTEND_ROOT, rel);
    if (!fs.existsSync(abs)) {
      offenders.push(`${rel} (missing file)`);
      continue;
    }
    const src = fs.readFileSync(abs, 'utf-8').toLowerCase();
    const hits = banned.filter((hex) => src.includes(hex));
    if (hits.length > 0) offenders.push(`${rel} → ${hits.join(', ')}`);
  }

  expect(offenders).toEqual([]);
});
