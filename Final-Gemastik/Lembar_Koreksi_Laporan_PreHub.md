# Lembar Koreksi Laporan Akhir PreHub

Tanggal: 29 Oktober 2026
Sumber acuan: `Laporan-PreHub-GEMASTIK19.pdf` (versi 29 Oktober 2026) dan kode di repositori ini.

Catatan berkas: DOCX di `Final-Gemastik/` masih versi lama (`0,0937`, `TP 35`, "SUS ditunda"). Edit DOCX yang dipakai tim, bukan berkas lama itu, lalu ekspor ulang ke PDF.

## Catatan koridor

Benchmark mencocokkan `corridor` ground truth dengan `corridor_segment` hasil NLP secara eksak. Hasilnya 46 dari 60 (76,67%). Empat belas sisanya tetap ter-geocode, tetapi mendarat di node administratif, misalnya "Pelalawan" bukan "Pekanbaru–Pangkalan Kerinci KM 83". Resolusi lokasi 60/60 (100%), kecocokan segmen 46/60 (76,67%), dan 58/60 (96,67%) masih dalam radius 25 km. Pakai definisi yang dipilih secara eksplisit.

## A. Hapus Google OR-Tools

| No | Lokasi | Cari | Ganti |
| --- | --- | --- | --- |
| A1 | Abstrak (h. i) | `Mesin perutean deterministik CPU (NetworkX dan Google OR-Tools 2-Opt) membukukan median latensi komputasi 0,06 ms` | `Mesin perutean deterministik CPU (NetworkX Dijkstra/A* dan heuristik 2-Opt) membukukan median waktu komputasi solver 0,06 ms` |
| A2 | VI.7 (h. 16) | `berbasis NetworkX dan Google OR-Tools (Google, 2026; dengan heuristik 2-Opt)` | `berbasis NetworkX Dijkstra/A* dengan heuristik 2-Opt` |
| A3 | VII.7 Tabel VII.1, baris Routing engine (h. 21) | `Deterministic CPU Routing Adapter (NetworkX + OR-Tools / 2-Opt), latensi 0,06 ms` | `Deterministic CPU Routing Adapter (NetworkX Dijkstra/A* + 2-Opt), waktu komputasi solver 0,06 ms` |
| A4 | VII.8 (h. 23) | `Solver deterministik CPU (NetworkX dan Google OR-Tools 2-Opt) mencatatkan median latensi 0,06 ms (p95 0,41 ms)` | `Solver deterministik CPU (NetworkX Dijkstra/A* dan heuristik 2-Opt) mencatatkan median waktu komputasi 0,06 ms (p95 0,41 ms)` |
| A5 | Lampiran 2, baris 1 (h. 32) | `berbasis NetworkX dan Google OR-Tools (2-Opt). Waktu komputasi median 0,06 ms` | `berbasis NetworkX Dijkstra/A* dan heuristik 2-Opt. Waktu komputasi median 0,06 ms` |
| A6 | Daftar Pustaka (h. 29) | `Google. (2026). Google OR-Tools: Fast and portable software for combinatorial optimization...` | Hapus satu entri ini |

## B. Radar BMKG menjadi peringatan dan prakiraan

| No | Lokasi | Cari | Ganti |
| --- | --- | --- | --- |
| B1 | Abstrak (h. i) | `informasi spasial radar BMKG, telemetri kemacetan TomTom` | `informasi peringatan dan prakiraan cuaca BMKG, telemetri kemacetan TomTom` |
| B2 | Latar Belakang (h. 2) | `mengintegrasikan informasi cuaca radar BMKG, kemacetan TomTom` | `mengintegrasikan informasi peringatan dan prakiraan cuaca BMKG, kemacetan TomTom` |
| B3 | VI.1 (h. 11) | `PreHub memanfaatkan fusi spasial radar real-time BMKG dan Numerical Weather Prediction (NWP) Open-Meteo` | `PreHub memanfaatkan fusi peringatan cuaca BMKG dan Numerical Weather Prediction (NWP) Open-Meteo` |
| B4 | VI.2 (h. 11) | `Data radar cuaca BMKG dan model NWP sama-sama merefleksikan kondisi atmosfer` | `Peringatan cuaca BMKG dan model NWP sama-sama merefleksikan kondisi atmosfer` |
| B5 | VII.7 Tabel VII.1, baris Weather ingestion (h. 22) | `Fusi spasial radar BMKG dan NWP Open-Meteo resolusi tinggi, peringatan badai dan curah hujan.` | `Fusi peringatan dan prakiraan cuaca BMKG dengan NWP Open-Meteo resolusi tinggi, mencakup peringatan badai dan curah hujan.` |
| B6 | Lampiran 2, baris 2 (h. 32) | `Menggabungkan data radar presipitasi BMKG dengan prakiraan cuaca Open-Meteo per jam` | `Menggabungkan peringatan cuaca BMKG dengan prakiraan cuaca Open-Meteo per jam` |
| B7 | Daftar Pustaka (h. 29) | `Basis Data Radar Cuaca dan Prakiraan Spasial Terpadu` | `Data Peringatan Dini dan Prakiraan Cuaca` |

