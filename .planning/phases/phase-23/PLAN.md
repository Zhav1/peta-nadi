# PLAN — Phase 23: Run Demo Engine Overhaul — Interactive Stepper, Stage-Wired Map Effects & Architectural Hook Lift

**Phase:** 23  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Goal:** Perbaiki fitur `▶ Run Demo` secara menyeluruh sehingga stepper card **100% dapat diinteraksi**, transisi setiap stage **terhubung langsung ke efek map dan dashboard** (hazard polygon injection, sidebar XAI reasoning, health score animation), arsitektur `useDemoState` diangkat ke level `DashboardClient`, ikon emoji diganti dengan Lucide SVG sesuai aturan AGENTS.md, dan timer auto-advance dioptimalkan untuk skenario presentasi hackathon.

---

## 🔍 Root Cause & Problem Analysis

### 1. GuidedDemoPanel Card Tidak Bisa Diinteraksi (Click Nembus ke Mapbox)

**Lokasi Persis:** `frontend/components/dashboard/DashboardClient.tsx` baris 952

Container overlay floating di atas kanvas peta menggunakan `pointer-events-none` pada seluruh div-nya:

```tsx
// Baris 952 — mematikan SEMUA event klik di dalam div ini, termasuk GuidedDemoPanel
<div className="absolute inset-0 w-full h-full pointer-events-none z-10">
  <CrisisSimulatorBar ... />   // ← diberikan pointer-events-auto secara internal
  <GuidedDemoPanel ... />      // ← TIDAK pernah mendapat pointer-events-auto! BUG!
  <footer className="... pointer-events-auto"> // ← bottombar sudah fix manual
```

`GuidedDemoPanel` me-render sebagai `<div className="fixed bottom-6 right-... z-50 ...">` — menggunakan posisi `fixed`. Namun, `pointer-events: none` **diwariskan oleh fixed child elements** dalam spesifikasi CSS. Wrapper div terluar `GuidedDemoPanel.tsx` **tidak pernah mengaktifkan kembali** `pointer-events-auto`. Akibatnya seluruh klik di dalam card (tombol `⏭ Next Step`, `▶ Auto`, filter sensor, tombol `✕` close) tidak terdeteksi browser dan tembus ke kanvas WebGL Mapbox di belakangnya.

**Bukti tambahan:** Setiap button di dalam `GuidedDemoPanel.tsx` (baris 130, 247, 272, 290, 301) sudah memiliki `e.stopPropagation()` — ini langkah defensif yang benar, namun `stopPropagation()` tidak berguna ketika event tidak pernah di-dispatch karena `pointer-events: none` menghentikan hit-testing di level browser, sebelum JavaScript dieksekusi.

---

### 2. Tombol `▶ Run Demo` Menggunakan DOM Selector Hack yang Rapuh

**Lokasi Persis:** `frontend/components/dashboard/DashboardClient.tsx` baris 1012–1016

```tsx
// DOM hack yang bergantung pada struktur DOM statis
onClick={() => {
  const demoBtn = document.querySelector('button[data-demo-trigger="true"]') as HTMLButtonElement | null;
  if (demoBtn) { demoBtn.click(); }  // klik programatik ke tombol tersembunyi
}}
```

Pattern ini akan gagal jika: (a) `GuidedDemoPanel` berada di dalam `pointer-events-none` container (sudah terjadi), (b) `GuidedDemoPanel` di-unmount secara kondisional, atau (c) ada dua panel. Pola yang benar adalah lifting state ke level parent.

---

### 3. Stage Transitions Tidak Terhubung ke Map / Dashboard (Stage 0–2 Mati Total)

**Lokasi Persis:** `frontend/hooks/useDemoState.ts` baris 134

```ts
// onCrisisReady hanya di-fire pada stage >= 3 — terlambat!
if (stage >= 3 && onCrisisReady && notifiedKeyRef.current !== notifyKey) {
  onCrisisReady(filtered);
}
```

