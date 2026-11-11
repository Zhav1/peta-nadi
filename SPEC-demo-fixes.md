# SPEC — Demo-Day Fixes (post-push regressions)

**Status:** APPROVED 2026-11-11 (grill-me interview, user-confirmed)
**Context:** Agile MVP fix pass before tomorrow's presentation. No over-verification.
**Orchestration:** Mistral Large = orchestrator/planner; GLM 5.3-Flash subagents for research/implementation units (no default subagent). Backend on VPS `akin@177.202.246.251` (SSH permitted); pipeline spans Redis, Vercel frontend, VPS backend, Supabase.

---

## Goal
Fix post-push regressions so the demo shows one coherent early-warning DSS:
**one hazard visual (real-radius zone), one detail surface (right sidebar), one truth engine (consensus gate)**.
Dispatcher value: faster decisions on disasters/congestion/floods with multi-source corroboration.

## Non-goals (deferred post-demo)
- Full Playwright golden suite, soak tests, full OSM graph, desa-level gazetteer, Analitik/Laporan redesign.
- Fixture/fake fleet — explicitly rejected. Live saved data only, painted as realistically as possible.
- GloFAS/GDACS as displayed labels (backend inputs only, never shown).

## Decisions locked
| # | Decision |
|---|---|
| 1 | **Unified map hazard model**: real-radius zone (actual km polygon, same geometry path as Simulasi Bencana) + small center dot. Click anywhere on zone → CrisisSidebar (right panel). No floating modal over the map. |
| 2 | **Zone naming**: short Indonesian title `"{Jenis bahaya} · {Lokasi}"` (e.g. "Banjir · Medan", "Gempa M4.9 · Padang Panjang") + severity badge (Kritis/Tinggi/Waspada) + separate line "Radius terdampak aktual: X km". Simulasi zones prefixed "Simulasi:". No machine text like "simulated flood disruption critical 8km radius". |
| 3 | **Mitigasi & Rute / Dampak Ekonomi tabs** appear only when a real rit/trip is impacted (HITL context). Zone click with no trip → Evidence tab only. (Today: `CrisisSidebar.tsx:76` shows them whenever any route exists.) |
| 4 | **Source badges**: clean short names only — BMKG, **Berita** (ANTARA renamed), TomTom, NASA FIRMS, BNPB. **GloFAS/GDACS removed from display entirely.** Fallback: "Multi-sumber" (kills the `'BMKG CAP / GloFAS / GDACS'` literal at `DashboardClient.tsx:2089`, `CrisisMap.tsx:2666/2713`). Tier reason = one line; full evidence chain stays in Bukti tab. |
| 5 | **Close-area routing** (e.g. Batu Taba → Pariangan 17 km): attempt a real detour around the actual hazard polygon via nearest arterial junction outside it; accept if ≤ ~2× direct distance; else draw primary route with red-dashed crossing segment + one-line note "Melewati zona bahaya — tanpa alternatif wajar (+X menit)". Never hide the route; never draw a straight line through the zone. |
| 6 | **Province-named advisory** (Waspada Hujan Deras Sumut): render whole-province amber "Peringatan" polygon from official boundary fixtures (`advisory_area`, `adm_boundary_service.get_advisory_boundary_for_area`). City names (Medan) in detail text only. Never blocks roads (~1.1× penalty). No boundary data → point at mentioned place + honest note; never invent shapes. |
| 7 | **Berita zones on map**: every geocoded berita with radius draws its zone — red fill for RED_CONFIRMED, amber ring for YELLOW_CLARIFY (early-warning), using real radius_km when present. News-card click focuses the zone and opens the unified sidebar. Aceh-on-top is recency sort (verified `DashboardClient.tsx:1261–1299`) — accepted as correct. |
| 8 | **Fleet paint**: no fixtures. Map paints exactly what the counters count (single data path). Guest = public AIS vessels + ADS-B aircraft; dispatcher = + tenant trucks (JWT company_id scope, no cross-tenant leak). Estimated units (ROUTE_ESTIMATED) = hollow high-contrast rings visible on dark sea tiles; fleet layer above hazard/weather layers. Known suspects: `useFleetVehicles.ts` `FALLBACK_FLEET = []`, public snapshot fleet from `get_unified_fleet` only. |
| 9 | **Armada actions** (HOLD / hold_staging / reroute buttons) only on real trips proven to cross a hazard via check-route endpoint. No trip → informational warning only. Berita cards purely informational, no buttons. |
| 10 | **Single consensus gate**: map zones, routing penalties, berita zone_tier, and trip check-route ALL read only from `hazards_consensus` (Redis `lrip:state:hazards_consensus:v1` TTL 600s → Supabase table, anon-readable; tiers CONFIRMED/WATCH/ADVISORY → Terkonfirmasi/Pantauan/Peringatan). LLM arbitrates conflicts only (short verdict + 1-line ID reason), honest `llm_used` flag, deterministic rule fallback when offline. No source renders its own hazard directly. |

## Open questions / deferred
- Root cause of yellow-zone paint gap (`DashboardClient.tsx:1662/1674` filters) and fleet count-vs-paint drift — diagnose live on VPS/Redis during implementation.
- AIS/ADS-B rate limits — keep multi-feed aggregator + stale-cache fallback (`is_stale`).

## Interfaces + edge cases
- Zone click on map ↔ sidebar ↔ news card all funnel through one `onZoneClick` → CrisisSidebar path.
- Detour edge cases: origin/destination inside zone; no junction outside polygon; detour > 2× → crossing warning; `no_route` visible, never silent.
- Advisory without official boundary → point + honest note.
- Consensus empty: `0` = verified empty, `—` = unknown with reason; never bare zeros (M9 contract).
- Tenant scoping: dispatcher fleet strictly JWT `company_id`.

## Verification hooks (locked — agile)
1. Tier-1: `npx tsc --noEmit`, targeted `pytest` on touched backend modules, `next build`.
2. Deploy: backend → VPS, frontend → Vercel.
3. Live smoke: consensus endpoint returns tiers; unified zone renders from click; hazard-crossing route shows detour-or-warning; fleet paints counted units; sidebar opens from zone click.

Spec status: READY
