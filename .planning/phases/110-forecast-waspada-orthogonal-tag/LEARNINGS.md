# Phase 110 — Learnings

**Rule:** only code-evidenced decisions. This phase is unpushed; "implemented" means present in the working tree, not merged or CI-verified.

---

## 1. Decisions

| Decision | Evidence | Consequence |
|---|---|---|
| Keep `FORECAST_WASPADA` orthogonal to `zone_tier` | `news_extractor.py:540-547`; `types.ts:18-24` | Existing tier consumers do not need a fourth enum. |
| Pin a forecast to YELLOW | `news_extractor.py:673-684`; `unified_news_ingestor.py:605-630` | A forecast can never render or behave as RED. |
| Validity = `min(published + 24h, now + 24h)` | `news_extractor.py:575-585` | A warning cannot live forever; an old article does not get a fresh 24 h. |
| Require W + consensus/official source for eligibility | `unified_news_ingestor.py:575-588` | A lone article is a candidate but not an eligible pinned forecast. |
| Disable E in forecast mode | `consensus_gate.py:365-370` | A commodity mention cannot masquerade as a PIHPS observation. |
| Never synthesize an incident from a forecast | `unified_news_ingestor.py:736-743` | Early warning cannot create a fake road closure. |
| HOLD-only in UI and 409 in API | `MitigationTab.tsx:166-173,828-836`; `news_router.py:727-780` | An unconfirmed forecast cannot dispatch a reroute. |
| Separate map/counter treatment | `CrisisMap.tsx:917-967`; `DashboardClient.tsx:755-772,2921-2942` | Forecast reads as advisory, not as a confirmed zone. |

---

## 2. Fixes tried and why they changed

1. **Use `temporal_phase` as the tag.** It is a phase, not a display decision; a phase can exist without an eligible tag and vice versa. **Replaced by** `forecast_tag` resolved from row/audit/GTM (`news_router.py:66-97`).
2. **Add a fourth tier.** It would break every `RED/YELLOW/DROPPED` consumer. **Replaced by** an orthogonal tag.
3. **Let high consensus promote a forecast.** A forecast is not an observed event; promoting it fabricates a closure. **Replaced by** a hard YELLOW cap.
4. **Let E vote on commodity mentions.** A forecast can name a commodity without a price anomaly. **Replaced by** `forecast_mode`.
5. **Allow APPROVE with a toast warning.** A reroute would be committed against an unconfirmed event. **Replaced by** 409 + HOLD-only.
6. **Hide forecast zones.** The warning would be invisible. **Replaced by** zero-fill dashed cyan and a dedicated filter.

---

## 3. Concerns (open, evidenced)

1. **No tests.** `FORECAST_WASPADA` appears only in source, not tests. Every invariant is unprotected.
2. **Duplicated derivation.** `news_extractor.is_forecast_candidate` and `useNewsVerification.deriveForecastTag/isForecastActive` must agree.
3. **Unknown expiry keeps the tag.** `isForecastActive` returns `true` when `validUntil` is missing/unparseable (`useNewsVerification.ts:288-292`).
4. **Old article, expired tag.** `published + 24h` can be in the past while the article is still inside the 48 h admission window.
5. **HITL pre-read failure.** `approval_row` defaults to `{}` on error (`news_router.py:743-745`); the 409 guard may not fire.
6. **Linkage dependency.** The guard needs `incident_id` to find the article; a missing link weakens it.
7. **No state field.** `agents/state.py` does not define `forecast_tag`; the tag is not broadcast through the swarm state.
8. **No expiry telemetry.** The UI hides an expired tag silently; no operator event is emitted.
9. **24 h is policy, not calibration.** There is no empirical study in the tree supporting 24 h over 12/48 h.

---

## 4. Mistakes not to repeat

- **Do not encode a display concept as a severity tier.** A new tier has a blast radius across map, filters, HITL, and tables.
- **Do not let a forecast synthesize a physical incident.** The whole point is that it is unconfirmed.
- **Do not let a commodity mention activate the economic channel.** It is not an observation.
- **Do not allow APPROVE on an unconfirmed forecast.** HOLD is the honest action.
- **Do not rely on one resolution path for the tag.** Row, audit, GTM, and linked article all need checking.
- **Do not merge an orthogonal contract without a regression test.** This phase has none.

---

## 5. Constraints carried into this phase

- Muse Spark orchestrator/planner; subagents DeepSeek/GLM high; no default subagent; always use subagents.
- Playwright auto-check mandatory; free-model limit → paid high fallback.
- Windows PowerShell; `D:\College\Pidi.id`.
- Render free Singapore single worker; Vercel `pre-hub.vercel.app`; Supabase PostGIS.
- No Redis by default; `NEXT_PUBLIC_API_URL` inlined at build.
- No schema migration: tag/validity live in existing JSONB/mirrored columns.
- Docs under `.planning/phases/`; no temp final docs.
