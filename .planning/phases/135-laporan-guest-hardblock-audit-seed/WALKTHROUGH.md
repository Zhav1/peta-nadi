# WALKTHROUGH — Phase 135: Laporan Guest Hard-Block + Audit Guided + Demo Seed

**Commit:** `8f30522` (Fase B slice).

## Changes made

- Triple lock for guests: (1) nav `#nav-reports` disabled + tooltip,
  (2) `?section=reports` deep-link → map + `openAuthModal()` + toast
  "Mode Sandbox: Laporan terkunci untuk tamu…", (3) live-downgrade effect
  repeats the bounce when role flips mid-session.
- In-section lock card (`role=alert`, `aria-label="Laporan terkunci untuk tamu"`)
  with Masuk / Kembali-ke-Peta actions (only reachable if section forced open).
- Audit ledger: `isDemoApproval()` helper; Demo/Real count badges
  (`aria-label="Label keaslian data"`); per-row Demo chip; guided empty with
  exact strings asserted in e2e ("Belum ada catatan persetujuan mitigasi",
  `POST /approvals`, "Mode Sandbox tamu tidak dapat mengisi audit").
- `LaporanFilterBar` migrated to Base-UI `Select` (`modal={false}`,
  `portal={false}` canonical Analitik pattern); granularity pills get
  `role=group` + `aria-pressed`.
- Seeder: 6 honest demo commits with fixed RNG seed 7; verify asserts
  `demo ≥ min(N,5)` and zero unlabeled DEMO rows.

## Fixes tried + retry (user-provided context)

- Port-3000 squatter kill: stale dev server held the port during Playwright
  runs → kill before gate, re-run.
- M7 gate `mockDispatcherAuth` drift: gate spec needed the dispatcher mock
  update after the hard-block (guests no longer mount ledger).
- `laporan-filters` Select migration: native select → Base-UI changed the
  option query shape; spec updated, re-ran green.

## Concerns

- Juri validitas: Demo vs Real labeling is the validity mechanism — every
  seeded row carries `[DEMO]` + `DEMO-INC-*` so judges can distinguish demo
  commits from operational rows. Never present Demo rows as Real.
- No synthetic-as-real: seeder writes operator commits only, no fake prices.

## Constraints / conditions (user-given)

- Hard-block guest (not soft-hide); keep Demo/Real labeling; threshold 10 keep;
  never touch Peta/Evaluasi/RBAC POST; e2e green; Playwright auto-check;
  orchestrator Xhigh via sub High only.

## Environment

- Windows `D:\College\Pidi.id`; `frontend/` Vercel root; `backend/` Render.
- Branch (user-given): `evaluasi-credibility-milestone-20261026`; commit `8f30522`.

## Issues found — avoid next time

- Every new Laporan entry point (nav, URL, programmatic `setActiveSection`)
  needs the guest guard — audit all three, not just the button.
- Base-UI `Select` requires `modal={false}` + `portal={false}` over map canvas;
  default portal breaks map interaction.
- Seeder re-runs must stay idempotent; never delete/alter non-DEMO rows.
