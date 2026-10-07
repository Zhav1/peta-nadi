# Phase 44: Extracted Learnings, Environment Conditions & Anti-Regressive Patterns

**Phase:** 44 — Intermodal Terminal Dashboard, Spoilage Hedging & Compliance Inspector  
**Document Type:** Post-Implementation Audit & Learning Extraction  
**Date:** 2026-10-03  

---

## 1. Operating Environment & Conditions

When executing tasks in this codebase, strict adherence to the underlying host and tooling environment is mandatory:

| Environment Factor | Specification & Concrete Requirement | Rationale / Failure Mode if Ignored |
|---|---|---|
| **Operating System** | Windows 11 (PowerShell) | Shell commands must use PowerShell syntax. POSIX tools (`ls`, `grep`, `cat`) fail unless available via Windows binary or PowerShell cmdlets. |
| **CLI Token Optimizer** | `rtk` (Rust Token Killer) | All standard shell commands (`git`, `npm`, `cargo`, `pytest`) must be prefixed with `rtk` (e.g. `rtk git status`, `rtk npm run build`). If PATH is not resolved in a subshell, refresh `$env:PATH` from Registry. |
| **Python Virtual Environment** | `backend\.venv\Scripts\python.exe` | Do not use global `python` or non-virtualized runtimes. Pytest must be invoked as `backend\.venv\Scripts\python -m pytest backend/tests`. |
| **Auth & RBAC Topology** | Supabase Auth with Local SQLite Fallback | Roles are strictly `DISPATCHER`, `REGULATOR`, and `GUEST`. Evaluator sandbox runs under `GUEST` persona with full offline capability. |
| **Frontend Runtime** | Next.js 14.2 (App Router) + Tailwind CSS | Must build 100% cleanly without TypeScript errors (`npm --prefix frontend run build`). |

---

## 2. Strict Project Constraints & Invariants

1. **Non-AI Anti-Patterns (Zero Exceptions):**
   - ❌ **Zero Emojis:** Strictly prohibited in UI, components, code comments, and documentation. All icons must be monochrome SVG components from `lucide-react`.
   - ❌ **No Generic AI Gradients:** Banned purple/pink generic gradients. Use dark glassmorphism and muted semantic colors (cyan `#00F0FF`, emerald `#10B981`, amber `#F59E0B`, rose `#F43F5E`).
   - ✅ **Glassmorphism Standard:** Consistently use `backdrop-blur-md bg-[#0c0e12]/80 border border-white/10 rounded-xl`.
   - ✅ **Interaction Affordance:** Explicit `cursor-pointer` on every clickable or interactive button, tab, and card.
2. **Empirical Grounding (Zero Marketing Boasting):**
   - No unverified claims of "GPU acceleration" or "quantum routing" when running standard CPU heuristics or NetworkX Dijkstra.
   - Solver execution must remain sub-millisecond, closed-form, and mathematically documented.
3. **Traceability of Approvals:**
   - Every operator decision logged via `/api/v1/approvals` must capture the actual operator persona from `useAuth()`. Hardcoding static strings like `'OP-CHIEF-01'` violates the RBAC audit trail.

---

## 3. Issues Found During Context Window & Root Causes

### Issue 1: False-Positive BKHIT Quarantine Hard Block
- **Symptom:** A shipment between Bakauheni (Lampung, Sumatra) and Palembang (South Sumatra) was rejected with `HARD_BLOCK` ("BKHIT Quarantine Certificate Missing").
- **Root Cause:** In `backend/app/services/compliance_service.py`, `ferry_cues = ["bakauheni", "merak", "selat sunda", ...]` matched `"bakauheni"` alone in `origin` or `destination`. Because Bakauheni is located on mainland Sumatra, an intra-Sumatra shipment touching Bakauheni was incorrectly categorized as an inter-island transit.
- **Fix Implemented:** Refactored `_is_inter_island()`:
  - Ferry cues on `traversed_roads` now require explicit maritime terms: `"selat sunda"`, `"pelabuhan feri"`, `"penyeberangan"`, `"kapal roro"`, `"ferry"`, `"feri"`.
  - Endpoint comparison checks whether one endpoint is in Java and the other in Sumatra, or involves detached islands (Batam, Bangka, Belitung, etc.).
  - Bakauheni only triggers an inter-island crossing when paired with Merak or explicit ferry transit.

