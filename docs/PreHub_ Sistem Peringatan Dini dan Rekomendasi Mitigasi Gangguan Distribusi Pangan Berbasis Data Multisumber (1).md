PreHub: Sistem Peringatan Dini dan Rekomendasi Mitigasi Gangguan Distribusi Pangan Berbasis Data Multisumber 

**2\. Latar Belakang Ide Perangkat Lunak**

Ketahanan pangan tidak hanya ditentukan oleh ketersediaan komoditas, tetapi juga oleh kemampuan sistem distribusi menjaga kesinambungan pasokan antarwilayah. Di Indonesia, rantai pasok pangan melibatkan jaringan produksi, penyimpanan, perdagangan, dan transportasi yang menghubungkan wilayah dengan karakteristik geografis dan infrastruktur yang berbeda. Perspektif rantai pasok dan logistik menunjukkan bahwa ketahanan pangan berkaitan erat dengan kemampuan sistem distribusi menghadapi gangguan dan menjaga kelancaran aliran komoditas (Islah et al., 2021).

Kerentanan tersebut menjadi semakin penting ketika terjadi gangguan pada jaringan transportasi. Tinjauan terhadap penelitian mengenai gangguan rantai pasok pangan menunjukkan bahwa gangguan iklim, bencana lingkungan, serta gangguan logistik dan infrastruktur dapat menghambat aliran produk dan berdampak terhadap ketersediaan, kualitas, maupun biaya pangan (Mishra et al., 2024). Dalam konteks Indonesia, Yudha dan Roche (2023) menunjukkan bahwa pembatasan transportasi selama pandemi COVID-19 memberikan dampak yang berbeda terhadap rantai pasok dan margin perdagangan berbagai komoditas pangan antarwilayah. Temuan tersebut menunjukkan bahwa gangguan pada jaringan transportasi tidak menghasilkan konsekuensi yang seragam, tetapi bergantung pada komoditas, wilayah, dan kondisi rantai pasok yang terdampak.

Permasalahan tersebut tidak hanya berkaitan dengan keberadaan gangguan, tetapi juga dengan kemampuan pelaku distribusi memperoleh dan menginterpretasikan informasi mengenai kondisi operasional. Literatur mengenai supply chain visibility menunjukkan bahwa visibilitas membutuhkan akses terhadap informasi yang akurat dan tepat waktu, sementara implementasinya masih menghadapi kendala pada sistem informasi, komunikasi, pemantauan, dan metrik pengambilan keputusan (Freichel et al., 2022). Pada rantai pasok beras Indonesia, penelitian terbaru juga menemukan bahwa fragmentasi data dan keterbatasan transparansi dapat menyebabkan inefisiensi pada proses produksi hingga distribusi, sehingga diperlukan sistem informasi yang mampu menghubungkan informasi antarbagian rantai pasok (Azis et al., 2026).

Kebutuhan terhadap kemampuan tersebut menjadi semakin nyata ketika gangguan berkembang dalam waktu singkat. Pada rangkaian banjir dan longsor di Sumatra pada akhir 2025, BNPB melaporkan bahwa kerusakan jalan dan jembatan menyebabkan sejumlah wilayah terisolasi sehingga distribusi logistik harus menggunakan kombinasi jalur darat, laut, dan udara. Kondisi tersebut menunjukkan bahwa perubahan aksesibilitas jaringan transportasi dapat berlangsung cepat dan memerlukan penyesuaian keputusan distribusi berdasarkan kondisi aktual serta alternatif yang tersedia (Badan Nasional Penanggulangan Bencana \[BNPB\], 2025).

Di sisi lain, penelitian mengenai ketahanan rantai pasok pertanian di Indonesia menekankan pentingnya digitalisasi, kolaborasi, fleksibilitas, dan kemampuan adaptasi dalam menghadapi gangguan (Keefe et al., 2024; Wangke et al., 2026). Digitalisasi dapat meningkatkan koordinasi dan efisiensi rantai pasok, tetapi manfaat tersebut bergantung pada kemampuan sistem dalam menghubungkan informasi yang relevan dengan kebutuhan operasional pengguna.

Berdasarkan kondisi tersebut, terdapat kebutuhan akan perangkat lunak yang tidak hanya mengumpulkan informasi, tetapi mengubah data multisumber menjadi konteks operasional yang dapat digunakan untuk merespons gangguan. PreHub dikembangkan sebagai sistem peringatan dini dan rekomendasi mitigasi gangguan distribusi pangan berbasis data multisumber. Sistem mengintegrasikan informasi mengenai kondisi cuaca, lalu lintas, perjalanan, serta kejadian dari sumber publik; mengidentifikasi indikasi gangguan; memvalidasi bukti dari sumber yang relevan; menganalisis dampaknya terhadap koridor distribusi; dan membandingkan alternatif mitigasi seperti Continue, Reroute, atau Hold/Delay. PreHub dirancang sebagai human-in-the-loop decision-support system, sehingga rekomendasi sistem menjadi dasar pertimbangan, sedangkan keputusan akhir tetap berada pada operator.

**3\. Tujuan dan Manfaat Dikembangkannya Perangkat Lunak**

**3.1 Tujuan**

Pengembangan PreHub bertujuan untuk:

1. **Membangun visibilitas operasional distribusi pangan berbasis data multisumber** dengan mengintegrasikan informasi cuaca, lalu lintas, kondisi perjalanan, dan kejadian dari sumber publik ke dalam satu konteks spasial-temporal yang dapat dipantau oleh operator.  
2. **Mendeteksi indikasi gangguan secara lebih dini** dengan mengidentifikasi perubahan kondisi yang berpotensi memengaruhi koridor distribusi sebelum dampaknya berkembang menjadi gangguan operasional yang lebih besar.  
3. **Meningkatkan keandalan peringatan melalui validasi berbasis bukti**, dengan mempertimbangkan kualitas, kebaruan, kesesuaian spasial-temporal, serta independensi sumber sebelum suatu indikasi digunakan dalam penilaian risiko.  
4. **Menerjemahkan indikasi gangguan menjadi estimasi dampak operasional**, meliputi koridor terdampak, perubahan estimasi waktu perjalanan, tingkat eksposur perjalanan, serta konsekuensi terhadap operasi distribusi.  
5. **Menyediakan alternatif mitigasi yang dapat dibandingkan secara operasional**, termasuk melanjutkan perjalanan (*Continue*), melakukan pengalihan rute (*Reroute*), atau menunda perjalanan (*Hold/Delay*) berdasarkan kondisi, kendala, dan risiko yang tersedia.  
6. **Mendukung pengambilan keputusan yang dapat ditelusuri dan tetap berada dalam kendali operator**, melalui penyajian *Evidence Chain* yang menghubungkan sumber data, hasil analisis, penilaian risiko, dan rekomendasi tindakan.  
7. **Mengevaluasi efektivitas PreHub secara kuantitatif dan end-to-end**, mencakup kinerja deteksi, kualitas kalibrasi probabilitas, ketepatan estimasi dampak, kelayakan alternatif mitigasi, waktu penyelesaian tugas, serta usability sistem.

**3.2 Manfaat**

1\. Bagi Operations Coordinator / Logistics Dispatcher

PreHub membantu operator mengurangi beban pengumpulan dan interpretasi informasi secara manual dengan menyajikan kondisi distribusi, bukti gangguan, dampak operasional, dan alternatif mitigasi dalam satu alur keputusan. Operator dapat memeriksa dasar suatu peringatan, membandingkan konsekuensi setiap alternatif, serta menentukan tindakan tanpa menyerahkan kewenangan keputusan kepada sistem.

2\. Bagi Perusahaan Logistik

PreHub menyediakan dukungan untuk merespons gangguan secara lebih proaktif melalui deteksi awal, pemantauan risiko koridor, analisis perubahan perjalanan, dan perbandingan alternatif mitigasi. Digitalisasi dan integrasi informasi dalam rantai pasok pertanian Indonesia telah dikaitkan dengan peningkatan koordinasi, efisiensi logistik, serta kemampuan menghadapi gangguan, meskipun penerapannya tetap menghadapi kendala infrastruktur dan kualitas data (Keefe et al., 2024).

3\. Bagi Ketahanan Distribusi Pangan

PreHub mendukung aspek adaptasi distribusi ketika terjadi gangguan dengan membantu pelaku logistik mempertahankan pilihan operasional, seperti melanjutkan perjalanan, mengalihkan rute, atau menunda perjalanan. Kemampuan mempertahankan aliran distribusi melalui kombinasi kapasitas yang tersedia dan respons adaptif merupakan salah satu aspek penting dalam ketahanan operasi logistik rantai pasok pangan (Umar & Wilson, 2024).

