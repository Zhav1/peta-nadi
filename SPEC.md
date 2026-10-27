# SPEC — M8: Operational Truth & Distilled Command Surface

**Status:** APPROVED 2026-10-27
**Active milestone:** M8 (follows M7, completed at phase 159)
**Execution mode:** `/goal` outer loop + `/boost` delegation (`explore` for investigation, `general` for coding, one unit per subagent)

---

## Goal

Make the dashboard stop lying, then make it look like it costs money.

Two outcomes, in this order:

1. **Truth.** Every hazard counter and layer reports a true, provable state across all of Sumatra — no toggle-gated zeros, no silent empties, no stubbed confidence scores.
2. **Surface.** The entire dashboard surface (HUD, counters, tooltips, buttons, modals) is rebuilt in one distilled visual language matching Laporan/Analitik, with gods-eye-view's colour distribution, purposeful motion, and Watermelon blocks where they earn their place.

## Non-goals

- Densifying the road graph into a full OSM network. The CPU solver stays a 56-node arterial skeleton; road fidelity comes from Mapbox.
- Offline desa-level gazetteer (~25k records rejected: collision noise + unreliable centroids).
- Rewriting Analitik/Laporan — they are the reference, not the target.
- Touching the agents/LangGraph swarm, evaluation pipeline, or Supabase schema unless a fix strictly requires it.
- Deleting or weakening any existing spec to make a phase pass.

## Decisions locked

| # | Decision |
|---|---|
| 1 | **Order:** truth first, reconstruct second. Tooltip restyle collapses into the rebuild. |
| 2 | **Waspada Dini** = world truth, independent of layer toggles; medium+ across full Sumatra; the 24-feature cap is removed from the count path; tooltip carries window + source + last-updated. |
| 3 | **Titik Panas** = keyless NASA FIRMS public CSV (Indonesia 24h/48h/7d, bbox-filtered server-side) as the default path, MAP_KEY API when present; tri-state count. |
| 4 | **Retention** = stale-while-revalidate with a visible freshness badge. Weather 10-min poll / 6h validity / 24h stale ceiling. FIRMS 1h poll / 48h window / 6h stale ceiling. Full bbox always; caps move to the render path with "menampilkan N dari M". |
| 5 | **Routing** = hybrid. CPU solver decides (ETA, hazard weighting, offline); Mapbox draws road geometry; provenance badge `jalan · koridor-hub · simulasi-offline`. Fix unbounded snap, same-node collapse, and swallowed `no_route`. |
| 6 | **Search** = kab/kota + kecamatan seeded offline (~2,100 records, aliases, province/parent fields, diacritic + typo tolerant); desa via Nominatim with an honest "butuh koneksi" state. |
| 7 | **Berita confidence** = tier + calibrated consensus; the `0.86/0.94` constant is never displayed as confidence; unverified reads "Belum terverifikasi". |
| 8 | **Berita breadth** = measure per-feed yield first, fix province derivation (kill the silent "Sumatera Utara" default), then enforce read-time quotas (max per source + every province with qualifying 48h articles appears) + province grouping. |
| 9 | **Armada** = full tenant-scoped drawer: roster table + per-vehicle detail, explicit `12 unit · 9 live GPS`. |
| 10 | **Palette** = monochrome chrome, single data accent `#38b8f8`, hazard red/amber only for hazards, emerald only for live; purple/blue/orange/yellow removed from chrome; palette contract extended to dashboard files. |
| 11 | **Motion** = purposeful only: 120–300ms, `cubic-bezier(.4,0,.2,1)`, transform/opacity, reduced-motion honored, one live-hazard pulse, seek-safe. |
| 12 | **Watermelon** = catalog audit, adopt only blocks that replace bespoke code, restyle onto our tokens, record source + license. |
| 13 | **Gate** = 3 tiers (tsc/pytest/build → targeted real-assertion specs → full suite + screenshots + live smoke). |
| 14 | **Frozen** = behaviour, `data-testid`, `#id`, `aria-label`, deep-link params. Spec changes land in the same commit as the rename, never as a deletion. |
| 15 | **Done** = verified **and** deployed, in two independent steps with rollback tags and post-deploy smoke. |

## Phase map

### Wave 1 — Operational Truth (deploy R1 at the end)

| Phase | Scope |
|---|---|
| 160 | Hazard counters: world-truth Waspada/Cuaca, remove toggle gating + count cap, tri-state contract |
| 161 | FIRMS keyless CSV fallback, tri-state, cluster threshold audit |
| 162 | Retention + freshness: stale-while-revalidate, provenance badge, TTL fix, full-Sumatra bbox, render caps |
| 163 | Small-town routing: snap ceiling, same-node rejection, visible `no_route`, engine provenance |
| 164 | Gazetteer: seed kab/kota + kecamatan, alias/province/parent matching, fuzzy + diacritics, desa fallback |
| 165 | Berita: per-feed yield diagnostic, province derivation, diversity quotas, calibrated confidence, grouping |
| 166 | Armada drawer: roster + vehicle detail, live vs estimated counts, tenant scope |

### Wave 2 — Distilled Command Surface (deploy R2 at the end)

| Phase | Scope |
|---|---|
| 167 | Design contract: rewrite DESIGN.md dashboard section, token layer, extend palette spec, freeze banned-hue set |
| 168 | Shell rebuild: telemetry HUD, counters, legend, dock, tabs — Watermelon audit + adoptions + purposeful motion |
| 169 | Overlay rebuild: one tooltip/popover system for cuaca/waspada/FIRMS zones, HITL, route modal, fleet drawer, auth, empty states |
| 170 | Regression: a11y, reduced-motion, perf, screenshot goldens 1920×1080 + 390×844, full suite |

## Interfaces and edge cases

- Counters return `{count, window, status: ok|stale|degraded|empty, reason, source, updatedAt}` — never a bare integer. `0` means verified empty; `—` means unknown with a reason.
- Route result carries `geometry_source` and `route_status`; no silent early return anywhere.
- Handled explicitly: origin and destination snapping to the same node; coordinates beyond the snap ceiling; both endpoints outside the graph; degraded upstream *and* empty stale cache; a province with zero qualifying articles (must say so, not vanish).
- Palette contract becomes a lint-level assertion over dashboard files, mirroring `analitik-palette-3neutral.spec.ts`.

## Verification

Tier 1 (every phase): `npx tsc --noEmit`, `pytest` on touched modules, `next build`.
Tier 2 (UI phases): new real-assertion specs written for that phase's acceptance criteria plus existing specs in the affected area.
Tier 3 (milestone end): full Playwright suite, dashboard screenshots at 1920×1080 and 390×844, live smoke against a running backend, post-deploy smoke after each rollout.

## Deferred deliberately

Full OSM graph ingestion; desa-level offline data; any redesign of Analitik/Laporan; Watermelon blocks that duplicate a working base-ui primitive.
