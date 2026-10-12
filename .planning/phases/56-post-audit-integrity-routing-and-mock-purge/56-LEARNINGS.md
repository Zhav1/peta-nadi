# Phase 56: Learnings — Integrity, Provenance & Honest UI

Distilled lessons from the post-audit remediation pass. These are the acceptance philosophy behind `56-PLAN.md`: **a demo is allowed to be a simulation, but it must never pretend to be live data — and a dead link must never masquerade as a live source.**

---

## 1. Provenance Is a Payload Field, Not a UI Judgment

**Observed anti-pattern:** the news feed decided a link was "dead" with a client-side heuristic (`link.includes('/berita/49')` — a single fixture URL) and substituted a Google News search URL. The heuristic broke the moment a real article happened to match, and the substitution hid the failure entirely.

**Principle:** liveness is measured at the boundary where the data enters the system (ingestion time, `unified_news_ingestor._attach_link_liveness`) and carried as a first-class payload field (`link_alive: 'alive' | 'dead' | 'unknown'`) through every layer — Redis stream, Supabase column (migration 011), API response, TypeScript type, and UI. The UI only *renders* the verdict; it never *re-derives* it.

**Corollary — the three-valued verdict:** `unknown` (timeout/transport error) is a legitimate state distinct from `dead`. Declaring a link dead because the probe timed out is a false positive that erodes trust; the honest UI shows "status belum diverifikasi" styling and still offers the stored excerpt.

---

## 2. The Three-Valored Liveness Contract

| Verdict | Meaning | UI treatment |
|---|---|---|
| `alive` | 200-ish response, same host, not redirected to site root | "Buka sumber" anchor |
| `dead` | status ≥ 400, redirect to `/`, or redirect to another host | amber "Tautan asli kedaluwarsa" badge + expandable stored excerpt |
| `unknown` | timeout / transport error / no link | anchor allowed (unverified) or "Tautan sumber tidak tersedia" |

**Dead-definition details that matter:**
- A redirect to the **site root** is dead even with a 200 — the article is gone.
- A redirect to **another host** is dead (paywall/aggregator syndication), *unless* the original host was empty.
- `www.` prefix and case are normalized before host comparison — an `http→https` or `www` hop is not a dead link.

---

## 3. Centering Math Must Come From One Module

**Observed:** two independent 4-branch `lg:left-[calc(…)]` ternaries (footer + simulator bar) plus a hardcoded `right-[408px]` panel offset — three encodings of the same layout invariant, already drifted by 16 px (408 vs the real 424 px drawer).

**Principle:** responsive docking arithmetic lives in **exactly one** module (`mapDockLayout.ts`) exposing a pure function of the two booleans that matter (`isLeftSidebarCollapsed`, `isCrisisDrawerOpen`). Consumers compose the returned class string; they never re-derive offsets. The four states are explicit and exhaustively named (`sidebarAndDrawer`, `sidebarOnly`, `drawerOnly`, `mapOnly`) — adding a fifth dock state is a one-file change.

**Formula (memorize):** content region between a 320 px sidebar and a 424 px drawer centers at `left = (100vw − 424px + 320px) / 2`, with `max-w = 100vw − 424px − 320px − 48px` reserving 24 px per side.

---

## 4. External-API Options Are Conditional, Not Absolute

**Observed (D2):** blanket `exclude=toll` on every route request would force all traffic onto arterials even when the hazard is nowhere near a toll road — slower, and wrong. The correct contract:

1. **Gate:** apply `exclude=toll` only when `isHazardNearTollCorridor()` — hazard center within `radius + 2 km` (haversine) of a node flagged `isTollGate: true`.
2. **Degrade:** if Mapbox answers `NoRoute` (or 200-with-empty-routes), retry **exactly once** without the exclusion. Routing must never fail closed because an optional filter was too aggressive.
3. **Assert:** the URL construction is unit-tested both ways (with/without `exclude=toll`), and the retry path is tested by injecting a synthetic `NoRoute`.

**Corollary — the HOLD card:** when every route is compromised, the recommendation is a *decision* (delay departure), not a *route*. It must carry `waypoints: []` and `is_compromised: true`. Reusing the compromised corridor's waypoints and marking it `is_compromised: false` (the old behavior) painted an unsafe route as safe — the single most dangerous defect fixed in Phase 56.

---

## 5. Empirical Calibration Over Fixed Literals

**Observed (D5):** `/spikes` returned two hardcoded objects (`cabai_merah 62000/52000 19.2%`, `bawang_merah 38500/35000 10.0%`) with `import random` still present — the endpoint was theater.

**Principle:** any metric derived from data must be *computed from that data* with an explicit sufficiency guard:
- Minimum-records guard (`>= 3` records in the 30-day window) before any percentage is computed.
- Baseline = mean of the window; spike = `(current − baseline) / baseline × 100`.
- Severity bands are thresholds on the *computed* value (≥15 critical / ≥10 high / ≥5 medium), not per-commodity literals.
- Insufficient data → honest `[]` with `total: 0`, never a fabricated row.