Stage 0, 1, dan 2 tidak memicu side-effect apapun ke peta, Left Sidebar health metrics, maupun Right Sidebar XAI panel. Tiga stage pertama demo terasa "mati" — tidak ada perubahan visual di dashboard.

---

### 4. Ikon Emoji di Stage 0 Source Chips Melanggar Aturan AGENTS.md

**Lokasi Persis:** `frontend/components/demo/GuidedDemoPanel.tsx` baris 97–103

```tsx
{ name: 'BMKG', icon: '🌩️', ... },   // HARAM per AGENTS.md
{ name: 'NASA', icon: '🛰️', ... },   // HARAM per AGENTS.md
{ name: 'AISstream', icon: '⚓', ... } // HARAM per AGENTS.md
```

Aturan AGENTS.md: *"❌ HARAM memakai Emoji sebagai ikon (wajib SVG dari Lucide/Heroicons)"*.

---

### 5. Timer Auto-Advance Terlalu Lambat (15 Detik per Stage)

**Lokasi Persis:** `frontend/hooks/useDemoState.ts` baris 281

```ts
}, 15000); // 15 seconds per stage — terlalu lambat untuk demo 5 stage
```

Untuk presentasi hackathon dengan 5 stage, 15 detik × 5 = 75 detik terlalu lambat. Target ideal: **8 detik per stage** untuk total ±40 detik demo otomatis yang engaging.

---

## 🛠️ Detailed Technical Deliverables

---

### DELIVERABLE 1 — Fix `pointer-events` CSS Inheritance Bug pada GuidedDemoPanel

**File:** `frontend/components/demo/GuidedDemoPanel.tsx` [MODIFY]

**Tujuan:** Membuat card stepper `GuidedDemoPanel` 100% dapat diklik tanpa mengganggu perilaku pass-through klik ke Mapbox untuk area kosong di luar card.

**Perubahan Kode — Baris 116 (outer wrapper div card aktif):**

```diff
- <div className={`fixed bottom-6 ${dynamicRightOffset} z-50 w-96 rounded-2xl border border-slate-800 bg-slate-950/90 backdrop-blur-xl p-5 text-slate-100 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300 transition-all`}>
+ <div
+   className={`fixed bottom-6 ${dynamicRightOffset} z-50 w-96 rounded-2xl border border-slate-800 bg-slate-950/90 backdrop-blur-xl p-5 text-slate-100 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300 transition-all pointer-events-auto`}
+   onMouseDown={(e) => e.stopPropagation()}
+   onPointerDown={(e) => e.stopPropagation()}
+ >
```

**Mengapa `onPointerDown` juga diperlukan?**  
Mapbox GL JS menangkap interaksi via event `pointerdown` pada canvas WebGL-nya. `stopPropagation()` pada `mousedown` saja tidak mencegah `pointerdown` dari bubbling ke Mapbox di semua browser. Keduanya harus dihentikan untuk mencegah Mapbox drag/zoom saat user mengklik di dalam card stepper.

---

### DELIVERABLE 2 — Lift `useDemoState` Hook ke DashboardClient & Hapus DOM Selector Hack

**Files:** `frontend/components/dashboard/DashboardClient.tsx` [MODIFY] & `frontend/components/demo/GuidedDemoPanel.tsx` [MODIFY]

**Tujuan:** Pindahkan ownership `useDemoState` hook dari `GuidedDemoPanel` ke `DashboardClient` agar state demo bisa mengontrol seluruh dashboard (map, sidebar, health score), bukan hanya stepper UI card.

#### 2a. Import `useDemoState` di `DashboardClient.tsx`

```tsx
import { useDemoState } from '@/hooks/useDemoState';
```

#### 2b. Instansiasi hook di body `DashboardClient`

Tambahkan setelah deklarasi state lainnya (sekitar baris 183):

```tsx
// Demo Engine State — lifted to DashboardClient level (Phase 23)
const demoState = useDemoState(handleCrisisReadyFromDemo);
```