### Issue 2: Variable Name Mismatch for Affected Commodity
- **Symptom:** `SpoilageHedgingCard` always defaulted to `'Cabai Merah Keriting'`, even when the active crisis incident was about rice or meat.
- **Root Cause:** In `frontend/components/sidebar/MitigationTab.tsx`, the code read `(crisis as any).commodities_affected[0]`. In `CrisisState` (`frontend/lib/types.ts`), the economic agent outputs `crisis.inflation_forecast?.commodity`. The field `commodities_affected` did not exist on `CrisisState`.
- **Fix Implemented:** Replaced with prioritized resolution:
  `crisis.inflation_forecast?.commodity || (crisis as any).commodities_affected?.[0] || 'Cabai Merah Keriting'`.

### Issue 3: Route Origin and Destination Extraction Failure
- **Symptom:** Origin displayed as `"Rute Utama (Jalan Tol / Jalinsum)"` and destination as `undefined`.
- **Root Cause:** `route_name?.split('→')` assumed the arrow character `'→'` was present. In `aiDynamicRouter.ts`, route names are formatted as `"Rute Utama (Jalan Tol / Jalinsum)"` or use standard ASCII `->`.
- **Fix Implemented:** Extracted endpoints using structured legs (`route.legs[0].from_name` / `route.legs[last].to_name`) or regex split `/→|->|\bto\b/i`, falling back to `crisis.region` and canonical defaults.

### Issue 4: Bypassed MST Axle-Load Regulation Checks
- **Symptom:** Selecting an alternative detour route traversing steep mountain corridors (e.g. Malalak or Sitinjau Lauik) never triggered the MST Axle-Load warning (>8 Ton).
- **Root Cause:** `ComplianceInspectorCard` was passed hardcoded `traversedRoads=['Jalan Tol Medan - Tebing Tinggi', 'Lintas Timur Sumatera']`.
- **Fix Implemented:** Dynamically compiled `traversedRoads` from the selected `activeRoute.description` and `activeRoute.route_name`. When Malalak or Class III keywords are present and vehicle weight > 8.0T, the warning correctly triggers.

### Issue 5: Missing React Hook Dependency in Inspector Card
- **Symptom:** When switching between route detours on the map, the compliance card did not re-run verification.
- **Root Cause:** In `ComplianceInspectorCard.tsx`, the `useEffect` dependency array omitted `traversedRoads` and `commodity`.
- **Fix Implemented:** Serialized `traversedRoads` with `JSON.stringify` to create `traversedRoadsKey`, and added both `traversedRoadsKey` and `commodity` to the dependency array.

### Issue 6: TMS Telemetry Webhook Port Mismatch
- **Symptom:** Copying the webhook URL from the modal produced `http://localhost:3000/api/v1/fleet/telemetry/ingest`, resulting in a 404 when tested with external curl or GPS pings.
- **Root Cause:** The component generated the URL using `window.location.origin`, which points to Next.js on port 3000 rather than FastAPI on port 8000.
- **Fix Implemented:** Pointed URL generation to `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'`.

---

## 4. Architectural Concerns & Trade-Offs

1. **Deterministic Logic vs. LLM Hallucinations:**
   - Regulatory compliance (BKHIT & MST) must never be delegated to an LLM prompt. Deterministic rule evaluation in Python services guarantees consistent legal compliance.
2. **Reactivity & Serialization in React Hooks:**
   - Passing arrays (like `traversedRoads`) into `useEffect` causes infinite re-render loops if the array reference changes on every render. Serializing the array (`JSON.stringify`) or memoizing with `useMemo` avoids this pitfall.
3. **Multi-Tenant / Personas in Approvals:**
   - Storing decisions with the active user persona enables real-time auditing between `DISPATCHER` (who holds write permission) and `REGULATOR` (who holds read-only audit permission).

---

## 5. Defensive Checklist for Future Context Windows

- [ ] **Always run `rtk git pull --rebase` before committing** to reconcile remote pushes from collaborators.
- [ ] **Validate Pydantic schema field names against TypeScript interfaces** in `frontend/lib/types.ts` whenever introducing new API contracts.
- [ ] **Never hardcode dummy values for props** in parent components when the data is readily available in active state or context hooks.
- [ ] **Verify zero emojis** via `python scripts/verify_codebase_consistency.py` before finalizing any task.
- [ ] **Ensure both backend tests (`pytest`) and frontend production build (`npm run build`) pass cleanly** before concluding a phase.