4\. Bagi Kualitas Pengambilan Keputusan

PreHub membantu mengubah informasi yang tersebar menjadi konteks keputusan yang terstruktur. Evidence Chain memungkinkan operator menelusuri hubungan antara data, indikasi, validasi, dampak, risiko, dan rekomendasi sehingga keputusan tidak hanya bergantung pada satu sumber informasi atau interpretasi yang tidak terdokumentasi.

5\. Bagi Pengembangan Sistem dan Evaluasi Operasional

PreHub menyimpan informasi mengenai peringatan, keputusan, dan hasil aktual sehingga kinerja sistem dapat dievaluasi secara berkelanjutan. Evaluasi dapat dilakukan terhadap ketepatan deteksi, false-positive rate, waktu deteksi, kalibrasi probabilitas, estimasi perjalanan, kelayakan rekomendasi, serta waktu penyelesaian tugas pengguna. Dengan demikian, peningkatan sistem dapat didasarkan pada hasil pengujian, bukan hanya persepsi keberhasilan.

3.3 Indikator Manfaat yang Dapat Diukur

Manfaat PreHub dievaluasi melalui indikator yang menghubungkan kemampuan perangkat lunak dengan hasil operasional yang diharapkan: 

| Aspek manfaat | Indikator evaluasi |
| ----- | ----- |
| Deteksi dini | Precision, Recall, F1-score, *false-positive rate*, detection latency |
| Keandalan probabilitas | Brier Score dan calibration analysis |
| Analisis perjalanan | Perbedaan ETA prediksi dengan ETA aktual |
| Mitigasi | Kelayakan rute, constraint violations, ETA, dan risiko alternatif |
| Pengambilan keputusan | Waktu penyelesaian tugas dan waktu memahami insiden |
| Usability | Task completion, error rate, dan penilaian usability |
| Keputusan operator | Accept, reject, atau override terhadap rekomendasi |
| Hasil aktual | Perbandingan prediksi dengan kondisi aktual setelah keputusan |

**4\. Batasan Perangkat Lunak yang Dikembangkan**

PreHub dibatasi sebagai sistem peringatan dini dan decision-support untuk mitigasi gangguan distribusi pangan pada koridor logistik, dengan pengguna utama Operations Coordinator atau Logistics Dispatcher. Batasan pengembangan ditetapkan agar fungsi perangkat lunak, sumber data, cakupan implementasi, dan tingkat otomasi dapat dievaluasi secara terukur.

4.1 Batasan Fungsi

PreHub mencakup integrasi data multisumber, pemantauan kondisi koridor, deteksi indikasi gangguan, validasi bukti, analisis dampak perjalanan, perbandingan alternatif mitigasi, dan penyajian rekomendasi. Alternatif tindakan yang didukung meliputi Continue, Reroute, dan Hold/Delay.

PreHub tidak menggantikan Transportation Management System (TMS), Enterprise Resource Planning (ERP), sistem navigasi kendaraan, maupun sistem dispatch perusahaan. Sistem juga tidak melakukan pengendalian armada secara langsung. Perubahan rute, keberangkatan, penundaan, maupun tindakan operasional lainnya tetap menjadi keputusan operator.

4.2 Batasan Pengguna dan Pengambilan Keputusan

Pengguna utama PreHub adalah personel yang bertanggung jawab memantau perjalanan dan menentukan respons operasional. Sistem dirancang dengan pendekatan human-in-the-loop: PreHub memberikan indikasi, analisis, bukti, dan alternatif tindakan, sedangkan keputusan akhir tetap berada pada operator.

Keluaran AI, termasuk hasil interpretasi informasi tidak terstruktur dan rekomendasi berbasis model, tidak diperlakukan sebagai fakta atau keputusan final. Informasi tersebut harus melalui mekanisme validasi dan dapat ditelusuri melalui Evidence Chain. Pendekatan ini mempertahankan pembagian tanggung jawab antara sistem dan manusia dalam pengambilan keputusan berbantuan AI (Tabassi, 2023).

4.3 Batasan Data

PreHub menggunakan kombinasi data terstruktur dan tidak terstruktur, meliputi informasi cuaca, lalu lintas, perjalanan atau posisi armada apabila tersedia, serta berita dan laporan publik/OSINT. Setiap sumber memiliki perbedaan dalam cakupan geografis, frekuensi pembaruan, kelengkapan, dan reliabilitas.

Karena itu, PreHub tidak menjamin ketersediaan maupun kelengkapan informasi kondisi lapangan secara real-time. Keterlambatan, kehilangan, atau konflik antarsumber dapat menyebabkan sistem menurunkan tingkat keyakinan, mempertahankan suatu kejadian sebagai indikasi, atau meminta verifikasi operator.

Informasi OSINT tidak dianggap sebagai ground truth. Informasi tersebut terlebih dahulu melalui ekstraksi, penyaringan relevansi, deduplikasi, geocoding, penyelarasan spasial-temporal, dan validasi dengan bukti lain sebelum digunakan dalam penilaian risiko.

4.4 Batasan Data Pengujian

Data yang belum tersedia secara langsung dapat direpresentasikan menggunakan data simulasi atau fixture untuk menguji alur perangkat lunak. Data simulasi digunakan untuk merepresentasikan kondisi pengujian tertentu dan selalu dibedakan dari data operasional aktual.

Penggunaan fixture tidak digunakan untuk mengklaim bahwa PreHub telah memiliki akses terhadap seluruh sumber data lapangan secara real-time. Evaluasi terhadap data simulasi juga dilaporkan secara terpisah dari evaluasi menggunakan data aktual agar hasil pengujian tidak disalahartikan.

4.5 Batasan Wilayah dan Skenario

Pengembangan dan validasi awal PreHub difokuskan pada koridor logistik strategis di Sumatra. Cakupan tersebut digunakan sebagai lingkungan pengembangan dan pengujian, bukan sebagai klaim bahwa sistem telah siap mengelola seluruh jaringan distribusi pangan Indonesia.

Skenario gangguan yang menjadi fokus meliputi kondisi yang dapat memengaruhi aksesibilitas atau kelancaran perjalanan, seperti gangguan cuaca, anomali lalu lintas, gangguan infrastruktur, dan kejadian lokal yang teridentifikasi melalui sumber publik. PreHub tidak mencakup pengelolaan seluruh aspek produksi, pergudangan, perdagangan, harga, atau kebijakan pangan nasional.

4.6 Batasan Otomasi dan Integrasi

PreHub bersifat human-in-the-loop dan tidak melakukan tindakan eksternal secara otomatis. Sistem tidak mengubah rute kendaraan, mengirim instruksi kepada pengemudi, mengendalikan kendaraan, maupun melakukan intervensi terhadap infrastruktur transportasi.

Integrasi langsung dengan TMS, ERP, sistem dispatch internal perusahaan, atau perangkat kendaraan berada di luar cakupan pengembangan awal. Demikian pula, aplikasi khusus untuk pengemudi tidak menjadi bagian dari MVP.

Dengan batasan tersebut, PreHub difokuskan pada satu fungsi inti yang dapat diuji secara end-to-end:

mendeteksi gangguan → memvalidasi bukti → memperkirakan dampak → membandingkan mitigasi → mendukung keputusan operator.

**5\. Metodologi Pengembangan Perangkat Lunak**

Pengembangan PreHub menggunakan Agile dengan pendekatan incremental dan iterative prototyping yang disesuaikan dengan karakteristik sistem berbasis data, AI, dan pengambilan keputusan. Pendekatan ini dipilih karena kebutuhan perangkat lunak, kualitas data, konfigurasi model, serta hasil analitik PreHub perlu divalidasi secara bertahap dan dapat mengalami perubahan berdasarkan hasil pengujian. Pendekatan incremental memungkinkan pengembangan dilakukan melalui penambahan fungsi yang dapat diuji, sedangkan pendekatan iteratif memungkinkan hasil pengujian digunakan sebagai dasar penyempurnaan pada siklus berikutnya. Prinsip tersebut sejalan dengan pengembangan sistem ML yang menempatkan eksperimen, validasi, pembangunan pipeline, dan produksi sebagai proses yang dapat berlangsung secara iteratif (Google for Developers, 2025).

Pengembangan PreHub dilakukan melalui lima tahap utama, yaitu analisis kebutuhan, perancangan solusi, implementasi incremental, validasi dan pengujian, serta evaluasi dan iterasi.

5.1 Analisis Kebutuhan

