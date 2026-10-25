---
phase: 110
phase_name: FORECAST_WASPADA Orthogonal Early-Warning Tag
milestone: M7
milestone_name: Live News Trust, Source Breadth & Forecast Waspada Integrity
created_at: "2026-10-25T00:00:00.000Z"
status: in_progress
code_state: working-tree (unpushed)
framework: GSD
---

# Phase 110 — FORECAST_WASPADA Orthogonal Early-Warning Tag

**Status:** IMPLEMENTED in the working tree; **unpushed** (HEAD is `56045cf`).
**Depends on:** Phase 107 (weather-warning-only YELLOW), Phase 109 (news persistence/read path).
**Scope:** backend contract + frontend rendering, no database migration.

---

## 1. Goal

Represent an early warning as a **display tag**, not a new severity tier:

1. A forecast/advisory item may mention a hazard and staple commodities, but it is not an observed physical disruption.
2. `FORECAST_WASPADA` is orthogonal to `zone_tier`; a forecast is pinned to `YELLOW_CLARIFY` and can never become `RED_CONFIRMED`.
3. The tag has a bounded 24 h validity; after it lapses the UI hides the tag, but the article stays subject to the independent 48 h admission gate.
4. HOLD is the only operational action on a forecast; APPROVE/reroute is blocked until field clarification converts the zone to RED. REJECT/DISMISS remain available as review outcomes.
5. The E (commodity) consensus channel must not activate from a forecast's commodity mention.

---

## 2. Contract

| Field | Type | Rule |
|---|---|---|
| `forecast_tag` | `"FORECAST_WASPADA"` or absent | Display layer only; never a `zone_tier`. |
| `forecast_valid_until` | ISO timestamp | `min(published_at + 24h, now + 24h)`; unknown publish uses `now + 24h`. |
| `zone_tier` | `YELLOW_CLARIFY` | A tagged item is always advisory; `RED_CONFIRMED` is forbidden. |
| `forecast_candidate` | bool (audit) | No physical blockage AND (`forecast_early_warning` OR weather-warning-only). |
| `forecast_eligible` | bool (audit) | Candidate + W_present + consensus/official-source threshold. |
| `forecast_w_present` | bool (audit) | BMKG corroboration or official BMKG/BNPB/BPBD source. |

**Invariants**

1. A forecast never synthesizes a physical incident (`unified_news_ingestor.py:736-743`).
2. A forecast never activates the E channel (`consensus_gate.py:365-370`).
3. A forecast never POSTs an approval (`news_router.py:727-780`; `MitigationTab.tsx:166-173,828-836`).
4. A forecast zone is zero-fill + dashed cyan (`CrisisMap.tsx:917-927,930-967`).

---

## 2b. Issues found

| Issue | Why it mattered | Resolution |
|---|---|---|
| `temporal_phase='forecast_early_warning'` was being treated as a display tier | A phase is not an eligibility decision; a non-tagged item could inflate the early-warning count | Separate `forecast_tag` resolved from row/audit/GTM (`news_router.py:66-97`) |
| A high-consensus forecast could be promoted to RED | A forecast is not an observed physical event; RED would imply a confirmed closure | Hard YELLOW cap (`news_extractor.py:673-684`; `unified_news_ingestor.py:605-630`) |
| Commodity mentions activated the E channel | A mention is not a PIHPS anomaly | `forecast_mode` disables E (`consensus_gate.py:365-370`) |
| A forecast could synthesize an incident | Would create a false road/port closure | Explicit skip (`unified_news_ingestor.py:736-743`) |
| APPROVE was available on an unconfirmed forecast | Would dispatch a reroute against an advisory | 409 + HOLD-only (`news_router.py:727-780`; `MitigationTab.tsx:166-173`) |
| Forecast zones looked like confirmed fill | Visual ambiguity between advisory and hazard | Zero fill + dashed cyan (`CrisisMap.tsx:917-967`) |
| Forecast was double-counted as Kuning | Operators could not distinguish advisory from clarification | Fourth `Prakiraan` counter (`DashboardClient.tsx:755-772,2921-2942`) |
| Expiry was invisible | A 24 h warning could look permanent | WIB expiry countdown (`FreshnessBadge.tsx:86-141`) |

---

## 3. Backend work

### 3.1 Detection + tag persistence (`backend/app/nlp/news_extractor.py`)

