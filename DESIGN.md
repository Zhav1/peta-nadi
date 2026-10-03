---
name: PreHub
description: Sistem Peringatan Dini dan Rekomendasi Mitigasi Gangguan Distribusi Pangan Nasional
colors:
  primary: "#ffffff"
  primary-foreground: "#080d14"
  surface: "#080d14"
  surface-elevated: "#0c1017"
  surface-subtle: "#121822"
  border: "rgba(255, 255, 255, 0.08)"
  border-muted: "rgba(255, 255, 255, 0.04)"
  text-primary: "#f1f5f9"
  text-muted: "#94a3b8"
  text-dim: "#64748b"
  status-critical: "#ef4444"
  status-warning: "#f59e0b"
  status-clear: "#10b981"
  status-info: "#38bdf8"
typography:
  display:
    fontFamily: "Space Grotesk, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(2.5rem, 5vw, 4.25rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Space Grotesk, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.04em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-secondary:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  card:
    backgroundColor: "{colors.surface-elevated}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: PreHub

## Overview

**Creative North Star: "The Strategic Sentinel"**

PreHub is a high-stakes national infrastructure dispatch and food logistics intelligence platform. Its purpose is to deliver immediate, verified situational awareness to supply chain directors, port authorities, and government regulators monitoring critical corridors across Indonesia (such as Belawan to Medan and Trans-Sumatra).

The visual language rejects generic tech-product decoration, synthetic neon glows, and template cardification. Instead, it adopts the austere clarity of an editorial ledger and geopolitical operational dossier: stark contrast, disciplined typography, intentional whitespace, and zero decorative chrome. Chrome and framing recede completely; authentic geospatial evidence and causal supply chain impacts take center stage.

**Key Characteristics:**
- Pure tonal flatness with no artificial blur, glow halos, or floating glassmorphic novelty.
- Monochrome high-contrast chrome (pure white and deep charcoal) where chromatic color is strictly reserved for operational hazard status.
- Content-first editorial layout with generous breathing room (32px to 64px rhythm) replacing card-cluttered grids.
- Authentic data presentation with no simulated liveness, stock photography, or decorative metrics.

## Colors

The palette is rooted in pure charcoal-black ground with high-contrast neutral slate text, restricting hue exclusively to real-time operational risk indicators.

### Primary
- **Architectural White** (`#ffffff`): Used exclusively for primary interactive focus, selected states, and supreme typographic emphasis. Its visual power stems from its rarity.

### Neutral
- **Deep Void Background** (`#080d14`): The foundational canvas for both public overview and command center views. Absorbs visual noise.
- **Elevated Ledger Charcoal** (`#0c1017`): Used for secondary surface elevation, headers, and discrete operational drawers.
- **Hairline Border** (`rgba(255, 255, 255, 0.08)`): Single-pixel structural boundary separating functional viewports.
- **Subtle Rule** (`rgba(255, 255, 255, 0.04)`): Internal divider line between tabular ledger rows.
- **Crisp Text Slate** (`#f1f5f9`): Primary reading text, metrics, and headlines. Exceeds WCAG AAA contrast ratio on dark ground.
- **Muted Text Slate** (`#94a3b8`): Secondary descriptive text, labels, and metadata.
- **Dimmed Slate** (`#64748b`): Tertiary captions and disabled states (never applied below 12px).

### Functional Status (Operational Signals Only)
- **Critical Disruption Red** (`#ef4444`): Active corridor closure, severe flood inundation, bridge structural collapse, or port shutdown.
- **Elevated Risk Amber** (`#f59e0b`): High congestion delay, predictive price volatility, or unconfirmed seismic tremors.
- **Clear Corridor Emerald** (`#10b981`): Operational nominal flow, verified bypass route, or consensus validated clearance.
- **Informational Sky** (`#38bdf8`): Telemetry sync timestamp, verified weather station notice, or network origin/destination nodes.

### Named Rules
**The Functional Status Rule.** Chromatic color (red, amber, emerald, sky) is restricted 100% to live operational state, risk severity, and geospatial map layers. Colored badge chips, neon gradients, and decorative accent text on standard marketing paragraphs are strictly forbidden.

