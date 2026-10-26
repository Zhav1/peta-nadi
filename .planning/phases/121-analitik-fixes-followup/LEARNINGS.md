# LEARNINGS — Phase 121: Analitik Fixes Followup

**Date:** 2026-10-26

## Process learnings (carried + confirmed)

1. **Stale `_next/static` 404s = stale server, not broken build.** Kill PID + fresh standalone server on `:3000` per Phase-118 learning; do not chase the build.
2. **Run `tsc` from `frontend/`.** The root `npx tsc` shim resolves the wrong project and misleads.
3. **Same-file parallel edits overwrite.** Use a single writer per file; split work by file, not by hunk.
4. **Background build/pytest exceed the 120s cap.** Split into foreground runs under the cap instead of one long background job.
5. **Stale gate specs outlive removed UI.** The e2e `m7` gate spec still asserts the deleted map canvas; flag for owner rather than silently editing gates in a docs window.

## Product learnings

6. **Empty-by-construction UI is worse than no UI.** A globe with `layers: []` plus a wrong label actively misinforms — deleting the canvas was the honest fix.
7. **Transparent outline buttons on near-black read as bare text.** On `#0c1017`, hand-rolled glass + shimmer beats the base-ui outline variant without adding deps.
8. **Collapse maps are time-bombs — label their expiry.** The 8→`north_sumatra` map was correct only while the DB held one region; it needed (and got) a Phase 119 1:1 successor.
9. **Index-derived chart labels (`T-`) hide staleness.** Deriving `DD/MM` from row `time` plus a `min(days, rows)` header makes short/weekly-cadence data self-describing.
10. **Scaffold ≠ shipped.** A 103-line tooltip component with zero consumers is inventory, not a feature — native `title` remains the correct call under the no-Portal-over-map rule.
