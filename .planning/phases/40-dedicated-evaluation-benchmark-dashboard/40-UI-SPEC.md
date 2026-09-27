---
phase: 40
slug: dedicated-evaluation-benchmark-dashboard
status: approved
reviewed_at: 2026-09-27
shadcn_initialized: false
preset: none
created: 2026-09-27
---

# Phase 40 — UI Design Contract: Dedicated Evaluation & Benchmark Dashboard

> Visual, interactive, and architectural contract for Phase 40: Dedicated Evaluation & Benchmark Dashboard.
> Designed for mission-critical logistics operations, academic defense rigor, and non-AI minimalist UX standards.

---

## 1. Design System & Foundational Principles

| Property | Value |
|---|---|
| Framework | Next.js 14 App Router (React 18 client component) |
| Styling | Tailwind CSS (Strict Utility Tokens, Zero generic AI gradients) |
| Icons | Lucide React (SVG only, **strictly zero emoji characters**) |
| Typography | Space Grotesk (Headings/Display), Inter (Body/Labels), JetBrains Mono (Metrics/Tables/Code) |
| Interactive Elements | **Strictly required `cursor-pointer` on all clickable surfaces** |
| Surface Finish | Glassmorphism (`backdrop-blur-md bg-[#0c0e12]/80 border border-white/10`) |
| Micro-interactions | Smooth ease transitions (150ms – 250ms `cubic-bezier(0.16, 1, 0.3, 1)`) |

---

## 2. Spacing Scale

Strictly adheres to an 8-point scale (multiples of 4px):

| Token | Value | Applied Context |
|---|---|---|
| `xs` | 4px | Icon-text spacing, micro badge padding, dot indicator margins |
| `sm` | 8px | Metric card gap, pill badge padding, filter chip inner margin |
| `md` | 16px | Card inner padding, column gutter, search bar height offset |
| `lg` | 24px | Section container padding, grid item gaps |
| `xl` | 32px | Sub-panel separation, diagram canvas margins |
| `2xl` | 48px | Major dashboard segment vertical margins |
| `3xl` | 64px | Viewport edge breathing room and bottom clearance |

---

## 3. Typography Hierarchy

| Role | Size | Weight | Line Height | Font Family | Applied Context |
|---|---|---|---|---|---|
| **Display** | 24px | 600 | 1.1 | Space Grotesk / JetBrains Mono | Top-level KPI scorecallouts (e.g., `100%`, `0.0782`, `0.019 ms`) |
| **Heading** | 16px | 600 | 1.2 | Space Grotesk | Section headers, card titles, table column groups |
| **Body** | 13px | 400 | 1.5 | Inter | Explanatory descriptions, scenario names, advisory rationale |
| **Mono Data** | 12px | 500 | 1.4 | JetBrains Mono | Test IDs, coordinates, probability values, delta percentages |
| **Label / Meta** | 11px | 400 | 1.3 | Inter / JetBrains Mono | Table headers, timestamp readouts, status pill badges |

Weights: Regular (400), Medium (500), SemiBold (600).

---

## 4. Color Palette (60 / 30 / 10 Rule)

| Role | Color Value | Tailwind Token | Semantic Usage |
|---|---|---|---|
| **Dominant (60%)** | `#0c0e12` | `bg-[#0c0e12]` | Full page canvas, dashboard backdrop, deep panel fills |
| **Secondary (30%)** | `#13161c` / `#1a1d24` | `bg-[#13161c] border-white/10` | Glassmorphic cards, table containers, diagram frames |
| **Accent (10%)** | `#00f0ff` (Cyan 400) | `text-cyan-400 border-cyan-400/40` | Active navigation tab, calibration diagonal, selected filters |
| **Success** | `#10b981` (Emerald 500) | `text-emerald-400 bg-emerald-500/10` | Passed tests (79/79), calibrated status, positive savings |
| **Warning** | `#f59e0b` (Amber 500) | `text-amber-400 bg-amber-500/10` | Recalibration advisories, marginal thresholds, detour overhead |
| **Danger** | `#ef4444` (Red 500) | `text-red-400 bg-red-500/10` | Blocked road corridors, critical alert thresholds |

---

## 5. Navigation Bar Contract (`DashboardClient.tsx`)

