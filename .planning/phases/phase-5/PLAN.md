# PLAN — Phase 5: Notifications & Human-in-the-Loop

**Phase:** 5  
**Name:** Notifications & Human-in-the-Loop  
**Status:** PLANNING  
**Depends on:** Phase 4 complete (3D Map Dashboard)  
**Target:** WhatsApp alert delivery + `route_approvals` DB table + Approve button + source health UI

---

## Context

Phase 4 delivered the full 3D dashboard: Mapbox + Deck.gl, WebSocket streaming, Tri-Panel Sidebar (Evidence / Mitigation / Economic), timeline scrubber, and the TheoTown simulate UI.

**What's missing after Phase 4:**
- The consensus gate fires and writes to Supabase — but sends no outbound notification.
- The Mitigation tab shows route cards with a "select" interaction — but no "Approve" action that persists to DB.
- The StatusHeader shows incident count, but there is no per-layer source health indicator (BMKG/TomTom green/yellow/red).
- `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are wired in `config.py` but completely unused.

Phase 5 closes all three gaps. It is the final human-facing layer before the demo polish phase.

---

## Architecture Overview

```
consensus_gate (validated=True)
        │
        ▼
[NEW] notification_service.py
   send_whatsapp_alert(crisis_state)
        │  ← WhatsApp Cloud API (POST /messages)
        ▼
  Operator's WhatsApp
  "🚨 ALERT: Belawan Port closure..."
  "Recommended: Route via Dumai"
  "View dashboard: https://app/crisis/<id>"

Dashboard — MitigationTab
   [Approve] button
        │  ← POST /api/v1/approvals
        ▼
  route_approvals (Supabase table)
  timestamp | route_id | operator_id | crisis_id | recommended_route

StatusHeader / new SourceHealthBanner
   BMKG ● green / TomTom ● yellow / AISstream ● red
        │  ← GET /api/v1/health/sources
        ▼
  source_health (Supabase table, already in schema)
```

---

## Task Breakdown

### Wave 1 — Backend: DB Migration + Notification Service

#### Task 1.1 — Supabase migration: `route_approvals` table
**File:** `backend/migrations/005_route_approvals.sql` [NEW]

```sql
CREATE TABLE IF NOT EXISTS route_approvals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crisis_id          text NOT NULL,
  route_id           text NOT NULL,
  recommended_route  jsonb NOT NULL,
  operator_id        text NOT NULL DEFAULT 'anonymous',
  approved_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON route_approvals (crisis_id);
CREATE INDEX ON route_approvals (approved_at DESC);
```

Apply via Supabase SQL editor or `supabase db push`.

---

#### Task 1.2 — WhatsApp notification service
**File:** `backend/app/services/notification_service.py` [NEW]

Responsibilities:
- `send_crisis_alert(state: dict) -> bool`
  - Builds formatted WhatsApp text body with crisis summary, recommended action, and dashboard deep-link
  - POST to `https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages`
  - Headers: `Authorization: Bearer {WHATSAPP_TOKEN}`
  - Recipient: `settings.whatsapp_recipient_number` (env var, test number for MVP)
  - Returns `True` on HTTP 200, logs warning and returns `False` on any error
  - If `WHATSAPP_TOKEN` is empty → logs `"WhatsApp not configured — skipping notification"`, returns `False`

Config additions required:
- Add `whatsapp_recipient_number: str = ""` to `Settings` in `config.py`
- Add `WHATSAPP_RECIPIENT_NUMBER=+628xxxxxxxxxx` to `.env.example`

---

#### Task 1.3 — Hook notification into agent worker
**File:** `backend/app/workers/agent_worker.py` [MODIFY]

After `result = await compiled_graph.ainvoke(...)`, check `result.get("validated")` and call `send_crisis_alert(result)`. This keeps app services out of the agents package boundary.

---

#### Task 1.4 — Approval REST endpoint
**File:** `backend/app/routers/approvals.py` [NEW]

```
POST /api/v1/approvals
Body: { crisis_id, route_id, recommended_route, operator_id? }
Response: { approval_id, approved_at }

