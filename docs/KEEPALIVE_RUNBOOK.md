# Keep-Alive + External Tick Runbook — peta-nadi (Render Free)

Tujuan: mencegah Render Free tidur (idle sleep 15 menit) **dan** menjalankan
batch ingestion di luar proses web. Sejak Phase 162 (M8) proses web adalah
**thin web**: tidak ada poller batch in-process di produksi, jadi pinger yang
sama juga menjadi pemicu ingestion.

Pinger ada DUA lapis (defense-in-depth):

| Lapis | Alat | Peran |
|---|---|---|
| 1 (primer) | cron-job.org, tiap 5 menit | wake (`GET /health`) + tick ingestion (`POST /internal/tick`) |
| 2 (sekunder) | GitHub Actions `.github/workflows/keep-alive.yml`, tiap 10 menit | probe SLO + refresh timer inaktivitas Supabase |

## Kontrak tick (baru)

| Field | Nilai |
|---|---|
| Method | `POST` |
| URL | `https://peta-nadi.onrender.com/internal/tick` |
| Header | `X-Internal-Token: <INTERNAL_TICK_TOKEN>` |
| Timeout | **90 detik** |
| Body sukses | `202 {"accepted": true, "due": [...], "skipped": [...], "run_id": "..."}` |
| Overlap | `202 {"accepted": false, "reason": "already_running"}` |
| Token salah | `401` (`WWW-Authenticate: Bearer`) |
| Token belum diset | `404` — endpoint **dimatikan**, bukan "token kosong cocok" |

`POST` hanya menerima pekerjaan lalu langsung membalas `202`; ingestion berjalan
di background task. `GET /health` **tidak pernah** menjalankan job — liveness
tetap konstan dan tidak menyentuh Supabase.

`/api/v1/internal/tick` adalah alias dengan guard yang sama (tidak muncul di
OpenAPI).

### Kenapa POST dan bukan GET

`M8-SPEC.md` menulis `GET /internal/tick`; implementasi memakai `POST` seperti
instruksi phase 162, karena tick menyebabkan mutasi state (lock + ingestion) dan
tidak boleh di-cache/prefetch oleh proxy atau browser. Gunakan `POST` di
cron-job.org.

## Lapis 1 (primer): cron-job.org

Buat **dua** job di dashboard cron-job.org:

### 1a. Waker — `GET /health`

| Field | Value |
|---|---|
| URL | `https://peta-nadi.onrender.com/health` |
| Method | GET |
| Interval | **5 menit** |
| Timeout | **90 detik** |
| Retry | **ON** |

Aturan keras: **hanya** `GET /health` untuk wake. **Jangan** pakai
`/api/v1/health/sources` sebagai wake — endpoint itu probe DB berat
(fan-out Supabase/Redis), bukan pemicu bangun yang murah.

### 1b. Tick — `POST /internal/tick`

| Field | Value |
|---|---|
| URL | `https://peta-nadi.onrender.com/internal/tick` |
| Method | POST |
| Header | `X-Internal-Token: <nilai INTERNAL_TICK_TOKEN>` |
| Interval | **5 menit** |
| Timeout | **90 detik** |
| Retry | **ON** |

- Interval 5 menit < batas tidur Render 15 menit, dengan margin untuk satu
  kegagalan ping berurutan.
- Timeout 90 detik karena cold start masih bisa 20–60 detik (lihat bawah) dan
  cron harus menunggu instance bangun sebelum tick diterima.
- Jika job 1b dieksekusi saat instance masih tidur, request pertama membayar
  cold start; tick tetap diterima setelah boot. Tick yang gagal **tidak** hilang:
  job dipilih dari `last_finished_at + cadence`, jadi window yang terlewat
  dikejar pada tick berikutnya.
- `INTERNAL_TICK_TOKEN` diisi di Render dashboard (`sync: false` di
  `render.yaml`) dan disalin ke header cron-job.org. Rotasi = ganti env di
  Render, lalu ganti header di cron-job.org; tidak ada nilai token di repo.

## Lapis 2 (sekunder): GitHub Actions `.github/workflows/keep-alive.yml`

- Jadwal `*/10 * * * *`, `timeout-minutes: 15` (lihat `KEEPALIVE-FIX.md`;
  jangan diturunkan ke 5).
- Langkah 1: `GET /health` dengan
  `curl --fail-with-body --max-time 120 --retry 1 --retry-delay 10`.
- Langkah 2 (warm ping): `sleep 15`, lalu `GET /health` lagi.
- Langkah 3: `GET /api/v1/health/sources` hanya sebagai **probe DB**, bukan wake.
- Langkah 4: query REST langsung ke Supabase (`data_sources?select=name&limit=1`)
  untuk me-refresh timer inaktivitas database 7 hari.
- Workflow ini **tidak** memanggil `/internal/tick`: ingestion tetap milik
  cron-job.org supaya hanya ada satu pemilik jadwal dan satu token.

## Render `healthCheckPath`

`render.yaml` menetapkan:

```yaml
healthCheckPath: /health
```

Ini health check bawaan platform Render (bukan pinger). Tidak ada perubahan
render lain di luar baris ini.

## Env yang mengatur thin web

