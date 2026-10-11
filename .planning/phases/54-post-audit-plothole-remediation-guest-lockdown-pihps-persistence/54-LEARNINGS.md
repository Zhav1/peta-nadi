# Phase 54: Learnings, Architectural Takeaways & Anti-Patterns Avoided

Phase 54 was a remediation phase: every item was a previously-diagnosed plothole with a precise fix. The value is less in the individual patches than in the patterns they establish. These learnings directly seed the Phase 55 resilience blueprint.

---

## 1. Architectural Learnings

### A. Telemetry Impact Must Be Incremental, Never Absolute

`applyOperationalImpact` was fed the route's **total** `eta_minutes` (38–90 min) instead of the detour delta, so every approval over-inflated corridor delay. The fix (`resolveApprovedDelayMinutes`) derives the delta from the route set itself (`approved − min(etas)`) instead of a hardcoded baseline like `38`.

**Takeaway:** any "impact" value crossing a boundary must be defined as a delta with an explicit reference point. Hardcoded baselines silently rot when the underlying route set changes.

### B. Locally Derived State Must Survive Background Polling

The 30s corridor poller overwrote operator-approved recalculation after at most 30 seconds. The durable pattern now in `useCorridorContext`:

1. Store the impact in a ref (`activeImpactRef`) — it is an *intent*, not derived data.
2. On every fresh poll, **re-base**: apply the stored impact on top of new backend data before committing to state.
3. Only use the full fallback object when no context exists yet (first render), never to clobber live data.

**Takeaway:** "state that must survive polling" belongs in a ref/user intent layer that is deterministically re-applied — not in the polled state itself.

### C. Degradation Must Be Flagged, Not Implied

The `FALLBACK` badge branch was unreachable because the fallback object made every probe truthy (`corridorContext?.weather`). UI honesty required an **explicit** `is_fallback` boolean, set at the data source (`true` in `DEFAULT_FALLBACK_CORRIDOR`, `false` on fresh fetch).

**Takeaway:** truthiness of a fallback object is not a degradation signal. Systems should carry explicit provenance/quality flags (`is_fallback`, `source`, `sync_status`) end-to-end. This generalizes directly to the backend engines audited in Phase 55, where hardcoded defaults are currently indistinguishable from live data.

### D. Prefer Permission Capability Gates Over Role-Name Checks

Backend routers checked `if user.role == ROLE_REGULATOR` (denylist) and then *assumed* everyone else may mutate. Phase 54 converted these to `if "approvals:write" not in user.permissions` gates which:

- deny **every** role lacking the capability (guest included) with no router edits when roles evolve,
- return machine-readable `required_permissions` in the 403 payload,
- keep role definitions (in `supabase_auth.py`) as the single source of permission truth.

**Takeaway:** RBAC checks should be about *what the caller can do* (capabilities), with roles as bundles of capabilities. Denylists age badly.

### E. Never Auto-Mint Sessions as an Availability Fallback

The offline "login with any credentials → DISPATCHER session" path made authentication optional during outages. The replacement pattern: detect the unavailable identity provider, return an explicit error string, keep the caller in a locked guest profile (zero permissions).

**Takeaway:** demo/sandbox convenience must be an **explicit mode** (e.g. `?guest=1` preview), never a silent fallback in the authentication path. Availability problems must degrade *capability*, not *identity verification*.

### F. Idempotent Persistence Without Unique Constraints

`commodity_prices` has no unique constraint, so historical backfill needed idempotency: `persist_price_points` deletes the `(commodity, region, time)` row before inserting, per point, and never raises (best-effort logging).

**Takeaway:** when the schema cannot enforce idempotency, enforce it in the writer with a natural key delete-then-insert, and keep ingestion failure-tolerant. Corollary: reads deserve policies; writes deserve the service role.

### G. Startup Wiring Is a Checklist, Not a Detail

A new background loop is only "live" when it is (1) defined, (2) registered as a lifespan task, and (3) added to the shutdown cancellation list. `_poll_pihps_loop` required all three edits in `main.py`. Multi-worker deployments (`--workers 2`) additionally duplicate every poller per process — "run once" needs leader election or a worker-external scheduler.

---

## 2. Process Learnings

### H. Test Imports Are API Contracts

The missing `KNOWN_POIS` alias aborted **pytest collection entirely** — not one test, the whole suite. A refactor that removes a module-level symbol is a breaking change for every importer; keep compatibility aliases or update importers atomically.

### I. Live-Data-Coupled Tests Need Seeding or Skips

The commodity API test asserted `items > 0` against a live endpoint while the table was empty — an environment condition masquerading as a code failure. Either the test seeds its data, skips on empty, or is labelled an environment check.

### J. Fix the Data, Then Fix the Test — In That Order

`commodity_prices` failures had two layers: (1) no rows existed (writes blocked by RLS, persistence missing), (2) the test asserted against live rows. Addressing (1) made (2) meaningful again. Test adjustments before data fixes would have masked a real availability bug.

---

## 3. Anti-Patterns Avoided (Checklist for Future Phases)

| Anti-pattern | Phase 54 countermeasure |
|---|---|
| Hardcoded baseline ETA (`?? 38`) | Delta computed from the live route set |
| Checkmark icon on error alerts | `AlertCircle` for errors; `CheckCircle2` for success only |
| Stale `?guest=1` in the address bar after login | `dismissGuestQuery()` preserving other params |
| "Full access" guest copy contradicting a locked role | Copy + badge now state the limited preview explicitly |
| Frontend/backend permission drift | `ROLE_GUEST` trimmed server-side; capability gates are authoritative |
| Silent guest session minting during outages | Explicit "auth service unavailable" error; no session created |
| Guest account still able to approve routes / mutate fleet | 403 on `approvals:write`, `fleet:write`, `manifests:upload` |
| Scraper crash-sensitivity | Best-effort `persist_price_points` never raises; loop survives |

---

## 4. Trade-Offs Accepted

- **Guest mode now depends on Supabase availability** for any session upgrade. Offline demos still work in the restricted preview (zero-permission guest), and approvals persist to SQLite via the local fallback (`sync_status: pending`) — so the closed-loop demo path survives without the cloud.
- **Migration 009 is policy-only** (no `enable row level security`), matching the live project where RLS is already enabled. Fresh-environment replays must pair it with an explicit RLS enablement statement.

---

## 5. Handoff to Phase 55

The through-line of Phase 54 — **no silent fallbacks; degrade explicitly and visibly** — is the exact remedy pattern for the engine audit findings:

- TomTom 403/400 → explicit degraded flags instead of hardcoded 22.5 km/h corridor telemetry.
- OpenMeteo TypeError / NIM 404 / invalid Gemini ID → fail loudly or return typed degraded states, never canned strings disguised as model output.
- RLS-with-no-policy → the same silent-empty-read class found on `commodity_prices` now blocks `/api/v1/incidents`.

See `.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-LEARNINGS.md` for the full resilience principles.
