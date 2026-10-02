---
phase: 44
slug: intermodal-terminal-dashboard-spoilage-hedging-compliance-inspector
status: approved
shadcn_initialized: false
preset: prehub-tactical-glass
created: 2026-10-02
---

# Phase 44 — UI Design Contract

> Visual and interaction contract for Phase 44 frontend deliverables: `SpoilageHedgingCard`, `ComplianceInspectorCard`, and `IntermodalTerminalPopover`.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Tailwind CSS + Custom Tactical Glassmorphism 2.0 |
| Preset | prehub-tactical-glass (`#0c0e12` / `#13161c`) |
| Component library | Custom accessible React primitives (`GlassPanel.tsx`, `Toast.tsx`) |
| Icon library | `lucide-react` (100% monochrome SVG, 0 emojis) |
| Font | Inter / Geist Sans (UI text) + JetBrains Mono (monospaced metrics/figures) |

---

## Spacing Scale

Declared values (multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, badge padding, metric spacing (`gap-1`, `p-1`) |
| sm | 8px | Compact button padding, card inner row margins (`gap-2`, `p-2`) |
| md | 16px | Card body padding, section header gaps (`p-4`, `gap-4`) |
| lg | 24px | Container padding, modal section margins (`p-6`) |
| xl | 32px | Major sidebar layout blocks (`mb-8`) |
| 2xl | 48px | Dashboard split pane boundaries |
| 3xl | 64px | Page boundary gutters |

Exceptions: None.

---

## Typography

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Body | 12px (`text-xs`) | 400 (`font-normal`) | 1.5 | Explanatory text, policy trade-off descriptions |
| Label | 10px (`text-[10px]`) | 700 (`font-bold font-mono`) | 1.2 | Section supertitles, status pills, highway route badges |
| Metric | 13px (`text-sm font-mono`) | 700 (`font-bold`) | 1.2 | Indonesian Rupiah costs, delay multipliers, coordinates |
| Heading | 14px (`text-sm`) | 600 (`font-semibold`) | 1.3 | Card headers, popover titles, inspection check items |
| Display | 18px (`text-lg font-mono`) | 700 (`font-bold`) | 1.1 | Net savings prevention summary in IDR |

---

## Color

Strictly adheres to PreHub Tactical Dark HUD palette (No AI purple/pink gradients):

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#0c0e12` / `#08090b` | Background canvases, map viewport underlays |
| Secondary (30%) | `#13161c` (opacity 80-95%) | Cards, `CrisisSidebar` tabs, popover panels (`border-white/10`) |
| Accent Emerald (10%) | `#10b981` / `#34d399` | Optimal mitigation policy (`REROUTE`/`HOLD`), valid compliance badges |
| Warning Amber | `#f59e0b` / `#fbbf24` | MST Axle-Load advisory, elevated traffic congestion, medium demurrage |
| Destructive Rose | `#f43f5e` / `#fb7185` | BKHIT Hard Block, port gate closure, highest monetary risk policy |

Accent reserved for: Optimal policy highlight border, active popover toggle, verified checkmark SVG icons.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary Action: Apply Hedging | "Terapkan Kebijakan Mitigasi" |
| Primary Action: Override Warning | "Konfirmasi Dispensasi MST (Catat Audit)" |
| Terminal Choke-Point Popover Title | "Choke-Point & Terminal Antarmoda Pan-Sumatra" |
| Empty state (No vehicle selected) | "Pilih armada pada peta untuk mengkalkulasi hedging kerugian komoditas & kepatuhan izin." |
| BKHIT Quarantine Block Warning | "Akses Penyeberangan Ditolak: Sertifikat Karantina Pertanian (BKHIT) Tidak Ditemukan." |
| MST Axle-Load Warning | "Peringatan Tonase: Beban armada melebihi MST Jalur Kelas III (Maks 8 Ton). Disarankan pengalihan rute." |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| lucide-react | Ship, Anchor, ShieldAlert, Scale, FileText, DollarSign, Clock, ThermometerSnowflake, CheckCircle2, AlertTriangle, ChevronDown | PASS |
| custom components | GlassPanel, StatusBadge, Popover | PASS |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-10-02
