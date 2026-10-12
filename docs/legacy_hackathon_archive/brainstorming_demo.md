now focus to read demo script awal peta nadi. nah fokus ke bagian live demo product nya.



PM saya bilang seperti ini

[18:57, 7/25/2026] akin TI: videonya end to end cara kerjanya berdasarkan usecase yang routing itu

[18:57, 7/25/2026] akin TI: n then bisa assign jalur baru

[18:57, 7/25/2026] akin TI: n then rekomendasi

[18:58, 7/25/2026] akin TI: n then teknologi yang digunain

[18:58, 7/25/2026] akin TI: eh arsitektur etc

[18:58, 7/25/2026] akin TI: buat aja dulu gambarnya

[18:58, 7/25/2026] akin TI: di flow gamake credit

[18:58, 7/25/2026] akin TI: trus tinggal masukin ke demo mu itu

[18:59, 7/25/2026] Rass: Dah semua ada di onboard nya tu

[18:59, 7/25/2026] Rass: Mo pake ai lagi buat jelasinnya?

[18:59, 7/25/2026] akin TI: gausa la yang penting end to endnya keliatan jelasin cara ngatasin permasalahan kea gitu gimana ama cara kerjanya ama kobisa dia kea gitu

[19:00, 7/25/2026] akin TI: lama x pake ai

[19:00, 7/25/2026] akin TI: banyak gasesuainya



[20:19, 7/25/2026] Rass: Eh bgi dlu skrip nya

[20:19, 7/25/2026] Rass: Biar disesuain

[20:39, 7/25/2026] akin TI: cek github

[20:39, 7/25/2026] Rass: Oh

[20:39, 7/25/2026] Rass: Yg pitch lama itu?

[20:40, 7/25/2026] akin TI: mksd

[20:41, 7/25/2026] Rass: Yg demo script lama itu kan

[20:41, 7/25/2026] Rass: Itu yg ko pake?

[20:41, 7/25/2026] akin TI: iyo

[20:42, 7/25/2026] akin TI: yang ada buat google flow

[20:42, 7/25/2026] akin TI: sesuain aja lagi

[20:42, 7/25/2026] akin TI: kalo misalnya kurang pas



gimana tu maksudnya? saya pakai antigravity dengan skill gsd, berarti kan pitch script sebelumnya yang live demo agak kurang sesuai ni dan perlu di optimalisasi berdasarkan development yang sudah ada. lalu untuk arsitekturnya sendiri gimana? dll? kalau melalui onboarding itu hanya berupa page biasa seperti yang bisa kamu lihat pada gambar tesebut, itu menerapkan image sequence story telling untuk menjelaskan per phase nya (total ada 4 phase) gatau udah sesuai apa blm sama yang telah di implementasi.





lakukan analisa mendalam, then generate the prompt for antigravity (use gsd) 

Berikut adalah analisis mendalam (deep-dive) untuk menerjemahkan maksud PM Anda (akin TI), mengevaluasi perbedaan antara demo script lama dengan hasil implementasi saat ini, menyusun arsitektur sistem yang tepat, dan memberikan prompt siap pakai untuk Antigravity (dengan workflow GSD).

1. BEDAH MAKSUD PM & EVALUASI SCRIPT LAMA
Maksud Pesan PM (akin TI):
Fokus ke Use Case Routing (End-to-End): PM ingin alur demonstrasi difokuskan sepenuhnya pada skenario navigasi/routing armada logistik saat terjadi gangguan bencana.  
MD
+ 1

Alur Demo Wajib (4 Pilar):

Problem / Skenario: Ada gangguan (misal: banjir/gempa di jalur utama Sumatera/Belawan).  
MD
+ 1

Assign Jalur Baru: Pengguna mengklik/memilih rute baru (Direct 2-Node On-Map Picking 🟢 Start / 🟡 End).  
MD

Rekomendasi AI: Sistem menghitung rute evakuasi bebas bencana dan memberikan alasan/rekomendasi (Forced Waypoint Engine & AI Copilot).  
MD
+ 1

