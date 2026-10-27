# PLAN — Phase 150: P1 Foundation (Auto-Radius / Modal / Perusahaan)

**Window:** 2026-10-26/27 · **Mode:** docs (record built work; no code changes, no commit)
**Commits recorded:** `fc67632` (preview), `2de5ff8` (roster single-source)

## Objective

Record the P1 foundation slice: live auto-radius + manual simulator radius,
the 3-section route detail modal shell, and the Armada Perusahaan header
trigger as the single roster source.

## Scope IN

- Auto-radius: `autoRadiusKm` prop (`CrisisSimulatorBar.tsx:85,116,571`)
  fed live from `selectedCrisis?.radius_km ?? simulatedShockwave?.radiusKm ??
  selectedRadius ?? 8` (`DashboardClient.tsx:3562`); manual simulator radius
  (`selectedRadius`) remains the fallback control.
- Route detail modal shell: Watermelon `AlertDialog`, max-w-2xl,
  3 sections — `1. Risiko` (`RouteDetailModal.tsx:265`),
  `2. Dampak & Biaya` (`:306`), `3. Verifikasi` (`:516`).
- Armada Perusahaan: header trigger `#fleet-roster-toggle`
  (`DashboardClient.tsx:2757`); `TenantFleetRoster` by header only —
  bottom-left floating mount removed (`2de5ff8`).

## Scope OUT

- No geometry/routing math change; no migration; no commit/push.
- HITL decision semantics live in Phase 154; fleet scope in Phase 159.

## Decisions locked (from diffs + code reads)

1. Radius precedence is live-crisis-first, manual-second, `8` default-last.
2. One roster writer: header trigger only; no second floating mount.
3. Telemetry playback speed fixed at 1x, no UI control
   (`DashboardClient.tsx:522`; `CrisisSimulatorBar.tsx:75-77`).
