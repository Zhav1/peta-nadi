# M9 — Operational Truth & Distilled Command Surface

**Status:** IN PROGRESS — Wave 1 deployed (R1/R1.1), Wave 2 complete pending R2
**Branches:** `m9-operational-truth` (merged to `main`), `m9-distilled-surface` (unmerged)
**Spec:** `SPEC.md` (root) — reconciliation with M8 recorded there
**Started:** 2026-10-27 · **Deployed:** 2026-10-28

---

## Resolution against the user's eight complaints

| # | Complaint | Phase(s) | Status | Production evidence |
|---|---|---|---|---|
| 1 | Waspada Dini & Titik Panas always show 0 | 167, 168, 173.6 | DONE | `waspada 22→28`, `hotspots 0→145` live |
| 2 | Zone tooltips for cuaca/waspada/FIRMS look foreign | 176 | DONE | `.ds-popup` contract, XSS-escaped, 13/13 specs |
| 3 | Layers disappear/appear; want all Sumatra | 169 | DONE | corridor filter removed, 58-point grid, freshness badges |
| 4 | Alternative routes absent for small towns | 170 | DONE | snap ceiling 75 km, no silent `no_route`, provenance |
| 5 | Search misses small cities/towns | 171 | DONE | 2,096-record gazetteer, fuzzy, 10/10 spot-checks |
| 6 | Berita only Tribun Aceh; 86% confidence | 172, 172.5, 176.7 | DONE (breadth 7→10 in flight) | 0 crisis → 39 regional; constant 86% removed |
| 7 | Dispatcher cannot see armada details | 173 | DONE | drawer restored, tenant-scoped, unknown-location honest |
| 8 | Dashboard too colourful, want luxurious/distilled | 174, 175, 176, 176.5 | DONE | monochrome chrome, one accent, palette ratchet |

---

## Phase ledger

| Phase | Commit | Deliverable | Evidence |
|---|---|---|---|
| 167 | `51b3903` | World-truth hazard counters, toggle-independent, uncapped count path, tri-state | 17 pytest, tsc 0, build 0, 4 Playwright |
| 168 | `e8567b1` | Keyless FIRMS CSV fallback (per-country 404 → Global 24h + bbox), tri-state hotspot envelope | 12 pytest, 8 Playwright |
| 169 | `ef0148a` | Whole-Sumatra coverage (corridor filter removed, grid 23→58), stale-while-revalidate, freshness badges | 13 pytest, 11 Playwright, 16,704→8,352 calls/day |
| 170 | `bb9b61b` | Snap ceiling 75 km, same-node collapse, visible `no_route`, route provenance, shared weather snapshot | 25 pytest, 5 Playwright |
| 171 | `2783c10` | 2,096-record Sumatra gazetteer (118 kab + 34 kota + 1,944 kecamatan), fuzzy search | 19 + 43 pytest, 2 Playwright |
| 172 | `83a12fe` | Per-feed yield diagnostic, province derivation fix, source/province quotas, calibrated confidence | 22 + 43 pytest, 10 Playwright |
| 172.5 | `269324c` | Regional news tier: 0 crisis → 39 regional across 9 provinces | 50 pytest, 11 Playwright |
| 173 | `69840d4` | Armada drawer, per-vehicle detail, Medan fallback removed, tenant widening closed | 50 pytest, 6+10 Playwright |
| 173.5 | `40359c2` | Frozen E2E contract drift reconciled (role, offline tag, demo id, guest copy) | 12 phase57, full suite 93 → 0 failures |
| 173.6 | `299b4f9` | FIRMS `day_range=1`→`2` + stateless parse + CSV cross-check | 9 FIRMS pytest, live count 0→140 |
| 174 | `1f5485c` | DESIGN.md "Distilled Command Surface", `--ds-*` tokens, palette ratchet | 6 palette specs, full suite 97 |
| 175 | `cf2a1bb` | Chrome + map paint distilled to one accent; legend collapsed to shape+label | 21 targeted, full suite 101, before/after captures |
| 176 | `57641f2` | Branded zone tooltips, overlay contract, purposeful motion, reduced-motion | 13 targeted, full suite 106, XSS escaping proven |
| 176.5 | `95fc6a1` | Mobile layout, map legibility (land `#0d1219` / water `#070a10`), popup chrome | 19 targeted, full suite 112 |
| 176.6 | *(in flight)* | Pin the three hazard counters on mobile | — |
| 176.7 | `44f0ee4` | 8 verified feeds for Jambi/Babel/Bengkulu; `Kepulauan Bangka Belitung` alias fix; gazetteer `type` normalised | 69 targeted + 127 news/geo pytest |

---

## Deployments

| Rollout | Merge | Tag | Result |
|---|---|---|---|
| R1 | `bfa3337` | `pre-m9-r1` (`b1ebf7b`) | Deployed. Waspada 22, FIRMS empty (bug), summary endpoint live |
| R1.1 | `c250a09` | `pre-m9-r1.1` (`bfa3337`) | Deployed. FIRMS 140→145 hotspots, Waspada 28 |
| R2 | *(pending)* | — | Distilled surface |

Production targets: `https://pre-hub.vercel.app` · `https://peta-nadi.onrender.com`

---

## Verification baseline (must not regress)

- **Backend:** 520 passed / 4 known failures — `test_impact_assessment` (latency), `test_travel_fuel_guard` ×2 (Starlette constant drift), `test_cpu_routing_weather::…seed_fallback` (live TomTom cache).
- **Frontend:** 112 passed / 9 skipped / **0 failed** as of `95fc6a1`.
- **Frozen:** `phase57-pilot-hardening`, `news-live-audit`, `multi-client-routing-isolation`, `laporan-*`, `guest-laporan-hardblock`, `analitik-palette-3neutral` — no spec deleted, no `.skip` added, no timeout widened.

---

## Known open items

1. `/health` reports `environment:"development"` on Render despite `render.yaml` — the service is not synced from the blueprint. Cosmetic today; fix at the Render dashboard or derive from `RENDER=true`.
2. News breadth 7/10 provinces in production; 176.7 adds supply for the missing three.
3. Gazetteer `type` returns `regency` for Natuna/Belitung Timur; 176.7 normalises to `kabupaten`.
4. Watch item: `cuaca.count` was 1 at audit time — a supply problem, not a contract bug.
5. BMKG province-level DigitalForecast is deferred: the documented endpoints 301 away and no public province contract remains.
6. DESA-level offline gazetteer deliberately out of scope (25k records, unreliable centroids).
