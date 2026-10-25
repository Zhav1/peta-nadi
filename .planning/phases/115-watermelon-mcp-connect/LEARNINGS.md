# LEARNINGS — Phase 115: Watermelon MCP Connect

## Issues found (anticipated from window evidence)

1. **Gap-driven improvisation risk:** the 7 missing primitives (Select/Chip/Card/Empty/Skeleton/Tooltip/Chart) invite bespoke one-offs; the MCP-first rule exists to prevent a second chrome dialect.
2. **Version-pin blindness:** Base-UI 1.9.0 lacks `hideWhenDetached` — any MCP-sourced popover/tooltip must be checked against the pinned version, not latest docs.
3. **Collision recurrence risk:** Analitik work concentrates in `AnalyticsSection.tsx` + `lib/api.ts` — the one-writer-per-file rule (Phase 114) is the load-bearing guard for the connection pass.

## What not to repeat

- Do not `npx shadcn add` (banned) — even when it looks faster than MCP sourcing.
- Do not portal tooltips/popovers over Mapbox to "fix" positioning — reposition in panel DOM instead.
- Do not verify on a stale `:3000` standalone — kill it, use `next dev` only.
- Do not run parallel writers on `AnalyticsSection.tsx` — serialize or split by extracted component first.

## Environment pitfalls

- Stale-server divergence, strict-mode `getByText` collisions on duplicated labels, and Deck v9 prop drift (all Phase 111–114) remain live risks for the connection pass — re-read those LEARNINGS before starting.