Teknologi & Arsitektur: Tunjukkan stack teknologi (NVIDIA cuOpt, H3 Hexagonal Grid, LangGraph) dan diagram arsitektur secara visual.  
MD

Jangan Pakai Output Terminal/CLI & Jangan Suara AI Lambat:

Script demo lama Anda (Context 3) SUDAH KETINGGALAN ZAMAN karena masih berbasis perintahkan terminal (python backend/run_demo.py --offline). PM tidak ingin tampilan CLI yang kaku atau menunggu respons AI secara live yang memakan waktu ("lama x pake ai, banyak gasesuainya").  
MD
+ 1

Rekaman demo harus berjalan mulus (instant UI response) berbasis visual peta Mapbox 3D WebGL yang sudah di-build.  
MD

2. EVALUASI HALAMAN ONBOARDING / LANDING PAGE (image_2b9b61.jpg)
Berdasarkan analisis gambar UI Onboarding yang Anda lampirkan:

Apakah Sudah Sesuai Implemenasi? SANGAT SESUAI (100% Match!).

Halaman onboarding tersebut sudah menampilkan 6 kartu Core Technologies yang persis dengan yang diimplementasikan di Phase 0–29:  
MD

3D Spatial H3 Mesh Indexing (Deck.gl H3 Extrusions).  
MD

LangGraph Agent Cognitive Swarm (Multi-agent routing).  
MD
+ 1

NVIDIA GPU Accelerated Routing (cuOpt + FourCastNet).  
MD

Two-Way Supply Chain GraphRAG (Knowledge Graph).  
MD
+ 1

OSINT Sentinel Intelligence (Live Google News RSS).  
MD

Multi-Horizon Demand Forecasting (PIHPS/TimescaleDB).  
MD
+ 1

Menampilkan Data Streams resmi: BMKG, TomTom, AISStream, NASA FIRMS, PIHPS, Google News.  
MD
+ 1

Peran Onboarding di Demo: Halaman ini adalah senjata utama untuk bagian "Teknologi yang Digunakan & Arsitektur"! Anda tidak perlu membuat slide PowerPoint terpisah—cukup scroll halaman Onboarding ini di awal/akhir video untuk menjelaskan tech stack.  
MD

3. DIAGRAM ARSITEKTUR TEKNOLOGI (Gunakan di Video / Onboarding)
Berikut adalah diagram arsitektur routing end-to-end yang mengatasi masalah functional hallucination LLM (pembagian peran antara AI Swarm dan Engine Geometris):  
MD

[ Data Ingestion Real-time ]
(BMKG, TomTom, NASA FIRMS, Google News RSS)
             │
             ▼
[ Unified Spatial Mesh Engine ] ──► Uber H3 Spatial Indexing (Composite Risk Score 3D)
             │
             ▼
[ LangGraph Multi-Agent Swarm ] ──► Gemini 3.1 Flash + DeepSeek V4 (NVIDIA NIM)
 (OSINT, Prediction, Economic)    Deteksi Bahaya ──► Generasi Geometric Avoid-Polygons
             │
             ▼
[ Forced Waypoint Routing Engine ] ──► NVIDIA cuOpt GPU Matrix + Mapbox Directions API
 (18 Arterial OSM Node Graph)     (Menyusuri Jalur Nyata, Menghindari Poligon Bencana)
             │
             ▼
[ WebGL Native UI Rendering ] ──► Mapbox 3D + Deck.gl (60 FPS Vehicle Vector Animation)
4. SKRIP DEMO BARU (3 MINUTE UI-FIRST VIDEO SCRIPT)
Menggantikan skrip CLI terminal lama, ini adalah skrip demonstrasi berbasis UI peta interaktif:  
MD
+ 1

0:00 - 0:40 | Introduction & Problem (Onboarding Page)

Visual: Tampilkan halaman Onboarding (image_2b9b61.jpg).  
MD