> **Catatan:** `handleCrisisReadyFromDemo` sudah ada di `DashboardClient` baris 511. Langsung dapat digunakan sebagai callback `onCrisisReady`.

#### 2c. Update Props Interface `GuidedDemoPanel.tsx`

Ubah menjadi pure presentational component — hapus `useDemoState` dari dalam komponen ini:

```tsx
interface GuidedDemoPanelProps {
  // State dari DashboardClient (via demoState.*)
  stage: number;
  isRunning: boolean;
  isReplay: boolean;
  crisisId: string | null;
  confidence: number;
  summary: string;
  isAuto: boolean;
  // Callbacks dari DashboardClient
  onStart: () => void;
  onAdvance: () => void;
  onToggleAuto: () => void;
  onReset: () => void;
  onSaveReplay: () => void;
  // Layout
  isSidebarOpen?: boolean;
}
```

Hapus: `import { useDemoState } from '@/hooks/useDemoState';` dari `GuidedDemoPanel.tsx`.  
Hapus: blok destructuring `const { stage, isRunning, ... } = useDemoState(onCrisisReady);` di baris 14–27.  
Ganti semua referensi ke nilai hook dengan props yang diterima.

#### 2d. Update pemanggilan `<GuidedDemoPanel>` di `DashboardClient.tsx`

```tsx
{/* Guided Presentation Demo Panel */}
<GuidedDemoPanel
  stage={demoState.stage}
  isRunning={demoState.isRunning}
  isReplay={demoState.isReplay}
  crisisId={demoState.crisisId}
  confidence={demoState.confidence}
  summary={demoState.summary}
  isAuto={demoState.isAuto}
  onStart={() => demoState.start({ mock_agents: false, offline: false })}
  onAdvance={demoState.advance}
  onToggleAuto={demoState.toggleAuto}
  onReset={demoState.reset}
  onSaveReplay={demoState.saveReplay}
  isSidebarOpen={isSidebarOpen && !!selectedCrisis}
/>
```

#### 2e. Ganti DOM Hack di Bottombar `▶ Run Demo` button (baris 1010–1021)

```diff
- onClick={() => {
-   const demoBtn = document.querySelector('button[data-demo-trigger="true"]') as HTMLButtonElement | null;
-   if (demoBtn) { demoBtn.click(); }
- }}
+ onClick={() => demoState.start({ mock_agents: false, offline: false })}
```

---

### DELIVERABLE 3 — Stage-Wired Live Dashboard Effects (Map + Sidebar per Stage)

**File:** `frontend/components/dashboard/DashboardClient.tsx` [MODIFY]

**Tujuan:** Setiap transisi stage demo memicu efek visual spesifik pada peta dan dashboard — membuat demo terasa "hidup" sejak Stage 0.

Tambahkan `useEffect` baru setelah deklarasi `demoState`:

```tsx
// Phase 23: Stage-Wired Demo Effects — map & dashboard react per stage
useEffect(() => {
  if (!demoState.isRunning) return;

  switch (demoState.stage) {
    case 0: {
      // Stage 0: Baseline Data Ingestion — peta bersih, rute normal Belawan-Medan
      setSimulatedShockwave(null);
      setSelectedCrisis(null);
      setIsSidebarOpen(false);
      setSelectedOriginNode('belawan');
      setSelectedDestNode('medan');
      break;
    }

    case 1: {
      // Stage 1: Agent Swarm Analyzing — rute baseline Belawan-Siantar aktif
      setSelectedOriginNode('belawan');
      setSelectedDestNode('siantar');
      // updateBaselineMapboxRoute auto-trigger via useEffect yang sudah ada
      break;
    }

    case 2: {
      // Stage 2: Consensus Gate — injeksi hazard shockwave flood Lubuk Pakam
      setSimulatedShockwave({
        center: [98.87, 3.56], // Koridor banjir Lubuk Pakam
        radiusKm: 15,
        hazardType: 'flood',
      });
      // Rute baseline sekarang tampak terblokir oleh zona merah/cyan di peta
      break;
    }

    case 3: {
      // Stage 3: Crisis Validated — handleCrisisReadyFromDemo auto-dipanggil useDemoState
      setIsSidebarOpen(true);
      setActiveTab('Evidence');
      break;
    }

    case 4: {
      // Stage 4: WhatsApp Dispatch Complete
      setActiveTab('Mitigation');
      setToast({
        message: '✅ WhatsApp Alert Delivered — Armada Berhasil Dialihkan ke Rute Aman',
        type: 'success',
      });
      break;
    }
  }
}, [demoState.stage, demoState.isRunning]);
```

