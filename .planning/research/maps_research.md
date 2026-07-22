## Diagnosis dari dua screenshot

Ada 3 gejala yang saling terkait di gambar itu:

1. **Garis rute berkelok-kelok tidak natural** (Belawan → Tebing Tinggi di gambar 1, Belawan → Siantar di gambar 2) — bentuknya seperti "coretan tangan", bukan mengikuti jalan raya sungguhan.
2. **Rute masuk/menempel zona bahaya** — di gambar 2, garis hijau melewati tepat area oranye putus-putus (zona Tebing Tinggi yang ditandai bencana), padahal seharusnya justru dihindari.
3. **Pemilihan moda tidak masuk akal** — Belawan → Tebing Tinggi (jarak darat ±60-70 km dalam satu koridor Sumut) direkomendasikan lewat Truk → Cargo Udara via Bandara Kualanamu → Truk lagi. Itu jelas tidak efisien untuk jarak sedekat itu.

Jawaban singkatnya: **ya, dugaan kamu benar** — ini pola klasik ketika AI/LLM **menghasilkan geometri rute sendiri lewat teks (reasoning), bukan memanggil routing engine sungguhan dan hanya merender hasilnya.** Perhatikan kalimat di "AI Reasoning Trace" pada gambar 1: *"Engine Pure Agentic Tangential Vector menghitung pengalihan rute jalan raya otomatis melingkari zona krisis..."* — istilah "Pure Agentic Tangential Vector" itu bukan istilah teknis routing yang nyata (bukan Dijkstra, A*, contraction hierarchy, atau apapun yang dipakai routing engine sungguhan). Ini ciri khas LLM yang mengarang deskripsi teknis meyakinkan padahal tidak ada perhitungan graf jalan yang sebenarnya di baliknya — persis pola "functional hallucination" pada agentic tool-use yang saya temukan di riset (LLM mengarang parameter/aksi yang terdengar valid tapi tidak grounded ke sistem nyata).

## Bagaimana Google Maps/Mapbox/TomTom sebenarnya menghasilkan rute akurat

Tiga hal yang jadi fondasi ketiganya, dan ini yang kelihatannya belum diimplementasikan penuh di PetaNadi:

**1. Peta dimodelkan sebagai graf berbobot, bukan gambar.**
Routing fundamentally relies on a graph of nodes and edges, edge weights, and algorithms to traverse the graph, where the graph represents the traversable space of roads a vehicle can travel. Simpul (node) = persimpangan jalan, sisi (edge) = ruas jalan sungguhan dengan atribut arah, kecepatan, dan batasan kendaraan. Setiap rute yang ditampilkan **wajib** menyusuri edge-edge nyata ini — bukan garis lurus/patah-patah bebas seperti di screenshot kamu.

**2. Algoritma pencarian jalur (Dijkstra/A*) berjalan di atas graf itu, dengan bobot dinamis dari data lalu lintas real-time.** Graf ini dinamis — aplikasi memperbarui bobot edge secara real-time untuk mencerminkan lalu lintas yang lebih lambat, lalu menghitung ulang rute secara otomatis. Praktiknya: bobot edge yang merepresentasikan waktu tempuh dikalibrasi ulang secara dinamis sesuai kondisi saat ini — jika jalan tol yang biasanya cepat jadi macet, algoritma mendeteksi ini dan "menghukum" jalan tersebut dengan menaikkan bobotnya, sehingga rute alternatif jadi lebih menarik secara matematis.

**3. Zona yang harus dihindari (banjir, macet parah, bencana) diberikan sebagai *parameter geometris* ke routing engine — bukan disebutkan dalam teks lalu diharapkan AI "mengerti" sendiri.** Ini yang paling relevan untuk kasus kamu. Mapbox Directions API dan TomTom Routing API sama-sama sudah punya fitur ini secara native:
- Mapbox: parameter exclude pada Directions API mendukung penentuan area yang harus dihindari dalam format geometri (WKT/point/polygon), bukan hanya kategori jalan.
- TomTom: API routing bisa menerima parameter Avoid.Areas berupa bounding box/polygon geometri untuk memastikan rute menghindari zona yang ditentukan.

Artinya, zona bencana di PetaNadi seharusnya dikonversi jadi polygon geografis (dari PostGIS, sesuai stack yang sudah mereka punya), lalu dikirim sebagai parameter `exclude`/`avoidAreas` ke Mapbox/TomTom — sehingga rute yang kembali dari API **secara matematis tidak mungkin** melewati zona itu. Kalau rute di screenshot masih menembus zona bahaya, itu tandanya parameter ini tidak pernah benar-benar dikirim ke routing engine — kemungkinan besar rute itu hasil generate teks/gambar dari LLM, bukan hasil call API.