| Env | Produksi | Arti |
|---|---|---|
| `POLLERS_ENABLED` | `true` | master switch worker in-process (kini hanya consumer kontinu: AIS WebSocket + fan-out alert) |
| `INPROCESS_BATCH_POLLERS` | `false` | **produksi**: 8 poller batch (BMKG, TomTom, Open-Meteo, FIRMS, news, PIHPS, social, BNPB) tidak jalan di web; tick yang menjalankan |
| `INTERNAL_TICK_TOKEN` | secret (`sync:false`) | shared secret header tick; kosong = endpoint 404 |
| `TICK_MAX_JOBS` | `2` | maksimum job per tick |
| `TICK_BUDGET_SECONDS` | `120` | anggaran wall-clock per tick; sisanya ditunda ke tick berikutnya |
| `CONTINUOUS_TASK_DELAY_SECONDS` | default `75` | AIS + fan-out alert start 60–90 detik setelah boot |

Lokal/dev: `INPROCESS_BATCH_POLLERS=true` (default) mempertahankan perilaku
loop in-process, dan tick tetap bisa dipanggil manual bila token diisi.

### Urutan prioritas job saat backlog

Pemilihan job memakai rasio `umur / cadence` (paling terlambat lebih dulu), bukan
urutan registry. Dengan `TICK_MAX_JOBS=2` tiap 5 menit, job 5 menit (news, bmkg)
tidak bisa menggeser job harian (pihps) selamanya. Tick mengerjakan maksimal 2
job; sisanya ditunda dan tetap `due` — jadi backlog terkuras pada tick-tick
berikutnya.

## Kenapa timeout > 30 detik terjadi (dan kenapa 90 detik benar)

Rantai cold start di plan Free (1x instance, ~0.1 CPU):

1. **Sleep 15 menit** — Render Free menidurkan service setelah 15 menit tanpa
   traffic. Request pertama setelah tidur mengantre hingga instance boot.
2. **Boot** masih membayar import router/adapters (numpy/scipy/langgraph **tidak**
   lagi ikut ter-import saat `import app.main`, tetapi `corridor_router` tetap
   menarik `app.adapters`), plus koneksi Redis sinkron di `lifespan`. Sejak
   Phase 162 **tidak ada** 8 poller ingestion yang berebut CPU saat boot, dan
   AIS/fan-out ditunda 75 detik.
3. Akibatnya ping dengan `--max-time 45` (atau default cron 30 detik) masih bisa
   gugur di tengah boot dan tercatat gagal padahal instance sedang bangun.
   `--max-time 90` + retry menutup jendela ini.

## Verifikasi cepat

```bash
# 1. wake: harus 200 dalam < 5 dtk saat hangat, 20-60 dtk saat dingin
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
  --max-time 90 --retry 2 --retry-delay 10 \
  https://peta-nadi.onrender.com/health

# 2. tick (butuh INTERNAL_TICK_TOKEN dari Render dashboard)
curl -sS -D - -o /tmp/tick.json -w "\n%{http_code} %{time_total}s\n" \
  --max-time 90 --retry 2 --retry-delay 10 \
  -X POST -H "X-Internal-Token: $INTERNAL_TICK_TOKEN" \
  https://peta-nadi.onrender.com/internal/tick
cat /tmp/tick.json
```

Interpretasi:

| Status | Arti | Tindakan |
|---|---|---|
| `202 accepted:true` | tick diterima, `due` berisi job yang dijadwalkan | normal |
| `202 accepted:false reason:already_running` | tick sebelumnya masih berjalan | normal pada cold start; tidak perlu retry |
| `202 due:[]` | tidak ada job yang jatuh tempo | normal |
| `401` | header salah/kosong | samakan dengan `INTERNAL_TICK_TOKEN` di Render |
| `404` | `INTERNAL_TICK_TOKEN` belum diset di Render | set secret, lalu redeploy |
| `502/503` | instance belum bangun / crash | lihat log Render |

## Diagnostik state tick

State durable ada di Supabase `scheduler_jobs` (migration
`infra/supabase/migrations/023_scheduler_jobs.sql`), satu baris per job:
`last_started_at`, `last_finished_at`, `last_status`, `last_error`,
`locked_until`, `retry_after`.

```sql
-- job mana yang tertinggal / gagal?
select job_name, last_finished_at, last_status, last_error, retry_after
from scheduler_jobs
order by last_finished_at nulls first;
```

- `last_finished_at` hanya maju saat sukses; job yang gagal tetap `due`.
- `locked_until` adalah lease lintas proses; lease macet kedaluwarsa sendiri
  (TTL 600 detik), jadi tick berikutnya mengambil alih.
- `retry_after` = backoff 120 detik setelah gagal, supaya upstream yang down
  tidak dipukul tiap tick.
- Jika Supabase tidak bisa dihubungi, tick mencatat warning dan **tidak**
  mengerjakan apa pun; `/health` tetap 200 dan tidak terpengaruh.

## Yang TIDAK boleh diubah di sini

- Jangan menaikkan interval cron-job.org di atas 10 menit (batas tidur Render
  15 menit).
- Jangan menurunkan `--max-time` wake/tick di bawah 90 detik.
- Jangan menjalankan `POST /internal/tick` dari lebih dari satu penjadwal
  (duplikasi token di dua alat berbeda) — lock mencegah job dobel, tetapi
  jadwal jadi sulit diaudit.
- Jangan mengembalikan batch poller ke proses web produksi
  (`INPROCESS_BATCH_POLLERS=true`) tanpa mengukur ulang cold boot.