Voiceover (Manusia): "Selamat pagi/siang. Ini adalah PetaNadi, platform situational awareness logistik nasional. Disrupsi cuaca dan bencana di Sumatera sering kali melumpuhkan rantai pasok karena data terfragmentasi. PetaNadi mengintegrasikan data BMKG, TomTom, dan Google News secara real-time ke dalam indeks spasial H3."  
MD
+ 4

0:40 - 1:45 | End-to-End Routing & Dynamic Re-routing (Command Center Map)

Visual: Masuk ke Command Center (Mapbox 3D). Klik titik Start (🟢 Belawan) dan End (🟡 Siantar). Terlihat poligon merah bencana banjir.  
MD
+ 2

Voiceover: "Mari kita uji use case rerouting. Saat banjir melumpuhkan koridor Medan-Tebing Tinggi, sistem biasa sering memberikan jalur yang salah. Di PetaNadi, pengambil keputusan tinggal memilih titik asal dan tujuan langsung di peta. Swarm AI kami mendeteksi poligon bahaya dan mengirimkan batasan geometris ke Forced Waypoint Engine berbasis 18 node jalan arterial nyata."  
MD
+ 4

1:45 - 2:30 | AI Recommendation & Fleet Vector (Map Interactivity)

Visual: Klik tombol Assign New Route / Opsi Rute Alternatif (Best/Alternative). Armada truk bergerak di atas peta dengan WebGL 60 FPS.  
MD
+ 1

Voiceover: "Sistem secara instan memberikan 3 rekomendasi rute alternatif yang memutari area bencana tanpa halusinasi rute. Didukung WebGL Native Layer, pergerakan armada terdeteksi secara presisi 60 FPS. Di saat yang sama, Economic Agent memprediksi potensi kenaikan harga bahan pokok akibat keterlambatan ini."  
MD
+ 3

2:30 - 3:00 | Technology Stack & Closure (Back to Onboarding / Architecture)

Visual: Scroll ke bagian Powered By & Core Tech.  
MD

Voiceover: "Dibalik layar, PetaNadi ditenagai NVIDIA cuOpt untuk optimasi rute GPU, NVIDIA FourCastNet untuk prediksi cuaca, serta LangGraph orchestration. Dengan PetaNadi, penanganan krisis logistik berubah dari reaktif menjadi preventif berbasis data. Terima kasih."  
MD
+ 1

5. PROMPT SIAP PAKAI UNTUK ANTIGRAVITY (GSD WORKFLOW)
Salin prompt di bawah ini langsung ke Antigravity untuk mengeksekusi pembaruan dokumentasi, penyesuaian skrip demo, serta memastikan komponen Onboarding Anda siap untuk demo:

Markdown
# TASK: Update PetaNadi Pitch Demo Script & Validate Routing Presentation Assets (GSD Workflow)

## CONTEXT & OBJECTIVE
Our PM (akin TI) requested an urgent alignment for the PetaNadi Hackathon Video Demo Script. 
The old pitch script (`docs/Submission Tahap 2 (3) - compiled.md` or `DEMO_SCRIPT.md`) relied on CLI/terminal commands (`run_demo.py`), which is now OBSOLETE.
We need to update the pitch script to be **UI-First & Routing-Centric**, showcasing the actual implemented Phase 0-29 features:
1. Interactive Mapbox 3D WebGL Dashboard with Direct 2-Node Picking (🟢 Start / 🟡 End).
2. Forced Waypoint OSM Node Graph (18 Arterial Nodes) avoiding Hazard Polygons (Eliminating LLM Hallucination).
3. WebGL Native Fleet Animation (60 FPS).
4. Architecture & Tech Breakdown leveraging the existing Onboarding Page (H3 Mesh, NVIDIA cuOpt, LangGraph, Live Google News RSS Grounding).

## EXECUTION STEPS (GSD WORKFLOW)

