# Phase 56: Environment Constraints, Tooling Limits & Platform Pitfalls

External constraints and environment traps encountered while implementing Phase 56. Each section documents the hard limit, the observed failure it caused, and the workaround pattern.

---

## 1. cmdc Model Limits — Weekly Cap & Fallback Chain

**Hard constraint:** the cmdc delegation layer enforces **per-model weekly usage caps**. During Phase 56 execution, the implementation model **DeepSeek V4.1 Flash reached its weekly cap** mid-phase and began refusing new dispatches.

**Observed failure:** subagent dispatches configured for DeepSeek V4.1 Flash (`--yolo --tools-all --effort max`, per `56-PLAN.md` §Execution delegation) failed or stalled at the quota boundary — not with a code error, but with an account-level rate/quota rejection.

**Workaround pattern (applied):**

| Step | Action |
|---|---|
| 1 | Detect the cap rejection (quota/limit error on dispatch, not a syntax or test failure). |
| 2 | Fall back to the next available model in the free tier: **`inclusionai/ling-3.1-flash:free`** — a lighter model, so scope the remaining work into smaller, single-WP dispatches. |
| 3 | Record the substitution in the phase docs (this file) so the next context window knows which model actually executed which WP. |
| 4 | **Update the relevant `SKILL.md`** with the new fallback chain and the cap behavior, so future sessions learn the limit without rediscovering it. |

**Rules for future phases:**
1. Never pin a single model for a multi-WP phase — declare a primary + fallback in the plan.
2. When a cap hits, prefer *smaller* dispatches on the fallback model rather than one large one (lighter models degrade on long contexts).
3. After any fallback, the orchestrator (not the subagent) reviews `git diff` and runs the builds — lighter models need tighter review.
4. Check remaining weekly quota *before* dispatching the first WP of a session.

---

## 2. Windows Shell & Python Path Resolution

### 2.1 cmd.exe vs PowerShell

This workspace runs on Windows. Two distinct shells are in play, and they behave differently:

| Trap | Symptom | Fix |
|---|---|---|
| `head`, `ls`, `cat` etc. | `'head' is not recognized as an internal or external command` | cmd.exe lacks Unix utilities — use PowerShell cmdlets (`Select-Object`, `Get-Content`) or the dedicated file tools |
| `./.venv/Scripts/python.exe` in cmd.exe | `'.' is not recognized as an internal or external command` | cmd.exe does not resolve `./`-prefixed executables — use `.\.venv\Scripts\python.exe` (PowerShell) or the absolute path |
| Output redirection `> log 2>&1` | works in cmd.exe, but PowerShell `| Select-Object -Last N` wrappers serialize output as CLIXML and swallow the real text | redirect straight to a file with cmd-native redirection, then read the file |

### 2.2 Virtual environment python path

The backend venv lives at **`backend\.venv\Scripts\python.exe`** (Windows layout — *not* `backend/.venv/bin/python`). Always invoke it as:

```powershell
cd D:\College\Pidi.id\backend
& ".\.venv\Scripts\python.exe" -m pytest tests -q
```

**Rule:** every backend verification command in this repo must use the venv interpreter explicitly; the system python does not carry the project's dependencies (httpx, fastapi, pytest-asyncio, …).

### 2.3 PowerShell PATH refresh (rtk proxy)

Per the repo's global `AGENTS.md`, when `rtk` (Rust Token Killer) is not resolved in a subshell, refresh the PATH from the registry before use:

```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk <command>
```

---

## 3. Known Workspace Quirks — Content-Search Emptiness

**Observed (multiple times, this session):** the workspace grep/ripgrep tool returned **empty results for strings that verifiably exist in files**. Confirmed cases:

| Pattern | File (content confirmed by direct read) | grep result |
|---|---|---|
| `right-[424px]` | `frontend/components/demo/GuidedDemoPanel.tsx` L141 | no matches |
| `HAZARD_RADIUS_OPTIONS_KM` | `frontend/lib/aiDynamicRouter.ts` L6 | no matches |
| `_is_link_alive` / `_attach_link_liveness` | `backend/app/services/unified_news_ingestor.py` L106/L138 | no matches |
| `424` | `GuidedDemoPanel.tsx` L141 | no matches |

**Impact:** a naive "search then edit" loop silently no-ops — you conclude code doesn't exist and re-implement or skip it.

