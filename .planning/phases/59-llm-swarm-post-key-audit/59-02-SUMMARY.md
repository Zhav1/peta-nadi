---
phase: 59-llm-swarm-post-key-audit
plan: 02
subsystem: infra
tags: [pgvector, supabase, gemini-embeddings, asyncio-timeout, render-yaml, env-sync]

# Dependency graph
requires:
  - phase: 59-llm-swarm-post-key-audit
    provides: 59-RESEARCH.md env-sync table plus pgvector drift verdict (1536 vs 768)
provides:
  - 001_ltm_embedding_768.sql atttypmod-gated idempotent pgvector migration
  - 768-dim fresh-install schema in 000_init.sql
  - 12s embed bound plus 35s extractor outer timeout enveloping the 30s gateway inner call
  - synchronized env contracts with zero GOOGLE_API_KEY alias residue
affects: [59-01-gateway-cutover, 59-03-audit-probes, ltm-seeding, render-redeploy]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 2774
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns: [atttypmod-gated idempotent SQL migration, wait_for timeout bounds with honest []-degrade]

key-files:
  created:
    - infra/supabase/migrations/001_ltm_embedding_768.sql
  modified:
    - infra/supabase/migrations/000_init.sql
    - agents/memory/ltm.py
    - backend/app/nlp/news_extractor.py
    - .env.example
    - backend/.env.example
    - render.yaml

key-decisions:
  - "Migration shipped unprobed-but-gated: live atttypmod check deferred (no postgres driver), gate runs the check inside the DB at apply time"
  - "text-embedding-004 404 recorded as evidence, model NOT switched (one-way distribution shift per D-08 is Rule-4 architectural scope)"
  - "No package installs to run probes (policy exclusion); httpx-REST probe plus py_compile/grep equivalents instead, pytest recorded unrun"

patterns-established:
  - "pgvector width contract pinned via pg_attribute.atttypmod gate (typmod = dims + 4) with NOTICE-skip no-op path"
  - "Async LLM bounds: inner-timeout-first ordering (outer budget must exceed gateway 30s inner)"

requirements-completed: [FR-3.9, FR-3.2]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "768-dim pgvector migration plus corrected fresh-install schema"
    requirement: "FR-3.9"
    verification:
      - kind: other
        ref: "Select-String vector(768) in 001 file + 000_init.sql => MIGRATION-PINNED; atttypmod + IF EXISTS + TRUNCATE => MIGRATION-IDEMPOTENT"
        status: pass
      - kind: other
        ref: "Live read-only pg_attribute query: ltm_episodes.embedding = vector(1536) (drift confirmed); format_type predicate check returns live_matches_gate=false so the gate routes to MIGRATE, and would SKIP on vector(768)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bounded embedding (12s) and extraction (35s outer over 30s inner) timeouts with honest fallback"
    requirement: "FR-3.2"
    verification:
      - kind: other
        ref: "python -m py_compile ltm.py + news_extractor.py => COMPILE:True; wait_for + timeout=35.0 + warning-log greps pass"
        status: pass
    human_judgment: false
  - id: D3
    description: "Synchronized env contracts with stale key alias removed"
    requirement: "FR-3.9"
    verification:
      - kind: other
        ref: "GEMINI_MODEL in .env.example + OPENCODE_API_KEY in backend/.env.example + GEMINI_MODEL in render.yaml => ENV-SYNC-OK; non-comment GOOGLE_API_KEY count 0 => ALIAS-REMOVED; no AQ./AIza values in examples => NO-SECRET-LEAK"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live Supabase atttypmod width check plus embed-dim length probe against the live table"
    rationale: "Live width is proven (vector(1536), gate predicate verified), but the embed-dim length probe cannot complete: models/text-embedding-004 returns HTTP 404 for the current key, so no 768-length evidence exists and model availability needs a human/product decision"
    verification:
      - kind: other
        ref: "Live pg_attribute query => vector(1536), 0 rows, no match_episodes RPC (pass)"
        status: pass
      - kind: other
        ref: "embedContent length probe for text-embedding-004 => HTTP 404, length unobtainable (unknown)"
        status: unknown
    human_judgment: true

# Metrics
duration: 45min
completed: 2026-10-17
status: complete
---

# Phase 59 Plan 02: pgvector 768 Migration, Timeout Bounds, Env Sync Summary

