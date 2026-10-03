# Phase 46: Forensic Learnings, Issues & Architectural Knowledge

This document extracts all architectural discoveries, environment conditions, issues encountered, attempted fixes, and permanent constraints from Phase 46.

---

## 1. Environment & Platform Discoveries

### 1.1. WebGL Compositor Stutter Caused by Glassmorphism
- **The Issue:**
  During Phase 44 and 45 testing, dragging the 3D Mapbox camera or following moving vehicle trajectories experienced intermittent frame drops and stuttering.
- **Root Cause Analysis:**
  CSS `backdrop-blur-*` (`backdrop-filter: blur(...)`) placed on floating UI elements layered over high-frequency WebGL canvases (Mapbox GL v3 and Deck.gl v9 rendering 45 animated vehicle vectors at 60 FPS) forces the browser rendering engine to snapshot the WebGL frame buffer on every render pass, apply a Gaussian blur shader pass, and composite it onto the viewport. Multiplying this across 58 separate floating badges, popovers, and drawers caused severe GPU fill-rate throttling.
- **The Solution:**
  Replace all `backdrop-blur-*` styles with solid opaque elevated panels (`#0c1017` and `#121822`) with hairline borders (`#1c2432`). 
- **Learning:**
  Never use CSS backdrop-blur over high-frequency WebGL or canvas visualizers. Solid tonal elevation provides superior contrast, cleaner aesthetics, and zero composite overhead.

### 1.2. Windows PowerShell and `rtk` Subshell Resolution
- **The Issue:**
  Running standard Linux shell commands (like `ls` or `rg`) directly in PowerShell sessions via `run_command` failed because native aliases are either absent or incompatible.
- **The Solution:**
  Rely on PowerShell native cmdlets (`Get-ChildItem`, `Select-String`) or invoke tools via `rtk proxy powershell -Command "..."` or standard Git CLI commands (`rtk git grep -n "..."`).
  Always ensure the environment PATH is refreshed when invoking subshells:
  ```powershell
  $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk <command>
  ```

---

## 2. UI/UX Anti-Patterns & Slop Traps to Avoid

### 2.1. The "Microtext Density" Trap
- **The Pitfall:**
  Coding assistants frequently shrink font sizes to `text-[8px]`, `text-[9px]`, or `text-[10px]` under the mistaken belief that smaller text makes an interface look more "technical" or "cyberpunk".
- **The Reality:**
  In mission-critical command centers (e.g. Bloomberg terminals, flight dispatch, defense logistics), microtext causes severe eye strain and accessibility failures.
- **Permanent Rule:**
  Enforce a strict 12px floor (`text-xs`) across all functional labels, metadata, and status badges. High data density is achieved through clean tabular layouts, tight padding, and subtraction of decorative borders, not by shrinking typography into illegibility.

### 2.2. Cardification & Nested Container Fatigue
- **The Pitfall:**
  Wrapping every piece of text or data in its own rounded container (`rounded-2xl border border-white/10 p-4`) creates visual clutter and disjointed layouts.
- **The Solution:**
  Use flat surfaces with hairline borders (`#1c2432`), table rows with subtle dividers, and generous whitespace. Group related data logically rather than boxing each item individually.
- **Discovery in Landing Page:**
  Found two redundant components rendering identical map containers and metric pills: `LiveTelemetryShowcase.tsx` and `InteractiveDemoShowcase.tsx`. Deleting `InteractiveDemoShowcase.tsx` eliminated 216 lines of code with zero loss of user experience.

### 2.3. Pseudo-Military & Sci-Fi Cosplay
- **The Pitfall:**
  Using labels like `LOCKED: TARGET`, `[LIVE PING]`, `GOD'S EYE HUD`, `AI STEPPER`, and glowing cyan crosshairs creates a toy-like or game-like impression that destroys professional credibility with government and enterprise stakeholders.
- **The Solution:**
  Adopt professional domain terminology:
  - `LOCKED: CALLSIGN` -> `ARMADA: CALLSIGN`
  - `[LIVE PING]` -> Steady semantic status dot or tabular timestamp
  - `GOD'S EYE HUD` -> `Konsol Telemetri Operasional`
  - `Rocket animate-bounce` -> Clean SVG icon with architectural primary button

### 2.4. Generic AI Gradients & Box Glows
- **The Pitfall:**
  Buttons styled with `bg-gradient-to-r from-cyan-500 to-emerald-500 shadow-cyan-500/20` or purple glowing borders scream "AI-generated SaaS template".
- **The Solution:**
  Adopt architectural primary buttons:
  `bg-white text-[#080d14] hover:bg-slate-200 font-semibold text-xs rounded-md shadow-sm transition-colors cursor-pointer`
  Pair with dark elevated secondary controls (`bg-[#121822] text-slate-200 border-[#1c2432]`).

---

## 3. Typographic Hierarchy Contract

| Data Role | Family | Size | Weight | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Quantitative Data | Monospace | `text-xs` (12px) | Bold / Medium | Normal | Coordinates, timestamps, prices, latencies, Brier scores |
| Functional Labels | Sans-serif | `text-xs` (12px) | Semibold | Wider | Button labels, table headers, status badges |
| Section Headings | Sans-serif | `text-sm` to `text-base` | Bold | Normal | Panel titles, modal headers |
| Page / Hero Titles | Sans-serif | `text-xl` to `text-4xl` | Bold | Tight | Landing page hero, primary dashboard view titles |
| Body / Prose | Sans-serif | `text-xs` to `text-sm` | Normal | Normal | Incident descriptions, news summaries, recommendations |

---

## 4. Checklist for Future Phases (What NOT to Do)

1. Do NOT add `backdrop-blur-*` or `bg-slate-950/80` glass layers.
2. Do NOT add custom glow box-shadows (`shadow-[0_0_...]`) or neon drop-shadows.
3. Do NOT use font sizes below `text-xs` (12px).
4. Do NOT use `animate-ping` or `animate-bounce` on UI elements.
5. Do NOT use multi-color gradient buttons.
6. Do NOT use em dashes in documentation, commit messages, or user communications.
7. Do NOT wrap single data points in nested cards.
8. Always verify TypeScript compilation with `rtk npx tsc --noEmit` before concluding any UI phase.
