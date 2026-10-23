Hasil review saya: **makalah masih memerlukan revisi editorial dan format sebelum dikumpulkan**, terutama pada ukuran halaman, panjang intisari, konsistensi huruf miring, dan beberapa kalimat. Struktur utama tidak perlu dirombak.

Saya memeriksa kelima halaman \[Makalah-PreHub.pdf\](C:/Users/User/Documents/TUGAS TI/PORTFOLIO/Projects/prehub/research/Makalah-PreHub.pdf), membandingkannya dengan \[template GEMASTIK\](C:/Users/User/Documents/TUGAS TI/PORTFOLIO/Projects/prehub/research/Template-Makalah-Gemastik-ieee.docx), serta merujuk EYD V. Nomor halaman di bawah mengikuti urutan halaman PDF. **Berkas makalah tidak saya ubah.**

## **1\. Temuan utama terhadap template**

| Prioritas | Lokasi | Temuan | Perbaikan |
| ----- | ----- | ----- | ----- |
| **Tinggi** | Seluruh halaman | PDF berukuran **Letter, 215,9 × 279,4 mm**, sedangkan template mensyaratkan **A4, 210 × 297 mm**. | Ekspor ulang dengan ukuran A4. Dokumen Word sudah berukuran A4; periksa pengaturan ekspor/cetak PDF. |
| **Tinggi** | Seluruh halaman | Ukuran huruf pada PDF mengecil: teks utama sekitar **9,3 pt**, judul **18,8 pt**, dan referensi **7,5 pt**. Template menetapkan masing-masing **10, 20, dan 8 pt**. | Polanya mengindikasikan penskalaan ketika menghasilkan PDF. Perbaiki ekspornya terlebih dahulu, bukan langsung memperbesar semua huruf di Word. |
| **Tinggi** | Hlm. 1, intisari | Isi intisari sekitar **181 kata**, tidak termasuk label dan tanda pisah. Template meminta **200–300 kata**. | Tambahkan sekitar 25–40 kata yang memperjelas tujuan, metode, atau hasil yang memang sudah dibahas. Jangan menambah klaim baru. |
| **Tinggi** | Hlm. 1, identitas penulis | Surel penulis ketiga tertulis `qhanakinahmad@ students.usu.ac.id`, dengan spasi setelah `@`. | Hapus spasinya dan verifikasi kembali alamat tersebut. |
| **Sedang** | Hlm. 1, afiliasi | Nama negara belum dicantumkan. Template meminta sekurang-kurangnya institusi dan negara. | Tambahkan **Indonesia** pada afiliasi. |
| **Sedang** | Gambar 2, hlm. 2; Gambar 5, hlm. 4 | Resolusi efektif Gambar 2 sekitar **212–221 ppi**; Gambar 5 sekitar **171 ppi**. Keduanya di bawah batas **300 ppi**. | Ekspor ulang diagram dari sumbernya dan ambil tangkapan layar panel dengan resolusi lebih tinggi. Memperbesar gambar lama saja tidak menambah detail. |
| **Sedang** | Hlm. 5 | Dua rumus *precision* dan *recall* belum bernomor, sementara rumus sebelumnya sudah bernomor (1). | Beri nomor **(2)** dan **(3)** di sisi kanan sesuai pola template. |
| **Sedang** | Surel hlm. 1; URL hlm. 5 | Surel dan URL masih menggunakan huruf tegak. Template secara khusus meminta alamat lengkap dalam Times New Roman miring. | Terapkan format tersebut pada alamatnya. Ini aturan khusus template, bukan aturan umum bahwa semua URL harus miring. |

**Catatan penting:** setelah ekspor ulang ke A4, periksa kembali jumlah halaman, posisi tabel, dan gambar. Jangan mempertahankan lima halaman dengan cara mengecilkan seluruh halaman.

## **2\. Huruf miring dan istilah asing**

Ini memang salah satu bagian yang paling perlu dirapikan. Istilah yang sama sudah miring di sebagian paragraf, tetapi kembali tegak pada intisari, keterangan gambar, atau kesimpulan.