**The same purge applies everywhere:** `FALLBACK_OUTCOMES` (fabricated closed-loop outcomes), `?? 1.0` metric fallbacks, hardcoded chart prices (`14000/17000/55000`), hardcoded Brier/ECE defaults — all replaced with `null` + "Belum dihitung" / "Belum tersedia" rendering. An honest empty state is a feature, not a bug.

---

## 6. Simulation Is a Mode, Not a Default

**Observed (D3):** `useFleetVehicles` initialized with `FALLBACK_FLEET`, so the dashboard *always* showed a synthetic fleet — indistinguishable from real telemetry.

**Principle:** synthetic/fallback data is **opt-in** (`isSimulationMode`, default `false`) and **visible** (amber "Mode Simulasi" toggle with pulsing dot + explanatory toast). When the mode is off: empty arrays and honest errors. The fallback data itself (`FALLBACK_FLEET`) is retained but unreachable except through the toggle — purge the *silent* path, keep the *labeled* path.

**Corollary — label the simulation in the data:** the demo causal chain is derived server-side (`demo_router._derive_causal_chain`) with every node labeled `"Rantai Sebab-Akibat (Simulasi)"`. Provenance travels with the payload, so any consumer (not just the current UI) can tell simulation from production.

---

## 7. Demo Pacing Is Operator-Controlled

**Observed (D4):** the guided demo auto-advanced through timer-driven stages, which (a) skips the economic review operators actually need and (b) breaks offline walkthroughs when timing drifts.

**Principle:** stage transitions happen on button clicks (`Langkah Berikutnya`, CTA), never on timers. Stage 4 opens **Economic** (payload-bound cards), and the approve/dispatch CTA opens **Mitigation** — the operator reviews impact *before* approving action. Every economic card value is derived from `inflation_forecast` / `economic_intelligence_finding` payloads; missing fields render "Belum tersedia", a missing payload renders a dashed empty-state box.

---

## 8. Architectural Invariants to Carry Forward

1. **Single source of truth for layout math** — one module, pure function, named states (WP1).
2. **Payload-carried provenance** — `link_alive`, `label: "(Simulasi)"`, `is_fallback` — never re-derived downstream (WP4, WP5).
3. **Conditional external options with a retry-without** — `exclude=toll` gated by geometry, NoRoute falls back (WP2).
4. **Computed-or-empty** — every metric is computed from data with a sufficiency guard, or renders an explicit empty state (WP5).
5. **Opt-in simulation** — fallback datasets are behind a visible toggle, default off (WP5).
6. **No fabricated numbers anywhere in the demo path** — the guardrail from `56-PLAN.md` ("No hardcoded '+17.1%' or 'Rp 210 Juta'") is now enforced structurally: cards read payload fields or render empty states.

---

## 9. Pitfalls to Avoid in Future Context Windows

| Pitfall | Symptom | Safeguard |
|---|---|---|
| Reintroducing heuristic liveness | any `link.includes('…')` or URL-pattern check in the frontend | liveness comes only from `link_alive`; grep/Select-String sweep for `isDeadMockUrl`, `fallbackSearchUrl`, `berita/49` |
| Re-adding fixed spike literals | hardcoded `spike_pct` / `current_price` in `commodity_router.py` | `/spikes` reads `commodity_prices` with `MIN_RECORDS_GUARD`; test `test_commodity_spikes_calculation_and_guard` asserts the guard |
| Unlabeled fallback fleet | `useFleetVehicles` initializing with `FALLBACK_FLEET` | initial state is `[]`; fallback only under `isSimulationMode`; sweep for `useState<FleetVehicle[]>(FALLBACK_FLEET)` |
| Drifted dock math | new `lg:left-[calc(…)]` literals outside `mapDockLayout.ts` | all docks compose `resolveMapDockClasses()`; sweep for `calc(50%` |
| Timer-driven demo stages | `setTimeout` advancing `demoState.stage` | transitions only via `nextStage()` / CTA handlers |
| HOLD route with waypoints | `waypoints: recommendations[0]?.waypoints` on the HOLD card | HOLD carries `waypoints: []` + `is_compromised: true`; Playwright spec asserts it |

---

## 10. Context-Window Transfer Notes

- **The working tree is the artifact.** Phase 56 is uncommitted (23 modified + 2 new files). If a future window starts from a commit, re-run `git status` before trusting any line number in `56-WALKTHROUGH.md` — anchors refer to the working tree.
- **Verification baseline moved:** backend pytest 178 → **183** (WP4 +5 link-liveness tests, WP5 +1 spikes-guard test expansion inside existing files). Next.js build and the 7-test Playwright routing spec are green.
- **Migration 011 must be applied** to the remote Supabase project for `link_alive` to surface in the live dashboard; locally the column is additive (`IF NOT EXISTS`, default `'unknown'`), so the UI degrades to "unknown" styling until applied.
- **The workspace content-search tool is unreliable here** (see `56-ENVIRONMENT-FIXES-AND-PITFALLS.md` §3) — direct reads + PowerShell `Select-String` are the verification path of record.
- **Model fallback chain:** DeepSeek V4.1 Flash (primary, weekly-capped) → `inclusionai/ling-3.1-flash:free` (fallback, smaller dispatches). Check quota before dispatching.