## Kenapa ini terjadi secara arsitektur — root cause

Ini pola yang sangat umum ketika tim membangun "AI Copilot" tapi tergesa-gesa: LLM diberi tugas "putuskan rute dan gambarkan," padahal seharusnya tugas LLM dan tugas routing engine dipisah tegas. Riset soal tool-use/function-calling menegaskan ini:

LLM tidak mengeksekusi fungsi secara langsung — ia hanya mengusulkan tool dan argumennya; sistem lah yang mengeksekusi tool tersebut dan mengirim hasilnya kembali ke model. Pola ini aman karena mencegah LLM melakukan pemanggilan sistem yang tidak terkontrol, dan pendekatan tool-use terstruktur ini mengurangi risiko halusinasi karena jawaban didukung data API yang bisa diverifikasi.

Kalau prinsip ini dilanggar — LLM diminta "gambarkan jalur pengalihan" tanpa memanggil routing engine sungguhan — hasilnya persis yang kamu lihat: jalur zigzag tanpa dasar topologi jalan nyata, dan rekomendasi moda yang "terdengar pintar" tapi tidak masuk akal secara jarak/biaya.

Untuk pemilihan moda (truk vs kapal vs udara), masalahnya serupa tapi levelnya beda: ini bukan cuma soal "panggil API," tapi soal **model keputusan multi-moda yang belum eksis**. Riset transportasi menunjukkan pendekatan yang benar: jaringan transportasi multi-moda dibangun dengan menetapkan koneksi virtual antar-jaringan berbeda moda, lalu algoritma Dijkstra dan optimasi multi-objektif dipakai untuk memilih jalur di jaringan tersebut, dengan fungsi biaya berdasarkan waktu, biaya, dan risiko dari tiap jalur. Artinya truk/kapal/udara itu **layer graf yang berbeda, terhubung lewat simpul transfer** (pelabuhan, bandara, gudang) — bukan pilihan bebas yang dilempar ke LLM untuk "milih sesuka hati". Belawan-Tebing Tinggi direkomendasikan cargo udara via Kualanamu justru menunjukkan tidak ada *feasibility constraint* (jarak minimum, biaya marginal per moda, ketersediaan first-mile/last-mile) yang membatasi opsi moda sebelum ditampilkan.

Diagram di bawah menunjukkan bagaimana seharusnya urutan tanggung jawabnya dipisah:## Rekomendasi konkret sesuai stack PetaNadi yang sudah ada

Kabar baiknya: kamu tidak perlu ganti vendor. Dokumen proposal PetaNadi sudah menyebut Next.js + Mapbox + Deck.gl di frontend dan TomTom di sisi data — masalahnya di **cara pengkabelannya**, bukan pilihan tools-nya.

**1. Pisahkan tegas peran LLM dari peran routing engine.**
LangGraph (yang sudah dipakai di arsitektur mereka) seharusnya punya node eksplisit: `detect_disruption` → `build_constraints` → `call_routing_api` (Mapbox/TomTom, tool call sungguhan) → `validate_route` → `explain_with_ai`. LLM (DeepSeek) hanya boleh masuk di node pertama (menyusun constraint dari data BMKG/InaRISK) dan node terakhir (menjelaskan hasil dalam bahasa manusia). LLM **tidak pernah** menghasilkan koordinat/polyline sendiri.

**2. Zona bencana → polygon → parameter `exclude`/`avoidAreas`, bukan teks.**
Karena PostGIS sudah ada di stack mereka, zona banjir/longsor dari BMKG/InaRISK dikonversi jadi geometry (polygon) di database, lalu dikirim langsung sebagai parameter geometris ke Mapbox Directions API (`exclude`) atau TomTom Routing API (`avoidAreas`). Ini yang akan otomatis mencegah kasus "rute masuk zona bahaya" di gambar 2 — karena API-nya sendiri yang menolak menyusun rute lewat sana, bukan mengandalkan AI untuk "ingat" menghindarinya.

**3. Bangun graf multi-moda dengan simpul transfer, bukan pilihan bebas.**
Sesuai riset multimodal freight: buat graf berlapis — layer jalan raya, layer laut (rute kapal antar-pelabuhan), layer udara (rute kargo antar-bandara) — yang saling terhubung lewat simpul transfer di titik fisik nyata (pelabuhan, bandara, gudang). Baru di atas graf gabungan ini algoritma multi-objektif (waktu, biaya, risiko) memilih kombinasi moda. Dengan begitu, opsi "cargo udara" otomatis tidak akan muncul untuk jarak sedekat Belawan-Tebing Tinggi, karena secara matematis biaya+delay transfer ke Kualanamu akan selalu kalah dibanding truk langsung — sistem yang menyingkirkannya, bukan aturan manual.