**Workaround pattern (mandatory in this workspace):**
1. When grep returns empty but you have reason to believe the string exists, **read the file directly** (`read_file` with offset/limit) before concluding anything.
2. For repo-wide verification sweeps (e.g., the WP5 mock purge), use **PowerShell `Select-String`** as the cross-check — it does not exhibit the emptiness:

```powershell
Get-ChildItem -Recurse -File -Include *.ts,*.tsx,*.py,*.json,*.md |
  Where-Object { $_.FullName -notmatch 'node_modules|\.venv|\.next|\.git\\' } |
  Select-String -Pattern 'MOCK_SOCIAL_POSTS' -SimpleMatch
```

3. Subagents appear to hit the emptiness more often than the main thread — verify any subagent-reported "not found" with a direct read before acting on it.
4. Beware substring false positives in sweeps: `38500` matches `385000.0` (`test_pilot_e2e.py:77`, a spoilage-cost bound) — inspect hits, don't just count them.

---

## 4. Design Guidelines Enforced in Phase 56

These rules were applied to every Phase 56 UI change and must continue to apply:

### 4.1 Functional status rule
Every status-bearing element must reflect real state — a badge, toggle, or metric is **functional**, not decorative. Concretely in Phase 56:
- The "Mode Simulasi" toggle is a real state switch with a toast explaining the consequence (synthetic fallback fleet vs real/offline cache), never a static badge.
- Dead news links render an honest "Tautan asli kedaluwarsa" state; they never silently redirect to a search URL.
- Economic cards render payload values or an explicit empty state — never invented numbers (no hardcoded "+17.1%" / "Rp 210 Juta").

### 4.2 Pure flatness (no backdrop blur)
Docked panels, pills, and cards are **flat solid surfaces** (`bg-[#0c1017]`, `bg-[#121822]` with `border-[#1c2432]`). No `backdrop-blur`, no glassmorphism, no translucency on map-overlay chrome — blur layers break the 60 FPS map rendering budget and legibility over the Mapbox canvas.

### 4.3 12px font size floor
`text-xs` (12 px) is the **minimum** for any label, chip, badge, or telemetry text. Phase 56 introduced new chips (anomaly/preseden tags, "Tautan asli kedaluwarsa" badge, "Kutipan tersimpan" button) all at `text-xs` or above; the economic mini-card uses `text-[11px]` **only** for the mono commodity chips inside the payload-bound card, never for primary status text.

### 4.4 `cursor-pointer` on interactive items
Every clickable element carries `cursor-pointer` (buttons, anchors, expanders) and every *disabled* state carries `disabled:cursor-not-allowed` (see the "Buka Mitigasi & Setujui" CTA, `GuidedDemoPanel.tsx` L463). Hover transitions stay in the 150–300 ms band (`transition-colors`, `duration-200`).

---

## 5. Process Pitfalls Specific to This Phase

### 5.1 The uncommitted-tree trap
Phase 56 landed as **23 modified + 2 new files in the working tree, uncommitted**. Documentation and verification must therefore cite the working tree (`git diff HEAD`), not a commit hash. Rule: write phase docs *before* committing so the evidence ledger matches the tree being described.

### 5.2 Verification toolchain order
The correct verification order that produced the Phase 56 ledger:

1. `backend\.venv\Scripts\python.exe -m pytest tests -q` (backend contract tests)
2. `npm run build` in `frontend/` (typecheck + production build — includes `tsc`)
3. `npx playwright test toll-bypass-routing.spec.ts` (needs the production server; the config's `webServer` block starts `npm run start` with `reuseExistingServer: true`)
4. PowerShell `Select-String` purge sweep
5. Manual offline demo walkthrough (Evidence → Economic → Mitigation)

Skipping step 2 before step 3 wastes a Playwright run against a stale build.

### 5.3 Background-task output capture
Long-running verifications (pytest ≈ 10 min on this machine) must be launched as background tasks with **file redirection**, not piped through `Select-Object -Last N` — the CLIXML serialization of PowerShell 5.1 swallows the real output and only the exit code survives.

### 5.4 Delegation review loop
Per `56-PLAN.md`: one WP at a time, orchestrator reviews `git diff` and runs builds after each. When the primary model hit its weekly cap (§1), the review loop became *more* important, not less — lighter fallback models need the orchestrator to catch contract drift (e.g., renamed response fields) that a heavier model would avoid.
