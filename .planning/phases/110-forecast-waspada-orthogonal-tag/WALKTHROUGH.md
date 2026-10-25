# Phase 110 — Walkthrough

**Code state:** working tree, **unpushed**. `.git/logs/HEAD` ends at `56045cf`; no commit hash exists for this phase yet.
**Docs state:** written from the working tree; no app code edited.
**Verification:** code inspection only. No pytest/Playwright run in this pass.

---

## 1. Backend changes

### 1.1 Detection and validity

| File:line | What it does |
|---|---|
| `backend/app/nlp/news_extractor.py:508-537` | `_detect_weather_warning_only`: warning markers (termasuk gelombang tinggi/ombak besar/badai/angin kencang) without a blockage clause. |
| `:540-547` | `FORECAST_TAG`, 24 h constant, SPEC-LOCKED comment: orthogonal display tag, never a `zone_tier`. |
| `:550-572` | Parse `published_at` from row/GTM. |
| `:575-585` | `min(published + 24h, now + 24h)`; unknown publish → `now + 24h`. |
| `:588-642` | Candidate = no blockage AND (early-warning phase OR weather-only). Text-level blockage wins over a stray boolean. |
| `:645-684` | Idempotent tag writer; mirrors into `verification_audit` + `ground_truth_metrics`; caps RED → YELLOW. |
| `:1272`, `:1998`, `:2088`, `:2116`, `:2184` | Tag applied on every extraction path, including the pre-LLM dropped path and the batch path. |

### 1.2 Eligibility gate

| File:line | What it does |
|---|---|
| `backend/app/services/unified_news_ingestor.py:550` | Passes `forecast_mode=is_forecast_candidate(art)` into consensus. |
| `:570-588` | `W_present`, official-source flag, and the two eligibility routes. |
| `:605-630` | Forecast is always YELLOW; eligible gets `FORECAST_WASPADA_YELLOW_PINNED`, ineligible gets `FORECAST_INELIGIBLE_CAPPED`. |
| `:632-650` | Audit payload. |
| `:652-671` | Persist tag/validity on the row and GTM. |
| `:736-743` | Forecast candidates are skipped by critical-disruption synthesis. |

### 1.3 Consensus

| File:line | What it does |
|---|---|
| `agents/tools/consensus_gate.py:276-289` | `forecast_mode` argument or state flag. |
| `:365-370` | E channel is disabled in forecast mode. |
| `:519-531` | `forecast_mode` echoed in the result. |

### 1.4 API and HITL

| File:line | What it does |
|---|---|
| `backend/app/routers/news_router.py:66-97` | Resolve the tag from row/audit/GTM; never from `temporal_phase`. |
| `:100-124` | Resolve the tag from an approval or its recommended route/notes. |
| `:127-149` | Resolve the approval's `zone_tier`. |
| `:494-506` | Forecast excluded from critical indicators; early-warning count comes from the tag only. |
| `:727-780` | APPROVE/ACCEPT on a tagged non-RED item → `409 FORECAST_REQUIRES_RED_CONVERSION`; HOLD/REJECT/DISMISS allowed. |

---

## 2. Frontend changes

| File:line | What it does |
|---|---|
| `frontend/lib/types.ts:18-24` | `ForecastTag` type + docblock. |
| `:337-341`, `:407-411` | `CrisisState` and `DisasterZone` fields. |
| `frontend/hooks/useNewsVerification.ts:245-293` | Tag constant, 24 h TTL, derive tag/validity, active check. |
| `:389-411` | Forecast forces YELLOW unless DROPPED. |
| `:444-451` | Validity derived from backend value or `published + 24h`. |
| `:483-484` | Tag emitted only while active. |
| `frontend/components/dashboard/DashboardClient.tsx:755-772` | Forecast counter is separate from Kuning. |
| `:844-918` | Forecast zones gated by `showForecastZones`; tag/validity carried. |
| `:2921-2942` | `Prakiraan / Waspada Dini` chip with dashed cyan swatch. |
| `:2974-2985` | Forecast focus skips origin/dest pairing. |
| `:3016-3020`, `:3025-3026`, `:3059-3069` | Early-warning label, badge, advisory card, expiry badge. |
| `frontend/components/map/CrisisMap.tsx:917-927` | Zero fill for forecast. |
| `:930-967` | Solid outline excludes forecast; dedicated dashed cyan outline. |
| `:1429-1433` | Click mapping forces YELLOW and preserves tag/validity. |
| `frontend/components/sidebar/MitigationTab.tsx:68-73` | HOLD-only copy. |
| `:166-173` | `hitlBlocked` includes forecast. |
| `:777-778` | `isForecast` resolved from the crisis. |
| `:828-836` | Non-HOLD returns HOLD copy, no POST. |
| `frontend/components/sidebar/EvidenceTab.tsx:64-67` | Advisory evidence treatment. |
| `frontend/components/ui/FreshnessBadge.tsx:55-64,86-141` | Expiry countdown in WIB. |