**4. "Simulator Interaktif" sebaiknya tidak menyodorkan toggle moda sejajar sebagai pilihan utama.**
Setuju dengan analisis kamu — biarkan AI/engine yang otomatis memilih moda terbaik berdasarkan graf di atas, dan tampilkan pilihan manual (Truk/Kapal/Udara/Multi-Moda) hanya sebagai mode "what-if" tersembunyi di balik toggle "expert mode", bukan kontrol utama yang sejajar dengan tombol default. ini menghindari skenario user pilih "Kapal" untuk rute yang sepenuhnya daratan.

**5. Ganti "AI Reasoning Trace" yang berisi istilah buatan ("Pure Agentic Tangential Vector") dengan penjelasan yang benar-benar merujuk angka dari routing engine** — misalnya "edge jalan tol Tebing Tinggi–Siantar naik bobot 3x akibat genangan terkonfirmasi BMKG, sistem memilih detour B karena total waktu tempuh 12% lebih rendah dari alternatif A yang status *compromised*." Ini lebih meyakinkan juri/pengguna karena traceable ke data nyata, bukan istilah yang terdengar canggih tapi kosong.

**6. Rute berstatus "COMPROMISED" tidak boleh tetap tampil sebagai rute utama yang bisa di-*approve*.**
Di gambar 2, rute rekomendasi AI berlabel merah "COMPROMISED" tapi tetap satu-satunya opsi yang ditawarkan dengan tombol "Approve & Dispatch Reroute" aktif. Ini bug logika UI: kalau semua opsi berstatus compromised, sistem seharusnya menampilkan status eksplisit "tidak ada rute aman tersedia" dan menonaktifkan tombol approve, bukan menyodorkan rute yang sudah ditandai bermasalah sebagai default.


**✅ In-Depth Analysis: Masalah Routing di PetaNadi + Solusi Berbasis Mapbox/TomTom**

Saya sudah menganalisis masalah yang kamu sebutkan (rute aneh/mutar-mutar, masuk zona bahaya, hardcoded, simulasi kurang otomatis, pemilihan moda transportasi bodoh) dan menyesuaikannya dengan proposal PetaNadi (multi-source integration: Mapbox, TomTom traffic, BMKG cuaca/bencana, GraphRAG, multi-agent AI, real-time dashboard).

### Mengapa Masalah Ini Terjadi?
1. **AI "Buta" terhadap Struktur Map & Constraints Real-Time**  
   LLM (seperti Gemini/DeepSeek) bagus untuk reasoning tinggi, tapi **tidak punya native spatial awareness**. Ia hanya melihat teks deskripsi atau partial data, bukan seluruh graph jaringan jalan + layer bencana. Akibatnya:
   - Ia "membayangkan" rute berdasarkan pengetahuan umum, bukan data graph aktual.
   - Saat ada bencana (banjir/longsor), ia tidak punya validasi real-time terhadap zona berbahaya kecuali kamu feed data lengkap + constraint ketat.
   - Hardcoded routes muncul karena developer sering fallback ke simple A* atau predefined corridors saat integrasi belum matang.

2. **Kurangnya Integrasi Ketat dengan Routing Engine**  
   AI belum 100% terintegrasi dengan **Mapbox Directions API** atau **TomTom Routing**. AI hanya kasih instruksi tingkat tinggi ("cari rute aman"), tapi routing engine yang sebenarnya belum di-orchestrasikan dengan baik (constraint seperti avoid flood zone, multi-modal logic, cost function custom).

3. **Multi-Modal & Simulation Belum Cerdas**  
   - Google Maps punya **graph multi-modal** (jalan + pelabuhan + bandara + feri) dengan transition costs.
   - Di PetaNadi, simulasi masih manual pilihan moda → user bisa salah pilih (kapal untuk rute darat Belawan–Siantar).
   - Contoh Belawan–Tebing Tinggi via Kualanamu: AI tidak punya cost function yang kuat untuk penalti transfer moda yang tidak masuk akal.

### Bagaimana Google Maps Bisa Akurat & Efisien?
Google Maps menggunakan **hybrid approach** yang jauh lebih matang:

