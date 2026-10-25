---
phase: 107
phase_name: HITL Route Decision Control Unification & E2E Workflow Hardening
milestone: M6
milestone_name: 3D Globe Native Mapbox Fleet, Street-Snapping & Impeccable Cartography
created_at: "2026-10-25T16:15:00.000Z"
status: planned
framework: GSD
---

# Phase 107: HITL Route Decision Control Unification & E2E Workflow Hardening

## Context & Objectives
During operational usability testing of the PreHub dispatch workflow on the map interface, critical Human-in-the-Loop (HITL) decision defects were identified in [`RouteDetailModal.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/sidebar/RouteDetailModal.tsx) and [`DashboardClient.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx):

1. **Silent Drop on Ad-Hoc / Non-Crisis Corridors**:
   - When a dispatcher inspects an ad-hoc or map-selected corridor (where `selectedCrisis` is null), clicking **Setujui**, **Tahan**, or **Tolak** triggers a silent early return at `DashboardClient.tsx:2418` (`if (!route || !selectedCrisis?.crisis_id) return;`).
   - No HTTP request is sent, no error is logged, and no toast is displayed, rendering the action buttons completely unresponsive.
2. **Control Duplication & Logic Collision**:
   - The modal features two disjoint decision controllers:
     - Top toggle: `[ REROUTE ] [ HOLD ] [ CONTINUE ]` (mutates `tactical` state).
     - Bottom buttons: `[ Setujui ] [ Tahan ] [ Tolak ]` (mutates `decision` state).
   - In `DashboardClient.tsx:2435`, clicking "Tahan" forces `action = 'ACCEPT'`, but the actual maneuver sent to the backend is hijacked by the top toggle (`tactical_action: tactical`). If the top toggle is `REROUTE`, clicking "Tahan" sends `action: ACCEPT, tactical_action: REROUTE`, rerouting the truck instead of holding it.
3. **Premature Auto-Commit on Route Click**:
   - In `DashboardClient.tsx:2326`, merely clicking a route card or map line automatically dispatches `api.approvals.create` with `action: ACCEPT, tactical: REROUTE` before the dispatcher has opened or verified the modal.
   - If the dispatcher subsequently clicks "Setujui" in the modal, a duplicate approval is created. If they click "Tolak", the route was already recorded as accepted.
4. **Logic Inversion on Route Rejection**:
   - In `DashboardClient.tsx:2446`, `handleCommitOperationalRoute` is invoked unconditionally without checking `action === 'REJECT'`. Rejecting a route still converts the map route to active cyan and fires a telematics TMS ping to reroute the vehicle.
5. **Contract Mismatch on Mandatory Notes**:
   - Backend Pydantic schema (`decision_schemas.py:49-51`) strictly requires non-empty explanation notes for `REJECT` and `OVERRIDE`.
   - Frontend validation only required notes for `tactical === 'HOLD'`, causing HTTP 422 errors when rejecting without notes.

### Objectives for Phase 107:
1. **Unify Decision Controls**: Refactor the top toggle in `RouteDetailModal.tsx` into a pure **Economic Trade-off & Spoilage Impact Preview** selector, and replace the ambiguous bottom buttons with **3 explicit, mutually exclusive tactical commit actions**:
   - `[ Setujui Pengalihan (Reroute) ]` $\rightarrow$ `action: 'ACCEPT', tactical_action: 'REROUTE'`
   - `[ Tahan di Depo (Hold Fleet) ]` $\rightarrow$ `action: 'ACCEPT', tactical_action: 'HOLD'` (Requires mandatory notes)
   - `[ Lanjut Jalur Asal (Override) ]` $\rightarrow$ `action: 'OVERRIDE', tactical_action: 'CONTINUE'` (Requires mandatory notes)
   - `[ Batal / Tutup ]` $\rightarrow$ Closes modal without route mutation
2. **Eliminate Silent Drop**: Implement robust fallback incident ID resolution (`selectedCrisis?.crisis_id || route.incident_id || 'INC-ADHOC-CORRIDOR'`) and informative toasts.
3. **Eliminate Premature Auto-Commit**: Strip `api.approvals.create` out of `handleSelectRoute` so route selection remains purely visual.
4. **Fix Rejection Guard**: Ensure `action === 'REJECT'` records the rejection audit trail but never commits the route to the active map layer or fires TMS pings.
5. **Harden Downstream E2E Integrations**: Verify data propagation to Reports audit table (`ReportsSection.tsx`), driver WhatsApp dispatch (`MitigationTab.tsx`), TMS telematics, and evaluation outcomes (`EvaluationSection.tsx`).

---

## Design System & UI/UX Standards (Impeccable & Anti-Slop)

- **Aesthetic**: Modern Dark Tactical Command HUD (`#080d14` base, Glassmorphism 2.0 `backdrop-blur-xl bg-[#0c0e12]/80 border border-white/10 shadow-2xl`).
- **Button Styling & Hierarchy**:
  - **Setujui Reroute**: High-contrast primary action (`bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-semibold text-xs px-4 py-2.5 rounded-lg transition-all shadow-lg shadow-emerald-950/40 cursor-pointer`).
  - **Tahan di Depo**: Distinct caution action (`bg-amber-600/90 hover:bg-amber-500 text-white font-sans font-semibold text-xs px-4 py-2.5 rounded-lg transition-all shadow-lg shadow-amber-950/40 cursor-pointer`).
  - **Lanjut Jalur Asal (Override)**: Secondary override action (`bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-sans font-medium text-xs px-4 py-2.5 rounded-lg transition-all cursor-pointer`).
  - **Batal / Tutup**: Subtle ghost action (`bg-transparent hover:bg-white/5 text-slate-400 hover:text-slate-200 text-xs px-3 py-2 rounded-lg transition-all cursor-pointer`).