EYD V mengatur bahwa kata atau ungkapan asing ditulis miring, sedangkan nama diri—termasuk merek—tidak otomatis dimiringkan. [EYD V: Huruf Miring](https://ejaan.kemendikdasmen.go.id/eyd/penggunaan-huruf/huruf-miring/)

| Istilah | Temuan dalam makalah | Saran |
| ----- | ----- | ----- |
| *dispatcher* | Tidak konsisten antara pendahuluan, intisari, pembahasan, dan kesimpulan. | Miringkan setiap penggunaan sebagai istilah asing, atau gunakan padanan peran yang tepat secara konsisten. |
| *dashboard* | Masih tegak pada intisari, beberapa keterangan gambar, dan kesimpulan; teks lain sudah memakai “dasbor”. | **Gunakan “dasbor” secara konsisten**, tanpa huruf miring. |
| *black box testing* | Miring pada metode pengujian, tetapi tegak pada intisari, kata kunci, dan judul Tabel II. | Gunakan **pengujian kotak hitam**, atau miringkan frasa Inggrisnya secara konsisten. |
| *precision*, *recall* | Miring pada pembahasan evaluasi, tetapi tegak pada intisari dan kesimpulan. | Pertahankan kedua istilah dengan huruf miring secara konsisten. |
| *Design Science Research Methodology* | Miring pada metode, tetapi tegak pada intisari. | Samakan penulisannya; singkatan **DSRM** tetap tegak. |
| *backend*, *dataset* | Masih tegak pada beberapa bagian. | Gunakan padanan seperti “sisi server” dan “kumpulan data”, atau format miring jika mempertahankan istilah Inggris. |
| Mapbox Directions | Dimiringkan dalam paragraf pengujian rute, hlm. 3\. | **Tegakkan**, karena merupakan nama produk/layanan. |

Nama **PreHub, Next.js, FastAPI, LangGraph, Mapbox Directions, dan Open-Meteo** tidak perlu dimiringkan hanya karena berbahasa asing.

Untuk pengenal teknis seperti `CrisisState`, `/api/v1/incidents`, dan `SAFE_DETOUR`, bedakan dari istilah dalam kalimat biasa. Pertahankan ejaan persis sesuai implementasi dan gunakan format yang konsisten.

## **3\. Koreksi bahasa dan kalimat**

Berikut contoh yang paling jelas. Sebagian merupakan koreksi kaidah, sebagian merupakan penyuntingan agar kalimat lebih efektif.

| Lokasi | Teks sekarang | Usulan |
| ----- | ----- | ----- |
| Hlm. 1, intisari | “Namun laporan cuaca, …” | **“Namun, laporan cuaca, …”** |
| Hlm. 1, pendahuluan | “Kejadian pada pengiriman pangan … mendapati laporan gangguan jalan …” | Subjek “kejadian” tidak tepat untuk tindakan “mendapati”. Misalnya: **“Dalam pengiriman pangan dari Belawan menuju Tebing Tinggi, operator menerima laporan gangguan jalan …”** Sesuaikan dengan kejadian/skenario yang sebenarnya. |
| Hlm. 1 | “Dengan demikian diperlukan kajian …” | **“Dengan demikian, diperlukan kajian …”** |
| Hlm. 1 | “Berlandaskan dari kebutuhan tersebut …” | **“Berdasarkan kebutuhan tersebut …”** atau **“Berlandaskan kebutuhan tersebut …”** |
| Hlm. 1 | “Sedangkan ruang lingkupnya berupa …” | Lebih efektif: **“Ruang lingkup penelitian ini dibatasi pada …”** |
| Hlm. 2 | “… informasi armada yang berada terpisah, sementara ini perlu terintegrasi …” | **“… informasi armada yang masih terpisah, padahal informasi tersebut perlu diintegrasikan …”** |
| Hlm. 2 | “Kedua agen ini bertemu pada Gerbang konsensus.” | **“… pada gerbang konsensus.”** Huruf kapital tidak diperlukan untuk istilah umum tersebut. |
| Hlm. 2 | “Hasil pendukung keputusan ditampilkan dalam Antarmuka Next.js terhubung dengan backend FastAPI.” | **“Hasil analisis pendukung keputusan ditampilkan melalui antarmuka Next.js yang terhubung dengan layanan sisi server FastAPI.”** |
| Hlm. 2 | “… pendukung keputusan sedangkan keputusan yang tidak memenuhi syarat …” | Tambahkan koma sebelum **“sedangkan”**. |
| Hlm. 5 | “Precision dihitung melalui,” | **“Nilai *precision* dihitung dengan rumus berikut:”** Terapkan pola yang sama untuk *recall*. |

Koma setelah penghubung antarkalimat dan sebelum “sedangkan” dalam kalimat pertentangan mempunyai dasar langsung dalam EYD V. [EYD V: Tanda Koma](https://ejaan.kemendikdasmen.go.id/eyd/penggunaan-tanda-baca/tanda-koma/)

Kalimat pembuka intisari juga dapat dipadatkan:

> Kelancaran distribusi pangan memerlukan pemantauan gangguan yang terintegrasi dengan informasi armada dan pilihan mitigasi.

Ini lebih langsung daripada rangkaian “pemantauan yang memuat informasi berupa gangguan yang dapat terhubung …”.

## **4\. Konsistensi ilmiah dan daftar pustaka**

* **Definisikan singkatan teknis saat pertama digunakan.** API dan OSINT belum diperkenalkan secara memadai. Pada rumus evaluasi, jelaskan pula TP, FP, dan FN.  
* **Samakan jumlah angka desimal.** Nilai *precision* pada rumus tertulis **1,000**, sedangkan pada intisari dan kesimpulan **1,0000**. Nilainya sama, tetapi penyajiannya sebaiknya seragam.  
* **Rapikan rujukan persamaan.** Template mengarahkan penggunaan “(1)” di tengah kalimat. Frasa “menurut persamaan (1)” dapat menjadi **“menurut (1)”**.  
* **Seragamkan format nama jurnal.** Pada referensi \[1\] dan \[5\], nama jurnal sudah miring, tetapi pada beberapa entri lain—misalnya \[4\], \[8\], \[9\], dan \[10\]—belum. Ikuti satu pola bibliografi IEEE sesuai template. Jangan memiringkan seluruh judul artikel hanya karena berbahasa Inggris.  
* **Perhatikan keterbacaan tangkapan layar.** Gambar 4 dan 6 memiliki detail antarmuka yang kecil. Walaupun resolusinya memadai, potongan gambar yang lebih terfokus dapat membuat bukti visual lebih mudah dibaca.

## **5\. Hal yang perlu dikonfirmasi, bukan langsung diubah**

**Identitas penerbit pada kepala/kaki halaman.** Masih terdapat `ISSN: xxxxxx` dan “Volume 1 Nomor 1 September 2024”. Ini tampaknya bawaan template. Konfirmasikan kepada panitia apakah harus dipertahankan atau akan diperbarui oleh editor. **Jangan mengarang ISSN atau langsung mengganti tahun menjadi 2026\.**

**Judul pendek pada kaki halaman.** Tertulis “PreHub: Sistem Peringatan Dini…”, sedangkan judul utama tidak memuat “Dini”. Jika bagian ini merupakan tanggung jawab penulis, sinkronkan dengan judul final.

**Ketidakkonsistenan template sendiri.** Petunjuk menyebut jarak antarkolom **7,1 mm**, tetapi pengaturan dokumen template sekitar **4,2 mm**. Ketentuan ukuran keterangan gambar juga tidak sepenuhnya seragam antara tabel panduan dan uraian. Ini bukan kesalahan yang patut langsung dibebankan kepada makalah; perlu mengikuti klarifikasi panitia atau gaya bawaan template yang disepakati.

## **6\. Bagian yang sudah sesuai**

* Jumlah halaman **5**, sesuai batas **4–5 halaman**.  
* **Judul tepat 12 kata**, memenuhi batas template. Jadi, dugaan awal saya bahwa judul terlalu panjang tidak berlaku.  
* Terdapat **5 kata kunci**, sesuai ketentuan **4–8**.  
* Nama penulis tidak disertai gelar akademik.  
* Struktur empat bagian utama dan referensi sudah tersedia.  
* Penomoran gambar memakai angka Arab dan tabel memakai angka Romawi.  
* Pemisah desimal sudah menggunakan koma.  
* Tidak ditemukan anotasi pranala aktif dalam PDF, meskipun beberapa URL tampak biru dan bergaris bawah.

**Kesimpulan:** prioritaskan ekspor A4, panjang intisari, alamat surel, dan konsistensi istilah terlebih dahulu; kemudian rapikan kalimat, rumus, serta referensi. Review ini menilai bahasa dan kepatuhan format—bukan validasi ulang hasil penelitian atau keabsahan seluruh sumber pustaka.