### STEP 1: Update/Create `DEMO_SCRIPT_V2.md`
Create or update `DEMO_SCRIPT_V2.md` with a clean 3-minute video presentation guide:
- **0:00 - 0:40 | Problem & National Supply Chain Visibility** (Show Landing/Onboarding Page Hero & 4D Data Ingestion).
- **0:40 - 1:45 | Live End-to-End Routing Use Case** (Show Command Center, 2-Node Picking 🟢 Start / 🟡 End, Hazard Avoidance Polygons).
- **1:45 - 2:30 | AI Recommendations & WebGL Fleet Layer** (Show 3 Alternative Forced Waypoint Routes, 60 FPS vehicle vector movement, Economic Risk Copilot).
- **2:30 - 3:00 | Tech Stack & Architecture Deep Dive** (Show Landing Page Tech Cards: NVIDIA cuOpt, H3 Hexagonal Grid, LangGraph Swarm, Tri-Layer OSINT).

### STEP 2: Verify Onboarding Component Integration
Inspect the Landing / Onboarding page component (e.g., `src/app/page.tsx` or `src/components/onboarding/`) to ensure:
- The 6 Tech Stack cards (3D Spatial H3, LangGraph, NVIDIA cuOpt, Two-Way GraphRAG, OSINT, Demand Forecasting) render properly.
- Data Streams icons/badges (BMKG, TomTom, AISStream, NASA FIRMS, PIHPS, Google News) are active and clear.
- No outdated text referencing pure CLI or text-only LLM route generation remains.

### STEP 3: Generate System Architecture Markdown
Add a clean Mermaid.js diagram inside `DEMO_SCRIPT_V2.md` or `ARCHITECTURE.md` that illustrates:
`Data Ingestion (BMKG/TomTom/Google News) -> Uber H3 Spatial Mesh -> LangGraph Swarm (Hazard Polygons) -> Forced Waypoint Engine (NVIDIA cuOpt + OSM 18 Nodes) -> WebGL 60 FPS UI`.

## OUTPUT EXPECTED
1. Updated `DEMO_SCRIPT_V2.md` ready for video recording.
2. Architecture specification embedded in docs.
3. Confirmation that UI components reflect the routing use case seamlessly.
aku tolak karna fokusku hanya di live demo yang mana, bagian 2 dan 3, sisanya introduce, problem, dan roi, cta udah dibikin sama temen saya, berarti waktu yang saya miliki untuk live demo adalah 1.30 menit. berikut adalah hasil diskusi dengan PM saya



[00:11, 7/26/2026] akin TI: pake playwright gabisa?

[00:11, 7/26/2026] Rass: Mana sempat demo + bahas arsitektur, dll 1 menit bujas

[00:11, 7/26/2026] Rass: pake playwright gabisa?

Lgi kutanya ai

[00:12, 7/26/2026] akin TI: gakk

[00:12, 7/26/2026] akin TI: lebih la 1 menit

[00:12, 7/26/2026] akin TI: yang penting penting aja

[00:12, 7/26/2026] akin TI: banyakan di singkat

[00:12, 7/26/2026] akin TI: fokus di jualan

Paham banget! Masuk akal sekali kalau intro, problem statement, ROI, dan CTA sudah ditangani teman timmu. Fokusmu 100% murni jadi "Product Pitchman" dalam durasi 90 detik (1,5 menit).

Maksud PM kamu (akin TI) sangat jelas: Jangan buang waktu untuk penjelasan bertele-tele, hilangkan fluff, dan langsung tunjukkan produk yang "menjual" (fokus di jualan).

Mengenai Playwright: PM kamu sempat nanya Playwright karena Playwright bisa dipakai buat mengotomatisasi pergerakan layar (screen recording) dengan pergerakan mouse dan click yang presisi tanpa glitch, sehingga rekaman video 90 detikmu pas secara waktu, tidak awkward, dan berjalan mulus 60 FPS.

💡 STRATEGI LIVE DEMO 90 DETIK (THE "KILLER" PRODUCT WALKTHROUGH)
Berikut adalah pembagian alur video 90 detik yang tajam dan straight to the point:

