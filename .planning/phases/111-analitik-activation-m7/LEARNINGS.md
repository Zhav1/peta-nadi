# LEARNINGS — Phase 111: Analitik Activation M7

## Issues found

1. **Deck.gl v9 prop drift:** `getAlignmentBaseline` signature changed under Deck v9 — pin the v9 form and grep for removed accessor props after every Deck upgrade.
2. **`downlevelIteration` + `Map.forEach`:** iterating a `Map` under the repo tsconfig tripped iteration errors; prefer `Array.from(map)` or explicit `forEach` on the Map instance, not spread-iteration.
3. **Strict-mode `getByText` collisions:** duplicate filter bars (price vs ops) produced ambiguous text matches; scoping queries per-bar caught the duplication before users did.
4. **Duplicate filter bars (`priceRegion` vs `corridorFilter`):** parallel same-file edits created two bars driving overlapping scopes; healed by scoping `priceRegion` → prices/spikes and `corridorFilter` → rank rows with the Koridor label.

## What not to repeat

- Do not synthesize zones or series to fill empty widgets — `< 3` records renders `AnalyticsEmpty`, full stop.
- Do not add backend routes when existing GETs suffice (`prices`/`spikes` covered all 6 widgets).
- Do not introduce Cesium for a chips+Deck surface need — Globot Deck + gods-eye chips met the requirement.

## Environment pitfalls

- Stale `:3000` standalone server vs `next dev` serve different trees — kill `:3000` first, verify via the running dev port only.
- Concurrent same-file edits (P1/P3 collision healed via `corridorFilter` rename) — serialize edits per file or rename-then-merge; see Phase 114 learnings.