Tahap pertama mengidentifikasi kebutuhan Operations Coordinator atau Logistics Dispatcher, kondisi operasional yang perlu dipantau, jenis gangguan yang relevan, sumber informasi yang tersedia, serta keputusan yang perlu didukung oleh perangkat lunak. Kebutuhan kemudian diterjemahkan menjadi kebutuhan fungsional dan kriteria evaluasi, seperti kemampuan mendeteksi gangguan, memvalidasi bukti, mengidentifikasi dampak perjalanan, membandingkan alternatif mitigasi, dan menyediakan informasi yang dapat ditelusuri.

Keluaran tahap: kebutuhan pengguna, kebutuhan fungsional, skenario penggunaan, kebutuhan data, serta indikator evaluasi.

5.2 Perancangan Solusi

Berdasarkan kebutuhan tersebut, dirancang arsitektur perangkat lunak, struktur data spasial-temporal, alur pemrosesan data, pembagian fungsi antarkomponen, multi-agent workflow, mekanisme validasi bukti, penilaian risiko, serta antarmuka pengguna. Setiap komponen dirancang dengan keluaran yang terstruktur agar dapat diuji secara independen sebelum digunakan dalam alur end-to-end.

Pada tahap ini juga ditentukan hubungan antara keluaran sistem dengan indikator evaluasi. Dengan demikian, komponen tidak hanya dirancang berdasarkan fungsi yang diharapkan, tetapi juga berdasarkan cara keberhasilannya akan diukur.

5.3 Implementasi Incremental dan Eksperimen

Implementasi dilakukan secara bertahap berdasarkan prioritas fungsi inti. Increment awal berfokus pada pipeline akuisisi dan normalisasi data, kemudian dilanjutkan dengan deteksi dan validasi gangguan, analisis dampak, rekomendasi mitigasi, serta integrasi antarmuka.

Komponen berbasis AI dikembangkan melalui eksperimen terkontrol. Perubahan terhadap model, konfigurasi, prompt, atau aturan analitik diuji terhadap skenario dan metrik yang telah ditentukan. Hasil eksperimen dicatat dan dibandingkan dengan versi sebelumnya sehingga perubahan yang dilakukan dapat dievaluasi secara objektif. Praktik tersebut penting dalam sistem ML karena perubahan kecil pada data, fitur, model, atau konfigurasi dapat memengaruhi performa sistem secara keseluruhan (Google for Developers, 2025).

Keluaran tahap: increment perangkat lunak yang dapat dijalankan, konfigurasi/model yang diuji, serta hasil eksperimen.

5.4 Validasi dan Pengujian

Setiap increment melalui pengujian sebelum diintegrasikan ke dalam sistem. Pengujian dilakukan pada beberapa tingkat.

Pertama, component testing digunakan untuk memeriksa fungsi individual, seperti validasi data, API, pemrosesan spasial-temporal, ekstraksi informasi, dan modul analitik.

Kedua, integration testing digunakan untuk memastikan keluaran suatu komponen dapat digunakan dengan benar oleh komponen berikutnya. Pada sistem ML, pengujian integrasi penting karena perubahan pada satu bagian pipeline dapat menyebabkan kegagalan pada komponen lain (Google for Developers, 2025).

Ketiga, scenario-based testing digunakan untuk menguji alur PreHub secara end-to-end pada kondisi gangguan yang telah ditentukan. Skenario digunakan untuk mengevaluasi apakah sistem mampu melakukan alur deteksi → validasi → analisis dampak → rekomendasi → keputusan secara konsisten.

Evaluasi dilakukan menggunakan metrik yang sesuai dengan karakteristik setiap komponen, termasuk precision, recall, F1-score, false-positive rate, detection latency, Brier Score dan calibration analysis, estimasi waktu perjalanan, kelayakan rute, constraint violations, waktu komputasi, serta indikator usability dan waktu pengambilan keputusan.

Keluaran tahap: hasil pengujian komponen, hasil integrasi, hasil scenario-based testing, dan metrik evaluasi.

5.5 Evaluasi Pengguna dan Iterasi

Setelah sistem dapat menjalankan alur end-to-end, dilakukan evaluasi terhadap penggunaan perangkat lunak berdasarkan tugas yang harus diselesaikan operator. Evaluasi mencakup kemampuan pengguna memahami kondisi, menemukan bukti, mengidentifikasi dampak, membandingkan alternatif, dan menentukan tindakan.

Hasil evaluasi digunakan untuk menentukan kebutuhan iterasi berikutnya, baik pada antarmuka, workflow, integrasi data, konfigurasi agen, maupun parameter keputusan. Untuk komponen AI, hasil pengujian juga dibandingkan dengan versi sebelumnya untuk memastikan perubahan menghasilkan perbaikan atau setidaknya tidak menurunkan performa secara material. Praktik membandingkan versi dan memonitor kualitas secara berkelanjutan merupakan bagian penting dari pengembangan sistem ML yang dapat dipelihara (Google for Developers, 2025).

Siklus tersebut berlangsung secara berulang hingga tercapai increment yang memenuhi kriteria fungsional dan evaluasi yang telah ditentukan. Dengan demikian, metodologi PreHub tidak berhenti pada penyelesaian fitur, tetapi memastikan bahwa setiap penambahan fungsi menghasilkan perangkat lunak yang dapat dijalankan, diuji, diukur, dan diperbaiki berdasarkan bukti.

6\. Analisis Kebutuhan dan Desain Solusi Perangkat Lunak 

6.1 Analisis Kebutuhan Pengguna

PreHub dirancang untuk *Operations Coordinator* atau *Logistics Dispatcher*, yaitu pengguna yang memantau perjalanan distribusi dan menentukan respons ketika kondisi operasional berubah. Dalam menghadapi gangguan, pengguna membutuhkan informasi yang tidak hanya menunjukkan kondisi saat ini, tetapi juga membantu menjawab lima pertanyaan operasional: 

| Pertanyaan pengguna  | Kebutuhan sistem  |
| ----- | ----- |
| Apa yang terjadi?  | Deteksi kejadian dan identifikasi lokasi, waktu, serta jenis gangguan  |
| Seberapa kuat buktinya?  | Penyajian sumber, kualitas, kebaruan, dan validasi bukti  |
| Apakah perjalanan terdampak?  | Analisis hubungan gangguan dengan koridor dan perjalanan |
| Seberapa besar dampaknya?  | Estimasi keterlambatan, eksposur, dan risiko operasional  |
| Apa yang dapat dilakukan?  | Perbandingan Continue, Reroute, dan Hold/Delay  |

Kebutuhan tersebut diterjemahkan menjadi fungsi utama PreHub: integrasi data multisumber, deteksi indikasi gangguan, validasi bukti, estimasi probabilitas, analisis dampak, penilaian risiko, optimasi alternatif mitigasi, penyajian *Evidence Chain*, serta pencatatan keputusan dan hasil aktual. Sistem tidak menggantikan TMS, sistem navigasi, atau kewenangan operator. PreHub berfungsi sebagai lapisan *decision support* yang mengubah informasi terfragmentasi menjadi konteks operasional yang dapat digunakan untuk mengambil keputusan. 

6.2 Desain Solusi dan Integrasi Data

PreHub menggunakan arsitektur pengolahan data multisumber untuk menggabungkan data terstruktur dan tidak terstruktur. Data terstruktur dapat berasal dari informasi cuaca BMKG, kondisi lalu lintas TomTom, data posisi armada apabila tersedia, serta keluaran model prakiraan cuaca. Sementara itu, berita dan laporan publik/OSINT digunakan untuk menangkap informasi kejadian lokal yang belum tentu segera tersedia pada sistem operasional terstruktur. Sebelum digunakan oleh modul analitik, setiap sumber melalui tahapan normalisasi format, sinkronisasi waktu, geocoding, deduplikasi, serta penyelarasan spasial terhadap koridor distribusi. Setiap informasi juga mempertahankan metadata seperti sumber, waktu pengambilan, lokasi, tipe informasi, dan status kualitas sehingga asal-usul bukti tetap dapat ditelusuri.

Untuk informasi tidak terstruktur, Intelligence Agent mengolah berita dan laporan publik menjadi representasi kejadian terstruktur yang sekurang-kurangnya memuat lokasi, waktu kejadian, jenis gangguan, tingkat keparahan, sumber informasi, serta bukti yang mendukung ekstraksi tersebut. 

Untuk data prakiraan, FourCastNet digunakan sebagai komponen pembentuk sinyal cuaca masa depan. FourCastNet merupakan model prakiraan cuaca berbasis Adaptive Fourier Neural Operator yang menghasilkan prakiraan variabel atmosfer seperti angin dan presipitasi pada rentang waktu pendek hingga menengah (Pathak et al., 2022). Dalam PreHub, keluaran tersebut tidak dianggap sebagai prediksi langsung terhadap keterlambatan armada. Hasil prakiraan terlebih dahulu diterjemahkan menjadi sinyal kondisi cuaca, kemudian disejajarkan secara spasial dan temporal dengan koridor distribusi untuk menilai potensi gangguan operasional.