**The Monochromatic Chrome Rule.** All navigation bars, interactive container borders, buttons, and tab controls must use pure architectural white, slate, and charcoal. The UI chrome remains neutral so hazard alerts immediately command attention.

## Typography

**Display Font:** Space Grotesk (fallback: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)
**Body Font:** Inter (fallback: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)
**Data/Mono Font:** ui-monospace (fallback: SFMono-Regular, Menlo, Monaco, Consolas, monospace)

**Character:** The pairing of Space Grotesk's geometric confidence with Inter's legibility creates an authoritative, modern editorial register. Monospace is treated as an instrument for tabular values, never as a decorative styling novelty for prose.

### Hierarchy
- **Display** (Bold 700, `clamp(2.5rem, 5vw, 4.25rem)`, line-height 1.1, tracking `-0.03em`): Hero editorial statements. Set in sentence case or title case; never broken with multi-colored highlighter chips.
- **Headline** (SemiBold 600, `clamp(1.75rem, 3vw, 2.5rem)`, line-height 1.2, tracking `-0.02em`): Section headings and key situational overviews.
- **Title** (SemiBold 600, `1.125rem` (18px), line-height 1.4, tracking `-0.01em`): Module headers, article headlines, and panel titles.
- **Body** (Regular 400, `0.9375rem` (15px), line-height 1.6, tracking `normal`): Narrative copy, causal explanations, and report text. Line lengths constrained to 65-75 characters for reading comfort.
- **Label / Tabular** (Medium 500, `0.75rem` (12px) minimum, tracking `0.04em`): Monospaced telemetry figures, coordinates, timestamps, and data table numbers.

### Named Rules
**The 12px Baseline Rule.** No text element anywhere in the interface may be rendered smaller than 12px (`0.75rem`). Microscopic 8px to 10px labels are forbidden.

**The Monospace Discipline Rule.** Monospace is strictly reserved for quantitative numbers, coordinates, timestamps, and system identifiers. Marketing copy, feature summaries, section titles, and status explanations must always be set in Inter or Space Grotesk.

**The Natural Heading Rule.** Headings must read as continuous grammatical thoughts. Arbitrary pill wrappers, rotated word chips (+/-1 deg), and split-word badges (such as "shape" + chip "ing") are strictly banned.

## Layout

Layout prioritizes generous whitespace, horizontal visual restraint, and clear editorial rhythm over card collections.

- **Grid and Spatial Rhythm:** Sections use comfortable vertical spacing (`py-20` to `py-28`, 80px to 112px). Components are spaced using standard increments: 8px (tight), 16px (standard gap), 24px (module separation), and 48px to 64px (major narrative shifts).
- **Container Strategy:** Avoid enclosing related text blocks in individual boxes. Group content through natural proximity and whitespace first. Where a container is required (e.g. an interactive inspector or data table), use a single outer boundary with subtle single-pixel borders (`border-white/8`), avoiding nested cards.
- **Responsive Behavior:** 
  - Desktop (1280px+): Generous multi-column editorial composition; full-bleed command center with floating docked sidebars.
  - Tablet (768px - 1024px): 2-column simplified hierarchy; drawer-based sidebars.
  - Mobile (below 768px): Single-column clean vertical stack; sticky simplified header; all micro-indicators consolidated into readable blocks.

## Elevation & Depth

PreHub enforces pure tonal flatness. The interface does not simulate glass, water, or floating physical planes.

- **Depth through Tone:** Depth is achieved exclusively by stepped neutral background tones: canvas ground (`#080d14`), primary surface (`#0c1017`), and interactive hover surface (`#121822`).
- **No Neon Glows:** Box-shadows with colored blurs (e.g. `rgba(34, 211, 238, 0.4)`) and ambient background blur halos (e.g. 800px blur blobs) are completely eliminated.
- **Quiet Functional Elevation:** A single subtle neutral shadow (`0 12px 32px rgba(0, 0, 0, 0.4)`) is permitted only on detached floating overlays (such as the map inspector tooltip or dropdown modal).

