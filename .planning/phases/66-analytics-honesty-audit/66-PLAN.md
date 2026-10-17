# Phase 66 Plan: Analytics Honesty Audit (Mock Purge & Honest Empty States)

## 1. Executive Summary & Goals

Following the audit of `frontend/components/dashboard/AnalyticsSection.tsx`:
- The Analytics tab was a hybrid component. It possessed genuine live data: real commodity price series for rice (`beras`) and red chili (`cabai_merah`) queried via `api.commodities.prices()` against Supabase TimescaleDB (`commodity_prices`).
- However, it was compromised by hardcoded static elements:
  1. **24-Hour Commodity Risk Ranking**: 4 hardcoded static cards (`Cabai Merah +18.5%`, `Cabai Rawit +6.2%`, `Beras -1.2%`, `Bawang Putih +24.5%`).
  2. **Deck.gl Arcs & Ports**: 5 hardcoded static arcs connecting Sumatra and Java, and 6 static hub scatter points.
  3. **Causal Dependency Chain**: 4 static predetermined cards (`Curah Hujan Tinggi`, `Jalur Logistik Terputus`, etc.).
  4. **Synthetic Fallback Values**: If Supabase had no rows, it defaulted to `Rp 12.400` for rice, `+14.2%` delta, and synthetic bar heights.

**Goal**: Keep the genuine PIHPS price series while removing all hardcoded risk cards, static causal chains, and synthetic arcs/nodes. Replace synthetic fallback numbers with explicit, honest `"Data tidak tersedia"` empty states in strict accordance with PreHub's ground-truth integrity mandate.

---

## 2. Deliverables & Blast Radius

### Frontend Changes:
1. `frontend/components/dashboard/AnalyticsSection.tsx`:
   - Preserve real dynamic PIHPS API integration (`api.commodities.prices`).
   - Remove hardcoded risk-ranking cards array (`CABAI_MERAH`, `CABAI_RAWIT`, `BERAS`, `BAWANG_PUTIH`). Render an honest empty state (`"Belum ada data risiko komoditas multi-pasar"`) when dynamic feeds are unavailable.
   - Remove static Deck.gl arcs and port scatter points or restrict to active live nodes.
   - Remove hardcoded causal chain dependency cards.
   - Remove synthetic fallback numbers (`Rp 12,400`, `+14.2%`). Display explicit `"Data tidak tersedia"` when database records are missing or unseeded.
   - Update button CTA to navigate to Peta Operasi (`'map'`) under the label `"Simulasi Bencana (Peta)"`.

---

## 3. Verification & Acceptance Criteria
- [x] `rtk npx tsc --noEmit` compiles cleanly with 0 type errors.
- [x] `rtk npm run build` completes production bundle generation (7/7 static pages).
- [x] Analytics tab renders real PIHPS price series when available, and displays `"Data tidak tersedia"` when database query returns empty.
- [x] Zero hardcoded speculative risk percentages (+18.5%, +24.5%) remain in the component.
