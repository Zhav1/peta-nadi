<!-- generated-by: gsd-docs-update (M5 window, Deepseek worker) -->
# Phase 85: Weather + FIRMS Overlay — Learnings

**Scope:** durable lessons from this window's Phase B diff (`1c51619..b443352`, code inside commit
`b443352`). Grounded in committed hunks / file reads. No assumptions.

---

## 1. Fixes tried (what worked, with evidence)

### 1.1 FIRMS fake-healthy + 404: replaced with a 200-`degraded` contract

- **Issue:** source-health reported FIRMS `healthy` with `verified_active_adapter` even when no MAP_KEY
  existed (nothing could ever fetch), and a keyless fire endpoint would 500/404 — the UI then showed a
  live toggle for a dead source.
- **Fix:** three-point honest-degraded chain — (a) `health.py:41-46` defaults FIRMS to `degraded` +
  `butuh MAP_KEY` without key, and `:80-110` refuses DB resurrection in both branches; (b)
  `/fire/hotspots` returns 200 + `status: degraded` + `[]` without key (`routing_router.py:126-138`),
  never 500/never fake points; (c) toggle renders gray with `—` + tooltip (`TopNavTelemetry.tsx:444-466`).
- **Lesson:** health must be derived from capability (key present?) not from adapter existence. Any source
  requiring a provisioned secret needs the degraded-default pattern, with the DB branch guarded too —
  otherwise one stale row re-fakes the whole source.

### 1.2 Weather sim label: projection vs warning is a naming contract

- **Issue:** `open-meteo-sim` (simulated/ensemble projection) rendered under warning semantics (red/amber
  + `PERINGATAN`), overstating certainty.
- **Fix:** `is_om` set gains `open-meteo`/`open-meteo-sim`; sim sources labeled `PROYEKSI PRESIPITASI
  EKSTREM OPEN-METEO`, BMKG keeps `PERINGATAN`; palette moved off red/amber entirely (blue/purple
  advisory); every feature carries `source` + `valid_until` (+6 h) so any click proves provenance.
- **Lesson:** simulated vs observed must differ in label AND color AND metadata — one of the three alone
  gets misread at decision time. The `source`/`valid_until` pair is cheap and ends "is this live?" questions.

### 1.3 Fire-as-I without breaking the 4-channel contract

- **Evidence:** `consensus_gate.py:104-133` (fire finding + normalized-event fallback with honest
  0.7/0.55, no invented confidence), `:140-165` (stronger-corroborator single vote), `:187-196`
  (I counted once), `:215-232` (`fire_corroboration` outside `consensus_breakdown`, weights preserved).
- **Lesson:** adding a corroborator to a calibrated consensus requires the transparency object to live
  outside the asserted breakdown — the calibration tests pin W/T/I/E keys, so an in-breakdown fifth key
  would silently re-weight everything. Next window must re-run
  `test_consensus_calibration.py + test_phase76_news_spatial_consensus.py` to confirm the extra key is
  tolerated (flagged in PLAN §5, not yet executed).

### 1.4 Provision path without secrets in git

- **Evidence:** `.env.example:53-61` documents Render-env + `.env.local`; `render.yaml:45-46`
  `NASA_FIRMS_MAP_KEY sync: false`; `config.py:30` defaults to `""` (absent ⇒ degraded everywhere).
- **Lesson:** the same `sync:false` pattern as Phase 58 LLM keys — no secret value ever lands in yaml.
  The placeholder value in `.env.example` (`your-nasa-firms-map-key`) is inert by construction since
  the adapter treats any non-working key as fetch failure → degraded, not fake data.

---

## 2. Concerns (open, evidenced)

| # | Concern | Evidence |
|---|---|---|
| 1 | **MAP_KEY not provisioned.** Entire FIRMS chain is degraded until an operator sets `NASA_FIRMS_MAP_KEY` on the Render dashboard. | `render.yaml:45-46` (`sync:false`, no value); no `.env.local` in repo (gitignored by design) |
| 2 | **Calibration re-run pending.** `fire_corroboration` extra key + single-vote change need `test_consensus_calibration.py` + `test_phase76` green. | PLAN §5; not executed this window |
| 3 | **Layer wiring vs toggles.** Toggles exist with counts; `CrisisMap.tsx` FIRMS-dots+heat / weather-polygon layer wiring against the new endpoint fields is deploy-verify work. | `TopNavTelemetry.tsx:423-466` props only; no CrisisMap hunk in `b443352` for fire layers |
| 4 | **Pre-Q3 cached FIRMS rows lack click fields** — mitigated by raw-row backfill in `/fire/hotspots`, but old `lrip:events:nasa_firms` entries predate `dist_to_corridor_km`. | `routing_router.py` backfill block (`frp == 0` → parse `raw`) |
| 5 | **3 h poller unverified locally** — sleeps 10800 s; first pass runs at boot, but no boot log captured this window. | `main.py:136-180` (`asyncio.sleep(10800)`) |

---

## 3. Constraints (user-given, active)

| Constraint | Effect |
|---|---|
| 2 toggles corroborator-only | Neither overlay escalates alone; weather never RED, fire never solo vote/RED |
| MAP_KEY provision path | Render `sync:false` + `.env.local`, never commit; degraded-default without key |
| Async capped budget | Gate-2 caps (Phase 84); FIRMS poller 3 h cadence, Redis cap 1000, cache TTL 3 h |
| Prod-only verification for overlays | Live FIRMS/weather assertions run against prod only (needs key + satellite data) |
| No commit/push in this docs task | Files only; separate worker commits |

## 4. Re-prove recipe (next window — warm `/health` first)

1. Pre-provisioning: `GET /api/v1/fire/hotspots` → 200, `status: degraded`, `hotspots: []`,
   `reason` contains `MAP_KEY`; `/sources` shows FIRMS `degraded`.
2. Operator sets `NASA_FIRMS_MAP_KEY` on Render dashboard → redeploy → same endpoint returns `ok`
   with hotspots carrying `frp/conf/dist_to_corridor_km/near_segment`; Karhutla toggle turns orange with count.
3. Weather source returns blue/purple fills only (grep response for `239, 68, 68` → 0 hits),
   every feature has `source` + `valid_until`.
4. `pytest test_consensus_calibration.py test_phase76_news_spatial_consensus.py -q` → pass.
5. Prod map: toggle Cuaca/Karhutla independently; hotspot click shows FRP/conf/jarak-koridor;
   polygon click shows sumber + valid_until.
