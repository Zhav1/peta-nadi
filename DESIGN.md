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

## Distilled Command Surface

**Scope.** Every command viewport: `app/dashboard`, `components/dashboard/**`, `components/sidebar/**`, `components/fleet/**`, `components/auth/**`, `components/ui/**`, and `components/base-ui/**`. The editorial sections above govern the public/landing surface. This section is the normative contract for the command surface and wins on conflict. Colour distribution follows `gods-eye-view/src/ui/styles/foundation.css`: a near-black ground, one tonally stepped panel ladder, text expressed as opacity tiers over a single near-white, and hue reserved for state.

### Surface ladder

| Token | Value | Use | Never |
|---|---|---|---|
| `--ds-surface-base` | `#080d14` | App ground, fixed nav ground, map letterbox, inset wells | Any shade lighter "for warmth" |
| `--ds-surface-panel` | `#0c1017` | Cards, panels, drawers, tooltips, popovers, modals | `#1c2432` or any ad-hoc hex as a second panel tone |
| `--ds-surface-raised` | `#121822` | Inputs, chips, hovered rows, inset sub-blocks inside a panel | As a third nesting level |
| `--ds-border-rest` | `rgba(255, 255, 255, 0.08)` | Every resting 1px boundary | Heavy 2px or coloured borders |
| `--ds-border-hover` | `rgba(255, 255, 255, 0.15)` | Hover and active boundary on the same element | A hue-shifted "accent border" |

Three surfaces, two border weights. A component that needs a fourth tone uses an opacity of `--ds-surface-raised`, not a new hex.

### Text tiers

| Token | Value | Use |
|---|---|---|
| `--ds-text-primary` | `#e8eaed` | Headings, metric values, active tab labels, selected row text |
| `--ds-text-secondary` | `rgba(232, 234, 237, 0.62)` | Field labels, metadata, table headers, tooltip labels |
| `--ds-text-dim` | `rgba(232, 234, 237, 0.38)` | Timestamps, units, footnotes, disabled states, freshness footer |

One near-white, three opacities. Never introduce a fourth text colour (no slate/blue/orange labels).

### Emphasis and data accent

| Token | Value | Rule |
|---|---|---|
| `--ds-chrome-primary` | `#ffffff` fill, `#080d14` text | Exactly one primary action per viewport. Hover is `opacity: 0.92`, never a shadow or a transform. |
| `--ds-accent` | `#38b8f8` | The single data accent. Reserved for live, selected, and route (one component may carry one accent element). Never a label colour, never decoration, never a gradient stop. |
| `--ds-hazard-critical` | `#ef4444` | Active disruption, closure, collapse, shutdown |
| `--ds-hazard-warning` | `#f59e0b` | Elevated risk, congestion, volatility, unconfirmed signal |
| `--ds-hazard-clear` | `#10b981` | Healthy / live / cleared — never decoration, never a generic "success" chip on static content |

Chrome is monochrome. `#38b8f8` is the only non-hazard hue permitted in chrome. The front-matter `status-info` `#38bdf8` is the landing/editorial informational sky and is not used on the dashboard surface.

### Banned in dashboard UI chrome

These values may not appear in any command-surface source file, in any case, as a literal, a CSS variable fallback, a Tailwind arbitrary value, or a `style` object:

`#00d4ff`, `#00f0ff`, `#22d3ee`, `#06b6d4`, `#f97316`, `#fb923c`, `#ff8c00`, `#eab308`, `#facc15`, `#a855f7`, `#c084fc`, `#3b82f6`, `#60a5fa`, `#1c2432`

Enforced by `frontend/e2e/dashboard-palette-contract.spec.ts`, which scans `CLEANED_FILES` and grows file-by-file across phases 175 and 176. The list is a ratchet: it may only grow; a listed file that regresses fails the suite.

**Map data-paint exceptions.** Banned hues survive only inside Mapbox paint expressions where a hazard or modality ramp genuinely needs graded steps. Exact, exhaustive ranges:

