# Phase 47: Context, Constraints & Environment Baseline

## 1. Background & Operational Reality
Following the successful completion of Phase 46 (which purged generic backdrop-blur layers, glow drop-shadows, and microtext under 12px), an in-depth audit via the Impeccable design suite (`audit`, `document`, `distill`, `clarify`, `quieter`, `typeset`, and `layout`) revealed persistent "AI slop" and informational weaknesses in both copy and layout:
1. **Ungrounded Claims & Unscientific Boasting:**
   - Several UI sections contained inflated, unscientific phrasing and unsupported metrics (e.g. unbacked accuracy claims, pseudo-military buzzwords, or references to generic "AI Swarm" without empirical institutional attribution).
   - Domain credibility requires strict grounding to verified institutional authorities: BMKG (weather & seismic), LKBN ANTARA (regional news verification), TomTom Traffic Index (road congestion & delay), PIHPS Bank Indonesia (daily commodity price monitoring), AISstream.io (maritime telemetry), and NASA FIRMS (thermal hotspot satellite data).
2. **Design Detector Anti-Pattern Violations (14 AST/Regex Findings):**
   - Running `npx impeccable detect frontend/components/` surfaced 14 violations of the Master Design System:
     - `[gray-on-color]`: Using gray text classes (`text-slate-*`) on colored button or badge backgrounds (`bg-emerald-500`, `bg-amber-400`, `bg-cyan-500`), creating muddy contrast and low legibility.
     - `[border-accent-on-rounded]`: Placing active border bottom accents (`border-b-2`) on tabs with top corner radii (`rounded-t-md`), resulting in awkward visual border clipping.
3. **Typography & Tabular Numerals (`tabular-nums`):**
   - Key operational ledgers, benchmark tables, and KPI metrics lacked font tabular numeral styling, causing jitter during dynamic live telemetry updates and uneven vertical visual rhythm.
4. **Viewport & Responsive Layout Deficiencies:**
   - Hardcoded offsets on the bottombar simulation tools (`left-[calc(50%+160px)]`) caused buttons and filter bars to overflow the right edge of mobile screens (< 1024px).
   - Fixed widths on the docked crisis drawer (`w-[400px]` with `right-6`) caused horizontal clipping and overflow on mobile devices (360px - 414px width).
   - Parent `<main>` container had `overflow-hidden`, and child section containers (`analytics`, `simulation`, `reports`) lacked `overflow-y-auto`, causing stacked 12-column grids on mobile and tablet screens to be permanently cut off without scrollability.

Phase 47 executes the full distillation, empirical grounding, typographic refinement, and responsive layout hardening across the entire 25-component frontend suite.

---

## 2. Environment & System Conditions

### Host & Tooling Infrastructure
- **Operating System:** Windows 11 Home / PowerShell terminal environment.
- **Token Optimization Proxy:** `rtk` (Rust Token Killer) wrapping all shell and development commands (`rtk git status`, `rtk npx tsc --noEmit`, `rtk npx impeccable detect`).
- **Path Resolution:** Windows PowerShell registry PATH reload ensures `rtk` binary resolution across subshells:
  ```powershell
  $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk <command>
  ```
- **Web Platform:** Next.js 14.2.35 (App Router), React 18, Tailwind CSS 3.4.1.
- **Spatial GIS Stack:** Mapbox GL JS v3.25.0, Deck.gl v9.3.6, `@deck.gl/mapbox`, `@deck.gl/layers`.
- **Runtime Servers:**
  - Frontend: Next.js dev server on port 3100.
  - Backend API: FastAPI / Uvicorn running on port 8000.
  - Database: SQLite with WAL mode (`prehub_local.db`).

---

## 3. Strict Project Constraints & Rules

1. **Empirical Fact-Grounding & Slop Eradication:**
   - Eliminate all ungrounded boasting claims, vague "AI magic" phrases, and unsubstantiated numbers.
   - Every metric displayed must correspond to an actual model output, official dataset, or empirical test ledger (e.g. 5-point benchmark ledger: Precision 100%, Recall 94.3%, F1 0.971, Brier Score 0.0782, Latency 0.024ms).
   - All external citations must link to real working URLs or genuine institutional sources (LKBN ANTARA, BMKG, PIHPS).

2. **Zero Detector Anti-Patterns (`npx impeccable detect`):**
   - Zero `[gray-on-color]` findings: Never place `text-slate-*` on colored backgrounds. When colored backgrounds are used, pair them strictly with tone-matched dark foreground text (e.g., `bg-amber-400 text-amber-950 font-bold`, `bg-emerald-400 text-emerald-950 font-bold`) or high-contrast solid monochrome (`bg-white text-[#080d14]`).
   - Zero `[border-accent-on-rounded]` findings: Flat bottom-bordered tabs (`border-b-2`) must not have conflicting corner radius (`rounded-t-md`).

3. **Typographic Discipline:**
   - Enforce `tabular-nums` on all numbers, coordinates, timers, prices, and percentages.
   - Strictly adhere to the 12px floor (`text-xs`).
   - Body paragraphs constrained to standard measure (45ch to 75ch, `max-w-2xl` to `max-w-3xl`) with comfortable line height (`leading-relaxed`).

4. **Responsive Layout Discipline:**
   - Mobile-first containment: All drawers, modals, and floating bars must fit viewports from 360px up without horizontal scrolling.
   - Dynamic sidebar offsets on floating bars (`CrisisSimulatorBar`, bottombar time filter) must be scoped to `lg:` breakpoints, defaulting to `left-1/2 -translate-x-1/2 max-w-[95vw]` on mobile and tablet.
   - All main section views (`analytics`, `simulation`, `reports`, `evaluation`) must provide `overflow-y-auto` and `min-h-full lg:h-full` to allow natural vertical scrolling when grid columns collapse.

5. **Editorial & Communication Integrity:**
   - Strict ban on em dashes in all documentation, code comments, and user-facing copy.
   - Professional, intellectually honest communication style without cheerleading or hyperbole.