Hasil integrasi tidak langsung dianggap sebagai fakta gangguan. Data tersebut membentuk evidence objects yang kemudian diproses oleh modul analitik sesuai domainnya. Dengan desain ini, PreHub memisahkan tiga lapisan:

Data mentah → Evidence terstruktur → Konteks operasional

Pemisahan tersebut memungkinkan kualitas sumber dan hasil analisis dievaluasi secara terpisah serta mencegah satu sumber yang tidak lengkap langsung menentukan keputusan sistem.

6.3 Desain Deteksi dan Validasi Gangguan

PreHub membedakan indikasi gangguan dari gangguan yang telah tervalidasi. Setiap agen menghasilkan sinyal berdasarkan domainnya, misalnya peningkatan risiko cuaca, anomali lalu lintas, atau laporan kejadian di suatu lokasi. Setiap sinyal dilengkapi metadata mengenai sumber, waktu pengambilan, lokasi, jenis bukti, kualitas data, serta tingkat keyakinan yang diperoleh melalui metode yang sesuai dengan karakteristik sumber. Sinyal tersebut kemudian dikumpulkan oleh Consensus Engine untuk menentukan apakah bukti yang tersedia cukup kuat untuk membentuk suatu kejadian yang tervalidasi.

Validasi tidak dilakukan dengan menghitung jumlah sumber secara sederhana karena beberapa sumber dapat memiliki ketergantungan informasi. Sebagai contoh, BMKG dan FourCastNet sama-sama memberikan informasi mengenai kondisi atmosfer sehingga tidak seharusnya dianggap sebagai dua bukti lapangan yang sepenuhnya independen. Oleh karena itu, PreHub mengelompokkan bukti berdasarkan domain dan sumbernya, kemudian mempertimbangkan independensi, kualitas, ketepatan waktu, kesesuaian spasial, dan konsistensi antarsumber. Bukti dari kondisi atmosfer, lalu lintas, dan laporan kejadian lapangan memiliki nilai validasi yang lebih kuat apabila menunjukkan kondisi yang konsisten dibandingkan beberapa keluaran model yang berasal dari fenomena yang sama.

6.4 Penentuan Confidence dan Probabilitas Risiko

PreHub memisahkan **evidence confidence** dari **probabilitas gangguan** karena keduanya merepresentasikan konsep yang berbeda.

**Evidence confidence** menunjukkan kekuatan dukungan suatu bukti terhadap indikasi tertentu. Penilaiannya mempertimbangkan kualitas sumber, kelengkapan informasi, kebaruan, kesesuaian spasial-temporal, serta konsistensi dengan bukti lain.

Sementara itu, **probabilitas gangguan** menunjukkan kemungkinan bahwa kondisi yang teridentifikasi benar-benar menghasilkan gangguan operasional pada koridor atau perjalanan yang diamati. Probabilitas tidak diambil langsung dari confidence model bahasa maupun dari jumlah sumber.

Secara konseptual:

> **Evidence → Validation → Disruption Probability**

Probabilitas kemudian dievaluasi menggunakan data pengujian yang memiliki outcome aktual. Kalibrasi diperlukan agar nilai probabilitas memiliki makna empiris. Sebagai contoh, apabila kelompok prediksi dengan probabilitas sekitar 0,70 mengalami gangguan aktual pada sekitar 70% kasus yang sebanding, maka prediksi tersebut menunjukkan kalibrasi yang baik.

Evaluasi probabilitas menggunakan **Brier Score** dan analisis kalibrasi, sedangkan precision, recall, dan F1-score digunakan untuk mengevaluasi kinerja klasifikasi. Dengan demikian, nilai probabilitas tidak diperlakukan sebagai kebenaran hanya karena dihasilkan oleh model, tetapi harus dibandingkan dengan outcome aktual.

6.5 Penentuan Tingkat Risiko Operasional

PreHub tidak menentukan risiko hanya berdasarkan nilai confidence. Suatu kejadian dengan probabilitas tinggi belum tentu memerlukan intervensi apabila dampaknya terhadap perjalanan rendah. Sebaliknya, kejadian dengan probabilitas yang belum terlalu tinggi dapat tetap menjadi prioritas apabila berpotensi menyebabkan keterlambatan besar pada koridor yang kritis. Oleh karena itu, penilaian risiko mempertimbangkan kombinasi probabilitas gangguan dan dampak operasional. Dampak dapat mencakup estimasi keterlambatan, tingkat kepentingan koridor, eksposur armada atau pengiriman, tingkat keparahan kejadian, serta ketersediaan alternatif mitigasi.

Secara konseptual, mekanisme tersebut direpresentasikan sebagai:

Operational Risk \= f(Disruption Probability, Operational Impact) 

Bentuk fungsi, bobot, dan ambang kategorisasi risiko ditentukan berdasarkan karakteristik data dan **dikembangkan serta dievaluasi menggunakan skenario pengujian**, bukan ditetapkan sebagai nilai universal. Threshold kemudian dibandingkan terhadap outcome aktual untuk mengidentifikasi false alarm, missed disruption, dan kesalahan prioritas risiko.

Jika probabilitas tinggi tetapi dampak rendah, sistem tidak otomatis memberikan prioritas intervensi tinggi. Sebaliknya, kejadian dengan probabilitas lebih rendah dapat tetap menjadi prioritas apabila konsekuensi operasionalnya besar dan alternatif mitigasinya terbatas.

6.6 Desain Multi-Agent dan Orkestrasi

PreHub membagi proses analitik menjadi beberapa komponen spesialis berdasarkan domain data dan jenis tugas:

| Komponen | Fungsi utama | Keluaran |
| ----- | ----- | ----- |
| **Weather Agent** | Analisis kondisi dan sinyal prakiraan cuaca | Weather evidence |
| **Traffic Agent** | Analisis kondisi dan perubahan waktu perjalanan | Traffic evidence |
| **Intelligence Agent** | Ekstraksi kejadian dari berita/OSINT | Structured event |
| **Risk Agent** | Menggabungkan evidence dengan konteks operasional | Risk assessment |
| **Logistics Agent** | Mencari alternatif perjalanan berdasarkan kendala | Candidate routes |
| **Decision Agent** | Menyusun hasil menjadi alternatif/rekomendasi yang dapat dipahami | Decision support |

Pembagian tersebut digunakan karena setiap domain memiliki sumber data, metode analisis, dan bentuk keluaran yang berbeda. Agen tidak menghasilkan keputusan final secara independen, tetapi menghasilkan structured outputs yang dapat diproses oleh tahap berikutnya.

Orkestrasi dilakukan menggunakan LangGraph, yang memang dirancang sebagai framework/runtime untuk workflow agen yang stateful dan menyediakan mekanisme graph-based orchestration, termasuk node, edge, branching, persistence, dan human-in-the-loop (LangChain, 2026).

Dalam PreHub, LangGraph berfungsi sebagai orchestrator, bukan sumber kebenaran. Validasi evidence, perhitungan metrik, constraint routing, dan keputusan akhir tetap berada pada lapisan yang dapat diperiksa secara eksplisit.

6.7 Analisis Dampak dan Rekomendasi Mitigasi

Setelah gangguan tervalidasi dan memiliki relevansi terhadap perjalanan, PreHub melakukan analisis dampak untuk menentukan hubungan antara kejadian dan operasi yang terdampak. Analisis mencakup lokasi kejadian, koridor terdampak, perubahan estimasi waktu perjalanan, kendaraan atau pengiriman yang terekspos, serta ketersediaan alternatif.

Untuk alternatif rute, PreHub menggunakan **NVIDIA cuOpt** sebagai mesin optimasi. Permasalahan rute direpresentasikan melalui informasi lingkungan perjalanan, armada, tugas, waktu perjalanan, dan kendala operasional. cuOpt mendukung permasalahan routing seperti Vehicle Routing Problem serta berbagai kendala, termasuk kapasitas kendaraan, *time windows*, prioritas, dan batas operasi (NVIDIA, 2026).

Keluaran optimasi tidak langsung diterapkan kepada armada. PreHub membandingkan alternatif yang tersedia berdasarkan indikator seperti estimasi waktu, kelayakan terhadap *constraint*, dan eksposur risiko. Alternatif utama yang disajikan kepada operator adalah:

* **Continue**: mempertahankan perjalanan,  
* **Reroute**: menggunakan rute alternatif,  
* **Hold/Delay**: menunda perjalanan sampai kondisi lebih sesuai.

Operator kemudian memilih tindakan berdasarkan informasi sistem dan konteks lapangan. Dengan demikian, cuOpt berfungsi sebagai **optimization engine**, sedangkan PreHub berfungsi sebagai lapisan keputusan yang menghubungkan hasil optimasi dengan bukti gangguan dan konteks operasional.

