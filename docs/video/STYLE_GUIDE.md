# STYLE GUIDE — PetaNadi Video
## Konsistensi Visual untuk Semua Shot

---

## WARNA

| Peran | Hex | Digunakan untuk |
|---|---|---|
| Background primary | #0D0D0D | Latar belakang hampir semua shot |
| Background secondary | #1A1A1A | Panel UI, elemen di atas black |
| Green accent | #2E7D32 | Node data, UI highlight, glow, checklist |
| White | #FFFFFF | Teks headline, narasi overlay |
| Grey text | #9E9E9E | Teks sekunder, caption, label kecil |
| Amber warning | #F59E0B | Early warning notification |
| Red alert | #EF4444 | Node terdampak di GraphRAG (hanya saat demo) |

**Jangan gunakan:** cyan terang, neon, merah cerah di luar konteks warning, background putih di shot manapun.

---

## TIPOGRAFI

| Penggunaan | Font | Weight | Ukuran relatif |
|---|---|---|---|
| Headline besar | Inter atau DM Sans | 700 (Bold) | ~8% frame height |
| Subtitle / keterangan | Inter | 400 (Regular) | ~4% frame height |
| Callout / annotation | Inter | 600 (SemiBold) | ~3.5% frame height |
| Quote / citation | Inter | 400 italic | ~3% frame height |

**Aturan:**
- Semua teks: putih (#FFF) kecuali warning (amber) atau label sistem (hijau)
- Jangan gunakan terlalu banyak teks di satu frame — maksimal 2 baris headline
- Tambahkan semi-transparent black bar (#000 at 50% opacity) di belakang teks jika background visual ramai
- Letter spacing: +0.5 untuk headline, +0 untuk body

---

## ANIMASI TEKS

| Jenis | Digunakan |
|---|---|
| Fade in (0.4 detik) | Headline utama, transisi antar section |
| Slide up + fade (0.3 detik) | Sub-text, keterangan, label |
| Typewriter (karakter per karakter) | Daftar fitur (Shot 3B), opsi AI Copilot |
| Scale-up 95%→100% | CTA akhir video |

**Jangan gunakan:** bounce, wobble, spin, flash, slide dari kanan/kiri (kecuali alert panel di Shot 5B).

---

## KOMPOSISI SHOT

- **Negative space** selalu disengaja — jangan takut frame yang "kosong"
- **Rule of thirds** untuk elemen penting — tapi center frame juga sah untuk logo/branding
- **Depth of field**: shallow DOF (f/2.0–2.8) untuk shot karakter; in-focus penuh untuk shot UI dan abstract
- **Framing karakter**: selalu dari belakang, samping, atau hanya tangan — tidak ada wajah yang teridentifikasi (kecuali jika ada shot nakhoda/operator yang disengaja)

---

## MUSIK

| Section | Mood | Instrumen | BPM |
|---|---|---|---|
| Hook (0–8 det) | Silence → tension | Sub-bass drone | — |
| Problem (8–28 det) | Tension, minor | Low cello, drone | 60–70 |
| Solusi (28–60 det) | Clarity, digital | Clean synth pads, light piano | 80 |
| Demo (60–175 det) | Focused, minimal | Minimal electronic, no percussion hard | 90 |
| Closing (175–180 det) | Resolution | Cello + violin chord | — |

**Reference musik (bisa cari royalty-free):**
- Artlist.io: cari "cinematic minimal dark"
- Epidemic Sound: cari "corporate dark tech"
- Uppbeat: cari "tension resolve"

---

## AUDIO VO

- Tempo bicara: sedang, tidak terburu-buru (sekitar 130–145 kata per menit)
- Tone: profesional, percaya diri, tidak dramatik — seperti narator dokumenter atau TED Talk
- Jika menggunakan AI voice: ElevenLabs model "Charlie" (en) atau Google TTS WaveNet id-ID (Indonesian)
- Volume VO: -3dB relative to track maximum. Musik di bawah VO: -18dB minimum

---

## SUBTITLE

- Posisi: bottom center
- Background: rgba(0,0,0,0.6) dengan padding 8px
- Font: Inter 400, ukuran memadai untuk dibaca di mobile
- Maksimal 1.5 baris per frame
- Sync ketat dengan VO — tidak boleh terlambat lebih dari 200ms

---

## APA YANG JANGAN DILAKUKAN

- Jangan gunakan footage yang jelas stock footage generic (orang berpelukan di pantai, peta dunia berputar, dll.)
- Jangan tampilkan nama individu nyata yang tidak ada LOI/persetujuan tertulis
- Jangan screenshot dari Google Maps langsung — gunakan peta dari dashboard PetaNadi sendiri
- Jangan melebih-lebihkan status MVP — script sudah jujur soal ini
- Jangan gunakan musik dengan lirik — VO akan tertutupi
- Jangan gunakan efek transisi yang terlalu showreel (wipe spiral, ripple, dll.)
