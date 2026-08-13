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