---

## 3. Behavior deltas

1. **Forecast tag:** a BMKG "waspada gelombang tinggi" article becomes `YELLOW_CLARIFY` + `FORECAST_WASPADA`, with a 24 h validity.
2. **Map:** the zone has no fill and a dashed cyan outline. It reads as advisory, not as a confirmed hazard area.
3. **Sidebar:** a fourth `Prakiraan` chip counts tagged items separately from Kuning.
4. **Crisis panel:** the evidence view uses the forecast treatment; the route panel only allows HOLD.
5. **HITL:** an APPROVE on a tagged approval returns 409 until the zone is RED; HOLD still works.
6. **Consensus:** a forecast that mentions "cabai" does not activate the PIHPS/economic channel.
7. **Incident synthesis:** a forecast never creates a physical incident, even if a legacy row still says RED.

---

## 4. Fixes tried and rejected

| Attempt | Why it was rejected | Current approach |
|---|---|---|
| Treat `temporal_phase='forecast_early_warning'` as the tag | A phase is not a display tag; many phases exist without a tag | Separate `forecast_tag` resolved from row/audit/GTM |
| Add a fourth `zone_tier` (`FORECAST`) | Every consumer expects exactly three tiers; this would break tier comparisons | Orthogonal tag; `zone_tier` stays YELLOW |
| Let a forecast become RED on high consensus | A forecast is not an observed physical event; it would fabricate a closure | Hard cap to YELLOW; never synthesize incident |
| Let commodity mentions activate E | A mention is not a PIHPS anomaly | `forecast_mode` disables E |
| Allow APPROVE with a warning toast | The operator would commit a reroute against an unconfirmed event | 409 until RED conversion; HOLD-only |
| Hide forecast zones entirely | The point of an early warning is to show it | Dashed cyan, zero fill, separate filter |
| Reuse the Kuning counter | Forecast would be indistinguishable from a confirmed clarification | Fourth counter + chip |

---

## 5. Verification evidence

**No commit:** `.git/logs/HEAD` ends at `56045cf`; this phase exists only in the working tree.

**No dedicated tests found:** a repo-wide search for `FORECAST_WASPADA` returns 20 source hits and no test hits. The closest existing tests are:

- `backend/tests/test_news_pipeline.py:46-58` — BMKG early-warning extraction (`temporal_phase`), but not the tag.
- `backend/tests/test_consensus_calibration.py` — consensus arithmetic, but no `forecast_mode` case.
- `frontend/e2e/news-live-audit.spec.ts` — live/empty/link/timestamp contracts, no forecast spec.

This is a real gap: the invariants are implemented but not regression-locked.

---

## 6. Residual risks

1. **Backend/frontend drift.** Two derivations of the tag and validity (`news_extractor.py`, `useNewsVerification.ts`) can diverge.
2. **Missing expiry.** `isForecastActive` keeps a tag when `validUntil` is absent or unparseable.
3. **Stale-publish expiry.** `published + 24h` may already be in the past for an old article that still passes the 48 h gate; the tag disappears immediately.
4. **Guard bypass on pre-read failure.** If the `route_approvals` lookup throws, `approval_row` is empty (`news_router.py:743-745`) and the 409 path may not fire.
5. **Linkage dependency.** The API needs `incident_id` to find the linked article; a missing link weakens the guard.
6. **No `CrisisState` field.** The swarm state does not carry the tag; only the news/API/UI layers do.
7. **No operator signal on expiry.** The tag silently disappears after 24 h.
