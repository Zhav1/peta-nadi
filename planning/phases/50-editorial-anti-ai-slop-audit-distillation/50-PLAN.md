# Phase 50: Anti-AI-Slop & Editorial Distillation Audit Plan

## Objective
Execute a comprehensive audit and cleanup to eradicate remaining AI slop, decorative clutter, pseudo-terminal streams, conversational chatbot fluff, and unnecessary wordiness across PreHub (both Landing Page and Dashboard surfaces). Transition the interface from speculative prototype aesthetics to a grounded, defense-grade operational platform.

## Context & User Directives
- **Trigger**: User requested an audit to thoroughly clean up AI slop and unnecessary information following Phase 46. Even though text had been grounded previously, excessive words, decorative telemetry pills, artificial agent matrix grids, and conversational chat widgets still introduced visual clutter.
- **Directives from `/grill-me` Alignment**:
  1. **Surfaces**: Both Landing Page (`/`) and Dashboard (`/dashboard`).
  2. **Landing Page**: Retain hero headline and the 121-frame scroll sequence canvas. Strip the right chapter rail, synthetic telemetry pills, stage counter, and condense feature cards into concise editorial statements.
  3. **Top Nav & Telemetry**: Remove the internal agent swarm health widget (`AgentStatusWidget`), strip wordy 320px popover essays from telemetry badges, and keep direct, compact operational status indicators.
  4. **Guided Demo**: Strip pseudo-terminal logs (`> [00:01.2] Akuisisi Data...`) and synthetic agent grids in stages 1 and 2. Transition copy from "Simulasi Krisis & Jalankan Swarm" to "Mulai Simulasi Disrupsi".
  5. **Reports Section**: Replace the 3-page static textbook document (explaining what BMKG and PreHub are) with an actionable, compact Audit Ledger table and export utility.
  6. **Simulation Section**: Replace the conversational chatbot assistant with an interactive Scenario Workbench with explicit operational parameters and instant calculated impact readouts.
  7. **Crisis Sidebar & Map Controls**: Remove theoretical Human-in-the-Loop governance essay banners, remove cosmetic 8-step decision trace pipeline headers, and replace the AI `Sparkles` icon with operational `Compass`/`Sliders` icons.
  8. **Typography**: Enforce a strict 12px font floor (`text-xs`) across all components, replacing all sub-12px microtext (`text-[8px]`, `text-[9px]`, `text-[10px]`, `text-[11px]`).

## Scope & Target Components
| Component | Scope of Work |
|---|---|
| `ImageSequenceCanvas.tsx` | Strip right chapter rail, telemetry pill row, stage counters; distill narrative card to 1 headline + 1 sentence. |
| `KineticFeatureGrid.tsx` | Remove kickers, engine tags, artificial metric footers; replace `Bot` icon with `ShieldCheck`. |
| `LiveTelemetryShowcase.tsx` | Remove category badges and protocol chips; convert into a 3-column provenance ledger. |
| `TopNavTelemetry.tsx` | Remove `AgentStatusWidget`, strip 320px modal essays, keep direct status badges. |
| `IntermodalTerminalPopover.tsx` | Remove requirement tag `FR-17`. |
| `GuidedDemoPanel.tsx` | Remove pseudo-terminal stream and agent matrix; replace with 4 operational status checks. |
| `ReportsSection.tsx` | Replace 3-page static document with an Audit Ledger table and export controls. |
| `SimulationSection.tsx` | Replace conversational chatbot with Scenario Workbench sliders and calculated impact metrics. |
| `CrisisSidebar.tsx` | Remove governance lecture banner and popover; clean up unused state. |
| `EvidenceTab.tsx` | Remove 8-step decision trace header and provenance info popover; clean up unclosed JSX. |
| `CrisisSimulatorBar.tsx` | Replace `Sparkles` with `Compass`; rename "Best Mode" to "Multi-Moda Terpadu". |
| Microtext Targets (7 files) | Enforce 12px floor (`text-xs`) across `PriceChart`, `AnalyticsSection`, `DashboardClient`, `TestMatrixTable`, `FleetOnboardingModal`, `CausalChainPanel`, `MitigationTab`. |

## Execution Waves
- **Wave 1 (Landing Surface)**: Clean up `ImageSequenceCanvas`, `KineticFeatureGrid`, and `LiveTelemetryShowcase`.
- **Wave 2 (Dashboard Telemetry & Navigation)**: Clean up `TopNavTelemetry`, `IntermodalTerminalPopover`, and `GuidedDemoPanel`.
- **Wave 3 (Dedicated Functional Views)**: Overhaul `ReportsSection` into an Audit Ledger and replace `SimulationSection` with Scenario Workbench.
- **Wave 4 (Crisis Triage & Map Overlays)**: Sanitize `CrisisSidebar`, `EvidenceTab`, and `CrisisSimulatorBar`.
- **Wave 5 (Typography Floor & Build Verification)**: Replace all sub-12px microtext classes, resolve TypeScript errors, run production build (`npm run build`).
