# Komponen & Daftar Pustaka (Component & Library List)

Berikut adalah daftar pustaka dan komponen perangkat lunak (libraries/components) yang digunakan dalam pengembangan purwarupa PreHub, beserta lisensinya.

## Frontend (Antarmuka Pengguna & Peta)
| Library / Component | Versi | Kegunaan | Lisensi |
| :--- | :--- | :--- | :--- |
| **Next.js** | 14.2 | Framework React untuk SSR & routing | MIT License |
| **React & React-DOM** | 18 | Pustaka antarmuka pengguna inti | MIT License |
| **Tailwind CSS** | 3.4 | Framework CSS utilitas | MIT License |
| **Deck.gl** | 9.3 | Framework visualisasi data spasial berskala besar | MIT License |
| **Mapbox GL JS** | 3.25 | Rendering peta interaktif berbasis vektor | Mapbox License |
| **Mapbox GL Draw** | 1.5 | Fitur menggambar bentuk poligon/area pada peta | ISC License |
| **Turf.js** | 7.3 | Pustaka analisis geospasial *client-side* | MIT License |
| **Recharts** | 3.9 | Komponen grafik untuk dashboard data | MIT License |
| **Lucide React** | 1.25 | Ikon antarmuka (*vector icons*) | ISC License |
| **Clsx** | 2.1 | Utilitas untuk mengatur *class* CSS kondisional | MIT License |
| **QRCode** | 1.5 | Pembuatan kode QR di sisi klien | MIT License |

## Backend (API & Multi-Agent)
| Library / Component | Versi | Kegunaan | Lisensi |
| :--- | :--- | :--- | :--- |
| **FastAPI** | 0.115 | Framework web API berkinerja tinggi | MIT License |
| **Uvicorn** | 0.30 | Server ASGI untuk FastAPI | BSD 3-Clause |
| **Pydantic** | 2.x | Validasi data dan pengaturan skema/lingkungan | MIT License |
| **Supabase (Python)** | 2.7 | Client untuk integrasi dengan database PostgreSQL/PostGIS | MIT License |
| **Redis** | 5.0 | Penyimpanan sementara (*cache* & *message broker*) | MIT License |
| **WebSockets** | 14.0 | Komunikasi dua arah (komunikasi antar-agen/klien) | BSD 3-Clause |
| **HTTPX** | 0.27 | Client HTTP asinkron untuk panggilan API eksternal | BSD 3-Clause |
| **Geopy** | 2.4 | Utilitas *geocoding* koordinat ke alamat | MIT License |
| **Google Generative AI** | 0.8 | Integrasi model bahasa untuk ekstraksi OSINT (Gemini) | Apache License 2.0 |
| **LangGraph** | 0.2 | Orkestrasi stateful *multi-agent workflow* | MIT License |
| **NetworkX** | 3.3 | Algoritma *graph* untuk optimasi pencarian rute alternatif | BSD 3-Clause |
| **NumPy & SciPy** | 1.26 | Perhitungan matriks dan probabilitas risiko matematis | BSD 3-Clause |

## Testing & Quality Assurance
| Library / Component | Versi | Kegunaan | Lisensi |
| :--- | :--- | :--- | :--- |
| **Pytest** | 8.2 | Framework unit testing backend | MIT License |
| **Playwright** | 1.62 | Framework pengujian E2E (End-to-End) otomatis | Apache License 2.0 |