6.8 Transparansi Keputusan dan Evidence Chain

PreHub menyediakan **Evidence Chain** sebagai mekanisme penelusuran hubungan antara data, analisis, risiko, dan rekomendasi. Setiap peringatan dan rekomendasi menyimpan informasi yang memungkinkan operator memeriksa:

**Sumber data → Evidence → Analisis → Validasi → Probabilitas → Dampak → Risiko → Alternatif → Rekomendasi**

Informasi yang ditampilkan meliputi sumber data, waktu pengambilan, lokasi, hasil analisis agen, tingkat confidence bukti, hasil validasi antarsumber, probabilitas gangguan, tingkat risiko, serta aturan atau kondisi yang menyebabkan sistem menghasilkan peringatan. Evidence Chain tidak dimaksudkan untuk menampilkan proses internal model yang tidak dapat diverifikasi. Fokusnya adalah menyediakan **evidence dan decision trace yang relevan bagi operator**. 

Apabila terdapat informasi yang bertentangan atau sumber utama tidak tersedia, sistem tidak memaksakan keputusan. Sistem dapat menurunkan tingkat keyakinan, mempertahankan status sebagai indikasi, atau meminta verifikasi operator apabila bukti yang tersedia belum memenuhi kriteria validasi. Mekanisme tersebut memungkinkan graceful degradation dan mengurangi risiko sistem menghasilkan peringatan dengan kepastian yang tidak didukung oleh data. Operator juga dapat mengoreksi atau membatalkan rekomendasi, sedangkan keputusan dan hasil akhirnya dicatat untuk kebutuhan audit dan evaluasi. Desain ini mendukung transparansi dan interpretabilitas sistem AI, yang merupakan bagian dari karakteristik AI yang dapat dipercaya menurut NIST AI RMF (Tabassi, 2023). 

6.9 Desain Evaluasi Solusi

Evaluasi PreHub dirancang secara bertingkat untuk memastikan bahwa kinerja sistem tidak hanya dinilai dari keluaran akhir, tetapi juga dari kualitas setiap komponen dan keterhubungan antarproses. Evaluasi dilakukan pada tiga tingkat, yaitu **evaluasi komponen, evaluasi integrasi, dan evaluasi sistem secara end-to-end**. Pendekatan ini digunakan karena PreHub terdiri atas beberapa komponen dengan karakteristik yang berbeda, mulai dari pengolahan data multisumber, ekstraksi informasi, validasi evidence, estimasi probabilitas, hingga penyusunan rekomendasi mitigasi. Oleh karena itu, penggunaan satu metrik tunggal tidak cukup untuk menggambarkan kualitas sistem secara keseluruhan.

Pada tingkat **komponen**, setiap modul dievaluasi menggunakan indikator yang sesuai dengan fungsi dan jenis keluarannya. Modul deteksi gangguan, misalnya, dievaluasi menggunakan *precision*, *recall*, *F1-score*, *false-positive rate*, dan *detection latency* untuk menilai kemampuan sistem dalam mengidentifikasi gangguan secara tepat dan tepat waktu. Modul ekstraksi informasi dari OSINT dievaluasi berdasarkan ketepatan identifikasi jenis kejadian, lokasi, waktu, tingkat keparahan, dan relevansi informasi, termasuk kemampuan melakukan deduplikasi terhadap laporan yang membahas kejadian yang sama. Sementara itu, keluaran probabilistik dievaluasi menggunakan **Brier Score** dan analisis kalibrasi untuk memastikan bahwa nilai probabilitas yang dihasilkan memiliki keterkaitan yang sesuai dengan frekuensi outcome aktual. Apabila modul prakiraan cuaca digunakan dalam implementasi, evaluasinya dilakukan menggunakan metrik yang sesuai dengan variabel dan horizon prakiraan, sedangkan modul optimasi rute dievaluasi berdasarkan kelayakan solusi, pemenuhan *constraint*, estimasi waktu perjalanan, dan waktu komputasi.

Pada tingkat **integrasi**, evaluasi berfokus pada keterhubungan antarkomponen dalam alur **data → evidence → validation → probability dan impact → risk → routing → recommendation**. Pengujian dilakukan untuk memastikan bahwa keluaran dari suatu komponen dapat digunakan secara benar oleh komponen berikutnya tanpa kehilangan informasi penting, perubahan konteks, atau kesalahan representasi. Pengujian integrasi juga mencakup kondisi ketika salah satu sumber tidak tersedia, data diterima terlambat, atau beberapa evidence memberikan informasi yang saling bertentangan. Dalam kondisi tersebut, sistem diharapkan tidak menghasilkan keputusan yang tidak dapat dipertanggungjawabkan, melainkan menyesuaikan tingkat keyakinan, mempertahankan status sebagai indikasi, atau menampilkan kebutuhan verifikasi kepada operator.

Pada tingkat **sistem secara end-to-end**, PreHub dievaluasi menggunakan *scenario-based testing* yang merepresentasikan kondisi gangguan distribusi pada koridor logistik. Setiap skenario menguji kemampuan sistem dalam menjalankan proses secara lengkap, mulai dari menerima sinyal gangguan hingga menyajikan alternatif tindakan kepada operator. Evaluasi mencakup kemampuan sistem mengidentifikasi koridor terdampak, tingkat *false alarm*, kesalahan estimasi waktu perjalanan, kemampuan pengguna menelusuri evidence, serta kesesuaian alternatif yang dihasilkan dengan kondisi dan *constraint* pada skenario. Untuk menilai kontribusi PreHub terhadap proses pengambilan keputusan, evaluasi juga dapat mengukur waktu yang dibutuhkan pengguna untuk memahami kejadian dan menentukan tindakan, *task completion rate*, serta pola *accept*, *reject*, atau *override* terhadap rekomendasi sistem.

Hasil dari seluruh tingkat evaluasi digunakan sebagai dasar iterasi pengembangan. Dengan demikian, evaluasi tidak hanya digunakan untuk menyatakan bahwa sistem bekerja, tetapi juga untuk mengidentifikasi komponen yang menjadi sumber kesalahan, menentukan parameter atau *threshold* yang perlu disesuaikan, serta membandingkan hasil sebelum dan sesudah perbaikan. Pendekatan ini memastikan bahwa peningkatan pada satu komponen tidak secara otomatis dianggap meningkatkan kualitas keseluruhan sebelum dampaknya terhadap alur sistem juga diuji.

6.10 Desain Alur Solusi

Secara keseluruhan, PreHub dirancang sebagai sistem *closed-loop decision support* yang menghubungkan proses pemantauan kondisi, validasi informasi, analisis dampak, penyusunan alternatif mitigasi, dan evaluasi hasil keputusan dalam satu alur. Proses dimulai dari akuisisi data multisumber yang mencakup data terstruktur maupun tidak terstruktur. Data yang diperoleh tidak langsung digunakan sebagai dasar keputusan, tetapi terlebih dahulu melalui proses normalisasi format, sinkronisasi waktu, geocoding, deduplikasi, dan penyelarasan terhadap konteks spasial koridor distribusi. Tahap ini menghasilkan representasi evidence yang memiliki informasi mengenai sumber, waktu, lokasi, jenis informasi, dan kualitas data.

Evidence tersebut kemudian diproses oleh komponen analitik sesuai dengan domainnya. Informasi cuaca dianalisis untuk mengidentifikasi kondisi yang berpotensi memengaruhi perjalanan, data lalu lintas digunakan untuk mendeteksi perubahan kondisi operasional, sedangkan informasi dari berita dan OSINT diproses untuk mengidentifikasi kejadian lokal yang relevan. Setiap komponen menghasilkan keluaran terstruktur yang selanjutnya dikirimkan ke mekanisme validasi. PreHub tidak memperlakukan setiap sinyal sebagai gangguan yang telah terkonfirmasi. Melalui *Consensus Engine*, evidence dibandingkan berdasarkan kesesuaian spasial-temporal, kualitas dan kebaruan data, konsistensi informasi, serta tingkat independensi antar-sumber.

Setelah evidence memiliki tingkat dukungan yang memadai, sistem memperkirakan probabilitas terjadinya gangguan dan menganalisis dampaknya terhadap perjalanan atau koridor yang diamati. Probabilitas dan dampak tersebut kemudian digunakan untuk membentuk penilaian risiko operasional. Hasil penilaian risiko tidak hanya menunjukkan apakah suatu kejadian penting untuk diperhatikan, tetapi juga menentukan apakah kondisi tersebut memerlukan analisis mitigasi lebih lanjut. Dalam tahap ini, PreHub membedakan antara kekuatan evidence, kemungkinan terjadinya gangguan, dan besarnya konsekuensi operasional agar seluruh proses tidak bergantung pada satu nilai *confidence* tunggal.

