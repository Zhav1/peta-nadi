# 📰 PANDUAN PEMBARUAN PROPOSAL & DOKUMEN TEKNIS: INTEGRASI INTELIJEN BERITA RESMI & EARLY WARNING SYSTEM

Dokumen ini disusun agar Anda dapat **langsung menyalin (copy-paste)** pembaruan inovasi intelijen berita (*Official News Outlets & Early Warning*) ke dalam berkas resmi proposal [Proposal Submission 3.md](file:///d:/College/Pidi.id/docs/Proposal%20Submission%203.md) dan [Dokumen_Pendukung_PreHub.md](file:///d:/College/Pidi.id/docs/Dokumen_Pendukung_PreHub.md).

---

## BAGIAN 1: PEMBARUAN UNTUK PROPOSAL SUBMISSION 3

### 1.1 Penajaman pada "PROGRESS AND CHANGE LOG" (Maksimal 150 kata)
> **Salin teks berikut untuk menggantikan/menambah poin perubahan:**

Sejak *2nd submission*, kami meningkatkan kapabilitas sistem dari sekadar deteksi pasif sensor menjadi **intelijen prediktif multi-sumber aktif** dengan mengintegrasikan agregasi berita resmi (*LKBN ANTARA Sumut, ANTARA Ekonomi, dan portal berita terakreditasi*) yang diproses melalui *Gemini Flash NLP Information Extraction*. Evaluasi operasional membuktikan bahwa telemetri sensor fisik (seperti GPS armada dan TomTom Traffic) bersifat *lagging* (baru mendeteksi disrupsi setelah armada terjebak macet/banjir). Sebaliknya, buletin dan berita resmi memberikan **pre-disruption lead time 3–6 jam lebih awal** (misal: kenaikan debit air sungai di hulu atau peringatan dini gelombang laut). Pembaruan ini memperkuat *Consensus Gate* (eliminasi *false alarms*), memicu penyesuaian bobot rute dinamis (*dynamic edge penalty*), serta memperkaya rekomendasi *AI Copilot* dengan kutipan bukti lapangan terverifikasi (*verifiable evidence citation*).

---

### 1.2 Penajaman pada "END-TO-END USE CASE AND FEATURE-TO-PAIN MAPPING" (Maksimal 300 kata)
> **Salin teks berikut untuk memperkaya alur operasional:**

Ketika terjadi cuaca ekstrem di Sumatera Utara, *Operations Coordinator* (Budi) sering menghadapi situasi kritis di mana sensor lalu lintas terlambat mendeteksi putusnya jalur logistik. Melalui **Modul Intelijen Berita Resmi**, PetaNadi secara otomatis mengagregasi dan mengekstraksi laporan waktu nyata dari LKBN ANTARA, BMKG, dan portal media kredibel via pipeline NLP berbasis Gemini. Sistem mendeteksi berita luapan Sungai Padang setinggi 120 cm di Jalinsum KM 78 dengan status *early warning* 4 jam sebelum air menutupi jalan sepenuhnya. Sinyal ini langsung dialirkan ke **Consensus Validation**, yang memverifikasi korelasi silang antara curah hujan BMKG, peringatan berita resmi, dan lonjakan kecepatan TomTom. Begitu konsensus mencapai $\ge 85\%$, **AI Copilot** tidak hanya menyajikan rekomendasi rute bypass (Tol MKTT), tetapi juga mengutip bukti berita resmi (*Evidence Chain citation*) lengkap dengan tingkat keparahan, waktu estimasi surut, dan komoditas terdampak (Beras BULOG & Cabai). Rekomendasi ini memangkas waktu verifikasi manual dari 2 jam menjadi hitungan detik, mencegah armada pangan terjebak banjir, dan mengamankan pasokan komoditas vital sebelum harga pasar bergejolak.

---

## BAGIAN 2: PEMBARUAN UNTUK DOKUMEN PENDUKUNG TEKNIS (TECHNICAL BLUEPRINT)

### 2.1 Tambahan pada Bab 4: Arsitektur Struktural Multi-Sumber

```
+---------------------------------------------------------------------------------+
|                    PAN-SUMATRA NEWS & EARLY WARNING PIPELINE                    |
+---------------------------------------------------------------------------------+
| [Tier 1: Kantor Berita Resmi & Pemerintah (8 Biro Sumatera)]                    |
|  - LKBN ANTARA Biro Sumut, Sumbar, Riau, Aceh, Sumsel, Lampung, Jambi, Bengkulu |
|  - LKBN ANTARA Ekonomi & Logistik (Direct XML RSS)                              |
|  - BMKG Warta Cuaca & Peringatan Dini Maritim Selat Malaka & Samudera Hindia    |
|  - BNPB / DIBI Laporan Bencana Terbuka                                          |
|                                                                                 |
| [Tier 2: Public News API & Media Nasional / Regional Terverifikasi]             |
|  - CNBC Indonesia Market, CNN Indonesia, DetikSumut, Tribun Medan, Kompas       |
+----------------------------------------+----------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
| [NLP Extraction Layer - Gemini 1.5 Flash]                                       |
|  - Ekstraksi Entitas Koridor & Titik KM Jalinsum                                |
|  - Klasifikasi Fase Temporal: 'Early Warning' (3-6 jam) vs 'Active Disruption' |
|  - Penentuan Komoditas Terdampak (Beras, Cabai, Bawang, Minyak Goreng)         |
|  - Ground-Truth Metrics: Ketinggian Air (cm), Arah Tertutup, Durasi Normalisasi |
+----------------------------------------+----------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
| [Redis Event Stream: lrip:stream:osint]                                         |
|  - Ingesti Asinkron, Deduplikasi Hash, & Pub/Sub 6-Agent Swarm                  |
+----------------------------------------+----------------------------------------+
                                         |
            +----------------------------+---------------------------+
            |                                                        |
            v                                                        v
+----------------------------------------+       +------------------------------------+
| [Route Optimization Agent]             |       | [Economic Intelligence Agent]      |
| Dynamic Edge Penalty (x5.0 on closed   |       | Causal Supply Disruption Multiplier|
| arterial segments -> Tol MKTT Detour)  |       | (+15% - 30% Volatile Food Shock)   |
+-------------------+--------------------+       +-------------------+----------------+
                    |                                                |
                    +--------------------+---------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
| [Consensus Gate & Decision Support Copilot]                                     |
|  - Overall Confidence >= 85% & Multi-Source Cross-Validation                    |
|  - Chain-of-Thought (CoT) Executive Briefing with Direct Media Citations        |
+---------------------------------------------------------------------------------+
```

### 2.2 Tambahan pada Bab 5: Deskripsi Fungsional Inovasi Baru

#### 5.1.3 Sub-Modul Intelijen Berita Resmi & Early Warning (News Intelligence Engine)
* **Tiered Authority Ingestion:** Memisahkan sumber data ke dalam 2 tingkat kredibilitas:
  1. *Tier 1 (Official / Government Authority - Bobot 0.95):* LKBN ANTARA, BMKG, BNPB, dan instansi perhubungan.
  2. *Tier 2 (Authoritative Regional Press - Bobot 0.85):* Media massa berbadan hukum pers terakreditasi dewan pers dengan liputan investigasi lapangan lokal.
* **Lead-Time Quantification (Pre-Disruption Horizon):** Menghitung estimasi *lead-time* antara pengumuman potensi bencana dengan waktu prediksi penutupan jalur fisik (rata-rata 3,5 jam lebih awal dari deteksi sensor kemacetan).
* **Cross-Corroboration Swarm Gate:** Menjamin bahwa laporan berita tidak hanya dibaca sebagai teks pasif, melainkan menjadi variabel penentu dalam konsensus:
  $$\mathcal{C}_{\text{news}} = w_{\text{tier}} \times \left(0.6 \cdot S_{\text{relevance}} + 0.4 \cdot S_{\text{location\_ner}}\right)$$
* **Dynamic Route Re-Weighting:** Berita dengan status jalan tertutup (*lane status: blocked*) langsung menaikkan bobot penalti jalur arteri pada graf jalan NetworkX sebesar $\times 5.0$, secara otomatis mengarahkan konvoi logistik ke rute jalan tol alternatif sebelum kendaraan mendekati lokasi bahaya.
* **Explainable AI Briefing:** Menghasilkan ringkasan eksekutif B2G di mana setiap instruksi disposisi (BAPANAS, Kemenhub, Bulog) menyertakan tautan sumber dan kutipan kalimat resmi jurnalis lapangan.