- **Core Algorithm**:  
  - **Contraction Hierarchies + A*** (optimized shortest path) pada **huge road graph** yang di-preprocess.
  - **Multi-modal graph**: Satu graph besar yang menghubungkan car/truck + transit + walking + cycling + flight/ferry dengan transition nodes (bandara/pelabuhan).

- **Real-Time Traffic Integration**:
  - **Floating Car Data** (jutaan mobil kirim anonymized speed via Android).
  - **TomTom-like** historical + live traffic patterns.
  - Dynamic edge weights: Setiap segmen jalan punya cost yang update setiap menit (macet = cost naik drastis).
  - Predictive traffic (machine learning untuk forecast 30–60 menit ke depan).

- **AI Integration Modern**:
  - Google pakai **Deep Learning** (Graph Neural Networks) + LLM (untuk natural language queries seperti "hindari tol" atau "rute aman banjir").
  - **Constraints Layer**: Avoid polygons (zona banjir dari BMKG-like sources), live incidents, user preferences.
  - **Re-routing otomatis** saat kondisi berubah.

- **Disaster Handling**: Google punya dedicated layers untuk incidents + evacuation routing (avoid closed roads).

**Kesimpulan**: Google Maps **bukan** murni AI LLM. Ia adalah **routing engine klasik + massive data + ML predictions + LLM on top** untuk user experience.

### Rekomendasi Integrasi untuk PetaNadi (Sesuai Proposal)
PetaNadi sudah punya fondasi bagus (Mapbox + TomTom + BMKG + GraphRAG). Masalahnya ada di **orchestration layer**.

#### 1. Arsitektur Routing yang Benar
```mermaid
AI Agents (Multi-agent) 
    ↓ (constraints + context)
Mapbox/TomTom Routing Engine (Directions Matrix + Optimization API)
    ↓ (live traffic + custom avoid polygons)
GraphRAG (supply chain + disaster knowledge)
    ↓ 
AI Copilot (summarize + recommend)
```

**Langkah Konkret**:
- **Gunakan Mapbox Directions API + Annotations** (atau TomTom Routing API yang lebih kuat di traffic Eropa/Asia).
  - Kirim `avoid` polygons untuk zona bencana (dari BMKG/InaRISK via PostGIS).
  - Gunakan `profile=driving` / `truck` + custom `weight=traffic`.
  - TomTom excels di **real-time traffic** dan **incident avoidance**.

- **Custom Cost Function**:
  - Tambahkan layer risk score dari GraphRAG + BMKG (banjir = multiplier cost 10x).
  - Penalti tinggi untuk unnecessary modal transfer.

- **Multi-Modal Otomatis**:
  - Mapbox/TomTom mendukung multi-modal (driving + ferry).
  - Untuk pesawat: Tambahkan logic manual (jika jarak > X km dan ada bandara) atau integrasikan dengan flight API.
  - Buat **single request** dengan `alternatives=true` + post-processing AI untuk rank berdasarkan risk + time + cost.

#### 2. Perbaikan Simulasi Interaktif
- **Hilangkan pilihan manual moda** di level tinggi. AI Agent harus otomatis memilih berdasarkan:
  - Origin-Destination graph analysis.
  - Real-time feasibility (jalan darat tersumbat? → cek feri).
  - Cost function: `total_cost = time + risk + transfer_penalty + fuel`.

- Contoh Belawan–Tebing Tinggi: Agent harus langsung reject plane karena daratan + jarak pendek.

#### 3. Implementasi Langsung
- **Frontend**: Mapbox GL JS + Deck.gl untuk visualize route + risk layers.
- **Backend**: FastAPI worker yang panggil Mapbox/TomTom API dengan constraints dari GraphRAG + PostGIS (zona bahaya).
- **Validation Loop**: Multi-sensor consensus (TomTom traffic + BMKG + user report) sebelum kasih rute final.
- **Fallback**: Selalu berikan 3–5 alternatif + visual risk heatmap.

### Research Summary (Google vs Mapbox/TomTom)
- **Google** unggul di data volume (Android ecosystem) → traffic prediction terbaik.
- **Mapbox + TomTom** sangat kompetitif untuk enterprise/logistics:
  - TomTom punya **Traffic API** + **Routing with Live Traffic**.
  - Mapbox punya **Traffic Layer** + **Custom Styles** + **Isochrone** (time zones) yang bagus untuk simulasi.
  - Banyak logistics company pakai kombinasi ini + custom ML.

**Kesimpulan Utama**:  
Masalahmu bukan karena "AI belum integrate 100%", tapi **routing engine belum di-orchestrasikan dengan benar** oleh AI agents. LLM harus jadi **orchestrator**, bukan direct route generator.
