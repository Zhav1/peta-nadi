# PetaNadi Hackathon Demo Script (3-Minute Presentation)

This script maps out a 3-minute presentation structure demonstrating PetaNadi's multi-agent crisis consensus framework.

---

## ⏱️ Timeline & Presentation Flow

### **0:00 – 0:45 | Introduction & Problem Statement**
* **Visual:** Pitch deck slide or homepage.
* **Speaker:**
  > "Selamat pagi/siang semuanya. Kami dari tim PetaNadi, solusi kecerdasan logistik real-time berbasis multi-agent swarm. 
  > Indonesia adalah salah satu negara dengan risiko bencana tertinggi di dunia. Saat gempa bumi, banjir, atau cuaca ekstrem memutus jalur logistik kritis seperti pelabuhan Belawan atau Jalur Lintas Sumatra, operator logistik sering terlambat mengambil keputusan taktis karena fragmentasi data. PetaNadi hadir untuk menyatukan aliran data secara real-time dan memberikan rekomendasi jalan alternatif otomatis dengan tingkat kepastian tinggi melalui sistem konsensus agen."

### **0:45 – 1:45 | Live Demo Walkthrough (The Belawan Scenario)**
* **Visual:** Terminal screen showing the ingestion command or the frontend dashboard.
* **Action:** Launch the offline fast injector:
  ```bash
  python backend/run_demo.py --offline --speed fast
  ```
* **Speaker:**
  > "Mari kita lihat bagaimana sistem ini bekerja secara offline melalui simulator skenario Pelabuhan Belawan. 
  > Begitu skenario dimulai, generator kami menyuntikkan 12 event real-time yang mencakup:
  > 1. Data fisik: Gempa Deli Serdang dari BMKG, titik api dari NASA FIRMS, dan warning badai Medan.
  > 2. Data operasional: Kecepatan lalu lintas dari TomTom, antrian kapal dari AISstream, dan kenaikan harga cabai/minyak goreng dari PIHPS.
  > 3. Data sosial: Laporan kerusakan/kemacetan langsung dari Twitter, TikTok, dan Facebook.
  > Semua data ini dinormalisasi oleh DataCollectionAgent secara paralel."

### **1:45 – 2:30 | Agent Collaboration & Consensus Gate**
* **Visual:** Point to the terminal output showing Agent 1 to 5's confidence scores and the consensus decision.
* **Speaker:**
  > "Setelah data masuk, swarm dari 5 agen kecerdasan khusus bekerja bersama menggunakan LangGraph:
  > - **PredictionAgent** memproyeksikan kemacetan masa depan (naik hingga 300 menit).
  > - **OSINTHazardAgent** mencocokkan koordinat banjir dengan laporan media sosial.
  > - **RouteOptimizationAgent** menghitung jalur alternatif berisiko rendah menghindari banjir.
  > - **EconomicIntelligenceAgent** mencari database memori LTM (Long-Term Memory) untuk memprediksi inflasi harga kebutuhan pokok (memproyeksikan kenaikan minyak goreng +11%).
  > 
  > Akhirnya, **Consensus Gate** menghitung bobot kepercayaan gabungan. Karena data fisik terkonfirmasi kuat oleh laporan sosial dan historis, skor kepastian mencapai **96.5%**, memicu validasi otomatis untuk penutupan Pelabuhan Belawan."

### **2:30 – 3:00 | Conclusion & Impact**
* **Visual:** Executive Summary output on terminal / frontend recommendation panel.
* **Speaker:**
  > "Setelah lolos consensus gate, **DecisionSupportCopilot** secara otomatis menghasilkan Ringkasan Eksekutif multibahasa untuk pengambil kebijakan dan memicu notifikasi pemindahan rute ke truk logistik.
  > Dengan PetaNadi, waktu pengambilan keputusan tanggap darurat logistik dipangkas dari hitungan jam menjadi milidetik dengan tingkat akurasi konsensus yang tepercaya. Terima kasih!"