| Line | Behavior |
|---|---|
| `508-537` | `_detect_weather_warning_only`: warning markers (including BMKG wave/storm terms) without a blockage clause. |
| `540-547` | `FORECAST_TAG = "FORECAST_WASPADA"`; `FORECAST_VALIDITY_HOURS = 24`; comment marks it SPEC-LOCKED and orthogonal. |
| `550-572` | `_parse_forecast_published_at`: structured row → GTM `published_at_iso`/`original_pub_date`. |
| `575-585` | `compute_forecast_valid_until`: `min(published + 24h, now + 24h)`; fallback `now + 24h`. |
| `588-642` | `is_forecast_candidate`: no blockage + early-warning phase or weather-only; text-level blockage overrides a stray `has_physical_blockage`. |
| `645-684` | `apply_forecast_tag`: idempotent; writes tag/validity to row, audit, GTM; caps RED → YELLOW with an Indonesian reason. |
| `1272` | Heuristic extraction returns a tagged row. |
| `1998`, `2088` | Batch paths tag each item. |
| `2116` | Pre-LLM dropped item still goes through the tag function (no effect unless candidate). |
| `2184` | Final single-item path tags before caching. |

### 3.2 Eligibility gate (`backend/app/services/unified_news_ingestor.py`)

| Line | Behavior |
|---|---|
| `550` | `compute_consensus(..., forecast_mode=is_forecast_candidate(art))`. |
| `570-588` | Candidate definition + `W_present` + eligibility: `(P >= 0.50 and >=2 agents) OR (weather_conf >= 0.60 and BMKG official)`. |
| `590-603` | Tier-C regency cap / RED / YELLOW decision. |
| `605-630` | Forecast candidates are always capped at YELLOW; eligible → `FORECAST_WASPADA_YELLOW_PINNED`; ineligible → `FORECAST_INELIGIBLE_CAPPED`. |
| `632-650` | Audit payload: candidate, eligible, W_present, official flag, weather confidence, tag/validity when eligible. |
| `652-671` | Persist `zone_tier`, reason, tag/validity into row and GTM. |
| `736-743` | Critical-disruption synthesis explicitly skips forecast candidates, even a legacy RED row. |

### 3.3 Consensus (`agents/tools/consensus_gate.py`)

| Line | Behavior |
|---|---|
| `276-289` | `compute_consensus(state, forecast_mode=None)`; explicit arg or `state["forecast_mode"]`. |
| `365-370` | `econ_active = (econ_conf > 0.50) and not forecast_mode_active`; forecast uses the physical-only weight profile. |
| `519-531` | Returns `forecast_mode` alongside `economic_channel_active`. |

**Rationale:** a forecast may say "cabai" without any observed PIHPS spike. Letting that mention activate E would add a 0.20 weight to a non-observation.

### 3.4 API (`backend/app/routers/news_router.py`)

| Line | Behavior |
|---|---|
| `66-97` | `_forecast_tag_of`: row → `verification_audit` → GTM → nested audit. Never reads `temporal_phase`. |
| `100-124` | `_approval_forecast_tag`: approval row → `recommended_route` → notes text. |
| `127-149` | `_approval_zone_tier`: approval row → route → GTM. |
| `494-506` | Critical indicators exclude forecast/tagged items; `early_warning_count` counts tagged items only. |
| `727-780` | HITL guard: `ACCEPT/APPROVE` on a tagged item is `409 FORECAST_REQUIRES_RED_CONVERSION` unless `zone_tier == RED_CONFIRMED`; HOLD/REJECT/DISMISS remain allowed. |

---

## 4. Frontend work