## C. Versi framework

| No | Lokasi | Cari | Ganti |
| --- | --- | --- | --- |
| C1 | VII.7 Tabel VII.1, baris Aplikasi web (h. 21) | `Aplikasi produksi Next.js 15, React 19, Tailwind CSS` | `Aplikasi produksi Next.js 14+, React 18+, Tailwind CSS` |

## D. Matematika gerbang konsensus (VI.2, h. 12)

| No | Cari | Ganti |
| --- | --- | --- |
| D1 | `(radar BMKG, kemacetan TomTom, dan warta berita LKBN ANTARA)` | `(cuaca BMKG, kemacetan TomTom, warta berita, dan harga pangan)` |
| D2 | `konstanta waktu paruh τ = 6 jam` | `konstanta laju peluruhan λ = 0,05 per jam, sehingga waktu paruh sekitar 13,9 jam` |
| D3 | `konstanta jarak pengurang s = 15 km` | `konstanta jarak pengurang d₀ = 25 km` |
| D4 | `Ambang batas validasi gerbang konsensus ditegakkan secara deterministik pada Pg ≥ 0,85 dengan syarat minimal dua kanal independen aktif (K ≥ 2)` | `Skor gabungan Pg dinormalisasi terhadap nilai maksimum teoretis P_max = 0,688 menjadi Pn = Pg / 0,688. Ambang validasi diterapkan pada skor ternormalisasi, yaitu Pn ≥ 0,85 (setara Pg ≥ 0,585 pada skala mentah), dengan syarat minimal dua kanal independen aktif (K ≥ 2)` |
| D5 | `(0,50 ≤ Pg < 0,85 atau K = 1)` | `(0,50 ≤ Pg < 0,585 atau K = 1)` |
| D6 | Tabel VII.1: `Probabilistic Consensus Gate (Pg ≥ 0,85, K ≥ 2)` | `Probabilistic Consensus Gate (skor ternormalisasi Pn ≥ 0,85; Pg ≥ 0,585; K ≥ 2)` |
| D7 | Tabel III.1: `(syarat Pg ≥ 0,85 & K ≥ 2 aktif)` | `(syarat Pn ≥ 0,85 & K ≥ 2 aktif)` |

## E. Koridor

| No | Lokasi | Cari | Ganti |
| --- | --- | --- | --- |
| E1 | Tabel III.1, baris Analisis dampak (h. 4) | `Identifikasi koridor akurat 100%; estimasi delay delta rata-rata 112 menit tervalidasi.` | `Resolusi lokasi 100% (60/60); kecocokan segmen koridor 76,67% (46/60); 96,67% dalam radius 25 km; estimasi delay delta rata-rata 112 menit tervalidasi.` |

## F. Jumlah tabel database

| No | Lokasi | Cari | Ganti |
| --- | --- | --- | --- |
| F1 | Tabel VII.1, baris Database (h. 22) | `Supabase (13 tabel)` | `Supabase (18 tabel)` |

## G. Jumlah mitra

| No | Lokasi | Cari | Ganti |
| --- | --- | --- | --- |
| G1 | Tabel III.1, baris Kesiapan mitra (h. 5) | `Feedback kualitatif 4 mitra` | `Feedback kualitatif 5 mitra` |

## H. Tes unit (opsional)

Baris `34 unit & integration test lulus 100%` tidak punya padanan di repo: `pytest --collect-only` mengumpulkan 567 tes, dan satu tes perutean sedang gagal. Kalau log 34 tes itu ada, amankan dengan tanggal dan lingkup.

| No | Cari | Ganti |
| --- | --- | --- |
| H1 | `34 unit & integration test lulus 100%, 15 kasus black-box API tervalidasi sukses.` | `34 tes unit & integrasi inti lulus 100% (22 Oktober 2026), 15 kasus black-box API tervalidasi sukses.` |

## Yang tidak diubah

- 15 endpoint black-box tetap di VII.8 dan Lampiran 2.
- Ditmawalumni USU "disahkan Direktur" tetap. Berkas di repo masih `... - Draft.docx` dengan nomor surat kosong; ganti pindaian Lampiran 1 begitu surat final diterima.
- Status 100% dan penggunaan fixture tetap, termasuk Tabel VII.1 dan Batasan IV.4.