Apabila risiko memerlukan tindakan mitigasi, sistem menghasilkan dan membandingkan alternatif respons, yaitu mempertahankan perjalanan (*Continue*), menggunakan rute alternatif (*Reroute*), atau menunda perjalanan (*Hold/Delay*). Modul optimasi digunakan untuk menghasilkan alternatif yang mempertimbangkan kondisi perjalanan dan *constraint* operasional, sedangkan lapisan pengambilan keputusan menyajikan perbandingan alternatif berdasarkan estimasi waktu, risiko, kelayakan, dan evidence yang mendasarinya. Hasil tersebut disampaikan kepada operator melalui antarmuka yang memungkinkan pengguna menelusuri hubungan antara data sumber, hasil analisis, validasi, risiko, dan rekomendasi melalui *Evidence Chain*.

Keputusan akhir tetap berada pada operator. Tindakan yang dipilih, termasuk keputusan untuk menerima, menolak, atau melakukan *override* terhadap rekomendasi, dicatat bersama hasil aktual apabila data outcome tersedia. Informasi tersebut kemudian digunakan dalam proses evaluasi untuk membandingkan prediksi dan rekomendasi sistem dengan kondisi yang benar-benar terjadi. Hasil evaluasi menjadi masukan bagi iterasi berikutnya, baik dalam bentuk penyesuaian parameter, *threshold*, konfigurasi workflow, maupun penyempurnaan antarmuka dan komponen analitik. Dengan alur tersebut, PreHub tidak berhenti pada penyampaian peringatan, tetapi membentuk siklus **deteksi → validasi → analisis → mitigasi → keputusan → evaluasi → perbaikan**.

7\. Implementasi Perangkat Lunak

7.1 Arsitektur Implementasi

PreHub dikembangkan sebagai aplikasi web dengan arsitektur modular yang memisahkan lapisan antarmuka pengguna, layanan backend, pemrosesan data, penyimpanan, dan integrasi layanan eksternal. Pada implementasi MVP, antarmuka pengguna dibangun menggunakan Next.js, sedangkan layanan backend dan API menggunakan FastAPI. Pemisahan ini memungkinkan proses pemrosesan dan analitik dijalankan pada backend tanpa membebani antarmuka pengguna serta memudahkan pengembangan dan pengujian komponen secara terpisah.

Data aplikasi disimpan menggunakan PostgreSQL dengan dukungan PostGIS untuk menangani data yang memiliki atribut spasial. Struktur penyimpanan digunakan untuk menyimpan informasi perjalanan, kondisi koridor, evidence, hasil analisis, serta informasi lain yang diperlukan dalam alur pengambilan keputusan. Untuk kebutuhan pemrosesan berbasis event, arsitektur PreHub menyediakan mekanisme pemisahan antara proses penerimaan data, pemrosesan, analisis, dan pembaruan informasi pada aplikasi.

Arsitektur tersebut tidak dimaksudkan sebagai kumpulan teknologi yang berdiri sendiri. Setiap lapisan memiliki peran dalam mendukung alur utama PreHub, yaitu menerima informasi dari berbagai sumber, membentuk evidence terstruktur, menjalankan analisis, melakukan validasi, menghasilkan penilaian risiko, dan menyajikan alternatif tindakan kepada operator. Implementasi modular juga memungkinkan komponen yang masih menggunakan fixture atau data simulasi diganti secara bertahap dengan sumber operasional tanpa mengubah keseluruhan antarmuka aplikasi.

7.2 Implementasi Pipeline Data

Data dari sumber eksternal diterima melalui konektor/API yang sesuai, kemudian diproses oleh layanan ingestion sebelum disimpan ke dalam skema internal PreHub. Tahap ini melakukan normalisasi format, penyamaan timestamp, validasi struktur, deduplikasi, geocoding, dan pemetaan lokasi ke indeks spasial H3. H3 digunakan untuk memberikan representasi spasial yang seragam sehingga data dengan format dan resolusi berbeda dapat dibandingkan pada wilayah geografis yang sama. H3 merupakan sistem hierarchical geospatial indexing berbasis sel heksagonal yang dapat digunakan untuk mengelompokkan dan menghubungkan berbagai dataset berdasarkan lokasi.

Setelah dinormalisasi, data diteruskan ke modul analitik melalui event stream. Setiap event menyimpan informasi sumber, waktu pengambilan, lokasi, jenis data, serta metadata kualitas data. Pendekatan tersebut memungkinkan hasil analisis tetap memiliki hubungan dengan data asalnya sehingga informasi yang ditampilkan pada dashboard dapat ditelusuri kembali ke sumber dan waktu pengambilannya. Data yang tidak tersedia secara real-time pada tahap pengembangan direpresentasikan menggunakan fixture atau data simulasi dengan penanda khusus agar tidak disamakan dengan data operasional aktual.

7.3 Implementasi Multi-Agent

Pada lapisan analitik, PreHub mengimplementasikan workflow berbasis komponen spesialis untuk menangani jenis informasi dan tugas yang berbeda. Komponen analitik mencakup pemrosesan kondisi cuaca, kondisi lalu lintas, informasi kejadian dari sumber publik, penilaian risiko, analisis alternatif perjalanan, dan penyusunan informasi untuk operator. Setiap komponen menghasilkan keluaran terstruktur sehingga hasil analisis dapat diperiksa sebelum digunakan oleh tahap berikutnya.

Workflow antar-komponen diorkestrasi menggunakan **LangGraph** pada bagian sistem yang membutuhkan perpindahan state dan urutan proses analitik. Implementasi ini memungkinkan hasil dari satu tahap diteruskan sebagai konteks terstruktur kepada tahap berikutnya, tanpa menjadikan keluaran model bahasa sebagai sumber kebenaran tunggal. Informasi yang digunakan dalam penilaian risiko tetap disimpan bersama metadata evidence dan dapat diperiksa melalui alur validasi yang terpisah.

Pembagian komponen tersebut juga memungkinkan pengembangan dilakukan secara bertahap. Komponen yang telah tersedia dapat dijalankan dalam alur utama, sedangkan komponen yang masih dikembangkan dapat menggunakan hasil fixture selama pengujian tanpa mengubah kontrak keluaran antarkomponen. Dengan demikian, pengembangan multi-agent tidak bergantung pada asumsi bahwa seluruh sumber data dan seluruh model telah tersedia sejak awal.

7.4 Implementasi Validasi, Confidence, dan Penilaian Risiko

PreHub mengimplementasikan Consensus Engine sebagai lapisan terpisah dari agen untuk mencegah keluaran satu model langsung menjadi keputusan sistem. Engine menerima sinyal dari berbagai agen dan mengevaluasinya berdasarkan kualitas sumber, kesegaran informasi, kesesuaian spasial dan temporal, serta independensi sumber. Confidence yang dihasilkan pada tingkat bukti digunakan untuk menunjukkan kekuatan dukungan terhadap suatu sinyal, sedangkan probabilitas gangguan dan tingkat risiko ditentukan pada tahap berikutnya berdasarkan gabungan bukti dan dampak operasional.

Dalam implementasi MVP, mekanisme tersebut menggunakan parameter awal yang dapat dikonfigurasi untuk menentukan kapan suatu indikasi dapat naik status menjadi peringatan. Parameter tersebut diperlakukan sebagai parameter engineering yang harus dikalibrasi, bukan sebagai nilai kebenaran universal. Sistem menyimpan hasil prediksi beserta keputusan aktual sehingga nilai threshold dapat dievaluasi menggunakan precision, recall, false-positive rate, detection latency, serta metrik probabilistik seperti Brier Score dan metrik kalibrasi. Dengan demikian, perubahan threshold dapat didasarkan pada hasil pengujian, bukan sekadar asumsi.

Apabila bukti tidak mencukupi, sumber saling bertentangan, atau sumber utama tidak tersedia, sistem tidak memaksakan status risiko tinggi. Kondisi tersebut dapat menghasilkan status indikasi, menurunkan tingkat keyakinan, atau meminta pemeriksaan operator. Mekanisme ini juga memungkinkan graceful degradation ketika salah satu API eksternal mengalami gangguan. Dengan demikian, kegagalan satu sumber tidak otomatis menghentikan keseluruhan sistem maupun menghasilkan rekomendasi tanpa bukti yang memadai.

7.5 Implementasi Analisis Kondisi dan Optimasi Mitigasi 

