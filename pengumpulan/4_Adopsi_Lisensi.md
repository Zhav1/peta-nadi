# Adopsi Lisensi (License Adoption)

PreHub dibangun dengan mengadopsi prinsip keterbukaan (*open-source-first*), di mana mayoritas tumpukan teknologi (teknologi *stack*) yang digunakan baik pada antarmuka (Frontend) maupun infrastruktur (Backend) memanfaatkan pustaka (*libraries*) dengan lisensi bebas atau permisif.

## 1. Lisensi Perangkat Lunak PreHub (Internal)
Kode sumber (*source code*) internal dari aplikasi PreHub ini dapat dipertimbangkan untuk dirilis di bawah lisensi terbuka permisif seperti **MIT License** atau **Apache License 2.0**. Hal ini akan memungkinkan pihak lain (misalnya lembaga logistik, pemerintah daerah, maupun pengembang lain) untuk memodifikasi, menggunakan, dan mengembangkannya secara bebas untuk kebutuhan mitigasi ketahanan pangan, selama mencantumkan atribusi kepada pembuat aslinya.

## 2. Penggunaan Pustaka Eksternal (Dependencies)
PreHub menggunakan beberapa komponen perangkat lunak dari pihak ketiga. Adopsi lisensi dari komponen tersebut diatur sebagai berikut:

*   **MIT & ISC License:** Mayoritas komponen inti seperti **React, Next.js, FastAPI, LangGraph, Turf.js, Deck.gl**, dan utilitas lainnya menggunakan lisensi MIT atau ISC. Lisensi ini sangat permisif dan bebas digunakan untuk kebutuhan komersial maupun non-komersial tanpa pembatasan ketat, cukup dengan mempertahankan notasi hak cipta bawaan pustaka aslinya.
*   **BSD 3-Clause:** Digunakan oleh beberapa komponen algoritma dan *server* backend seperti **NetworkX, NumPy, SciPy, dan Uvicorn**. Lisensi ini juga permisif dan mendukung pengembangan berpemilik (*proprietary*) atau komersial tanpa kendala berarti.
*   **Apache License 2.0:** Digunakan oleh **Google Generative AI SDK** dan **Playwright**. Lisensi ini memberikan kebebasan penggunaan namun menyertakan klausul perlindungan paten. Hal ini sepenuhnya aman digunakan pada PreHub.
*   **Mapbox License:** PreHub menggunakan **Mapbox GL JS** untuk *rendering* peta. Walaupun SDK ini pada dasarnya gratis untuk tahap pengembangan (*development*), penggunaannya di tingkat produksi skala besar wajib tunduk pada *Terms of Service* komersial Mapbox berdasarkan metrik *load* pemakaian (jumlah permintaan/tayangan peta bulanan).

## 3. Kompatibilitas Lisensi
Secara keseluruhan, tidak ada benturan lisensi (*license conflict*) antar-komponen yang menghalangi PreHub untuk beroperasi, dikomersialkan, atau didistribusikan secara publik. Tidak ada pustaka yang menggunakan lisensi perlindungan ketat (seperti *GPL/Copyleft*) yang akan "memaksa" seluruh kode sumber (khususnya *backend* kepemilikan) harus dibuka secara paksa kepada umum, memberikan fleksibilitas penuh untuk mengubah proyek dari tahap MVP menuju skema kemitraan dengan swasta/pemerintah (*B2B/B2G*).
