# PLAN — Phase 151: P2 Berita + TopNav

**Window:** 2026-10-26/27 · **Mode:** docs (record built work; no commit)
**Commits recorded:** `fc67632` (preview), `2de5ff8`, `1668222`

## Objective

Record the P2 news + top-nav slice: live-only Berita feed with Fokus /
route-gated Hold actions, and the minimalist TopNav (Cuaca / Waspada /
Titik Panas pills; dormant telemetry props kept for API compatibility).

## Scope IN

- Berita Hold gate: `Tahan (Hold)` button renders only when
  `activeRouteIdx != null || currentMapRoutes.length > 0`
  (`DashboardClient.tsx:3275`); Fokus stays available without a route.
- TopNav minimalist pills: Cuaca disruption (blue, default ON),
  Waspada Dini advisory (default OFF), Titik Panas satelit
  (`TopNavTelemetry.tsx:55-56,162-197`); Rute/latency/lalin/BMKG/hub/Tinjau
  dormant, props accepted but rendered nowhere.
- News Fokus reuses the stored audit-trail inspection at zero extra LLM
  cost (`DashboardClient.tsx:2155`).

## Scope OUT

- No ingestion/extractor change; no commit/push.
- Waspada info-only semantics live in Phase 156; zone gating in Phase 152.

## Decisions locked (from diffs + code reads)

1. Hold requires a real route (button hidden otherwise); Fokus does not.
2. Dormant props are kept, not deleted, to avoid breaking callers.
3. `HitlDecisionDrawer` + 15 s `api.news.hitlPending` poll untouched.
