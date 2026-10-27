# PLAN — Phase 154: P5 HITL / Detail 3-Section

**Window:** 2026-10-26/27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `1668222` (silent guest, forecast block, distill)

## Objective

Record the P5 HITL slice: evidence-gated 3-action decisions in the route
detail modal (Setujui / Tahan / Lanjut), silent-guest treatment (watermark
ribbon removed), forecast info-only blocking, and Mitigation-tab evidence
gating.

## Scope IN

- Evidence gate (`RouteDetailModal.tsx:130-150`): `canApprove` /
  `canOverride` need `hasEvidence` (crisis evidence or route proof);
  HOLD is the only evidence-free path (`:212-213`).
- Forecast block: `isForecastActive(...)` disables all three CTAs
  (`:146-150`) and `handleAction` early-returns (`:207`); 409 HITL guard
  server-side (Phase 110 contract, kept).
- Silent guest: sandbox watermark ribbon + dual preview badges removed
  (`1668222`); guest stays read-only without banner noise.
- Regulator: APPROVE/OVERRIDE disabled (`role !== 'REGULATOR'`),
  HOLD retained.
- Mitigation gating: `hitlBlocked = isSimulated || !hasEvidence ||
  isForecast` (`MitigationTab.tsx:168`); `crisisHasEvidence` plumbed
  (`:942,1356`).

## Scope OUT

- No approval-schema change; no commit/push.

## Decisions locked (from diffs + code reads)

1. No grounded evidence → no APPROVE/OVERRIDE; HOLD only.
2. Forecast zones: pantau saja — every decision CTA disabled.
3. Guest silence: read-only enforced by role gate, not by banner.