**Probe-then-migrate pgvector 1536→768 with atttypmod gate, 12s embed + 35s extractor timeout bounds, and env contract sync with stale key-alias removal**

## Performance

- **Duration:** 45 min
- **Started:** 2026-10-16T17:59:32Z
- **Completed:** 2026-10-17T00:45:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Shipped `001_ltm_embedding_768.sql`: atttypmod-gated idempotent migration (skip-when-768 no-op), explicit one-way TRUNCATE, ordered DROP INDEX IF EXISTS → ALTER TYPE vector(768) → CREATE INDEX IF NOT EXISTS ivfflat lists=100, seed_ltm.py re-embed runbook with row-count verify
- Fixed `000_init.sql` fresh-install LTM block to `vector(768)` with corrected text-embedding-004 comment (no `vector(1536)` remains)
- Bounded `embed_text` with 12s `asyncio.wait_for` returning `[]` on timeout (model + `[]`-on-error contract untouched); raised extractor outer budget 12s → 35s so the 30s gateway inner timeout fires first (heuristic + warning fallback kept)
- Synchronized all three env contracts (GEMINI_MODEL + four NVIDIA placeholders/keys) and deleted the stale `GOOGLE_API_KEY` alias from render.yaml (zero non-comment residue, no secret values committed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Probe live dimension then ship 768-dim pgvector migration** - `392dcd2` (feat)
2. **Task 2: Bound async LLM timeouts in embedding and extraction** - `38883df` (fix)
3. **Task 3: Synchronize env contracts and remove stale key alias** - `f55fdca` (chore)

**Follow-up fix to Task 1 (Rule 1 bug, same file):** - `e4f545e` (fix)

## Files Created/Modified

- `infra/supabase/migrations/001_ltm_embedding_768.sql` - Created: gated 768-dim migration (see Accomplishments)
- `infra/supabase/migrations/000_init.sql` - LTM block now declares `vector(768)`
- `agents/memory/ltm.py` - `embed_text` embed call wrapped in 12s `wait_for`; match_episodes RPC path untouched (out of scope)
- `backend/app/nlp/news_extractor.py` - Outer `wait_for` 12s → 35s with inversion-fix comment; opencode driver model, no effort param
- `.env.example` - Added `GEMINI_MODEL` (chat-disabled note) + four `NVIDIA_*` placeholders
- `backend/.env.example` - Added three `OPENCODE_*` entries + `GEMINI_MODEL` (existing `NVIDIA_*` already present, kept)
- `render.yaml` - Added `GEMINI_MODEL` non-secret value + four `NVIDIA_*` sync:false secrets; stale `GOOGLE_API_KEY` entry removed; OPENCODE model values untouched

## Decisions Made

- **Ship the migration unprobed-but-gated.** No postgres driver exists in the executor env and package installs are excluded from auto-fix, so the live `atttypmod` check could not run here. The DO gate performs that exact check inside the database at apply time (no-op with NOTICE when already 768), which is the plan's own safety property — recorded as deferred live proof, not a gap in the artifact.
- **Live probe completed via MCP SQL (supersedes the above for width).** Read-only `pg_attribute` queries confirmed `ltm_episodes.embedding = vector(1536)` live (drift is real, migration is NEEDED not a no-op), 0 rows (TRUNCATE destroys nothing), and no `match_episodes` RPC exists yet. The gate constant was corrected from this evidence (see Deviations). The migration file itself is still applied by a DBA step in SQL Editor — not applied live here, since re-embed cannot succeed until model availability is resolved.
- **Missing `match_episodes` RPC flagged, not created.** `ltm.py query_ltm` calls `supabase.rpc("match_episodes")` but no such function exists live (and `000_init.sql` never defined it) — a pre-existing gap, not caused by this task's changes, so per scope boundary it is logged as follow-up rather than auto-added. Creating the RPC (with a `vector(768)` arg) should ride with migration step 4 in a future plan.
- **Record the text-embedding-004 404 as evidence, do NOT switch models.** The dependency-free REST probe (httpx, key never printed) showed this key gets HTTP 404 for `models/text-embedding-004:embedContent`, and a full paginated ListModels exposes only `gemini-embedding-001` / `gemini-embedding-2-preview` / `gemini-embedding-2` as embed-capable. Switching embedding models is a one-way distribution shift per D-08 (Rule 4 architectural scope) — out of this plan. The 768-dim contract stands; model availability is a follow-up (see Issues Encountered).
- **No `pip install` to satisfy probe/test tooling.** `google-generativeai`, `supabase`, and `pytest` are absent from the executor env; per the plan's package-legitimacy exclusion no installs were attempted. Equivalents run instead: httpx-REST embed probe, `py_compile` on both edited modules, Select-String assertions mirroring every plan `<verify>` grep. `pytest backend/tests -k "news or extract or ltm"` is recorded unrun (coverage D4 routes it to human UAT).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] atttypmod gate constant corrected to format_type comparison**
- **Found during:** Task 1 follow-up (live pg_attribute probe via read-only SQL)
- **Issue:** Migration gate assumed pgvector encodes width as `atttypmod = dims + 4` (772 for 768). Live probe showed `vector(1536)` reports `typmod=1536` — width stored directly — so the gate would never match a real `vector(768)` column and re-runs would re-MIGRATE instead of SKIP.
- **Fix:** Gate now compares `format_type(v_typid, v_typmod) = 'vector(768)'`; predicate verified live (`format_type('vector',1536)` → `vector(1536)`, `live_matches_gate=false` → MIGRATE path; symmetric SKIP on 768). Migration header comment updated with the live evidence.
- **Files modified:** `infra/supabase/migrations/001_ltm_embedding_768.sql`
- **Verification:** Select-String suite re-run (MIGRATION-OK, NO-STALE-CONSTANT) + live predicate query
- **Committed in:** `e4f545e` (fix, follow-up to Task 1)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug — gate constant that would have broken idempotency)
**Impact on plan:** Fix required for the plan's own idempotency guarantee; no scope creep. Pre-existing working-tree modifications from a parallel wave (`agents/llm_gateway.py`, `backend/app/config.py`, `backend/tests/test_llm_gateway.py`, `backend/app/nlp/ner_pipeline.py`, `.planning/ROADMAP.md`) were left untouched — only this plan's seven files were staged per task.

