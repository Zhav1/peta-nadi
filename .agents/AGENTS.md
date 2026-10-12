# Token Optimization Rule

To reduce LLM token usage and optimize command execution outputs, all shell commands in this workspace should be routed through the `rtk` (Rust Token Killer) CLI proxy.

## Guidelines
1. Prefix standard shell commands with `rtk` (e.g., `rtk git status`, `rtk npm run test`, `rtk cargo test`).
2. If `rtk` is not directly recognized in a new terminal session, refresh the shell PATH environment variable from the system registry before running it:
   ```powershell
   $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
   ```
   You can combine this like:
   ```powershell
   $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk <command>
   ```


## UI/UX DESIGN SYSTEM ROUTER

Setiap kali melakukan refactoring, styling Tailwind, atau pembuatan komponen UI di Next.js:
1. Wajib baca `.agents/skills/ui-ux-pro-max/` dan file `design-system/MASTER.md`.
2. WAJIB patuhi aturan "Non-AI Anti-Patterns":
   - ❌ HARAM menggunakan AI gradient ungu/pink generik.
   - ❌ HARAM memakai Emoji sebagai ikon (wajib SVG dari Lucide/Heroicons).
   - ❌ HARAM memakai font default tanpa hierarchy jelas.
   - ✅ WAJIB tambahkan `cursor-pointer` pada semua tombol/elemen interaktif.
   - ✅ WAJIB gunakan Glassmorphism konsisten (`backdrop-blur-md bg-[#0c0e12]/80 border border-white/10`).
   - ✅ WAJIB micro-interaction halus (smooth transition 150ms - 300ms).


## CONTEXT & DOCUMENTATION AUTHORITY MATRIX

1. **Source of Truth Hierarchy**:
   - 🌟 **PRIMARY SPEC SOURCE**: `.planning/` (contains canonical `ROADMAP.md`, `PROJECT.md`, `STATE.md`, and active phase plans `phases/*`).
   - 🚫 **STALE/DUPLICATE FOLDERS**: Any undotted `planning/` folder is deprecated. DO NOT recreate or read `planning/`.
   - 📦 **LEGACY CONTEXT ISOLATION**: `docs/` and `docs/legacy_hackathon_archive/` contain outdated February 2026 hackathon stage 2 pitch documents. NEVER treat `docs/` as the current technical specification. If an agent encounters a contradiction between `docs/` and `.planning/`, `.planning/` WINS 100% of the time.

2. **Core Architectural Invariants (DO NOT REGRESS)**:
   - ❌ **DEPRECATED**: NVIDIA cuOpt and NVIDIA FourCastNet / Earth-2. DO NOT suggest, reintroduce, or generate code/docs requiring NVIDIA GPU solvers.
   - ✅ **CURRENT SOLVER**: Deterministic CPU Routing Adapter (`NetworkX + OR-Tools / 2-Opt`) in `backend/app/adapters/cpu_routing_adapter.py`.
   - ✅ **CURRENT WEATHER**: Real-time BMKG Radar + Open-Meteo NWP spatial fusion in `backend/app/services/weather_fusion_service.py`.
   - 🎯 **PRODUCT SCOPE**: PreHub is a **Live Pilot Operations Product** for Sumatra logistics partners (Pelindo Belawan, BKHIT, BPJT tolls, PIHPS food commodities), NOT an artificial synthetic demo.

3. **Metrics & Ground-Truth Integrity**:
   - ❌ HARAM menampilkan klaim bombastis tak berdasar (e.g. "100% Match!", "100% Solved Guarantee", "AI Sempurna").
   - ✅ Tampilkan metrik empiris presisi/recall yang terkalibrasi secara jujur sesuai N=60 benchmark Sumatra (`EvaluationSection.tsx`).