- **Checklist & Notes Synchronization**:
  - Dynamically highlight the notes textarea when selecting `HOLD` or `OVERRIDE`, with informative placeholder guidance: *"Wajib isi alasan penahanan depo / justifikasi rute asal..."*.
  - Synchronize checklist item 4: `"Catatan operator diisi untuk keputusan HOLD / OVERRIDE"`.

---

## Work Packages

### WP1: Decision Control Unification in `RouteDetailModal.tsx`
- **Target Files**:
  - `frontend/components/sidebar/RouteDetailModal.tsx`
- **Changes**:
  1. Refactor top toggle (`REROUTE` / `HOLD` / `CONTINUE`) into an explicit preview selector labeled *"Pratinjau Dampak Kebijakan"* (Economic & Spoilage Trade-off Preview) that updates the cost breakdown preview without conflating the final commit action.
  2. Replace the bottom `[ Setujui ] [ Tahan ] [ Tolak ]` button group with 3 distinct action buttons:
     - `[ Setujui Pengalihan (Reroute) ]`
     - `[ Tahan Armada (Hold Fleet) ]` (Disabled until notes are provided)
     - `[ Lanjut Jalur Asal (Override) ]` (Disabled until notes are provided)
     - `[ Batal / Tutup ]`
  3. Update `notesRequired` logic: `notesRequired = targetAction === 'HOLD' || targetAction === 'OVERRIDE' || targetAction === 'REJECT'`.
  4. Align checklist item 4 label and completion state with active notes input.

### WP2: Incident Fallback & Silent Drop Elimination in `DashboardClient.tsx`
- **Target Files**:
  - `frontend/components/dashboard/DashboardClient.tsx`
- **Changes**:
  1. In `handleModalAction`, eliminate `if (!route || !selectedCrisis?.crisis_id) return;`.
  2. Implement robust incident ID resolution:
     ```typescript
     const incidentId =
       selectedCrisis?.crisis_id ||
       route.incident_id ||
       (activeRouteIdx != null ? `INC-CORRIDOR-${activeRouteIdx}` : 'INC-ADHOC-CORRIDOR');
     ```
  3. Ensure that when `selectedCrisis` is null, the approval request still succeeds and dispatches a confirmation toast: *"Keputusan koridor berhasil dicatat (Mode Ad-Hoc / Koridor Mandiri)."*

### WP3: Premature Approval Elimination & Rejection Guard in `DashboardClient.tsx`
- **Target Files**:
  - `frontend/components/dashboard/DashboardClient.tsx`
- **Changes**:
  1. Remove premature `api.approvals.create` call in `handleSelectRoute` (around line 2326). Selecting a route from the map or sidebar must only update visual selection state (`activeRouteIdx` and `routeModalIdx`).
  2. In `handleCommitOperationalRoute`, add strict rejection guard:
     ```typescript
     if (action === 'REJECT') {
       // Close modal, reset temporary detour state, do NOT ping TMS or activate route
       return;
     }
     ```
  3. Ensure rejection displays a clear acknowledgment toast: *"Rekomendasi rute berhasil ditolak. Armada tetap pada jalur operasional awal."*

### WP4: E2E Downstream Pipeline Verification & Telemetry Alignment
- **Target Files**:
  - `frontend/components/dashboard/ReportsSection.tsx`
  - `frontend/components/sidebar/MitigationTab.tsx`
  - `frontend/lib/api.ts`
- **Changes**:
  1. Verify that approvals created for both crisis and ad-hoc routes populate the audit trail table in `ReportsSection.tsx`.
  2. Ensure WhatsApp dispatch links in `MitigationTab.tsx` dynamically reflect the actual tactical decision (`REROUTE` vs `HOLD` vs `CONTINUE`) and operator notes.
  3. Ensure background registration into `ground_truth_outcomes` at $T+12\text{H}$ executes cleanly for both online (Supabase) and offline (SQLite) paths.

### WP5: Automated Verification Gate & Unit Test Suite
- **Target Files**:
  - `frontend/scripts/test_phase107_hitl_approval_unification.ts`
- **Verifications**:
  1. Test 1: Verify `RouteDetailModal` action dispatch contracts (Reroute, Hold, Override).
  2. Test 2: Verify mandatory notes validation enforcement for Hold and Override.
  3. Test 3: Verify rejection closes modal without committing route to active status or triggering TMS pings.
  4. Test 4: Verify ad-hoc routes commit successfully with fallback incident ID when `selectedCrisis` is null.
  5. Test 5: Verify route selection does not trigger premature auto-commit.
  6. Test 6: Verify full TypeScript compilation (`tsc --noEmit`) with 0 errors.
  7. Test 7: Verify all backend pytests pass.

---

## Verification Criteria & Proof of Work

- [ ] All 3 bottom decision buttons in `RouteDetailModal.tsx` execute their designated tactical actions (`REROUTE`, `HOLD`, `OVERRIDE`) without ambiguity.
- [ ] Selecting an ad-hoc or map corridor without an active crisis (`selectedCrisis === null`) successfully commits the approval using the fallback incident ID without silent drop.
- [ ] Rejection action cleanly closes the modal, registers `action: REJECT`, and strictly prevents TMS pinging or active route stylization.
- [ ] Merely clicking a route card or map line does not create a premature approval record in the database.
- [ ] Approved decisions appear immediately in `ReportsSection.tsx` Table 3 (Audit Tindakan Operator) with correct action badges.
- [ ] WhatsApp dispatch links in `MitigationTab.tsx` generate accurate operational orders.
- [ ] 100% automated test pass: `test_phase107_hitl_approval_unification.ts`, 0 TypeScript errors, and 5/5 backend pytests.