PreHub mengintegrasikan informasi kondisi yang relevan terhadap perjalanan sebagai bagian dari proses pembentukan konteks gangguan. Pada implementasi MVP, sumber dan metode analisis yang tersedia digunakan untuk menghasilkan evidence mengenai kondisi yang dapat memengaruhi kelancaran perjalanan. Keluaran tersebut tidak secara langsung dianggap sebagai gangguan, tetapi diteruskan ke tahap validasi dan penilaian dampak bersama evidence dari sumber lain.

Apabila komponen prakiraan cuaca berbasis model digunakan dalam implementasi, keluaran model diperlakukan sebagai **sinyal kondisi masa depan**, bukan sebagai prediksi langsung terhadap keterlambatan distribusi. Relevansi kondisi cuaca ditentukan berdasarkan hubungan spasial dan temporal antara prakiraan dan koridor perjalanan. Dengan pemisahan tersebut, kualitas prakiraan cuaca dapat dievaluasi secara terpisah dari kualitas deteksi gangguan distribusi.

Untuk mitigasi, sistem membentuk alternatif tindakan berdasarkan kondisi perjalanan dan kendala yang tersedia. Alternatif dapat berupa mempertahankan perjalanan, menggunakan rute alternatif, atau menunda perjalanan. Mesin optimasi rute digunakan apabila integrasi dan data yang diperlukan tersedia, sedangkan pada skenario pengujian yang belum menggunakan data operasional penuh, alternatif dapat dibentuk menggunakan data dan constraint yang telah ditentukan dalam skenario.

Hasil optimasi atau alternatif mitigasi tidak langsung diterapkan kepada armada. PreHub menyajikannya sebagai bahan perbandingan bagi operator berdasarkan estimasi waktu, risiko, kelayakan, dan konsekuensi operasional.

7.6 Implementasi Antarmuka dan Decision Support

Antarmuka PreHub dikembangkan sebagai dashboard yang menyatukan informasi kondisi koridor, perjalanan, evidence gangguan, hasil validasi, tingkat risiko, dan alternatif tindakan dalam satu alur penggunaan. Pengguna tidak diarahkan untuk berinteraksi langsung dengan setiap agen atau komponen backend. Kompleksitas pemrosesan ditempatkan pada sistem, sedangkan antarmuka difokuskan pada informasi yang diperlukan operator untuk memahami kondisi dan mengambil tindakan.

Ketika sistem mendeteksi indikasi gangguan, pengguna dapat membuka detail peringatan untuk melihat informasi mengenai kejadian, lokasi, waktu, sumber evidence, dan status validasinya. Evidence Chain digunakan untuk menunjukkan hubungan antara data sumber, hasil analisis, penilaian risiko, dan alternatif tindakan sehingga rekomendasi tidak ditampilkan sebagai keluaran tanpa dasar yang dapat diperiksa.

Pada tahap mitigasi, antarmuka menyajikan alternatif seperti **Continue, Reroute, dan Hold/Delay** beserta informasi pembanding yang relevan, seperti estimasi waktu perjalanan, risiko, dan konsekuensi operasional. Sistem tidak menjalankan tindakan tersebut secara otomatis. Operator tetap menentukan tindakan berdasarkan informasi yang tersedia dan dapat menerima, menolak, atau melakukan *override* terhadap rekomendasi apabila fungsi tersebut telah tersedia pada implementasi MVP.

7.7 Status Implementasi Perangkat Lunak

Untuk menjaga kesesuaian antara proposal, perangkat lunak, dan demonstrasi, status setiap komponen PreHub dibedakan berdasarkan tingkat kesiapan implementasinya. Status tersebut menunjukkan apakah suatu komponen telah dapat dijalankan pada MVP, masih berupa prototype, menggunakan data simulasi, sedang dikembangkan, atau direncanakan untuk pengembangan berikutnya. Klasifikasi ini digunakan agar rancangan sistem tidak disalahartikan sebagai seluruhnya telah terimplementasi. 

| Komponen | Status | Keterangan |
| ----- | ----- | ----- |
| Aplikasi web | **Sudah diimplementasi** | Dapat dijalankan dan digunakan dalam MVP |
| Backend/API | **Sudah diimplementasi** | Menangani layanan aplikasi yang telah tersedia |
| Dashboard | **Sudah diimplementasi** | Menampilkan fungsi utama yang telah diintegrasikan |
| Database spasial | **Implemented / Prototype** |  |
| Pipeline data | **Implemented / Partial** |  |
| BMKG/live data | **Implemented / In Development** |  |
| Traffic integration | **Implemented / Fixture / In Development** |  |
| OSINT ingestion | **Prototype / In Development** |  |
| LangGraph workflow | **Sudah diimplementasi** |  |
| Consensus Engine | **Implemented / Prototype** |  |
| Probability calibration | **In Development** |  |
| Risk threshold tuning | **In Development** |  |
| Fleet telemetry | **Simulated/Fixture** |  |
| Route optimization | **Prototype / Scenario-based** |  |
| Operator decision history | **Implemented / Planned** |  |
| Outcome feedback loop | **In Development** |  |

7.8 Pengujian dan Evaluasi Implementasi

Pengujian implementasi PreHub dilakukan secara bertahap sesuai dengan tingkat kesiapan masing-masing komponen. Pada tahap pengembangan, pengujian awal dilakukan terhadap fungsi aplikasi, layanan API, aliran data, dan integrasi antarkomponen yang telah tersedia. Pengujian skenario digunakan untuk memastikan bahwa sistem dapat menjalankan alur utama mulai dari penerimaan informasi, pembentukan evidence, validasi, penilaian kondisi, hingga penyajian alternatif tindakan.

Untuk komponen yang masih menggunakan fixture atau data simulasi, pengujian dilakukan terhadap konsistensi alur dan kesesuaian keluaran dengan kondisi yang telah ditentukan pada skenario. Hasil pengujian tersebut digunakan untuk memverifikasi perilaku sistem, tetapi tidak diperlakukan sebagai bukti bahwa sistem telah mencapai performa yang sama pada kondisi operasional nyata.

Evaluasi kuantitatif dikembangkan sesuai dengan karakteristik masing-masing komponen. Modul deteksi dievaluasi menggunakan indikator seperti *precision*, *recall*, *F1-score*, *false-positive rate*, dan *detection latency*. Keluaran probabilistik dievaluasi menggunakan **Brier Score** dan analisis kalibrasi apabila data outcome yang memadai tersedia. Modul ekstraksi informasi dapat dievaluasi berdasarkan ketepatan identifikasi kejadian, lokasi, waktu, tingkat keparahan, relevansi, dan kemampuan deduplikasi. Sementara itu, alternatif mitigasi dan optimasi rute dievaluasi berdasarkan kelayakan solusi, pemenuhan *constraint*, estimasi waktu perjalanan, dan waktu komputasi.

Pada tingkat sistem, *scenario-based testing* digunakan untuk mengevaluasi alur end-to-end dan perilaku sistem ketika evidence tidak mencukupi, sumber memberikan informasi yang bertentangan, atau salah satu sumber tidak tersedia. Evaluasi pada tingkat pengguna, apabila telah dilakukan dengan pengguna sasaran, dapat mencakup waktu memahami kejadian, waktu pengambilan keputusan, *task completion rate*, dan kemampuan pengguna menelusuri evidence. Jika evaluasi dengan pengguna eksternal belum dilakukan, bagian tersebut sebaiknya dinyatakan sebagai **rencana evaluasi pada iterasi berikutnya**, bukan sebagai hasil yang telah diperoleh.

Hasil dari setiap pengujian digunakan sebagai dasar iterasi terhadap konfigurasi pipeline, parameter validasi, threshold risiko, workflow, dan antarmuka. Dengan demikian, pengujian PreHub tidak hanya digunakan untuk memastikan bahwa aplikasi dapat dijalankan, tetapi juga untuk mengidentifikasi batasan implementasi dan memperbaiki kualitas sistem secara bertahap.

8\. Mockup Tampilan Aplikasi

9\. Dokumentasi Cara Penggunaan Perangkat Lunak

9.1 Alur Penggunaan PreHub

Penggunaan PreHub dimulai ketika Operations Coordinator membuka dashboard untuk memantau kondisi koridor distribusi pangan. Pada kondisi normal, pengguna dapat melihat kondisi koridor, informasi cuaca dan lalu lintas, serta status operasional yang tersedia dalam satu tampilan. Ketika sistem mendeteksi indikasi gangguan, pengguna menerima early warning yang memuat lokasi, jenis kejadian, waktu pembaruan, serta tingkat risiko. Pengguna kemudian memilih peringatan tersebut untuk melihat informasi yang lebih terperinci.

