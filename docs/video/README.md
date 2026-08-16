# PetaNadi — Video Production Kit
## PIDI Digdaya x Hackathon 2026 | 3rd Submission

> **Video folder index** — semua file produksi video ada di sini.

| File | Isi |
|---|---|
| README.md | File ini — panduan dan index |
| VIDEO_SCRIPT_FULL.md | Script lengkap + narasi VO per section |
| FLOW_PROMPTS.md | Prompt per shot untuk Google Flow (Veo 3) |
| IMAGE_REFERENCE_PROMPTS.md | Prompt gambar referensi per scene |
| STYLE_GUIDE.md | Panduan visual konsisten: warna, tipografi, tone |

---

## Ringkasan Video

| Aspek | Detail |
|---|---|
| **Judul Video** | PetaNadi — Navigasi Krisis, Jaga Ketahanan Pangan |
| **Durasi** | 3 menit (180 detik) |
| **Bahasa** | Bahasa Indonesia (VO + text overlay) |
| **Format** | 16:9, min. 1920x1080, Full HD |
| **Gaya** | Cinematic minimalist, faceless, black + green accent |
| **Platform** | YouTube (unlisted link untuk submission) |
| **Struktur** | 60 detik Pitch + 120 detik Demo |

---

## Google Flow vs. Seedance — Perbedaan Penting untuk Workflow Kamu

### Seedance 2.0
- Input simultan: 9 gambar + 3 video + 3 audio sekaligus
- Prompt: director template kaku — @material[name] syntax
- Kekuatan: physics simulation, motion control presisi

### Google Flow (Veo 3.1) — yang kamu pakai
- Input: 1-3 gambar referensi per shot + text prompt (bukan semua sekaligus)
- Prompt: deskriptif, natural language, 7 layer: Camera > Subject > Action > Environment > Lighting > Style > Audio
- Fitur "ingredient" (@) untuk lock karakter lintas shot
- Fitur last-frame continuity: frame terakhir clip jadi input gambar clip berikutnya
- Kekuatan: konsistensi karakter, sinematik realistis, native dialogue audio

### Workflow Praktis
1. Generate reference image dulu (via Imagen / Flow image mode) — pakai prompt dari IMAGE_REFERENCE_PROMPTS.md
2. Upload gambar ke Flow sebagai ingredient/starting frame
3. Paste prompt dari FLOW_PROMPTS.md
4. Download frame terakhir tiap clip → upload sebagai gambar referensi clip selanjutnya
5. Untuk karakter (operator, nakhoda): buat 1 referensi karakter depan → reuse lintas semua shot karakter itu

---

## Base Images Guide

| Scene | Cara Dapat |
|---|---|
| Pelabuhan Belawan / Tanjung Priok | Cari Google: "pelabuhan belawan aerial" atau "pelabuhan tanjung priok malam" |
| Truk kontainer jalan nasional | Cari Google: "truk kontainer jalan pantura Indonesia" |
| Banjir jalan Pantura 2024 | Cari Google: "banjir pantura 2024" — pakai foto berita |
| Operator ruang kendali | Generate via Imagen — prompt di IMAGE_REFERENCE_PROMPTS.md |
| Nakhoda anjungan kapal | Generate via Imagen — prompt di IMAGE_REFERENCE_PROMPTS.md |
| Dashboard gelap dengan peta Indonesia | Generate via Imagen — prompt di IMAGE_REFERENCE_PROMPTS.md |
| Logo PetaNadi | Sudah ada: docs/logo/black-bg-clear.jpeg |
| Early warning alert di layar | Generate via Imagen — prompt di IMAGE_REFERENCE_PROMPTS.md |