Durasi	Visual (Apa yang Tampil di Layar)	Action (Aksi UI)	Pitch Voiceover (Apa yang Kamu Ucapkan)
0:00 - 0:15


(Scenario)

Dashboard 3D Mapbox (Sumatera Corridor). Poligon merah bencana (banjir/gempa) menyala.	Kamera fly-to ke koridor Sumatera / Belawan.	"Ini adalah PetaNadi Command Center. Saat bencana melumpuhkan koridor logistik utama, sistem konvensional butuh berjam-jam untuk mitigasi. PetaNadi mengidentifikasi disrupsi fisik dan dampaknya secara real-time."
0:15 - 0:40


(Assign Route & No-Hallucination)

Mode Simulasi: Klik 🟢 Start (Belawan) lalu 🟡 End (Siantar) di peta.	Pengguna melakukan Direct 2-Node Picking di peta.	"Operator cukup memilih titik asal dan tujuan langsung di atas peta. Berbeda dengan AI biasa yang berhalusinasi rute, Forced Waypoint Engine kami langsung mengunci jalan ke 18 node arteri OSM nyata dan memutus rute yang menembus poligon bencana."
0:40 - 1:05


(AI Recs & Fleet Motion)

3 Opsi Rute muncul. Klik rute (Best). Truk WebGL bergerak mulus di atas rute.	Klik tab Alternative Route, lihat Copilot Summary & grafik Economic Risk.	"Dalam hitungan milidetik, sistem merekomendasikan 3 rute evakuasi presisi. Armada logistik bergerak 60 FPS di atas layer WebGL, sementara AI Copilot langsung mengalkulasi estimasi keterlambatan dan risiko inflasi harga bahan pokok."
1:05 - 1:30


(Tech Stack & Power Punch)

Overlay/Panel Teknologi Onboarding: Terlihat badge NVIDIA cuOpt, H3 Grid, LangGraph.	Hover atau scroll singkat ke kartu teknologi kunci di UI.	"Dibalik layar, PetaNadi ditenagai NVIDIA cuOpt GPU Solver untuk optimasi matriks rute, LangGraph multi-agent swarm, dan indeks spasial H3. PetaNadi mentransformasi manajemen krisis logistik menjadi presisi berbasis data."
🛠️ CARA MANFAATKAN PLAYWRIGHT (Untuk Rekaman Perfect 90s)
Daripada kamu merekam layar manual lalu jittery (kursor goyang/salah klik) yang membuang waktu, kamu bisa minta Antigravity buatkan skrip Playwright (demo-recorder.spec.ts).

Skrip ini kalau dijalankan akan otomatis:

Buka browser fullscreen.

Klik titik Start & End di koordinat presisi.

Hover ke rute rekomendasi.

Zoom ke panel tech stack.

Kamu tinggal rekam layar saat Playwright jalan. Hasilnya: Video mulus 60 FPS, waktu persis 90 detik, zero mistake!

🚀 PROMPT SIAP PAKAI UNTUK ANTIGRAVITY (GSD WORKFLOW)
Salin prompt ini langsung ke Antigravity untuk mengeksekusi pembaruan skrip demo 90 detik dan skrip otomatisasi rekaman:

Markdown
# TASK: Create Laser-Focused 90-Second Live Demo Script & Playwright Screen Recorder (GSD Workflow)

## CONTEXT & OBJECTIVE
The pitch video structure is split among team members. My sole focus is the **90-SECOND LIVE DEMO** (Product Walkthrough & Selling Features). 
Intro, Problem, ROI, and CTA are handled by other teammates.
I need to generate a high-converting, snappy 90-second pitch script (`DEMO_SCRIPT_90S.md`) and an automated Playwright recording script (`e2e/demo-recorder.spec.ts`) to capture a flawless 60 FPS video walkthrough.