---

### DELIVERABLE 4 — UI Polish: Lucide SVG Icons, Stage Content & Stage 4 Button Fix

**File:** `frontend/components/demo/GuidedDemoPanel.tsx` [MODIFY]

#### 4a. Ganti Emoji dengan Lucide SVG Icons (Stage 0 Source Chips)

Tambahkan import Lucide (baris 1–2):

```tsx
import { CloudLightning, Car, Satellite, Anchor, TrendingUp, MessageSquare, CheckCircle2 } from 'lucide-react';
```

Ganti array `sources`:

```tsx
const sources = [
  { name: 'BMKG',      Icon: CloudLightning, color: 'border-yellow-500/30 text-yellow-400 bg-yellow-950/20' },
  { name: 'TomTom',    Icon: Car,            color: 'border-orange-500/30 text-orange-400 bg-orange-950/20' },
  { name: 'NASA',      Icon: Satellite,      color: 'border-red-500/30 text-red-400 bg-red-950/20' },
  { name: 'AISstream', Icon: Anchor,         color: 'border-blue-500/30 text-blue-400 bg-blue-950/20' },
  { name: 'PIHPS',     Icon: TrendingUp,     color: 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20' },
  { name: 'Social',    Icon: MessageSquare,  color: 'border-purple-500/30 text-purple-400 bg-purple-950/20' },
];
```

Update render chip source (Stage 0) — ganti `<span>{src.icon}</span>` dengan `<src.Icon className="w-3.5 h-3.5" />`.

#### 4b. Ganti Emoji Tick di Stage 4 dengan `CheckCircle2` Lucide

```diff
- <div className="w-9 h-9 rounded-full bg-emerald-950/50 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-lg shadow-lg shadow-emerald-500/10">
-   ✓
- </div>
+ <CheckCircle2 className="w-9 h-9 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
```

#### 4c. Ganti `💾 Save Replay` dengan `↺ Restart Demo` di Stage 4

```diff
- <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveReplay(); }}
-   className="flex-1 py-2 rounded-xl text-xs font-bold border border-slate-700 bg-slate-900 ...">
-   💾 Save Replay
- </button>
+ <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onStart(); }}
+   className="flex-1 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 active:scale-95 transition duration-200 shadow-md shadow-cyan-500/20 cursor-pointer">
+   ↺ Restart Demo
+ </button>
```

#### 4d. Update `stageExplainers` ke Bahasa Indonesia

```tsx
const stageExplainers = [
  'PetaNadi menarik data real-time dari 6 sumber: cuaca (BMKG), kemacetan (TomTom), peta kebakaran (NASA), antrian pelabuhan (AISstream), harga pangan (PIHPS), dan laporan media sosial.',
  '6 agen AI memproses data secara paralel. Setiap agen ahli di satu domain: pemetaan bahaya, optimasi rute, proyeksi ekonomi, dan dukungan keputusan krisis.',
  'Consensus Gate mengevaluasi skor kepercayaan dari semua agen. Krisis hanya divalidasi ketika skor tertimbang melebihi 85% — mencegah alarm palsu terhadap armada logistik.',
  'Penutupan Koridor Belawan tervalidasi. Dashboard menampilkan zona bahaya, rute pengalihan aman via cuOpt GPU, dan proyeksi dampak ekonomi terhadap harga komoditas.',
  'Notifikasi WhatsApp telah dikirim ke operator logistik dengan ringkasan krisis, rute pengalihan NVIDIA cuOpt, dan deep-link kembali ke dashboard PetaNadi.',
];
```

