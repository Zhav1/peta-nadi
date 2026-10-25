# LEARNINGS — Phase 116: Gap Shims Scaffold

**Date:** 2026-10-25

1. Registry fetch via `webfetch`, NOT via MCP `execute` in explore workers — MCP execute path is unreliable from worker context; direct webfetch to the Watermelon registry is the stable route.
2. Stale `.next` causes ENOENT on rebuild — fix is `Remove-Item .next` + retry, not config churn.
3. Parallel same-file edits collide (P1/P3 lesson) — avoid by file-split: C1/C2/C3 own disjoint file sets, one writer per file.
4. Tooltip render-pattern: trigger renders INSIDE the tooltip wrapper (no `asChild` prop needed); keeps Base-UI 1.9.0 review gate green.
5. `hideWhenDetached` is ABSENT in Base-UI 1.9.0 — never depend on it; use focus/hover CSS dismissal.
6. Recharts 2.15.4 vs 3.9.2: DO NOT downgrade — shims target the installed ^3.9.2 API.