GET /api/v1/approvals?crisis_id=<id>&limit=50
Response: { items: [...], total: int }
```

- Inserts into `route_approvals` via Supabase anon client
- Falls back to 202 with `{"status": "queued"}` if Supabase unavailable
- Registered in `main.py` under prefix `/api/v1`

---

#### Task 1.5 — Source health endpoint
**File:** `backend/app/routers/health.py` [MODIFY]

Add `GET /api/v1/health/sources`:
```
Response: {
  sources: [
    { name, status: "healthy"|"degraded"|"down", last_seen }
  ]
}
```

Status logic: `healthy` if last_seen < 15 min ago, `degraded` if 15–60 min, `down` if > 60 min or `degraded_flag = true`. Returns `"unknown"` for all sources if Supabase unavailable.

---

### Wave 2 — Frontend: Approve Button + Source Health Banner

#### Task 2.1 — API client additions
**File:** `frontend/lib/api.ts` [MODIFY]

Add `api.approvals.create()`, `api.approvals.list()`, and `api.sourceHealth.get()` methods.

---

#### Task 2.2 — Type definitions
**File:** `frontend/lib/types.ts` [MODIFY]

Add: `ApprovalPayload`, `ApprovalResponse`, `SourceStatus`, `SourceHealth`, `SourceHealthResponse`.

---

#### Task 2.3 — Approve button in MitigationTab
**File:** `frontend/components/sidebar/MitigationTab.tsx` [MODIFY]

- Add "✓ Approve Route" button inside `RouteCard` — visible only when `isActive === true`
- On click: call `api.approvals.create(...)`, show loading spinner, then green "✓ Approved" with timestamp
- Accept `crisisId: string` prop in `MitigationTab`; pass down to each `RouteCard`
- Show toast on success: `"Route approved and logged ✓"`

**File:** `frontend/components/sidebar/CrisisSidebar.tsx` [MODIFY]

Pass `crisis.crisis_id` as `crisisId` to `MitigationTab`.

---

#### Task 2.4 — Source health banner component
**File:** `frontend/components/ui/SourceHealthBanner.tsx` [NEW]

- Floating glass panel, positioned `bottom-4 left-4`
- Polls `GET /api/v1/health/sources` every 60 seconds
- Shows: ● green / ● yellow / ● red dot + source name + status + relative `last_seen` time
- Sources: BMKG, TomTom, AISstream, NASA FIRMS

---

#### Task 2.5 — Wire SourceHealthBanner into dashboard
**File:** `frontend/components/dashboard/DashboardClient.tsx` [MODIFY]

Import and render `<SourceHealthBanner />` bottom-left on the map.

---

#### Task 2.6 — Toast primitive
**File:** `frontend/components/ui/Toast.tsx` [NEW]

- Simple auto-dismiss toast (3 seconds), top-center
- Variants: `success` (green) | `error` (red) | `info` (cyan)
- No external dependency; pure CSS animation
- Exposed via `useToast` hook or simple state in DashboardClient

---

### Wave 3 — Config & Migration Wiring

#### Task 3.1 — `.env.example`
Add `WHATSAPP_RECIPIENT_NUMBER=+628xxxxxxxxxx`

#### Task 3.2 — `backend/app/config.py`
Add field: `whatsapp_recipient_number: str = ""`

#### Task 3.3 — Apply DB migration
Run SQL from Task 1.1 in Supabase SQL editor.

---

## Verification

| # | Check | How |
|---|-------|-----|
| V1 | Validated alert triggers WhatsApp message delivery | Set a real `WHATSAPP_RECIPIENT_NUMBER` + valid token, trigger simulation, confirm message received |
| V2 | No notification sent for unvalidated (< 85%) events | Force low-confidence event; check no WA message sent |
| V3 | Clicking "Approve" inserts record in `route_approvals` | Select a crisis → Mitigation tab → select route → Approve → check Supabase table |
| V4 | Source health indicator turns red when BMKG adapter is deliberately killed | Delete / corrupt `source_health` row for BMKG or set `degraded_flag = true`; refresh dashboard |
| V5 | WhatsApp notification contains dashboard deep-link | Inspect message body for `https://.../<crisis_id>` |
| V6 | `route_approvals` GET endpoint returns logged approvals | Hit `/api/v1/approvals?crisis_id=<id>` after approving |
| V7 | Frontend builds clean with new types and components | `npm run build` in `/frontend` passes with 0 errors |
| V8 | WhatsApp fallback (no token) logs cleanly, does not crash | Unset `WHATSAPP_TOKEN` in env; run simulation; check logs show "skipping notification" |

---

## File Index

### New Files
| File | Purpose |
|------|---------|
| `backend/migrations/005_route_approvals.sql` | DB schema for approval logging |
| `backend/app/services/notification_service.py` | WhatsApp Cloud API integration |
| `backend/app/routers/approvals.py` | REST CRUD for route approvals |
| `frontend/components/ui/SourceHealthBanner.tsx` | Per-layer health indicator UI |
| `frontend/components/ui/Toast.tsx` | Notification toast primitive |

### Modified Files
| File | Change |
|------|--------|
| `backend/app/config.py` | Add `whatsapp_recipient_number` field |
| `backend/app/main.py` | Register `approvals` router |
| `backend/app/routers/health.py` | Add `/api/v1/health/sources` endpoint |
| `backend/app/workers/agent_worker.py` | Call `send_crisis_alert` after validated graph run |
| `frontend/lib/types.ts` | Add Approval + SourceHealth types |
| `frontend/lib/api.ts` | Add `approvals` + `sourceHealth` API calls |
| `frontend/components/sidebar/MitigationTab.tsx` | Add Approve button + optimistic UI |
| `frontend/components/sidebar/CrisisSidebar.tsx` | Pass `crisis_id` to MitigationTab |
| `frontend/components/dashboard/DashboardClient.tsx` | Mount SourceHealthBanner + Toast |
| `.env.example` | Add `WHATSAPP_RECIPIENT_NUMBER` |

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| WhatsApp Cloud API requires Meta app approval / phone number verification | HIGH | Use sandbox test number (provided by Meta) for MVP; real delivery only for judge demo |
| Meta API rate limits on test account | MEDIUM | MVP sends at most 1 WA per validated crisis; throttle not a concern at demo scale |
| `source_health` table may be empty (Phase 1 adapters not running) | MEDIUM | Health endpoint returns `"unknown"` status by default — UI shows grey dot, no crash |
| Supabase offline during demo | LOW | Approval endpoint falls back to 202 log; notification service is independent of DB |
| `agent_worker.py` may not have access to app settings at import time | LOW | Use lazy import inside function; settings are already initialized via `get_settings()` |

---

## Notes

- **WhatsApp API version:** Use `v18.0` of the Graph API (stable as of 2026).  
- **Message format:** Plain text only for MVP (no interactive buttons or templates that require Meta approval). Template messages require 24h Meta review — plain text messages to test numbers work immediately.  
- **Operator ID:** MVP uses `"anonymous"`. Wire to an auth token in v1.1 when operator login is added.  
- **Deep-link URL:** Hardcode `NEXT_PUBLIC_APP_URL` env var for the WhatsApp message dashboard link. Add to `.env.example`.
