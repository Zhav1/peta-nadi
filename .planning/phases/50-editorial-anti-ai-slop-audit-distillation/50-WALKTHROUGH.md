# Phase 50: Anti-AI-Slop & Editorial Distillation Walkthrough

## Overview
Phase 50 conducted an exhaustive anti-slop refactor across the entire PreHub user interface. The primary objective was shifting the application from speculative demo aesthetic (characterized by fake agent logs, conversational chatbots, decorative pills, and wordy popovers) into a crisp, high-density operational workbench.

---

## Component Changes & Transformations

### 1. Landing Page Canvas & Sequence ([`ImageSequenceCanvas.tsx`](file:///d:/College/Pidi.id/frontend/components/onboard/ImageSequenceCanvas.tsx))
- **Removed**:
  - Vertical right rail navigation (`01 DETEKSI GENANGAN...`) which duplicated stage information and cluttered the right third of the viewport.
  - Floating synthetic telemetry pills (`Genangan Air`, `12 km/jam`, `Perlambatan Parah`, etc.).
  - Artificial stage counter (`Tahap X dari Y`).
- **Added / Retained**:
  - Distilled bottom overlay card to 1 clear headline and 1 concise sentence describing the current disruption frame.
  - Retained the high-performance 121-frame WebGL/Canvas scrub loop.

### 2. Feature Grid ([`KineticFeatureGrid.tsx`](file:///d:/College/Pidi.id/frontend/components/onboard/KineticFeatureGrid.tsx))
- **Removed**:
  - Uppercase kicker tags (`PEMANTAUAN KORIDOR`, `OPTIMASI MULTI-MODA`, etc.).
  - Speculative engine metadata tags (`Visualisasi Spasial`, `Solusi Graf`).
  - Decorative metric footers that mimicked artificial telemetry.
  - Generic `Bot` icon.
- **Added / Retained**:
  - Clean 2-column editorial cards with focused operational descriptions.
  - Substituted `Bot` with [`ShieldCheck`](file:///d:/College/Pidi.id/frontend/components/onboard/KineticFeatureGrid.tsx) to convey verified integrity.

### 3. Data Provenance Showcase ([`LiveTelemetryShowcase.tsx`](file:///d:/College/Pidi.id/frontend/components/onboard/LiveTelemetryShowcase.tsx))
- **Removed**:
  - Decorative protocol and cadence badges (`REST API`, `SSE Stream`, `Setiap 5 Menit`).
  - Speculative sensor status pills.
- **Added / Retained**:
  - Compact 3-column provenance ledger showing data source (BMKG, TomTom, PIHPS Bank Indonesia), update frequency, and verification scope.

### 4. Dashboard Top Bar & Telemetry ([`TopNavTelemetry.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/TopNavTelemetry.tsx))
- **Removed**:
  - `AgentStatusWidget` import and rendering (which exposed a fake multi-agent health matrix modal).
  - 320px popover modal essays reciting algorithm theory when hovering or clicking badges.
- **Added / Retained**:
  - Minimalist, high-density telemetry badges: `RUTE: 3.2ms`, `LALULINTAS: +25m`, `BMKG: 45mm/j`.
  - Removed speculative tag `FR-17` from [`IntermodalTerminalPopover.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/IntermodalTerminalPopover.tsx).

### 5. Guided Demo Panel ([`GuidedDemoPanel.tsx`](file:///d:/College/Pidi.id/frontend/components/demo/GuidedDemoPanel.tsx))
- **Removed**:
  - Pseudo-terminal log stream (`> [00:01.2] Akuisisi Data...`, `> [00:02.1] Sinkronisasi Swarm...`).
  - Synthetic 6-agent matrix grid in stages 1 and 2.
  - Buzzword copy: "Simulasi Krisis & Jalankan Swarm".
- **Added / Retained**:
  - Direct 4-point operational verification checks (Sensor BMKG/TomTom, Pemantauan Lalu Lintas, Verifikasi Berita Resmi, Konsensus Lapangan).
  - Grounded action button copy: "Mulai Simulasi Disrupsi".

### 6. Reports Section ([`ReportsSection.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/ReportsSection.tsx))
- **Removed**:
  - 3-page static textbook document reader explaining generic definitions of BMKG, TomTom, and PreHub.
  - Pagination controls for static essays.