### 5.1 Tab Unlocking & Activation
- Replace temporary lock icons (`<Lock>`) and disabled attributes on existing navigation buttons.
- Enable full operator switching across all 5 operational sections:
  1. `MAP 4D` (`id="nav-map"`, section `'map'`)
  2. `ANALYTICS` (`id="nav-analytics"`, section `'analytics'`)
  3. `SIMULATION` (`id="nav-simulation"`, section `'simulation'`)
  4. `REPORTS` (`id="nav-reports"`, section `'reports'`)
  5. `EVALUATION` (`id="nav-evaluation"`, section `'evaluation'`) **[NEW]**

### 5.2 Navigation Tab Styling Contract
- **Active Tab**: `bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-bold`
- **Inactive Tab**: `text-slate-400 hover:text-slate-200 hover:bg-white/5 font-medium transition cursor-pointer`
- **Tab Height**: `py-1.5 px-3.5 rounded-lg text-xs tracking-wider uppercase`
- All tabs preserve existing background WebSocket streaming and local memory states without page reloads.

---

## 6. Component Architecture & Detailed Layout

```
EvaluationSection.tsx (Container)
├── 1. Top Evaluation Header & Filter Bar
│   ├── Title + Subtitle ("Evaluasi Empiris & Tolok Ukur Validasi")
│   ├── Quick Sub-Navigation: [Ringkasan Metrik | Diagram Kalibrasi | Matriks Uji (81) | Efisiensi Rute | Audit Keputusan]
│   └── Refresh Telemetry Button + Live Timestamp
│
├── 2. Empirical Benchmark Scorecards (Grid 5 Kolom)
│   ├── Card 1: Presisi Deteksi (100.0%) [Target: > 85%]
│   ├── Card 2: Recall / Sensitivitas (97.1%) [Target: > 80%]
│   ├── Card 3: F1-Score Komposit (0.985) [Target: > 0.82]
│   ├── Card 4: Brier Score Kalibrasi (0.0782) [Target: <= 0.10]
│   └── Card 5: Rerata Latensi Inferensi (0.019 ms) [Target: < 15 min]
│
├── 3. Split Analytical Canvas (Grid 2 Kolom)
│   ├── Panel Kiri: Interactive Reliability Diagram (Diagram Kalibrasi Probabilitas)
│   │   ├── SVG 10-Bin Calibration Plot with Perfect Diagonal ($y = x$)
│   │   ├── Observed Empirical Frequency Bars vs. Forecast Confidence
│   │   └── Bin Hover Tooltip (Sample Count, Empirical Acc, Calibration Error)
│   └── Panel Kanan: Tolok Ukur Efisiensi Rute CPU & Mitigasi Gangguan
│       ├── Perbandingan Rute Koridor: Terblokir vs. Reroute CPU (NetworkX / OR-Tools)
│       ├── Penghematan Waktu Tempuh (-4.8 Jam / -62%)
│       ├── Penghematan Biaya & Bahan Bakar (Rp 1.450.000 / rit)
│       └── Indikator Beban Komputasi Solver (< 2.0 ms CPU)
│
├── 4. Exhaustive Automated Test Suite Matrix (81 Skenario)
│   ├── Filter Bar: Domain [Semua | FR-1 Cuaca | FR-2 TomTom | FR-4 Berita | FR-5 Swarm | FR-11 Kalibrasi | FR-12 Audit | FR-13 Telemetri]
│   ├── Status Summary Pill: "79 Unit/Integ Passing • 2 E2E Ready • 0 Gagal"
│   └── Interactive Table:
│       └── Kolom: Test ID | Kategori / FR | Modul Pengujian | Skenario Uji | Invarian / Ekspektasi | Hasil
│
└── 5. Closed-Loop Operator Decision Trace & Ground-Truth Outcomes
    ├── Tabel Audit Keputusan:
    │   └── Kolom: Waktu | ID Insiden | Keputusan Operator (ACCEPT/REJECT/OVERRIDE) | Aksi Mitigasi | Realitas Lapangan (T+12h / T+24h) | Varians Error | Faktor Rekalibrasi ($\eta$)
    └── Kartu Rekomendasi Bobot Sensor Adaptif:
        └── Bobot Cuaca (0.35 -> 0.36) • Bobot Trafik (0.35 -> 0.34) • Bobot Berita (0.30 -> 0.30)
```

---

## 7. Interactive Interaction Contracts