### Named Rules
**The Pure Flatness Rule.** No `backdrop-filter: blur()`, no glowing drop-shadows, and no semi-transparent layered frosted glass. Information clarity requires high contrast against opaque or near-opaque dark surfaces.

## Shapes

- **Radius Scale:**
  - Micro (`rounded-sm`, 4px): Checkboxes, small tags, and status dots.
  - Standard (`rounded-md`, 8px): Buttons, form inputs, and compact controls.
  - Container (`rounded-lg`, 12px): Module panels, modal sheets, and primary cards.
  - Full (`rounded-full`, 9999px): Strict pills for standalone count badges and avatars only.
- **Borders:** Crisp single-pixel lines (`1px solid rgba(255, 255, 255, 0.08)`). No heavy 2px neon borders.

## Components

### Buttons
- **Shape:** Standard radius (`rounded-md`, 8px).
- **Primary:** Solid Architectural White (`#ffffff`) background with Void Black (`#080d14`) text, font weight 600, padding `12px 24px`. On hover, subtle opacity shift (`opacity: 0.92`), zero motion transform or glowing drop-shadow.
- **Secondary:** Surface charcoal (`#0c1017`) background, single-pixel hairline border (`border-white/10`), Slate-100 (`#f1f5f9`) text, padding `12px 20px`. On hover, border warms to `border-white/25`.
- **Ghost:** Transparent background with Slate-300 text; hover transitions to subtle surface wash (`bg-white/5`).

### Cards & Panels
- **Style:** Single-layer Charcoal ground (`#0c1017`), hairline border (`1px solid rgba(255, 255, 255, 0.08)`), radius 12px (`rounded-lg`), generous internal padding (24px to 32px).
- **Prohibition:** Nested cards (a card inside a card inside a card) are strictly disallowed.

### Form Inputs & Search
- **Style:** Opaque deep charcoal ground (`#0c1017`), crisp hairline border (`border-white/10`), radius 8px, text size 14px.
- **Focus:** Crisp single-pixel white focus ring (`ring-1 ring-white/40 border-white/40`), zero fuzzy cyan glow.

### Navigation Header
- **Landing Nav:** Fixed top, dark solid ground (`#080d14`), bottom border (`border-white/8`), height 72px. Contains clean wordmark logo, three calm text links (14px, Slate-300), and a single primary white CTA.
- **Command Center Nav:** Fixed top 64px, organized in three distinct zones: Brand/Context on left, primary section switcher tabs in center, system health and user role selector on right. No overlapping dropdowns.

### Status Indicators
- **Style:** Monospaced 12px indicator with an un-animated 6px solid dot.
- **Colors:** Red for critical, amber for warning, emerald for clear. Never pulse or bounce continuously at rest.

## Do's and Don'ts

### Do:
- **Do** lead with the authentic supply chain narrative: Belawan Port status, CPO transport flow, and Medan market inflation.
- **Do** use Architectural White for primary interactive triggers and key metric figures.
- **Do** maintain a strict 12px minimum font size across all screens and components.
- **Do** respect the user's `prefers-reduced-motion` settings on all scroll interactions and animations.
- **Do** maintain generous whitespace between editorial sections (minimum 64px to 96px gaps).
- **Do** adhere to the Bilingual Operational Standard: Indonesian for operational content, English for technical infrastructure terms.

### Don't:
- **Don't** use multi-colored highlighter chips or rotated spans (+/-1 deg) inside headings.
- **Don't** apply neon glowing drop-shadows (`box-shadow: 0 0 35px cyan`) or ambient blur halos.
- **Don't** use generic stock photography to simulate product capabilities.
- **Don't** nest bordered cards inside other bordered cards.
- **Don't** set narrative descriptions or body copy in monospace.
- **Don't** add decorative pulsing dots, bouncing arrows, or artificial liveness labels to static data.
- **Don't** display unverified, invented metrics or internal engineering sprint numbers in visitor-facing interfaces.