## Issues Encountered

- **text-embedding-004 unreachable with the current key (HTTP 404 + absent from ListModels).** This means `embed_text` currently returns `[]` via its except-branch for every call, and `seed_ltm.py` re-embed (migration step 4) will seed zero rows until key/model availability is resolved. Not acted on (architectural, out of scope). Recommended follow-up for a future plan: resolve embedding model availability (key project scope vs model cutover with full pgvector re-embed) before running migration step 4; create the missing `match_episodes(vector(768))` RPC at the same time.
- **`pytest` suite unrun** (no pytest in env). Static equivalents all pass; full `pytest backend/tests -k "news or extract or ltm"` should run in CI or a provisioned env.

## Known Stubs

None. Stub-pattern scan over the migration, both edited modules: zero TODO/FIXME/placeholder hits. (`unused-chat-disabled` / `your-*` values in env examples and render.yaml are the intentional non-secret contract per plan, not stubs.)

## User Setup Required

**Render dashboard manual follow-up (plan user_setup, D-02).** In Render Dashboard → prehub-backend → Environment:

1. Delete the stale `GOOGLE_API_KEY` variable so exactly one embedding key var remains (yaml alias already removed; `GEMINI_API_KEY sync:false` at former lines 36-37 is the survivor).
2. Confirm `OPENCODE_API_KEY` and `GEMINI_API_KEY` are set dashboard-side before redeploy.

## Next Phase Readiness

- LTM write+recall is dimension-safe on the schema side (768 pinned in both migration and fresh-install); runtime recall additionally needs the embedding-model availability follow-up above.
- No hang vectors remain in the embedding or extraction paths; extractor outer (35s) correctly envelopes the gateway inner (30s, verified at `agents/llm_gateway.py:139,180,219`).
- Local, example, and Render key contracts agree; dashboard alias deletion is the only remaining manual step.
- Out of scope, untouched as instructed: `NVIDIA_CUOPT` / `NVIDIA_FOURCASTNET` keys and all cuopt/earth2 code paths (separate purge task).

---
*Phase: 59-llm-swarm-post-key-audit*
*Completed: 2026-10-17*

## Self-Check: PASSED

- SUMMARY file exists on disk; all three task commits (392dcd2, 38883df, f55fdca) are ancestors of HEAD.
