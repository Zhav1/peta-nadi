# Tasks — Phase 5: Notifications & Human-in-the-Loop

## Wave 1 — Backend: DB Migration + Notification Service
- [x] Task 1.1: Supabase migration for `route_approvals` table
- [x] Task 1.2: WhatsApp notification service (`backend/app/services/notification_service.py`)
- [x] Task 1.3: Hook notification service into `backend/app/workers/agent_worker.py`
- [x] Task 1.4: Approval REST endpoint (`backend/app/routers/approvals.py` + registry in `main.py`)
- [x] Task 1.5: Source health endpoint (`backend/app/routers/health.py`)

## Wave 2 — Frontend: Approve Button + Source Health Banner
- [x] Task 2.1: Add API client methods in `frontend/lib/api.ts`
- [x] Task 2.2: Add type definitions in `frontend/lib/types.ts`
- [x] Task 2.3: Implement Approve button in `frontend/components/sidebar/MitigationTab.tsx`
- [x] Task 2.4: Implement `SourceHealthBanner` component in `frontend/components/ui/SourceHealthBanner.tsx`
- [x] Task 2.5: Wire banner into `frontend/components/dashboard/DashboardClient.tsx`
- [x] Task 2.6: Implement `Toast` primitive in `frontend/components/ui/Toast.tsx`

## Wave 3 — Config & Migration Wiring
- [x] Task 3.1: Add `WHATSAPP_RECIPIENT_NUMBER` to `.env.example`
- [x] Task 3.2: Update `backend/app/config.py` with `whatsapp_recipient_number`
- [x] Task 3.3: Apply DB migrations/run SQL scripts
