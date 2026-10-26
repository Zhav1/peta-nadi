# Keep-Alive Runbook — peta-nadi (Render Free)

Tujuan: mencegah Render Free tidur (idle sleep 15 menit) agar API tetap hangat
untuk demo dan poller ingestion. Pinger ada DUA lapis (defense-in-depth).

## Lapis 1 (primer): cron-job.org

Konfigurasi kanonis di dashboard cron-job.org:

| Field    | Value                                    |
|----------|------------------------------------------|
| URL      | `https://peta-nadi.onrender.com/health`  |
| Interval | **5 menit**                              |
| Timeout  | **90 detik**                             |
| Retry    | **ON**                                   |
| Method   | GET                                      |

Aturan keras:

- **Hanya** `GET /health` untuk wake. **Jangan** pakai `/sources`
  (`/api/v1/health/sources`) sebagai wake — endpoint itu probe DB berat
  (fan-out Supabase/Redis), bukan pemicu bangun yang murah.
- Interval 5 menit < batas tidur Render 15 menit, dengan margin untuk satu
  kegagalan ping berurutan.
- Timeout 90 detik karena cold start butuh 60–80 detik (lihat bawah).

## Lapis 2 (sekunder): GitHub Actions `.github/workflows/keep-alive.yml`

- Jadwal `*/10 * * * *`, `timeout-minutes: 5` (jangan diubah).
- Langkah 1: `GET /health` dengan
  `curl --max-time 90 --retry 2 --retry-delay 10`.
- Langkah 2 (warm ping): `sleep 20`, lalu `GET /health` lagi dengan flag
  yang sama — konfirmasi instance sudah selesai boot.
- Langkah 3: `GET /api/v1/health/sources` hanya sebagai **probe DB**, bukan wake.
- Langkah 4: query REST langsung ke Supabase (`data_sources?select=name&limit=1`)
  untuk me-refresh timer inaktivitas database 7 hari.

## Render `healthCheckPath`

`render.yaml` menetapkan:

```yaml
healthCheckPath: /health
```

Ini health check bawaan platform Render (bukan pinger). Tidak ada perubahan
render lain di luar baris ini.

## Kenapa timeout > 30 detik terjadi (dan kenapa 90 detik benar)

Rantai cold start di plan Free (1x instance, ~0.1 CPU):

1. **Sleep 15 menit** — Render Free menidurkan service setelah 15 menit tanpa
   traffic. Request pertama setelah tidur mengantre hingga instance boot.
2. **Boot 60–80 detik**, terdiri dari:
   - import berat: `numpy` / `scipy` / `langgraph` (+ checkpoint) — detik
     belasan di CPU kecil;
   - `lifespan` FastAPI: koneksi Redis sinkron (`get_redis` / sync client)
     yang memblokir startup hingga handshake selesai;
   - penyalaan **9 poller ingestion** in-process (BMKG, TomTom, Open-Meteo,
     dsb.) di atas **1x0.1 CPU** — semua berebut CPU saat boot.
3. Akibatnya ping dengan `--max-time 45` (atau default cron 30 detik) **gugur
   di tengah boot** dan tercatat gagal padahal instance sedang bangun.
   `--max-time 90` + `--retry 2 --retry-delay 10` + warm ping 20 detik
   menutup jendela ini.

## Verifikasi cepat

```bash
# dry-run: harus 200 dalam < 5 dtk saat hangat, 60-80 dtk saat dingin
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
  --max-time 90 --retry 2 --retry-delay 10 \
  https://peta-nadi.onrender.com/health
```

## Yang TIDAK boleh diubah di sini

`backend/app/main.py` (`lifespan`), poller, dan adapter berada di luar scope
keep-alive. Optimasi startup (lazy import, Redis async, dsb.) adalah pekerjaan
terpisah — runbook ini hanya menjaga agar service tidak tidur.
