# LEARNINGS — Phase 114: Watermelon Polish P3

## Issues found

1. **Concurrent same-file edits overwrite:** P1 (chrome) and P3 (polish) edits to `AnalyticsSection.tsx` collided; the second writer's file state silently dropped the first's region. Healed via `corridorFilter` rename + re-apply. Rule: serialize edits per file; subagents must re-read before writing.
2. **Reduced-motion is a contract, not a nicety:** every `animate-*` needs a `motion-safe:` prefix with a static final state — audit by grepping bare `animate-`/`transition-` in the file.
3. **Skeleton/real geometry lockstep:** `LoadingSkeleton` `h-11` must track real row height forever (shared with Phase 113).

## What not to repeat

- Do not run two writers on one file in parallel — the P1/P3 collision is the reference incident.
- Do not add animation deps — utility-class polish covered all P3 needs (L187 rule).
- Do not verify motion on a stale server — kill `:3000`, use `next dev` only.

## Environment pitfalls

- `:3000` standalone vs `next dev` divergence: animations/timing differ between trees; single-server verification is mandatory.
- Base-UI version pin (1.9.0): `hideWhenDetached` absent — popover dismissal behavior must be verified manually (see Phase 115).
