# LEARNINGS — Phase 23: Run Demo Engine Overhaul — Interactive Stepper, Stage-Wired Map Effects & Architectural Hook Lift

Dokumen pembelajaran teknis dan wawasan arsitektural dari eksekusi **Phase 23** pada platform PetaNadi / LRIP Engine.

---

## 🔑 Key Technical Lessons Learned

### 1. Pointer-Events CSS Inheritance on Fixed Overlay Cards
- **Problem**: Elemen `<div>` dengan `position: fixed` yang berada di dalam kontainer ber-`pointer-events: none` tetap mewarisi pembatasan klik dari parent-nya di CSS.
- **Akar Masalah**: Browser hit-testing menolak meng-capture event mouse/touch pada level OS/DOM sebelum JavaScript sempat mengeksekusi `e.stopPropagation()`.
- **Solution**:
  - Menambahkan secara eksplisit `pointer-events-auto` pada class wrapper `GuidedDemoPanel.tsx`.
  - Menghentikan propagasi event mouse & pointer (`onMouseDown` & `onPointerDown` dengan `e.stopPropagation()`) agar klik pada tombol stepper (`⏭ Next Step`, `▶ Auto`, `✕`) tidak bocor/menembus ke canvas WebGL Mapbox di belakangnya.

### 2. React Architecture: Lifting Hook Ownership to Dashboard Level
- **Problem**: Komponen `GuidedDemoPanel.tsx` awalnya memiliki `useDemoState` hook secara privat, sementara tombol pemicu `▶ Run Demo` berada di `DashboardClient.tsx` (di dalam bottombar footer). Hal ini memicu penggunaan DOM selector hack (`document.querySelector('button[data-demo-trigger="true"]').click()`) yang rapuh.
- **Solution**:
  - `useDemoState` diangkat (*lifted*) ke level `DashboardClient.tsx`.
  - `GuidedDemoPanel.tsx` direfaktorkan menjadi *pure presentational component* yang menerima state (`stage`, `isRunning`, `crisisId`, `confidence`, dll.) dan handler callbacks (`onStart`, `onAdvance`, `onToggleAuto`, `onReset`) sebagai props.
  - Tombol footer `▶ Run Demo` kini memanggil `demoState.start(...)` secara langsung dan deklaratif tanpa DOM query selector hack.

### 3. Stage-Wired Visual Dashboard Effects
- **Problem**: Pada versi awal, transisi stage 0, 1, dan 2 hanya memperbarui teks pada stepper card tanpa mengubah tampilan peta atau sidebar, sehingga demo terasa "mati" di 3 stage pertama.
- **Solution**:
  - Ditambahkan `useEffect` stage-watcher di `DashboardClient.tsx` yang secara dinamis mereaksikan peta per stage:
    - **Stage 0**: Kanvas peta bersih, rute baseline normal Belawan ➔ Medan.
    - **Stage 1**: Rute baseline Belawan ➔ Siantar aktif.
    - **Stage 2**: Injeksi poligon zona bahaya (*flood shockwave*) di koridor Lubuk Pakam. Rute baseline berubah menjadi merah terisolasi (`COMPROMISED`).
    - **Stage 3**: Validasi krisis ➔ Peta otomatis merutekan ulang armada melingkari zona bahaya (Rute Detour Aman cyan/hijau) + Right Sidebar (Evidence & XAI CoT Reasoning) terbuka otomatis.
    - **Stage 4**: Tab Mitigation aktif + Toast notification `✅ WhatsApp Alert Delivered`.

### 4. Non-AI Anti-Pattern Compliance: SVG Icons & Natural Language
- **Problem**: Penggunaan emoji pada chip sumber data (`BMKG` 🌩️, `NASA` 🛰️, `AISstream` ⚓) melanggar aturan `AGENTS.md`.
- **Solution**:
  - Mengganti seluruh ikon emoji dengan SVG dari `lucide-react` (`CloudLightning`, `Car`, `Satellite`, `Anchor`, `TrendingUp`, `MessageSquare`, `CheckCircle2`).
  - Mengubah seluruh teks penjelasan stage (`stageExplainers`) dari Bahasa Inggris kaku menjadi Bahasa Indonesia yang profesional dan natural.

---

## 📁 Code Reference & Deliverables Summary

| Deliverable | Modified File | Key Function / Component |
|---|---|---|
| **Deliverable 1** | [`frontend/components/demo/GuidedDemoPanel.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/demo/GuidedDemoPanel.tsx) | `pointer-events-auto`, `onMouseDown`, `onPointerDown` |
| **Deliverable 2** | [`frontend/components/dashboard/DashboardClient.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx) | `useDemoState` hook lift & prop passing |
| **Deliverable 3** | [`frontend/components/dashboard/DashboardClient.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx) | Stage-wired `useEffect` handler (Stage 0–4 map side-effects) |
| **Deliverable 4** | [`frontend/components/demo/GuidedDemoPanel.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/demo/GuidedDemoPanel.tsx) | Lucide SVG icons & Bahasa Indonesia explainers |
| **Deliverable 5** | [`frontend/hooks/useDemoState.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useDemoState.ts) | Auto-advance timer interval `15000ms → 8000ms` |
