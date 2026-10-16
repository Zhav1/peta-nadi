# Phase 58 Learnings Extraction — opencode-go Migration + Audit Fixes

**Window:** 2026-10-14 (plan → execute → audit → fix → verify → docs)
**Commits:** `44030b4`..`ec211f9` (+ closeout/docs)
**Next phase number:** 59 (this file is debug documentation, not a phase)
**Companion:** [`58-PLAN.md`](./58-PLAN.md) (copy of the plan executed in this window)

> Scope rule for this file: everything tried, concerned, constrained, conditioned,
> and broken in this window — **excluding assumptions** (those live in
> `58-RESEARCH.md` Assumptions Log A1–A3 and stay there).

---

## 1. What changed

### Phase 58 core (WP1–WP4)
- `agents/llm_gateway.py` — opencode-first branch (single base-URL constant,
  Bearer key, 30s timeout, fail-loud). Gemini/NIM kept fail-closed, not deleted.
- Model split: `mimo-v2.6-flash-free` reasoning (decision_support, economic
  narrative) / `deepseek-v4.1-flash` driver (osint severity, prediction narrative,
  routing explainer, simulation/chat).
- LTM embeddings stay Google `text-embedding-004` (no opencode embeddings
  endpoint exists — verified against official docs, not guessed).
- 5 call sites rewired (the 5th, `news_extractor.py`, was caught by the checker,
  not the planner — see §4 W2).
- Expansion A (prediction narrative) + B (routing explainer), prose-only,
  deterministic fallback, no DAG/consensus/state-schema changes.
- Drift fixes: `incident_id`/`id` either-key reads, `idle`/`never` boot seeds,
  `DEMO_OFFLINE=false` pin + boot log.
- `render.yaml` full env sync (secrets `sync: false`, dashboard-only).
- `scripts/verify_opencode_models.py` + `scripts/probe_parity.sh` shipped.
- Verified: 194/194 pytest green, graph/consensus diffs empty, local SSE trace
  end-to-end (consensus 0.86 validated).

### Audit fixes F1–F5 (`ec211f9`, all verified green)
- **F1:** Gemini branch uses `settings.gemini_model` (never caller opencode IDs);
  30s `wait_for` bound on the previously unbounded SDK call. + regression test.
- **F2:** deterministic decision fallback labeled `[ESTIMASI DETERMINISTIK…]`;
  price/inflation lines relabeled baseline/estimate.
- **F3:** `route.explainer` + prediction `narrative` surfaced in
  MitigationTab RouteCard + EconomicTab "Narasi Prakiraan" (+ `explainer?` type,
  `typeof` narrowing, `degraded` in chat API type).
- **F4:** `/agents/status` reports `warming` + `0.0` until first real run.
- **F5:** degraded chat → 0.62 confidence, `consensus_passed=False`, cuOpt source
  replaced with CPU-solver label.

## 2. Tried fixes & iterations

- Plan-checker round 1 verdict **FAIL** (W1–W3), all fixed in plan text, round 2
  **PASS** with zero re-research. Lesson: checker findings at plan level are
  cheap; the same findings at execution level would have cost real commits.
- W1 (PYTHONPATH): bare `python -c` importing `agents.*` fails from repo root
  because nodes do `from app.config import …` (path comes only from pytest
  rootdir/conftest). Every `<verify>` command touching `agents.*` must be
  prefixed `PYTHONPATH=backend`. **Do not "fix" by editing imports.**
- W3 (per-branch defaults): first attempt (global default swap) would have
  deadened the kept Gemini revert path. Per-branch resolution is the pattern
  (and F1 later proved the same bug class lived inside the branch too).
- F1 was found by audit, not by tests: all 194 tests passed WITH the bug,
  because no test combined "opencode ID + Gemini-only keys". The new regression
  test covers exactly that combination. Lesson: failover-matrix tests must cover
  key-presence combinations, not just single-provider states.
- Edit collision (self-inflicted): a `types.ts` edit duplicated the
  `safety_status` line because oldString matched twice across near-identical
  context. Caught by immediate re-read. Rule: **read the hunk after every edit**
  to non-test shared files (types, schemas, yaml).

## 3. Concerns (kept, not all resolved)

- **Honesty debt is structural, not textual.** F2 tags the fallback, but any
  deterministic text containing numbers can resurface as "verified" downstream.
  The durable fix is payload-derived-or-empty rendering at every surface, not
  disclaimers. Carried as routine, not a phase.
- **Expansion cost without UI was real** (F3): two LLM calls per crisis burned
  latency/tokens for prose nobody rendered. New rule: no LLM overlay ships
  without its render site in the same change.
- **Dead-endpoint honesty work (F5)** has zero user impact while chat has no UI.
  Fine as hygiene, but do not mistake it for user-facing progress.
- **Sequential LLM latency stacking** (~+90s healthy / ~+2min degraded per
  crisis) fits NFR-1 today. If a third overlay is ever proposed, it needs
  parallel fan-out or a budget, not another sequential await.

