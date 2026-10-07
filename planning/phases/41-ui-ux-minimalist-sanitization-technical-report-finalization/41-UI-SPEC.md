# UI/UX Specification: Phase 41 — Minimalist Sanitization & Non-AI Compliance

## 1. Visual Hierarchy & Philosophy

Phase 41 is the final sanitization phase of Milestone M2. Its purpose is to eliminate all remaining AI anti-patterns, emojis, exaggerated tech buzzwords, and fictional GPU claims across all frontend components in `frontend/` to present an honest, defense-grade, operator-first user experience.

### Non-AI Design Rules Enforced
1. **Zero Emoji Characters**: All emoji icons (e.g., `🟢`, `🟡`, `📌`, `📱`, `📍`, `✓`, `✕`, `✏`, `⚡`) are strictly replaced with monochrome Lucide SVG icons (`Circle`, `MapPin`, `Smartphone`, `Navigation`, `CheckCircle2`, `X`, `Pencil`, `Zap`).
2. **Zero Fictional GPU / cuOpt Claims**:
   - Replace "NVIDIA cuOpt GPU Solver" with "Solver Rute Koridor (NetworkX / OR-Tools)".
   - Replace "NVIDIA FourCastNet" with "Model Cuaca Open-Meteo & BMKG".
   - Replace "GPU ACCELERATION" with "OPTIMASI DETERMINISTIK CPU".
   - Replace "LAUNCH COMMAND CENTER 4D" with "Buka Command Center".
   - Replace "MAP 4D" with "PETA OPERASI".
3. **Consistent Dark Glassmorphism**:
   - Background: `backdrop-blur-md bg-[#0c0e12]/80 border border-white/10`
   - High contrast tactical text: Slate-200 / Slate-400 with cyan `#00f0ff` and emerald `#10b981` accents.
4. **Interactive Discipline**:
   - Mandatory `cursor-pointer` on all clickable buttons, badges, and tabs.
   - Smooth hover transitions (`transition-all duration-200`).

---

## 2. Component Inventory for Sanitization

| File | Identified Anti-Patterns | Target Minimalist Replacement |
| :--- | :--- | :--- |
| `frontend/components/ui/Toast.tsx` | Character `✕` in close button | Lucide `<X className="w-3.5 h-3.5" />` |
| `frontend/components/ui/SimulateButton.tsx` | Characters `✏`, `⚡` | Lucide `<Pencil />` & `<Zap />` |
| `frontend/components/demo/GuidedDemoPanel.tsx` | Characters `🟢`, `🟡`, `📌`, `📱`, `✕`, buzzwords "NVIDIA cuOpt", "FourCastNet" | Lucide SVG icons, honest CPU solver & Open-Meteo copy |
| `frontend/app/demo-remote/page.tsx` | Character `✓` | Lucide `<CheckCircle2 className="w-5 h-5 text-emerald-400" />` |
| `frontend/components/dashboard/DashboardClient.tsx` | Tab label `MAP 4D`, emoji `📍`, buzzwords | Tab label `PETA OPERASI`, clean Markdown without emojis, honest solver telemetry |
| `frontend/components/dashboard/ReportsSection.tsx` | "Solved NVIDIA cuOpt GPU matrix" | "Solver Rute CPU (NetworkX Dijkstra / OR-Tools)" |
| `frontend/components/dashboard/SimulationSection.tsx` | "Rekomendasi Rute GPU NVIDIA cuOpt" | "Rekomendasi Rute Solver CPU NetworkX / OR-Tools" |
| `frontend/components/dashboard/TopNavTelemetry.tsx` | Props `cuOptInfo`, labels | `routerInfo`, clean CPU latency display |
| `frontend/components/onboard/OnboardHero.tsx` | "Launch Command Center 4D", "NVIDIA cuOpt" | "Buka Command Center", honest tech stack badges |
| `frontend/components/onboard/InteractiveDemoShowcase.tsx` | "NVIDIA cuOpt GPU Rerouting", "< 100ms GPU Accelerated" | "Optimasi Rute Deterministik CPU", "< 2ms Latensi CPU" |
| `frontend/components/onboard/KineticFeatureGrid.tsx` | "NVIDIA cuOpt Avoidance Rerouting", "GPU ACCELERATION" | "Optimasi Rute Bypass Multi-Koridor", "ALGORITMA DETERMINISTIK" |
| `frontend/components/onboard/ImageSequenceCanvas.tsx` | "PHASE 03: NVIDIA CUOPT GPU ROUTE OPTIMIZATION" | "PHASE 03: OPTIMASI RUTE BYPASS DETERMINISTIK CPU" |
| `frontend/components/onboard/OnboardFooter.tsx` | Badge "NVIDIA cuOpt" | "NetworkX & Google OR-Tools" |

---

## 3. Interaction & States

- **Tab Navigation**: `PETA OPERASI` | `ANALYTICS` | `SIMULATION` | `REPORTS` | `EVALUATION`
  - Active: `bg-cyan-500/20 text-cyan-400 border border-cyan-500/40`
  - Inactive: `text-slate-400 hover:text-white hover:bg-white/5`
  - Cursor: `cursor-pointer`
- **Tooltips & Badges**:
  - Monospaced numeric telemetry (`font-mono text-xs`).
  - No dramatic animations or rainbow gradients.
