# Phase 46: Context, Constraints & Environment Baseline

## 1. Background & Operational Reality
PreHub achieved full feature-readiness and technical depth across Phases 1 through 45 (133 passing automated tests, live telemetry ingestion, multi-modal pathfinding, spoilage hedging, quarantine compliance, and Docker packaging). 

However, rapid iterative development using AI-assisted coding introduced second-order "AI slop" across the UI:
- Visual overload: 58 instances of `backdrop-blur-*`, 36 glowing box-shadows, 24 ambient halos, and neon gradient buttons.
- Component slop: Nested glass cards, duplicate showcase sections, floating kicker badges, fake HUD crosshairs, and repetitive status pills.
- Information slop: Sub-12px microtext (`text-[8px]`, `text-[9px]`, `text-[10px]`) causing accessibility failures and artificial density.
- Performance penalty: Browser GPU compositing bottlenecks caused by stacking glassmorphism (`backdrop-blur-md`, `backdrop-blur-xl`) over WebGL canvases running Mapbox GL v3 and Deck.gl v9 at 60 FPS.

Phase 46 executes the complete architectural and aesthetic distillation to "The Strategic Sentinel": an intentional, restrained, editorial, and content-first design system.

---

## 2. Environment & System Conditions

### Host & Tooling Infrastructure
- **Operating System:** Windows 11 Home / PowerShell terminal environment.
- **Token Optimization Proxy:** `rtk` (Rust Token Killer) wrapping standard CLI commands (`rtk git`, `rtk npx`, `rtk curl`, `rtk node`).
- **Web Platform:** Next.js 14.2.35 (App Router), React 18, Tailwind CSS 3.4.1.
- **Spatial GIS Stack:** Mapbox GL JS v3.25.0, Deck.gl v9.3.6, `@turf/along`, `@turf/bearing`.
- **Runtime Servers:**
  - Frontend development server: Next.js dev server on port 3100.
  - Backend API: FastAPI / Uvicorn running on port 8000.
  - Local persistence: SQLite with WAL mode (`prehub_local.db`).

---

## 3. Strict Project Constraints & Rules

1. **Typographic Discipline:**
   - Strict 12px floor (`text-xs`) on functional and label type.
   - Sub-12px microtext is strictly prohibited.
   - Monospace font (`font-mono tabular-nums`) is strictly restricted to quantitative data: coordinates, timestamps, monetary figures, latencies, and calibration scores.
   - UI labels, navigation, and editorial prose must use clean sans-serif type in sentence case.

2. **Surface & Depth Hierarchy:**
   - Zero `backdrop-blur-*` layers across all components.
   - Solid elevated surfaces:
     - Base canvas: `#080d14`
     - Elevated panels, drawers, navigation bars: `#0c1017` with hairline border `#1c2432`
     - Nested data tiles, cards, and input controls: `#121822` with hairline border `#1c2432`
   - Hairline borders: 1px `#1c2432` or `border-white/10`. Zero glowing halos or neon drop-shadows.

3. **Color Discipline:**
   - Strict elimination of AI generic multi-color gradients (purple/pink, cyan/emerald gradient buttons).
   - Primary action controls: Architectural white (`bg-white text-[#080d14] hover:bg-slate-200 shadow-sm`).
   - Secondary controls: Muted elevated slate (`bg-[#121822] text-slate-200 border-[#1c2432]`).
   - Semantic accents: Emerald (verified/safe), Amber (advisory/warning), Rose (critical/disrupted).

4. **Preservation of Core Functionality:**
   - Zero regression on Deck.gl WebGL rendering, vehicle path interpolation, and Mapbox camera animations.
   - Preservation of all WebSocket state subscriptions, incident selection hooks, and simulation triggers.
   - Zero TypeScript compilation errors (`tsc --noEmit`).

5. **Editorial Integrity:**
   - Never use em dashes anywhere in prose, code comments, or user communication.