---

### DELIVERABLE 5 — Auto-Advance Timer Optimization & Planning Docs Sync

**File:** `frontend/hooks/useDemoState.ts` [MODIFY]

**Perubahan timer baris 281:**

```diff
- }, 15000); // 15 seconds per stage
+ }, 8000);  // 8 seconds per stage — optimal untuk presentasi demo hackathon
```

**Files Planning yang perlu dibuat/diperbarui:**
- `.planning/phases/phase-23/PLAN.md` [NEW] — Dokumen ini
- `.planning/phases/phase-23/LEARNINGS.md` [NEW]
- `.planning/phases/phase-23/walkthrough.md` [NEW]
- `.planning/ROADMAP.md` [MODIFY] — Tambah entry Phase 23
- `.planning/STATE.md` [MODIFY] — Sync state Phase 23

---

## 📁 File Changes Summary

| File | Action | Scope |
|---|---|---|
| `frontend/components/demo/GuidedDemoPanel.tsx` | MODIFY | Fix `pointer-events-auto`, refactor ke pure presentational props, Lucide SVG icons, stage explainers BHS ID, stage 4 Restart button |
| `frontend/components/dashboard/DashboardClient.tsx` | MODIFY | Lift `useDemoState` hook, hapus DOM selector hack, tambah stage-wired `useEffect`, teruskan props ke `GuidedDemoPanel` |
| `frontend/hooks/useDemoState.ts` | MODIFY | Timer interval `15000ms → 8000ms` |
| `.planning/phases/phase-23/PLAN.md` | NEW | Dokumen perencanaan Phase 23 (file ini) |
| `.planning/phases/phase-23/LEARNINGS.md` | NEW | Dokumen pembelajaran Phase 23 |
| `.planning/phases/phase-23/walkthrough.md` | NEW | Dokumen walkthrough Phase 23 |
| `.planning/ROADMAP.md` | MODIFY | Entry Phase 23 ditambahkan |
| `.planning/STATE.md` | MODIFY | State proyek disinkronkan ke Phase 23 |

---

## 🧪 Detailed Verification Plan

### 1. Build Verification

```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk npm --prefix frontend run build
```

Target: `✓ Compiled successfully` tanpa TypeScript error.

### 2. Backend Syntax Check

```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk python -c "import ast, pathlib; [ast.parse(f.read_text()) for f in pathlib.Path('backend').rglob('*.py')]; print('ALL PYTHON FILES AST PARSE OK')"
```

### 3. Visual & Interactive Browser Verification

| Test Case | Expected Result |
|---|---|
| Klik `▶ Run Demo` di bottombar footer | `GuidedDemoPanel` stepper card langsung muncul di kanan bawah |
| Klik `⏭ Next Step` di dalam card | Stage maju (0 → 1 → 2 → 3 → 4) **tanpa** peta terpan/drag ke Mapbox |
| Klik `▶ Auto` di dalam card | Auto-advance tiap 8 detik, map & sidebar update per stage |
| Demo Stage 2 aktif | Zona bahaya flood shockwave muncul di peta Mapbox (area Lubuk Pakam) |
| Demo Stage 3 aktif | Right Sidebar terbuka otomatis dengan tab `Evidence` + XAI CoT reasoning |
| Demo Stage 4 aktif | Tab Mitigation aktif + Toast `✅ WhatsApp Alert Delivered — Armada Berhasil Dialihkan` |
| Klik `↺ Restart Demo` di Stage 4 | Demo reset ke Stage 0, peta bersih dari semua overlay bencana |
| Source chips Stage 0 | Lucide SVG icons (CloudLightning, Car, Satellite, Anchor, TrendingUp, MessageSquare) |
| Klik `✕` close button card | Card hilang, demo direset ke initial state |
