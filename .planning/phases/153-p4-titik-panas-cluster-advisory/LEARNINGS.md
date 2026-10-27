# LEARNINGS — Phase 153: P4 Titik Panas Cluster + Advisory

**Window:** 2026-10-26/27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Cluster-before-highlight** — single-link 5 km clustering over
   high-conf points only; raw single detections never draw zones.
2. **Single color exception** — orange reserved for ≥3-clusters; all other
   chrome keeps main+neutral semantics.
3. **Advisory rename** — `Waspada Dini` separates medium drizzle from
   disruption Cuaca in copy, toggle, and legend.

## 2. Concerns (open, evidenced)

1. 5 km single-link can chain distant points via bridges; acceptable for
   advisory display, never for RED synthesis.
2. FRP/conf click contract (FRP + conf + dist-to-corridor) must survive
   any popup refactor.

## 3. Constraints (observed this window)

- Map-only color exception documented inline (`:948`); do not spread
  orange to other chrome.
- 20 km→bbox lesson applies upstream (Phase 157): clustering is display,
  bbox is the geo gate.

## 4. Conditions (user-stated this window)

- Dashboard minimalist; main+neutral keep semantics.
- Waspada info-only (behavior in Phase 156).

## 5. Issues found (do not repeat)

1. Highlighting raw single detections as zones caused false urgency —
   always cluster first (≥3 high-conf / 5 km).
