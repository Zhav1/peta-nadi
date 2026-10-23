# Phase 90 — Learnings (verified facts only)

Grounded in this session's diffs (`git diff -- backend/... backend/tests/`),
the untracked `backend/tests/test_osint_leak_hardening.py`, and the test runs
listed in WALKTHROUGH.md. No assumptions.

## Reusable lessons

(a) **Production gates must fail closed; fixtures opt in explicitly.**
The freshness gate treated unparseable dates (`"15m lalu"`, `"Terkini"`,
missing) as fresh — a backdoor for stale DOM-scraped pages. Fix:
default `is_fresh=False` / `unparseable_date_in_prod`, with
`is_test_fixture=True` preserving the legacy path. Evidence:
`news_aggregator.py:697-810`.

(b) **Joining title+desc without punctuation breaks sentence-level logic.**
`f"{title} {desc}"` merges two sentences into one, so predicate+infra from
different fields falsely share a sentence (or a boundary is lost). All three
join sites now use `". "`. Evidence: `news_extractor.py` gate/heuristic joins.

(c) **Permissive infra lists leak — bare hazards need strict infra.**
Qualifying `banjir/rob/genangan` on the veto list (which includes
`distribusi/logistik/kargo/sembako`) lets commodity sentences
(`distribusi … terganggu`) pass as physical. Qualification now requires
`_PHYSICAL_INFRA_NOUNS` (road/port/vehicle); the permissive list is used
only for the veto direction. Evidence: `has_physical_crisis_proximity`
branches (A)/(B).

(d) **Comments and numeric checks drift — keep bbox constants single-sourced.**
The ingestor comment said `-6..6N` while intending `-6.5..6.5N`, and its
numeric check still read `-6.0`. Same-window fix: `-6.5` in code + strings
across all four files. Next step should be one shared constant.
Evidence: `unified_news_ingestor.py:391-394` hunk.

(e) **Test fixtures that depend on a backdoor must be updated when it closes.**
Three existing suites relied on the fresh-on-unparseable behaviour and needed
`"5 menit lalu"` / `now.isoformat()` dates after the gate closed.
Evidence: `test_news_pipeline.py`, `test_phase76_news_spatial_consensus.py`,
`test_pre_llm_filter.py` hunks.

(f) **Environment notes (this Windows session).**
- PowerShell tooling: no `grep`/`head`/`&&` chaining — use `Select-String` /
  `Select-Object`, `;`-separated commands.
- Run pytest suites individually with `-p no:cacheprovider` under memory
  pressure (WinError 1450 observed with full-suite runs).
- `test_agents.py` is uncollectable (missing `google.generativeai`) —
  pre-existing, unrelated.
- `test_cross_workstream::test_resolve_canonical_article_url` failure is
  pre-existing (resolver byte-identical to HEAD) — do not chase in news work.

## Standing constraints / conditions for future work

| Item | Value |
|---|---|
| Strict scope | `news_aggregator.py` + `news_extractor.py` (+ gazetteer/geocoding/bbox consistency); nothing outside without a new phase |
| Geographic mandate | Every km² of Pulau Sumatera + archipelagic nodes (Kepri/Natuna-Anambas-Lingga-Karimun, Babel, Mentawai, Enggano, Nias) |
| Decision philosophy | Admit uncertainty over false positive (DROPPED > YELLOW; un-geocoded never RED; FPR ≤ 0.15 per Phase 84) |
| Regression contract | Existing tests must stay green (88 hardening+news/pre_llm/phase76; 8 bmkg + 9 calibration + 10 geocode + 22 scrapers) |
| No commit/push in docs tasks | Files only; a separate step owns commits |

---

## Follow-up phase

The P0-P4 remediation committed as `20c7fa5` builds on this phase's OSINT gates
(spatial corroboration, degraded-source ledger, idempotent writes, map/UI
null-guards). Its record lives in
`../91-p0-p4-integrity-remediation/LEARNINGS.md` and `DECISIONS.md`.