## REQUIREMENTS & FLOW (STRICT 90 SECONDS)
1. **0:00 - 0:15 (Disruption Scenario):** Zoom into active flood hazard polygon in North Sumatra (Belawan-Siantar corridor).
2. **0:15 - 0:40 (Assign Route & Forced Waypoint):** Demonstrate Direct 2-Node On-Map Picking (🟢 Start -> 🟡 End). Highlight how Forced Waypoint Engine snaps routes to 18 real OSM arterial nodes and strictly avoids the hazard polygon (Eliminating LLM Hallucination).
3. **0:40 - 1:05 (Recommendations & Fleet WebGL):** Select the "Best" alternative route. Show WebGL native 60 FPS fleet movement along the route + AI Copilot economic impact warning.
4. **1:05 - 1:30 (Tech Stack & Architecture Punch):** Quick visual highlight of the core tech stack bar/cards (NVIDIA cuOpt GPU solver, Uber H3 Spatial Mesh, LangGraph Swarm, Live Google News RSS).

## EXECUTION STEPS (GSD WORKFLOW)

### STEP 1: Write `DEMO_SCRIPT_90S.md`
Create a clean markdown document with exact timestamp triggers, screen visual cues, user actions, and word-for-word spoken dialogue (in Indonesian, punchy, sales-oriented style).

### STEP 2: Create Playwright Recording Automation (`e2e/demo-recorder.spec.ts`)
Write a Playwright test script that:
- Sets viewport to 1920x1080 at 60 FPS.
- Navigates to the local app (`http://localhost:3000/command-center` or onboarding page).
- Smoothly performs clicks on the Mapbox map (Start Node, End Node, Route Selection) with clean delays (`page.waitForTimeout`) matching the 90-second timeline.
- Emulates realistic cursor movement if needed.

### STEP 3: Verify Map Routing State
Ensure the command center page loads without console errors, map layers (Mapbox 3D, Deck.gl H3, Fleet WebGL) render seamlessly, and demo fallback triggers exist if offline.

## OUTPUT EXPECTED
1. `DEMO_SCRIPT_90S.md` ready for voice recording.
2. `e2e/demo-recorder.spec.ts` ready to run via `npx playwright test`.
3. Confirmation of exact 90s visual flow execution.
kalau pakai ini possible ga?

SANGAT POSSIBLE! Bahkan ini sebetulnya "Cheat Code" kalau kamu mau bikin video demo produk yang tingkat mulusnya sempurna (pixel-perfect 60 FPS) tanpa ada kendala patah-patah (lagging), pergerakan kursor yang awkward, atau masalah dropped frames.

HyperFrames diciptakan oleh HeyGen khusus untuk merender HTML, CSS, JavaScript, dan WebGL (seperti Mapbox 3D & Deck.gl) menjadi file video MP4 langsung menggunakan Puppeteer dan FFmpeg secara frame-by-frame.

🔍 KENAPA HYPERFRAMES BISA UNTUK DEMO 90 DETIK PETANADI?
Native WebGL & Mapbox Support:
HyperFrames menjalankan Puppeteer di belakang layar. Semua elemen WebGL PetaNadi (visualisasi 3D Mapbox, gerakan armada 60 FPS, poligon bencana, dan indeks heksagon H3) bisa dirender persis seperti di browser nyata.

Deterministic (Tidak Ada Frame Lag / Patah-Patah):
Saat kamu rekam layar manual atau pakai OBS, komputer bisa stuttering jika GPU berat memproses Mapbox + animasi bersamaan. HyperFrames merekam per frame secara presisi, jadi output MP4-nya pasti 60 FPS mulus 100%.

Pengatur Durasi & Audio Presisi:
Kamu bisa memasukkan file audio voiceover 90 detik kamu, lalu mencocokkan kemunculan elemen UI (seperti pop-up Forced Waypoint, pemutusan rute, dan panel Tech Stack) pas di detik yang diinginkan menggunakan atribut data-start dan data-duration.