| File:line | Behavior |
|---|---|
| `frontend/lib/types.ts:18-24` | `ForecastTag = 'FORECAST_WASPADA'`; docblock states YELLOW and 24 h. |
| `frontend/lib/types.ts:337-341` | `CrisisState.forecast_tag` / `forecast_valid_until`. |
| `frontend/lib/types.ts:407-411` | `DisasterZone.forecast_tag` / `forecast_valid_until`. |
| `frontend/hooks/useNewsVerification.ts:245-293` | `FORECAST_TAG`, 24 h TTL, `deriveForecastTag`, `deriveForecastValidUntil`, `isForecastActive`. |
| `:389-411` | Explicit tag or `temporal_phase='forecast_early_warning'`; forecast forces `YELLOW_CLARIFY` unless DROPPED. |
| `:444-451` | Derive validity; tag is active only inside the window. |
| `:483-484` | Emit tag/validity only while active. |
| `:515-526` | Id-set freeze also prevents forecast expiry churn from re-deriving the feed. |
| `frontend/components/dashboard/DashboardClient.tsx:755-772` | Four counters; forecast is its own bucket, never double-counted as Kuning. |
| `:844-918` | Forecast zones use `showForecastZones`; effective tier is YELLOW; tag/validity carried onto each zone. |
| `:2921-2942` | Fourth filter chip `Prakiraan / Waspada Dini` with dashed cyan swatch. |
| `:2974-2985` | Forecast focus path skips origin/dest reroute pairing. |
| `:3016-3020`, `:3025-3026`, `:3059-3069` | Early-Warning label, `Prakiraan` badge, advisory card, expiry badge. |
| `frontend/components/map/CrisisMap.tsx:917-927` | Forecast fill opacity = 0. |
| `:930-953` | Solid outline layer excludes forecast. |
| `:954-967` | Forecast-only dashed cyan outline. |
| `:1429-1433` | Clicked forecast zone is forced to `YELLOW_CLARIFY` and carries tag/validity. |
| `frontend/components/sidebar/MitigationTab.tsx:68-73` | `FORECAST_HOLD_COPY` explains HOLD-only. |
| `:166-173` | `hitlBlocked` includes `isForecast`; `approveLocked` still allows HOLD/GUEST. |
| `:777-778` | `isForecast` from the crisis tag/validity. |
| `:828-836` | Non-HOLD action on a forecast returns the HOLD copy without POSTing. |
| `frontend/components/sidebar/EvidenceTab.tsx:64-67` | Forecast uses the advisory treatment; expiry hides the tag, evidence stays. |
| `frontend/components/ui/FreshnessBadge.tsx:55-64,86-141` | Expiry countdown only when `expiresAt` is supplied; WIB absolute time + remaining hours/minutes. |

---

## 5. Operating constraints

- Windows PowerShell, repo `D:\College\Pidi.id`.
- Render free Singapore single worker; Vercel `pre-hub.vercel.app`; Supabase PostGIS.
- No Redis by default.
- `NEXT_PUBLIC_API_URL` is inlined at build; the frontend must be rebuilt to point at a different API.
- Muse Spark orchestrator/planner; subagents DeepSeek/GLM high; no default subagent; always use subagents.
- Playwright auto-check mandatory; free-model limit → paid high fallback.
- No schema migration: tag/validity ride in existing JSONB (`ground_truth_metrics`) and mirrored columns where present.

---

## 6. Acceptance criteria

- [x] A weather-warning-only item is tagged and capped at YELLOW.
- [x] Validity is `min(published + 24h, now + 24h)`.
- [x] A forecast never becomes a synthesized incident.
- [x] A forecast never activates the E consensus channel.
- [x] Forecast zone is zero-fill + dashed cyan.
- [x] Forecast is its own filter bucket, not Kuning.
- [x] Forecast HOLD-only in UI and 409 on APPROVE in API.
- [ ] Automated tests for the above (none found in the tree at docs time).

## 7. Verification plan

```powershell
# from D:\College\Pidi.id
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_news_pipeline.py backend/tests/test_consensus_calibration.py -q
npx playwright test frontend/e2e/news-live-audit.spec.ts
npx tsc -p frontend/tsconfig.json --noEmit
```

**Status:** not run in this docs-only pass. The code is unpushed; CI has not seen it.

## 8. Open concerns

1. **No direct test coverage.** Repo search finds no test referencing `FORECAST_WASPADA`; the invariants are enforced only by code paths.
2. **Duplicated derivation.** Backend `is_forecast_candidate` and frontend `deriveForecastTag`/`isForecastActive` are separate implementations that must stay in sync.
3. **Unknown expiry keeps the tag.** `isForecastActive` returns `true` when `validUntil` is missing/unparseable; this is honest but means a malformed value never expires.
4. **Published-time dependency.** A very old article gets `published + 24h`, which may already be in the past → immediately expired but still admitted for 48 h. That is intentional but can look inconsistent.
5. **`forecast_valid_until` is not on `CrisisState`** in `agents/state.py`; the tag is currently a news/API/UI concept, not a swarm state field.
6. **HITL guard depends on linkage.** If `route_approvals` does not mirror the tag and `incident_id` does not link to the article, the API falls back to notes text; a missing link weakens the guard.
7. **The 409 is only as strong as the pre-read.** If the approval lookup fails, `approval_row` is empty and the guard can be bypassed (`news_router.py:743-745`).
8. **No expiry notification.** Once the tag lapses, the UI silently hides it; there is no operator signal that a warning expired.
