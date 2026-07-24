# Key Technical Learnings — Phase 25: Animated Multi-Modal Fleet Layer & Dynamic Vehicle Trajectories

Dokumen catatan pembelajaran teknis utama (*Key Technical Learnings*) dari pengerjaan **Phase 25**.

---

## 💡 Key Technical Learnings & Best Practices

### 1. The Danger of CSS `transition-all` on JS-Driven Mapbox HTML Markers
* **Pelajaran Utamanya:** Ketika menggerakkan posisi HTML Marker secara langsung via JavaScript (`marker.setLngLat()`) di Mapbox GL JS, menyertakan kelas CSS Tailwind `transition-all` pada elemen marker (`className = "... transition-all transform ..."`):
  ```tsx
  // ❌ SALAH: transition-all memaksa CSS easing pada properti transform
  el.className = `cursor-pointer z-[25] transition-all transform ...`;
  ```
  akan memaksa browser menerapkan *transition easing* (misalnya durasi 150ms) pada properti `transform: translate3d(...)` yang di-mutasi oleh Mapbox. Karena interval JavaScript (50ms/100ms) berjalan lebih cepat daripada durasi transisi CSS (150ms), mesin CSS browser secara konstan menginterupsi transisi di tengah jalan. Hal ini mengakibatkan efek **tarik-menarik (*rubber-banding*)**, kejang-kejang (*jitter*), dan lompatan visual yang terlihat seperti *glitch*.
* **Solusinya:** Hapus `transition-all` atau kunci transisi CSS hanya pada properti warna/shadow, sehingga transformasi koordinat `transform` dieksekusi secara instan dan presisi oleh Mapbox:
  ```tsx
  // ✅ BENAR: Hapus transition-all agar setLngLat() diproses instan tanpa konflik CSS easing
  el.className = `cursor-pointer z-[25] flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold shadow-2xl border backdrop-blur-md ${colorClass}`;
  el.style.zIndex = '25';
  el.style.willChange = 'transform';
  ```

---

### 2. Segment-Index Scaling vs Distance-Proportional Path Interpolation
* **Pelajaran Utamanya:** Menginterpolasi koordinat di sepanjang rute *polyline* multi-titik berdasarkan indeks segmen linier (`scaled = progress * totalSegments`) mengasumsikan setiap segmen memiliki panjang jarak yang sama. Padahal dalam jaringan jalan riil, satu segmen dapat berjarak 100 meter (gerbang pelabuhan) dan segmen berikutnya berjarak 25 kilometer (jalan tol). Akibatnya, kendaraan bergerak dengan kecepatan yang sangat tidak stabil—teleportasi sangat cepat di segmen panjang dan melambat di segmen pendek.
* **Solusinya:** Gunakan **Interpolasi Berdasarkan Jarak Geografis** (`interpolatePositionByDistance`), yang menghitung total jarak kumulatif seluruh segmen *polyline* sehingga nilai `progress` `0.0` s/d `1.0` mengukur jarak absolut dalam km/m. Hal ini menjamin nilai `speed_kmh` terkonversi menjadi kecepatan linier yang konsisten di seluruh rute:
  ```ts
  function interpolatePositionByDistance(path: [number, number][], progress: number): [number, number] {
    if (path.length < 2) return path[0];

    let totalDist = 0;
    const segDistances: number[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const dx = path[i + 1][0] - path[i][0];
      const dy = path[i + 1][1] - path[i][1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      segDistances.push(dist);
      totalDist += dist;
    }

    if (totalDist === 0) return path[0];

    const normalizedProgress = ((progress % 1.0) + 1.0) % 1.0;
    const targetDist = normalizedProgress * totalDist;
    let accumulated = 0;

    for (let i = 0; i < segDistances.length; i++) {
      const segDist = segDistances[i];
      if (accumulated + segDist >= targetDist) {
        const segProgress = segDist > 0 ? (targetDist - accumulated) / segDist : 0;
        const [lon1, lat1] = path[i];
        const [lon2, lat2] = path[i + 1];
        return [lon1 + (lon2 - lon1) * segProgress, lat1 + (lat2 - lat1) * segProgress];
      }
      accumulated += segDist;
    }

    return path[path.length - 1];
  }
  ```