Pada tahap verifikasi, pengguna membuka Evidence Chain untuk memeriksa sumber yang mendukung peringatan, tingkat confidence bukti, status validasi, dan informasi spasial-temporal kejadian. Apabila bukti belum mencukupi atau terdapat informasi yang bertentangan, sistem mempertahankan kejadian sebagai indikasi atau meminta pemeriksaan pengguna sehingga operator tidak dipaksa mengambil keputusan berdasarkan informasi yang belum memadai. Setelah peringatan tervalidasi, pengguna membuka Impact Analysis untuk melihat koridor yang terdampak, perubahan estimasi waktu perjalanan, serta eksposur operasional yang relevan.

Selanjutnya, pengguna membuka Mitigation Recommendation untuk membandingkan alternatif tindakan, seperti Continue, Reroute, atau Hold/Delay. Setiap alternatif disertai informasi pendukung seperti estimasi waktu, tingkat risiko, dan konsekuensi operasional. Pengguna kemudian memilih tindakan berdasarkan kondisi lapangan. PreHub tidak menerapkan perubahan rute secara otomatis, sehingga keputusan akhir tetap berada pada operator. Setelah keputusan dilakukan, pengguna dapat kembali memantau perkembangan kondisi dan membandingkan hasil aktual dengan prediksi sebelumnya sebagai bagian dari evaluasi sistem.

9.2 Pencegahan Kesalahan Pengguna

PreHub menggunakan beberapa mekanisme untuk mengurangi kesalahan pengambilan keputusan. Peringatan dibedakan berdasarkan status validasi dan tingkat risiko sehingga pengguna dapat membedakan antara indikasi awal dan gangguan yang telah memperoleh dukungan bukti yang memadai. Informasi sumber dan confidence juga dapat ditelusuri melalui Evidence Chain. Apabila data tidak lengkap atau sumber mengalami gangguan, kondisi tersebut ditampilkan kepada pengguna dan tidak secara otomatis dianggap sebagai bukti positif. Pada tahap rekomendasi, operator tetap memiliki kewenangan untuk menerima, menolak, atau mengoreksi hasil sistem. Keputusan tersebut dicatat sehingga dapat ditinjau kembali dan digunakan dalam evaluasi berikutnya. Pendekatan ini konsisten dengan batasan PreHub sebagai human-in-the-loop decision-support system.

DAFTAR PUSTAKA  
Azis, A. M., Irjayanti, M., & Murti, Y. R. (2026). Advancing traceability and sustainability through a digital information system in Indonesia’s rice supply chain. *Discover Sustainability, 7*, 184\. https://doi.org/10.1007/s43621-025-02544-4

Badan Nasional Penanggulangan Bencana. (2025, December 9). UPT BNPB beroperasi dukung manajemen logistik bencana Sumbar. BNPB.

Freichel, S. L. K., Rütten, P., & Wörtge, J. K. (2022). Challenges of supply chain visibility in distribution logistics: A literature review. *Ekonomski Vjesnik/Econviews, 35*(2), 453–466. https://doi.org/10.51680/ev.35.2.16 

Yudha, E. P., & Roche, J. (2023). How was the staple food supply chain in Indonesia affected by COVID-19? Economies, 11(12), 292\. https://doi.org/10.3390/economies11120292

Google Cloud. (2024, August 28). MLOps: Continuous delivery and automation pipelines in machine learning. Google Cloud Architecture Center.

Google for Developers. (2025). ML development phases. Google for Developers.

Google for Developers. (2025). Experiments. Google for Developers.

Huyen, C. (2022). Designing machine learning systems: An iterative process for production-ready applications. O'Reilly Media.

Islah, K., Vikaliana, R., Subagiyo, A., Rofiyanti, E., & Zakia. (2021). Food resilience policy 2012–2020: A perspective of food supply chain and logistics in Indonesia. *Journal of Management Information and Decision Sciences, 24*(Special Issue 1), 1–8.

Mishra, R., Singh, R. K., & Gunasekaran, A. (2024). Disruptions in the food supply chain: A literature review. *Heliyon, 10*(14), e34730. https://doi.org/10.1016/j.heliyon.2024.e34730

Wangke, S. J. C., Tumiwa, J. R., Tuegeh, O. D. M., & Paat, F. B. (2026). Agricultural food supply chain robustness and environmental health: The roles of collaboration, flexibility, and agility. *Jurnal Ilmiah PLATAX, 14*(1), 227–239. https://doi.org/10.35800/jip.v14i1.67297 

Heidari, R., Ghazanfari, M., & Rasouli, M. R. (2024). A decision support system for resilient vehicle route planning using mathematical modeling and artificial neural networks: A case study. Kybernetes, 55(2), 944–964. https://doi.org/10.1108/K-10-2024-2935

Keefe, D. H. S., Jang, H., & Sur, J.-M. (2024). Digitalization for agricultural supply chains resilience: Perspectives from Indonesia as an ASEAN member. The Asian Journal of Shipping and Logistics, 40(4), 180–186. https://doi.org/10.1016/j.ajsl.2024.09.001

Sharma, J., Tyagi, M., & Kazançoğlu, Y. (2024). Impact of digital technologies on the risk assessment in food supply chain: A wake towards digitalisation. *International Journal of Food Science & Technology, 59*(5), 3491–3504. [https://doi.org/10.1111/ijfs.17035](https://doi.org/10.1111/ijfs.17035)

Tabassi, E. (2023). *Artificial intelligence risk management framework (AI RMF 1.0).* National Institute of Standards and Technology. [https://doi.org/10.6028/NIST.AI.100-1](https://doi.org/10.6028/NIST.AI.100-1) 

ffrench-Constant, M., Yang, D., Huang, X., & Kapoor, S. (2026). ConfidenceBench: Evaluating confidence calibration in large language models. arXiv.

Guo, T., Chen, X., Wang, Y., Chang, R., Pei, S., Chawla, N. V., Wiest, O., & Zhang, X. (2024). Large language model based multi-agents: A survey of progress and challenges. Proceedings of the Thirty-Third International Joint Conference on Artificial Intelligence, 8048–8057.

NVIDIA. (2026). NVIDIA cuOpt documentation. NVIDIA.

Pathak, J., Subramanian, S., Harrington, P., Raja, S., Chattopadhyay, A., Mardani, M., Kurth, T., Hall, D., Li, Z., Azizzadenesheli, K., Hassanzadeh, P., Kashinath, K., & Anandkumar, A. (2022). FourCastNet: A global data-driven high-resolution weather model using adaptive Fourier neural operators. arXiv.

Wang, L., Ma, C., Feng, X., Zhang, Z., Yang, H., Zhang, J., Chen, Z., Tang, J., Chen, X., Lin, Y., Zhao, W. X., Wei, Z., & Wen, J.-R. (2024). A survey on large language model based autonomous agents. Frontiers of Computer Science, 18, 186345\.

Umar, M., & Wilson, M. M. J. (2024). Inherent and adaptive resilience of logistics operations in food supply chains. *Journal of Business Logistics, 45*(1), e12362. [https://doi.org/10.1111/jbl.12362](https://doi.org/10.1111/jbl.12362) 

Zhao, T., He, Y., Zheng, W., Zhang, Y., & Chen, C. (2026). Wired for overconfidence: A mechanistic perspective on inflated verbalized confidence in LLMs. arXiv

FastAPI. (2026). *FastAPI documentation*. [FastAPI Documentation](https://fastapi.tiangolo.com/?utm_source=chatgpt.com)

LangChain. (2026). *LangGraph documentation: Workflows, agents, persistence, and human-in-the-loop*. [LangGraph Documentation](https://docs.langchain.com/oss/python/langgraph/overview?utm_source=chatgpt.com)

NVIDIA. (2026). *NVIDIA cuOpt documentation*. [NVIDIA cuOpt Documentation](https://docs.nvidia.com/cuopt/index.html?utm_source=chatgpt.com)

NVIDIA. (2023). *FourCastNet*. [NVIDIA FourCastNet Documentation](https://docs.nvidia.com/deeplearning/modulus/modulus-v2209/user_guide/neural_operators/fourcastnet.html?utm_source=chatgpt.com)

PostGIS. (2026). *PostGIS documentation*. [PostGIS Documentation](https://postgis.net/docs/manual-3.5/using_postgis_dbmanagement.html?utm_source=chatgpt.com)

Redis. (2026). *Redis Streams documentation*. [Redis Streams Documentation](https://redis.io/docs/latest/develop/data-types/streams/?utm_source=chatgpt.com)

Uber. (2026). *H3: A hierarchical geospatial indexing system*. [H3 Documentation](https://h3geo.org/docs/3.x/core-library/overview/?utm_source=chatgpt.com)

Vercel. (2026). *Next.js documentation*. [Next.js Documentation](https://nextjs.org/docs?utm_source=chatgpt.com)