### 7.1 Reliability Diagram Interaction
- **Canvas**: Rendered with lightweight native SVG (no heavyweight charting libraries), responsive aspect ratio 16:9.
- **Perfect Calibration Diagonal**: Dashed cyan line (`stroke-cyan-400/40`, `stroke-dasharray="4 4"`).
- **Observed Curve**: Solid emerald line (`#10b981`) connecting the 10 probability bin centroids with circular data nodes.
- **Bin Confidence Bars**: Subtle slate background columns showing sample volume distribution ($N=60$).
- **Hover State**: Hovering over any bin displays a monospaced glassmorphic card:
  - Bin Range (e.g. `[0.90 - 1.00]`)
  - Sample Count (e.g. `34 skenario`)
  - Mean Confidence (e.g. `97.31%`)
  - Empirical Accuracy (e.g. `100.0%`)
  - Calibration Error (e.g. `0.0269`)

### 7.2 Test Suite Filter & Search Interaction
- **Search Input**: Live client-side text filter matching Test ID, module path, and scenario text in $< 10\text{ ms}$.
- **Domain Filter Tabs**: Pill buttons filtering across FR domains (FR-1 through FR-13). Active filter highlighted with cyan border.
- **Row Expansion**: Clicking any test row expands an inline detail drawer displaying the exact assert statement, mock inputs, and execution time.

### 7.3 Route Efficiency Comparator Interaction
- **Modality Selector**: Toggle comparison metrics between Truk Logistik (Jalinsum), Kapal Ro-Ro (Selat Malaka), dan Kargo Udara.
- **Dynamic Savings Counter**: Interactive numeric stepper simulating fleet size from 1 to 50 trucks, updating total saved operational costs dynamically.

---

## 8. Copywriting & Content Contract (Bahasa Indonesia)

| UI Element | Exact Indonesian Copy | Context / Purpose |
|---|---|---|
| **Page Title** | Evaluasi Empiris & Tolok Ukur Validasi | Top section title |
| **Subtitle** | Bukti empiris keandalan model kecerdasan logistik PreHub berdasarkan dataset ground truth Sumatra ($N=60$), pengujian otomatis, dan kalibrasi probabilitas. | Context banner |
| **Metric 1 Title** | Presisi Deteksi | Positive disruption precision |
| **Metric 1 Target** | Target: > 85.0% (Tercapai: 100.0%) | Target benchmark pill |
| **Metric 2 Title** | Sensitivitas (Recall) | Disruption identification rate |
| **Metric 2 Target** | Target: > 80.0% (Tercapai: 97.1%) | Target benchmark pill |
| **Metric 3 Title** | Skor F1 Komposit | Balanced harmonic mean |
| **Metric 3 Target** | Target: > 0.82 (Tercapai: 0.985) | Target benchmark pill |
| **Metric 4 Title** | Brier Score Kalibrasi | Probabilistic calibration honesty |
| **Metric 4 Target** | Target: ≤ 0.10 (Tercapai: 0.0782) | Target benchmark pill |
| **Metric 5 Title** | Latensi Inferensi Solver | CPU computation time |
| **Metric 5 Target** | Target: < 15 mnt (Tercapai: 0.019 ms) | Target benchmark pill |
| **Empty State Header**| Tidak Ada Data Rekaman Evaluasi | Fallback message |
| **Empty State Body** | Dataset tolok ukur belum dimuat. Klik tombol 'Muat Ulang Telemetri' untuk menyinkronkan data evaluasi. | Fallback body |
| **CTA Button** | Muat Ulang Evaluasi | Sync button |
| **Audit Filter All** | Semua Kategori | Filter pill |

---

## 9. Verification & Acceptance Criteria

- [ ] **Tab Navigation**: Clicking `EVALUATION`, `ANALYTICS`, `SIMULATION`, `REPORTS`, and `MAP 4D` switches view smoothly without losing state or disconnecting WebSockets.
- [ ] **Empirical Metrics**: 5 KPI cards render exact benchmark values matching `test-results/benchmark_evaluation_report.json`.
- [ ] **Reliability Diagram**: Displays 10 probability bins with perfect calibration reference line and accurate hover tooltips.
- [ ] **Test Matrix**: Exhaustive list of 81 automated tests mapped to FR-1 through FR-13 with real-time domain filtering and search.
- [ ] **Corridor Savings**: Visual comparison of corridor travel times, detour distances, and operational cost savings calculated deterministically.
- [ ] **Decision Audit**: Closed-loop table displaying operator decisions (ACCEPT/REJECT/OVERRIDE) alongside verified post-incident outcomes and sensor recalibration weights ($\eta = 0.05$).
- [ ] **Non-AI Design Compliance**: Zero emoji characters, zero generic purple/pink gradients, all interactive elements marked with `cursor-pointer`, consistent glassmorphic styling.