---

### 3. Avoiding 8-Second Polling State Thrashing via Immutability Diffing
* **Pelajaran Utamanya:** Ketika hook polling (seperti `useFleetVehicles`) memanggil endpoint backend setiap 8 detik dan me-refresh state React `setVehicles(data.vehicles)`, mengembalikan objek array baru meskipun isinya identik akan memicu re-render dan eksekusi `useEffect` pada komponen peta. Jika `useEffect` menghapus dan membuat ulang seluruh marker DOM HTML (`fleetMarkersRef.current.forEach(m => m.remove())`), peta akan mengalami **kedipan/flicker visual setiap 8 detik** dan posisi animasi kendaraan ter-reset secara mendadak.
* **Solusinya:** Gunakan *signature diffing* (`JSON.stringify` struktur esensial ID, status, & path) sebelum memanggil `setVehicles`. Jika payload backend belum berubah, kembalikan referensi state sebelumnya (`prev`) agar React tidak memicu re-render dan `useEffect` pada komponen peta tidak dieksekusi ulang:
  ```ts
  setVehicles((prev) => {
    const prevSignature = JSON.stringify(prev.map((v) => ({ id: v.vehicle_id, s: v.status, path: v.path })));
    const newSignature = JSON.stringify(data.vehicles.map((v) => ({ id: v.vehicle_id, s: v.status, path: v.path })));
    return prevSignature === newSignature ? prev : data.vehicles;
  });
  ```

---

### 4. Zero Emojis & Strict Spatial Z-Index Matrix Alignment
* **Pelajaran Utamanya:** Mematuhi aturan *Anti-AI-Slop* dari `design-system/MASTER.md` mewajibkan penggunaan ikon SVG murni (Lucide-compatible paths) alih-alih emoji mentah. Selain itu, penataan z-index harus dikelompokkan secara hierarkis agar marker armada tidak menutupi informasi hub penting:
  ```
  z-[30]: Hub Node Markers (Belawan ⚓ / Medan 🏙️)
  z-[25]: Fleet Vehicle Markers (Kapal, Pesawat, Truk) <--- PHASE 25 LAYER
  z-[20]: Route ETA Floating Badges
  z-[15]: Weather Regional Badges
  ```

---

## 🛠️ Summary of Created and Refactored Files

| File Path | Functional Role |
| :--- | :--- |
| [`frontend/lib/types.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/types.ts) | Penambahan tipe data `VehicleModality` dan interface `FleetVehicle`. |
| [`backend/app/routers/vehicles_router.py`](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/vehicles_router.py) | Endpoint REST `GET /api/v1/fleet/vehicles` menggabungkan live AISstream + 11 armada sintetis. |
| [`backend/app/main.py`](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/main.py) | Registrasi `vehicles_router.router` pada FastAPI entry point. |
| [`frontend/lib/api.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/api.ts) | Penambahan method `api.fleet.vehicles()` untuk mengonsumsi API backend. |
| [`frontend/hooks/useFleetVehicles.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useFleetVehicles.ts) | Hook polling 8s dengan *signature diffing* & *fallback fixture* offline 100%. |
| [`frontend/components/dashboard/DashboardClient.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx) | Pemasangan state `activeFleet` & `demoStage` ke komponen `CrisisMap`. |
| [`frontend/components/map/CrisisMap.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/CrisisMap.tsx) | Engine animasi kendaraan 20 FPS (50ms) dengan `interpolatePositionByDistance`, tanpa konflik `transition-all`, & z-index `25`. |
| [`frontend/components/sidebar/EvidenceTab.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/sidebar/EvidenceTab.tsx) | Pembersihan kartu CCTV dari *Sensory Evidence Chain* agar data realistis & bersih. |
| [`frontend/components/sidebar/MitigationTab.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/sidebar/MitigationTab.tsx) | Pembaruan label input sensor dari CCTV menjadi `AISstream Maritime`. |