| File | Lines | What it paints |
|---|---|---|
| `components/map/CrisisMap.tsx` | 800–818 | Hazard-zone fill/stroke and selected-node halo |
| `components/map/CrisisMap.tsx` | 876 | Macro-node label text |
| `components/map/CrisisMap.tsx` | 958–967 | Disruption footprint fill and stroke |
| `components/map/CrisisMap.tsx` | 1014–1070 | Hazard-type and intensity ramps |
| `components/map/CrisisMap.tsx` | 1153 | Moderate intensity tier |
| `components/map/CrisisMap.tsx` | 1207–1229 | Port / airport / key-node symbol ramps |
| `components/map/CrisisMap.tsx` | 1248 | Airport glyph |
| `components/map/CrisisMap.tsx` | 1386–1408 | Route origin marker |
| `components/map/CrisisMap.tsx` | 1978–2029 | Route-leg geometry colour ramp |
| `components/map/CrisisMap.tsx` | 2341 | Route-label text colour |
| `components/map/FleetVehicleLayer.tsx` | 308 | Selected-vehicle line |
| `components/map/FleetVehicleLayer.tsx` | 365–367 | Modality line ramp (sea / air) |

`components/map/FleetVehicleLayer.tsx:816–818` (hover-tooltip modality dot) is chrome, not data paint, and is **not** excepted. No other exception exists: every occurrence in `components/dashboard/**`, `components/sidebar/**`, `components/fleet/**`, `components/auth/**`, `components/ui/**` and `components/base-ui/**` must reach zero by the end of phase 176.

### Type

| Rule | Value |
|---|---|
| UI text floor | `12px`. No command-surface text renders below it. |
| Dense-table exception | `11px` is permitted only inside a `<table>` cell or header. Never in cards, labels, tabs, or tooltips. |
| Numerals | Every metric, count, price, timestamp and percentage carries `font-variant-numeric: tabular-nums`. |
| Monospace | Codes, coordinates, IDs, units and timestamps only. Never prose, never a heading, never a sentence. |

### Radius

| Token | Value | Use |
|---|---|---|
| `--ds-radius-panel` | `12px` | Panels, cards, drawers, modals, tooltips |
| `--ds-radius-control` | `10px` | Buttons, inputs, selects, chips, tabs (supersedes the 8px editorial control radius on this surface only) |
| `--ds-radius-pill` | `999px` | Count badges, freshness pills, standalone status capsules |

### Elevation

One soft neutral shadow maximum: `0 12px 32px rgba(0, 0, 0, 0.4)`, and only on a detached overlay (tooltip, popover, dropdown, modal). Panels are flat; their boundary is the border. No coloured glow (`0 0 20px rgba(0,212,255,.4)`), no `backdrop-filter`, no ambient blur halo.

### Motion

| Property | Value |
|---|---|
| Duration | `120ms`–`300ms`. Nothing longer on the command surface. |
| Easing | `cubic-bezier(.4, 0, .2, 1)` for every transition and entrance. |
| Properties | `transform` and `opacity` only. Never animate `width`, `height`, `top`, `left`, `background-color` on the hot path. |
| Live pulse | Exactly one pulsing element per viewport, and only for a genuinely live hazard feed. A pulse at rest is a lie. |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` disables the pulse, all transitions and all transforms. Honoured everywhere, no exceptions. |

### Tooltip and popover contract

This is the single overlay system phase 176 builds; every earlier ad-hoc tooltip is replaced by it.

| Property | Value |
|---|---|
| Surface | `#0c1017`, opaque (no blur, no translucency) |
| Radius | `10px` |
| Border | `1px solid rgba(255, 255, 255, 0.1)` |
| Padding | `10px 12px` |
| Text | `12px`, `#e8eaed` body; `tabular-nums` on every value |
| Rows | Label/value rows; label at `62%` opacity (`--ds-text-secondary`), value right-aligned in `tabular-nums` |
| Footer | 1px top rule (`rgba(255,255,255,0.08)`) before the source + freshness line, which renders at `38%` opacity |
| Max width | `320px` |
| Ornament | No arrow, no gradient, no glass, no icon header |

**Why.** A dispatch surface is read in glances, under time pressure, by someone deciding whether to move trucks. Every extra hue is a competing signal, and every competing signal costs a glance. So the chrome is one near-black ladder and one near-white ladder, the accent appears only where the system is live or where the operator has just selected something, and hue means hazard — nothing else. The tooltip contract exists for the same reason: the operator must be able to read a population figure, its window, its source and its freshness as one block, in the same place, at the same size, every time. Consistency here is not aesthetic; it is the difference between a number that can be trusted at 3am and a number that has to be re-checked.

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
