# Research & Technical Architecture: Phase 59 - E2E Audit Remediation & Visual Lockdowns

**Date:** 14 Oktober 2026  
**Reference File:** [PILOT_BUGS_AND_E2E_AUDIT_REPORT.md](file:///c:/Farras/DIGDAYA/peta-nadi/PILOT_BUGS_AND_E2E_AUDIT_REPORT.md)  
**Status:** COMPLETE & VERIFIED 🔍  

---

## 1. Deep Technical Diagnosis of Discovered Anomalies

### 1.1 Bug 1: Banner Pointer-Event Interception
* **File:** `frontend/components/dashboard/GuestEvaluationBanner.tsx` (lines 38 - 42)
* **Code State:**
  ```tsx
  <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[550] w-[95%] max-w-3xl pointer-events-auto">
    <div className="mt-2 bg-[#0c1017] border border-amber-500/40 ...">
  ```
* **Mechanics:** The parent container is `w-[95%] max-w-3xl` with `pointer-events-auto`. Because the top HUD strip (`TopNavTelemetry.tsx`) is positioned at `top-3.5` inside the main layout below the 64px header, the invisible bounds of this banner span across horizontal coordinates that physically cover `TopNavTelemetry`. When Playwright or users click `HITL REVIEW`, `RUTE`, or `BMKG`, the pointer event is captured by the banner container, causing a 30-second click timeout.
* **Remediation Pattern:**
  Make the outer container `pointer-events-none` and attach `pointer-events-auto` strictly to the inner card:
  ```tsx
  <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[550] w-[95%] max-w-3xl pointer-events-none">
    <div className="mt-2 bg-[#0c1017] border border-amber-500/40 ... pointer-events-auto">
  ```
  Adjust vertical clearance to ensure it never overlaps the center HUD.

---

### 1.2 Bug 2: Missing Profile View in AuthModal for Authenticated Sessions
* **File:** `frontend/components/auth/AuthModal.tsx` (lines 40 - 75)
* **Code State:**
  ```tsx
  const [activeTab, setActiveTab] = useState<'persona' | 'password' | 'magic'>('password');
  ```
  `AuthModal` lacks a view for `isAuthenticated === true`. Clicking the top role badge opens the password form again.
* **Remediation Pattern:**
  Introduce an `'account'` tab:
  ```tsx
  const [activeTab, setActiveTab] = useState<'account' | 'persona' | 'password' | 'magic'>(
    isAuthenticated ? 'account' : 'password'
  );
  ```
  When `activeTab === 'account'` and `isAuthenticated === true`, render an enterprise User Profile Card:
  - Header with User Avatar & Role Badge (DISPATCHER: Cyan, REGULATOR: Amber, GUEST: Emerald)
  - Full Name / Display Name (`user?.name || user?.email`)
  - Email Address (`user?.email`)
  - Organization / Enterprise Tenant (`user?.company_id || user?.org_name || 'Bapanas'`)
  - Active RBAC Permissions list (e.g. `fleet:read`, `fleet:write`, `routes:plan`)
  - Action Button: "Keluar dari Sesi (Logout)" with red border, calling `logout()`.

---

### 1.3 Bug 3: Persona Switcher Access for Corporate Accounts
* **File:** `frontend/components/auth/AuthModal.tsx` (lines 61 - 76)
* **Code State:**
  ```tsx
  const handlePersonaSelect = async (targetRole: UserRole) => {
    if (!isAuthenticated) { ... }
    const res = await switchRole(targetRole);
  ```
  Any authenticated corporate account can change their role on the fly.
* **Remediation Pattern:**
  Check whether the user is in an evaluator/sandbox account:
  ```tsx
  const isSandboxAccount = user?.is_offline_guest || user?.email?.endsWith('@kompetisi-lrip.id') || user?.company_id === 'demo_sandbox';
  ```
  If `!isSandboxAccount`, disable the persona buttons and show:
  `Peran operasional Anda dikelola secara terpusat oleh instansi/perusahaan resmi. Peralihan peran cepat hanya tersedia dalam Mode Evaluasi Kompetisi (Sandbox).`

---

### 1.4 Bug 4: Visual Lock Badges for Non-Dispatcher Roles
* **Files:**
  - `frontend/components/dashboard/DashboardClient.tsx` (lines 1346 - 1360)
  - `frontend/components/fleet/FleetOnboardingModal.tsx` (lines 180 - 188)
  - `frontend/components/sidebar/MitigationTab.tsx` (lines 275 - 305)
* **Mechanics:** Non-dispatcher roles (GUEST and REGULATOR) see unlocked buttons. When clicking "Onboard Armada", they fill out forms and then receive a 403 API failure.
* **Remediation Pattern:**
  1. In `DashboardClient.tsx`: If `role !== 'DISPATCHER'`, render a lock icon (`Lock` from Lucide) and a `[Khusus Dispatcher]` badge next to `Onboard Armada`. Clicking it triggers a warning toast: `Fitur Onboard Armada dan Unggah Manifest dibatasi khusus untuk peran DISPATCHER.`
  2. In `FleetOnboardingModal.tsx`:
     ```tsx
     if (userRole !== 'DISPATCHER') {
       setFeedback({
         type: 'error',
         message: 'Akses ditolak: Pendaftaran armada hanya dapat dilakukan oleh peran DISPATCHER.'
       });
       return;
     }
     ```
  3. In `MitigationTab.tsx`:
     - GUEST role: Action button labeled `Simpan Rencana (Sandbox Lokal)`
     - REGULATOR role: Action button labeled `Tinjau Kebijakan (Otoritas Regulasi)` (disabled / read-only)
     - DISPATCHER role: Action button labeled `Terapkan Rute Koridor` (full operational commit)

---

### 1.5 Bug 5: Run Demo Route Geometry and Simpul Coordinate Mismatch
* **Files:**
  - `frontend/components/dashboard/DashboardClient.tsx` (lines 212 - 268)
  - `frontend/hooks/useDemoState.ts` (lines 195 - 207)
  - `backend/app/routers/demo_router.py` (lines 54 - 60)
  - `data/fixtures/mock_crisis_state.json` (lines 74 - 84)
* **Mechanics:**
  - `buildHazardBypassRoute` generates a crude 4-point straight polygon `[origin, bend1, bend2, destination]`.
  - Fallback coordinates in `useDemoState.ts` and `mock_crisis_state.json` end at `{ lat: 2.9595, lon: 99.0687 }` (Lake Toba / Parapat), which is 60 km south of Tebing Tinggi (`3.3285, 99.1625`).
  - `StartDemoPayload` in backend lacks `origin` and `destination` fields.
* **Remediation Pattern:**
  1. Verified Pan-Sumatra Coastal Bypass corridor coordinates for Belawan -> Tebing Tinggi:
     ```ts
     const PANTAI_CERMIN_BYPASS_COORDINATES: [number, number][] = [
       [98.6776, 3.7922], // Pelabuhan Belawan
       [98.6850, 3.7250], // Marelan / Tol Belmera
       [98.6920, 3.6550], // Simpang Tanjung Mulia
       [98.7450, 3.6300], // Percut Sei Tuan
       [98.8100, 3.6150], // Batang Kuis
       [98.9800, 3.6350], // Pantai Cermin Coastal Bypass
       [99.0700, 3.5200], // Teluk Mengkudu / Matapao
       [99.1200, 3.4400], // Sei Rampah
       [99.1625, 3.3285], // Simpang Susun Tol Tebing Tinggi
     ];
     ```
  2. Strip the trailing Lake Toba waypoints from `mock_crisis_state.json` and `useDemoState.ts`.
  3. Update `StartDemoPayload` in `backend/app/routers/demo_router.py`:
     ```python
     class StartDemoPayload(BaseModel):
         mock_agents: Optional[bool] = None
         offline: Optional[bool] = None
         scenario: Optional[str] = None
         origin: Optional[str] = None
         destination: Optional[str] = None
     ```

---

### 1.6 Bug 6: Econometric Intelligence Data Piping in Demo State
* **Files:** `frontend/hooks/useDemoState.ts` (lines 160 - 175), `frontend/components/sidebar/EconomicTab.tsx`
* **Mechanics:** Client fallback sets `inflation_forecast: null` due to mock purge, causing EconomicTab to display "Proyeksi inflasi belum diterbitkan".
* **Remediation Pattern:**
  Bind the backend econometric findings into the demo fallback state:
  ```ts
  inflation_forecast: {
    headline_inflation_pct: 15.0,
    spoilage_hedging_savings_idr: 1045284,
    time_horizon_hours: 48,
    affected_commodities: [
      { name: 'Minyak Goreng', baseline_price: 15800, projected_price: 18170, increase_pct: 15.0 },
      { name: 'Cabai Merah', baseline_price: 42000, projected_price: 47250, increase_pct: 12.5 }
    ],
    source: '[Simulasi Model Ekonometrika]'
  }
  ```

---

### 1.7 Bug 7: Fleet Simulation Toggle Honest Filtering
* **File:** `frontend/hooks/useFleetVehicles.ts` (lines 234 - 249)
* **Mechanics:**
  `res.vehicles.length > 0` is always true because backend returns 45 baseline units. The branch checking `isSimulationMode` is only reached on failure.
* **Remediation Pattern:**
  When `isSimulationMode === false`, filter the vehicle list:
  ```ts
  if (res.vehicles && res.vehicles.length > 0) {
    if (!isSimulationMode) {
      const realOnly = res.vehicles.filter((v: FleetVehicle) =>
        Boolean(v.is_custom) ||
        v.telemetry_source === 'CUSTOM_DISPATCHER' ||
        v.telemetry_source === 'TMS_GPS_WEBHOOK'
      );
      setVehicles(realOnly);
    } else {
      setVehicles(res.vehicles);
    }
    setError(null);
  }
  ```

---

### 1.8 Bug 8: Demo Remote 404 Polling Loop
* **File:** `frontend/app/demo-remote/page.tsx` (lines 34 - 50)
* **Mechanics:** Polling interval blindly fetches `/api/v1/demo/belawan-demo-offline/status` every 2000ms. If the backend in-memory store doesn't have the crisis, it produces a flood of 404 errors.
* **Remediation Pattern:**
  Track consecutive 404 responses. If status is 404, stop polling and render a clean informative banner:
  `Sesi demonstrasi belum aktif. Silakan jalankan 'Run Demo' dari dashboard utama untuk menghubungkan pengendali jarak jauh.`

---

### 1.9 Bug 9: Duplicate Toast in SimulationSection Deploy
* **Files:**
  - `frontend/components/dashboard/SimulationSection.tsx` (line 104)
  - `frontend/components/dashboard/DashboardClient.tsx` (lines 610 - 620)
* **Mechanics:** `SimulationSection` calls its internal toast dispatch simultaneously with the parent callback `onDeployActionPlan`.
* **Remediation Pattern:**
  Remove the local toast call in `SimulationSection.tsx` and allow `onDeployActionPlan` to be the single source of truth for toast feedback.
