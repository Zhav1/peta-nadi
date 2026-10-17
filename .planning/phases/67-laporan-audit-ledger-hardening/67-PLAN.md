# Phase 67 Plan: Laporan Audit Ledger Hardening

## 1. Executive Summary & Goals

Following the audit of `frontend/components/dashboard/ReportsSection.tsx`:
- The Laporan tab is PreHub's official B2G / enterprise audit trail ("Catatan Audit Mitigasi Logistik Pangan"), persisted to Supabase `route_approvals` with local SQLite `route_decision_traces` fallback.
- However, the presentation layer had several critical audit gaps:
  1. The Status column was hardcoded to `DISETUJUI`, completely masking `REJECT` and `OVERRIDE` actions taken by operators and hiding sync statuses.
  2. The timestamp was formatted with `toLocaleTimeString()` (e.g. `09:15:00`), missing full calendar dates and timezone offsets necessary for legal non-repudiation.
  3. When empty, it rendered two fake hardcoded fallback rows (`Genangan Air Jalinsum`, `Hambatan Arteri Sei Rampah`).
  4. KPI card defaulted to a hardcoded `14` counter.
  5. The "Status Koridor" metric displayed a static `"Terkendali"` badge regardless of crisis status.
  6. PDF export ignored the approval list entirely, printing only 1 static summary row.
  7. There were no search or filtering capabilities (date range, action type, text search).

**Goal**: Transform the Laporan tab into an authentic, production-grade audit ledger displaying real operator actions, live sync indicators, full ISO date+timezone timestamps, interactive filters, honest empty states, and dynamic PDF/JSON exports based on the filtered ledger.

---

## 2. Deliverables & Blast Radius

### Frontend Changes:
1. `frontend/components/dashboard/ReportsSection.tsx`:
   - **Real Action & Sync Status**: Render dynamic badges for `ACCEPT` (emerald), `REJECT` (rose), and `OVERRIDE` (amber), accompanied by sync status indicators (`SYNCED` / `PENDING`), tactical maneuver directives (`REROUTE`, `HOLD`, `CONTINUE`), and operator justification notes.
   - **Full Calendar Date & Timezone**: Implement `formatDateTime()` in `id-ID` locale with full day, month, year, 24-hour time, and timezone offset (e.g., `18 Okt 2026, 03.47.03 GMT+7`).
   - **Purge Fake Fallbacks & Static Badges**:
     - Remove the 2 hardcoded static fallback rows.
     - Add glassmorphic empty states for zero records and zero filter matches.
     - Default the approval counter to `0`, dynamically bound to backend total.
     - Dynamically derive "Status Koridor" from `selectedCrisis.severity` and `corridorContext.traffic.status`.
   - **Interactive Filters Toolbar**:
     - Text search (querying incident ID, route, operator, notes, action).
     - Decision action dropdown filter (`ALL`, `ACCEPT`, `REJECT`, `OVERRIDE`).
     - Start date and end date inputs.
     - One-click "Reset Filter" action.
   - **Dynamic Export Hardening**:
     - `handleGeneratePDF()`: Prints the actual filtered audit log table with complete column metadata and live KPI summary.
     - `handleExportJSON()`: Exports `filteredList` with full filter and system integrity metadata.
2. `frontend/lib/types.ts`:
   - Add `sync_status?: string;` to `ApprovalItem` interface.

---

## 3. Verification & Acceptance Criteria
- [x] `rtk npx tsc --noEmit` compiles cleanly with 0 type errors.
- [x] `rtk npm run build` completes production bundle generation (7/7 static pages).
- [x] Table displays actual operator decisions (`ACCEPT`, `REJECT`, `OVERRIDE`) with sync status rather than hardcoded `"DISETUJUI"`.
- [x] Timestamps include full date, time, and timezone (`GMT+7`).
- [x] Zero mock rows appear when no approvals exist.
- [x] Filter toolbar dynamically narrows table rows and synchronizes with PDF/JSON exports.
