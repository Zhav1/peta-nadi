# LEARNINGS — Phase 18: Map UI/UX Refactoring, Unified Telemetry HUD & Localized Weather Animations

Dokumen ini mencatat pembelajaran tata letak WebGL, penanganan tabrakan spasial (spatial collision), interaktivitas pointer event pass-through, dan migrasi dataset statis ke backend API.

---

## 1. WebGL Canvas Delay Blinking & GPU-Accelerated Overlays

### Masalah
- Melakukan resize dinamis pada container Mapbox (misal mengubah lebar sidebar `aside` dari `w-80` ke `w-0` dalam flex container) memaksa WebGL untuk terus mengalokasikan ulang buffer rendering canvas setiap frame. Ini memicu kedipan hitam (black delay repaint) yang mengganggu visual.

### Solusi Teknis
1. **Full-Bleed Map Canvas**: Pasang Mapbox GL JS container dalam posisi full-bleed (`absolute inset-0 w-full h-full z-0`). Canvas peta tetap pada ukuran static viewport sehingga tidak memicu realokasi buffer WebGL.
2. **GPU transform Overlay**: Terapkan GPU-accelerated CSS `transform: translate-x` (`translate-x-0` vs `-translate-x-full`) pada sidebar di atas canvas. Ini menghasilkan animasi toggle sidebar yang sangat mulus (60 FPS) tanpa kedipan canvas.

---

## 2. Interactive Map click pass-through & pointer events

### Masalah
- Setelah memindahkan Mapbox canvas ke absolute background (`z-0`), peta menjadi tidak responsif terhadap gesture click, drag, atau zoom. Semua interaksi tertutup oleh elemen di atasnya.

### Solusi Teknis
1. **Pointer-Events-None Container**: Berikan class `pointer-events-none` pada pembungkus utama widget overlay (`div.absolute.inset-0.z-10`) agar semua event interaksi klik langsung meluncur bebas (pass-through) ke canvas Mapbox di bawahnya.
2. **Pointer-Events-Auto Controls**: Berikan class `pointer-events-auto` secara spesifik pada tombol/widget interaktif (Simulator bar, Guided demo, timeline footer, dan sidebar) agar controls tersebut tetap dapat diklik oleh pengguna.

---

## 3. Spatial Node Collision & Contextual Offsets

### Masalah
- Weather regional overlay badges sebelumnya menimpa (overlap) kota/hub logistik utama (seperti Hub Logistik Binjai, Hub Utama Medan, Pelabuhan Belawan) sehingga sulit diklik dan merusak visual.

### Solusi Teknis
1. **Contextual Coordinate Offsets**: Geser jangkar titik koordinat weather badge menjauhi hub kota logistik (misal: Belawan Coastal digeser ke koordinat laut utara `[98.67, 3.82]`, Binjai digeser ke barat `[98.40, 3.65]`).
2. **Z-Index Layer Matrix**: Kelola z-index secara ketat sesuai spesifikasi `MASTER.md`:
   * `z-[30]` untuk Hub Node Markers (prioritas interaksi tertinggi pada peta).
   * `z-[15]` untuk Weather regional HTML badges (diberi `pointer-events-none` agar tidak mengganggu klik hub).
3. **Dynamic HUD Shift**: Geser posisi `OPERATIONS HUD` secara dinamis dari `left-4` menjadi `left-[336px]` ketika sidebar taktis kiri terbuka.

---

## 4. Migrasi Mock Data ke Backend REST API (0% Hardcode Frontend)

### Masalah
- Frontend sebelumnya menyimpan data krisis tiruan (`MOCK_PAST_INCIDENTS`, `MOCK_FUTURE_INCIDENTS`, dll.) di dalam client bundle. Ini melanggar prinsip Single Source of Truth dan menyulitkan integrasi database.

### Solusi Teknis
1. **Backend Data Provider**: Pindahkan seluruh mock dataset ke router `BACKEND_SEED_INCIDENTS` di server FastAPI (`backend/app/routers/incidents.py`). REST API menjadi penanggung jawab tunggal data krisis.
2. **Dynamic Client Classification**: Hapus seluruh konstanta mock dari `DashboardClient.tsx`. Klasifikasikan status data secara dinamis berdasarkan data real-time hasil fetch API `/incidents`:
   * **Past**: `status === 'resolved'`
   * **Future**: `status === 'detecting' || status === 'validating'`
   * **Predict**: `status === 'predicting' || type === 'port_closure'`
   * **Present**: Semua insiden aktif lainnya.
