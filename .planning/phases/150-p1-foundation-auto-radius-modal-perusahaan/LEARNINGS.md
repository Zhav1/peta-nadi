# LEARNINGS — Phase 150: P1 Foundation

**Window:** 2026-10-26/27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Auto radius live + manual simulator** — crisis `radius_km` wins when
   present; operator `selectedRadius` stays the manual fallback; `8` is the
   last-resort default (`DashboardClient.tsx:3562`).
2. **Roster single-source** — deleting the bottom-left floating
   `TenantFleetRoster` mount ended the double-panel layout; header trigger
   `#fleet-roster-toggle` is the only writer (`2de5ff8`).
3. **Speed 1x lock** — playback-speed control removed; fixed 1x kept via
   prop plumbing only (`CrisisSimulatorBar.tsx:75-77`).

## 2. Concerns (open, evidenced)

1. Radius `8` default is a magic number shared by two files; a named
   constant would prevent drift.
2. `TenantFleetRoster` empty state depends on the dispatcher `company_id`
   claim; claim-less sessions render honest-empty (see Phase 159).

## 3. Constraints (observed this window)

- Dashboard minimalist: no second floating panel for the same data.
- Main + neutral semantics kept: no hype styling on roster/modal chrome.
- Subagents-only to protect main context; High tier only.

## 4. Conditions (user-stated this window)

- Dashboard minimalist; speed fixed 1x (no control rendered).
- Auto radius live, manual simulator retained as fallback.
- Vercel Root Directory = `frontend`; env vars via Vercel dashboard.

## 5. Issues found (do not repeat)

1. Two mounts for one roster = layout overlap; one writer per surface.
2. Never re-add a playback-speed control without a product decision.
