# SPEC — M9: Operational Truth & Distilled Command Surface

**Status:** APPROVED 2026-10-27
**Active milestone:** M9, phases 167–176
**Supersedes:** nothing. M8 "Fast & Durable" (phases 160–166) remains valid and independent.
**Execution mode:** `/goal` outer loop + `/boost` delegation (`explore` for investigation, `general` for coding, one unit per subagent)

## Milestone reconciliation (read this first)

Two milestones briefly shared the M8 label. Resolution, chosen to avoid destroying approved work:

- **M8 — Fast & Durable** (`.planning/M8-SPEC.md`, phases 160–166: auth durability, thin web + tick, bootstrap snapshot, hot-path/proxy, prod SLO gate, soak) is committed to git and **stays as M8**. It is not abandoned, not renumbered, and not overwritten.
- **M9 — Operational Truth & Distilled Command Surface** is this document. It takes phases **167–176** because 160–166 are already allocated.
- Phase 160's delivered code (`51b3903`) legitimately serves both: it shipped M8's baseline/audit **and** M9's world-truth hazard counters. M9 records that as phase **167 = carry-forward, already landed**.

Consequence: no renumbering of any committed phase, no `M8-SPEC.md` edits, no struck plans. `ROADMAP.md` gains an M9 section when R1 deploys.

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

### Wave 1 — Operational Truth (deploy R1 after 173)

| Phase | Scope |
|---|---|
| 167 | **Carry-forward.** Hazard counters: world-truth Waspada/Cuaca, toggle-independent, uncapped count path, tri-state contract — landed in `51b3903`; M9 verifies and documents it |
| 168 | FIRMS keyless CSV fallback, tri-state, cluster threshold audit |
| 169 | Retention + freshness: stale-while-revalidate, provenance badge, TTL fix, full-Sumatra bbox, render caps |
| 170 | Small-town routing: snap ceiling, same-node rejection, visible `no_route`, engine provenance |
| 171 | Gazetteer: seed kab/kota + kecamatan, alias/province/parent matching, fuzzy + diacritics, desa fallback |
| 172 | Berita: per-feed yield diagnostic, province derivation, diversity quotas, calibrated confidence, grouping |
| 173 | Armada drawer: roster + vehicle detail, live vs estimated counts, tenant scope |

### Wave 2 — Distilled Command Surface (deploy R2 after 176)

| Phase | Scope |
|---|---|
| 174 | Design contract: DESIGN.md dashboard section, token layer, extend palette spec, freeze banned-hue set |
| 175 | Shell rebuild: telemetry HUD, counters, legend, dock, tabs — Watermelon audit + adoptions + purposeful motion |
| 176 | Overlay rebuild + regression: one tooltip/popover system for cuaca/waspada/FIRMS zones, HITL, route modal, fleet drawer, auth, empty states; a11y, reduced-motion, screenshot goldens 1920×1080 + 390×844, full suite |

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