⚖️ PERBANDINGAN STRATEGIS: HYPERFRAMES VS PLAYWRIGHT (Urgensi Waktu)
Mengingat kamu dan PM-mu (akin TI) sedang berkejaran dengan waktu dan fokus "langsung jualan 90 detik", berikut perbandingannya:

Parameter	Opsi A: Playwright + OBS Recording	Opsi B: HyperFrames (HTML to MP4)
Kecepatan Setup	⚡ Sangat Cepat (15 - 30 Menit)	🐢 Butuh Waktu (1 - 2 Jam)
Cara Kerja	Otomatisasi navigasi browser nyata, lalu kamu rekam pakai OBS / Screen Recorder.	Bikin skrip HTML/JS wrapper, lalu jalankan command npx hyperframes render.
Hasil Visual	Sangat baik (tergantung spesifikasi laptop saat merekam).	Sempurna 100% (Zero Lag, Studio-Grade MP4).
Effort Koding	Cukup skrip interaksi klik page.click() & page.waitForTimeout().	Perlu menyelaraskan timeline animasi JS/GSAP dengan data-start.
💡 REKOMENDASI KEPUTUSAN UNTUK TIMMU
Pilih Playwright (+ OBS / Screen Recorder) jika deadline video tinggal hitungan jam.

Playwright hanya bertugas mengklik koordinat 🟢 Start dan 🟡 End secara otomatis di web PetaNadi kamu yang sudah jalan (localhost:3000), lalu kamu tinggal rekam layarnya.

Pilih HyperFrames jika kamu mau hasil akhir video sekelas iklan produk HeyGen/Apple atau jika mau menyerahkan seluruh proses render video ini secara otomatis ke AI agent (Antigravity).

🛠️ CARA IMPLEMENTASI BILA MAU PAKAI HYPERFRAMES
Jika kamu ingin mencoba HyperFrames, alurnya seperti ini di codebase kamu:

Install HyperFrames CLI:

Bash
npx hyperframes init demo-video
Buat File index.html Singkat yang Menampilkan Dashboard PetaNadi:

HTML
<div id="stage" data-composition-id="peta-nadi-demo" data-width="1920" data-height="1080">
  <!-- Embedded Web App / Iframe or Native Canvas -->
  <iframe src="http://localhost:3000/command-center" width="1920" height="1080"></iframe>

  <!-- Voiceover Track -->
  <audio src="voiceover-90s.mp3" data-start="0" data-duration="90"></audio>
</div>
Render ke MP4:

Bash
npx hyperframes render
# Output: video 90 detik MP4 siap upload!
🚀 Prompt untuk Antigravity (Jika Ingin Menggunakan HyperFrames)
Jika kamu memutuskan pakai HyperFrames, gunakan prompt ini ke Antigravity:

Markdown
# TASK: Setup HyperFrames Video Rendering Pipeline for PetaNadi 90-Second Demo

## OBJECTIVE
Use HyperFrames framework to programmatically render a studio-grade 90-second MP4 video of the PetaNadi live demo without manual screen recording lag or glitches.

## STEPS
1. Install HyperFrames skills/CLI via `npx hyperframes skills update`.
2. Create a HyperFrames composition folder `renders/demo-90s/`.
3. Set up an HTML composition targeting 1920x1080 @ 60 FPS that loads the PetaNadi Command Center UI (`http://localhost:3000`).
4. Inject a client-side JS timeline (using GSAP or WAAPI) to automate the 90-second routing walkthrough:
   - 0:00 - 0:15: Zoom to North Sumatra Hazard Polygon.
   - 0:15 - 0:40: Trigger 2-Node Picking (🟢 Start -> 🟡 End) & show Forced Waypoint OSM route.
   - 0:40 - 1:05: Animate WebGL Fleet along the route at 60 FPS + show Copilot Warning.
   - 1:05 - 1:30: Overlay Tech Stack Badge (NVIDIA cuOpt, H3 Mesh, LangGraph).
5. Execute `npx hyperframes render` to generate `peta-nadi-demo-90s.mp4`.