## 4. Constraints / conditions / context (locked, do not relitigate)

- From 58-CONTEXT D-01–D-16: mimo reasoning + deepseek driver split; single
  endpoint; opencode-first fail-loud (no canned prose ever); LTM fallback-to-Google
  clause; full-swarm audit from code not docs; full Render env sync + production
  flag; DAG + consensus formula untouched; expansion allowed prose-only;
  pilot lens on everything (dispatcher / regulator / HITL / stale labels).
- From 57-CONTEXT D1–D8 (do-not-regress): guest writes stay 403, invite-only
  auth, no password material in repo/UI, live-Mapbox-first routing, background
  news ingestion, no mock-economy injection, demo honest-empty states.
- User corrections in this window: (a) audit from end-to-end/user/business
  angles, not just code; (b) fix-all authorized explicitly; (c) docs must
  extract learnings sans assumptions; (d) PLAN.md lives in `.planning/debug/`,
  never temp files; (e) phase numbering continues (next = 59).

## 5. Environment conditions (this box, Windows)

- Shell is PowerShell 5-style: **no `&&` / `||` chaining** (parser error);
  use `;` and separate calls. `tail`, `find` (without path) may be missing.
- Python: system `python` has no pytest — always use
  `backend/.venv/Scripts/python.exe`.
- **Slow pytest runs lose redirected output**: `> file 2>&1` comes back empty
  on runs >~60s; pipe through `| Out-String | Select-Object` in-shell instead,
  or pass `-u`. Fast suites are unaffected.
- **Memory fragility is the dominant constraint.** `tsc --noEmit` OOMs even at
  6 GB heap (zero frontend files touched — purely environmental). Parallel
  pytest + numpy import can hit `OpenBLAS: Memory allocation failed`; retry
  with `$env:OPENBLAS_NUM_THREADS='1'; $env:OMP_NUM_THREADS='1'`. Full suite
  takes ~11 min here; NIM egress burns ~30–50s per LLM-touching test (real
  nvapi keys in root `.env`, blocked/slow egress) — tests still pass via
  fail-loud fallback, exactly per contract.
- Root `.env` holds REAL nvapi keys + placeholder Gemini/DeepSeek keys.
  Never print values; `git status` must be clean of `.env` (it is gitignored —
  verify, don't assume).
- `git add .` is authorized in this repo by the user for docs closeouts, but
  always run `git status --porcelain` first and delete probe debris
  (`chat_probe.json`, `sse_*.json/txt`, `pytest_out.txt` at root) before adding.

## 6. Issues found while making (mistake log)

| # | Mistake / issue | Cost | Prevention |
|---|---|---|---|
| M1 | Planner missed 5th gateway caller (`news_extractor.py`) | checker FAIL cycle | grep `LLMGateway.generate_content` across repo during planning, not just nodes/ |
| M2 | Global-default swap would deaden Gemini revert | checker FAIL cycle | per-branch defaults as the default pattern for multi-provider gateways |
| M3 | `types.ts` duplicate-line edit collision | 2 extra turns | read hunk after every shared-file edit |
| M4 | Ran full suite foreground repeatedly against 120s timeouts | 4+ wasted timed-out runs | background + notify for suites >60s; thin env flags for numpy suites |
| M5 | Chased "hang" that was a 50s NIM timeout (twice) | ~30 min | first hypothesis on slow LLM tests must be provider-timeout burn; confirm with single-test timing before bisecting |
| M6 | Probe debris (`chat_probe.json`, `sse_*`, `pytest_out.txt`) left at root twice | cleanup turns | probe scripts write under phase dir or temp; never repo root |

## 7. Open loops for the next window (Phase 59+ candidates, not commitments)

1. **Render operator leg** (human): dashboard secrets → verify `ENVIRONMENT` →
   redeploy → `bash scripts/probe_parity.sh https://peta-nadi.onrender.com`.
2. **mimo pro-ID resolution**: run `verify_opencode_models.py` with the Go key.
3. **Vercel frontend env**: `NEXT_PUBLIC_API_URL/WS_URL` → Render URLs,
   Mapbox + Supabase anon keys (build-time baked — set before deploy);
   append Vercel domain to backend `CORS_ORIGINS` in Render dashboard.
4. **Dead code triage**: `AgentStatusWidget.tsx` + `api.simulation.chat` client
   unmounted — delete or revive deliberately (revival must consume `degraded`).
5. **NIM-timeout test tax**: LLM-touching tests burn ~30–50s each in sandbox;
   consider keyless-fast-path fixtures or `pytest -m "not slow"` markers.
6. **tsc needs a bigger box** (or `--max-old-space-size` > 8 GB + patience);
   cannot verify frontend type-correctness in this sandbox.

---
*Extracted: 2026-10-14 · window: plan→execute→audit→fix→verify→docs · Phase 58 complete*