- **Added / Retained**:
  - Interactive Audit Ledger table displaying actual disruption event records, approval timestamps, verified authorities, and compliance statuses.
  - Direct PDF and JSON export triggers.

### 7. Simulation Section ([`SimulationSection.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/SimulationSection.tsx))
- **Removed**:
  - Conversational AI chatbot window with text prompts and synthetic typing animations.
- **Added / Retained**:
  - Dedicated Scenario Workbench with operational parameter controls:
    - Disruption Duration slider (1 to 24 hours).
    - Commodity Tonnage slider (10 to 120 tons).
    - Bypass Highway toggle (Tol Trans-Sumatra).
    - Emergency Buffer slider (0% to 50%).
  - Real-time calculated impact metric readouts (Net Delay, Price Spike %, Spoilage Risk %).
  - Replaced generic `Rocket` launch icon with [`CheckCircle2`](file:///d:/College/Pidi.id/frontend/components/dashboard/SimulationSection.tsx).

### 8. Crisis Sidebar & Map Controls ([`CrisisSidebar.tsx`](file:///d:/College/Pidi.id/frontend/components/sidebar/CrisisSidebar.tsx), [`EvidenceTab.tsx`](file:///d:/College/Pidi.id/frontend/components/sidebar/EvidenceTab.tsx))
- **Removed**:
  - Theoretical Human-in-the-Loop governance essay banner ("Prinsip Kendali Operator: Sistem tidak melakukan intervensi kendaraan otomatis...") and help popover.
  - 8-step decision trace pipeline header in `EvidenceTab`.
  - Provenance explainer modal.
  - AI `Sparkles` icon in [`CrisisSimulatorBar.tsx`](file:///d:/College/Pidi.id/frontend/components/map/CrisisSimulatorBar.tsx).
- **Added / Retained**:
  - Direct evidence card comparing statistical confidence against calibrated disruption probability.
  - Verified news grounding card with official tier badges.
  - Speed-flow delay distribution bar chart.
  - Operational `Compass` icon and renamed "Best Mode" to "Multi-Moda Terpadu".

### 9. Typography Floor Enforcement (Strict 12px / `text-xs`)
Upgraded all sub-12px microtext classes (`text-[8px]`, `text-[9px]`, `text-[10px]`, `text-[11px]`) across 7 files:
- [`PriceChart.tsx`](file:///d:/College/Pidi.id/frontend/components/charts/PriceChart.tsx): Loading text from `text-[10px]` to `text-xs`.
- [`AnalyticsSection.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/AnalyticsSection.tsx): Bar chart time label from `text-[10px]` to `text-xs`.
- [`DashboardClient.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx): News tabs and pipeline data status grid from `text-[10px]`, `text-[9px]`, `text-[8px]` to `text-xs`.
- [`TestMatrixTable.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/TestMatrixTable.tsx): Table cells, status badges, and pagination footer from `text-[10px]` and `text-[11px]` to `text-xs`.
- [`FleetOnboardingModal.tsx`](file:///d:/College/Pidi.id/frontend/components/fleet/FleetOnboardingModal.tsx): Temperature excursion tag from `text-[10px]` to `text-xs`.
- [`CausalChainPanel.tsx`](file:///d:/College/Pidi.id/frontend/components/sidebar/CausalChainPanel.tsx): Relation text from `text-[11px]` to `text-xs`.
- [`MitigationTab.tsx`](file:///d:/College/Pidi.id/frontend/components/sidebar/MitigationTab.tsx): News source tier badge from `text-[10px]` to `text-xs`.

---

## Verification
- `rtk npx tsc --noEmit` executed in `frontend`: 0 errors.
- `rtk npm run build` executed in `frontend`: Next.js 14 production build succeeded (7 of 7 static routes prerendered).
