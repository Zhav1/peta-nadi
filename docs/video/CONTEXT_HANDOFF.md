# PROJECT CONTEXT HANDOFF — PetaNadi Video Production
**Date:** July 25, 2026
**Project:** PetaNadi (S0848) — PIDI Digdaya x Hackathon 2026 (3rd Submission)

---

## 1. Project Goal & Current Status
The goal is to produce a professional, AI-generated, modern, cinematic, minimalist "hook/pitch" video (180 seconds total) for the 3rd Hackathon submission, supported by an automated 60 FPS Apple Keynote-style presentation engine powered by HyperFrames.

**Status:** 
- ALL master production documents (`VIDEO_SCRIPT_FULL.md`, `FLOW_PROMPTS.md`, `TEAM_INFO.md`, `ANIMATION_GUIDE.md`, `STYLE_GUIDE.md`) have been fully updated and synchronized to match the official **Proposal Submission 3** (`docs/Proposal Submission 3.md`).
- A 60 FPS HTML/GSAP presentation project has been scaffolded, built, and rendered at `docs/video/presentation/`.
- Rendered 60 FPS MP4 video output is validated and ready at `docs/video/presentation/output/petanadi_presentation_60fps.mp4`.

---

## 2. Key Accomplishments & Alignment Updates

1. **Full Alignment with Proposal Submission 3**:
   - **Business Model**: Updated to **Hybrid B2G + B2B** (B2G Lisensi Tahunan `Rp 120M – 600M/yr` with `Rp 50M – 250M` Setup Fee; B2B Tiered SaaS `Rp 3M – 35M/mo`). Added Indonesian scale note: *(Tergantung skala operasional & jumlah armada instansi/perusahaan)*.
   - **Financial ROI**: **3.4× ROI** (340%), **~22 Month Payback Period** (Break-even Year 2), **10%–15%** logistics cost reduction, **40% faster** response acceleration, **<15 minute** anomaly detection latency, **Rp 450M** initial seed capital.
   - **Validated Customer Discovery Quote**: Direct quote included from Direktur PT Rahmat Mandiri Sentosa (*"Rerouting saat ini baru dilakukan setelah armada di perjalanan — kami membutuhkan sistem prediktif sebelum keberangkatan."*).
   - **Team Readiness**: Updated with official team member roles, credentials (*Certified Agentic AI & LLM Specialist, Fullstack FastAPI/Next.js/Supabase Lead, PRD Owner & 4D GIS Visualizer, GTM & Partnership Lead*), and Level 3 MVP readiness.

2. **HyperFrames 60 FPS Presentation Engine (Higgsfield x Claude Motion Style)**:
   - Scaffolded and configured in `docs/video/presentation/`.
   - **Continuous 3D Camera Drift**: Camera maintains a subtle, slow 3D spatial drift across all slides (`scale 0.96 -> 1.03`, `rotateX/rotateY` spatial perspective) eliminating static pauses.
   - **Harmonized Depth Entrances**: Cards enter in 3D coordinate space (`z: -50px -> 0`, `scale: 0.94 -> 1.0`) with unified `power3.out` easing.
   - **Seamless Cross-Fades**: Overlapping cross-fades (`0.7s`) guarantee zero black gaps or frame freezes.
   - **Single-File Parameterization**: All texts, numbers, quotes, team info, and image paths are cleanly editable in `docs/video/presentation/src/data-config.js`.

---

## 3. Rendered Output Artifacts

- **Rendered Presentation Video**:  
  [`docs/video/presentation/output/petanadi_presentation_60fps.mp4`](file:///d:/College/Pidi.id/docs/video/presentation/output/petanadi_presentation_60fps.mp4) (35.7 MB, 60 FPS, 2700 frames, 45 seconds).
- **HyperFrames Codebase**:  
  [`docs/video/presentation/`](file:///d:/College/Pidi.id/docs/video/presentation/)

---

## 4. How to Run Preview & Re-Render

### Live Studio Preview
```powershell
Set-Location -Path "d:\College\Pidi.id\docs\video\presentation"
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
rtk npx hyperframes preview
```

### Re-render 60 FPS MP4 Video
```powershell
Set-Location -Path "d:\College\Pidi.id\docs\video\presentation"
$ffmpegDir = Split-Path -Path (node -e "console.log(require('ffmpeg-static'))")
$ffprobeDir = Split-Path -Path (node -e "console.log(require('ffprobe-static').path)")
$env:PATH = "$ffmpegDir;$ffprobeDir;" + [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
rtk npx hyperframes render -o output/petanadi_presentation_60fps.mp4 --fps 60
```

---

## 5. Master File Directory
All up-to-date, source-of-truth files are located at `d:\College\Pidi.id\docs\video\`:
- `VIDEO_SCRIPT_FULL.md` (Master timeline, script, and overlay specs aligned with Proposal 3)
- `TEAM_INFO.md` (Team credentials, validated quotes, and Hybrid B2G/B2B financial model)
- `ANIMATION_GUIDE.md` (Apple Keynote specs + HyperFrames 60 FPS presentation guide)
- `FLOW_PROMPTS.md` (Copy-paste prompts for AI video generator)
- `STYLE_GUIDE.md` (Visual identity and audio tone)
- `presentation/` (HyperFrames project, code, config, and 60 FPS MP4 output)
