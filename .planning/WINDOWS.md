---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 0
total_count: 3
last_updated: 2026-10-16T18:11:48.794Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 59 | unrun-verify | backend/tests |  | 59-02: pytest backend/tests -k news/extract/ltm unrun (no pytest in executor env) | open |  | 2026-10-16T18:11:38.726Z |  |
| 2 | 59 | deviation | infra/supabase/migrations/001_ltm_embedding_768.sql |  | 59-02 follow-up: no match_episodes RPC exists live; create match_episodes(vector(768)) with migration step 4 re-embed | open |  | 2026-10-16T18:11:47.844Z |  |
| 3 | 59 | unmet-truth | agents/memory/ltm.py |  | 59-02 finding: models/text-embedding-004 returns HTTP 404 for current key (absent from ListModels); embed_text degrades to [] until model availability resolved | open |  | 2026-10-16T18:11:48.794Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "59",
    "file": "backend/tests",
    "line": null,
    "description": "59-02: pytest backend/tests -k news/extract/ltm unrun (no pytest in executor env)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-16T18:11:38.726Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "59",
    "file": "infra/supabase/migrations/001_ltm_embedding_768.sql",
    "line": null,
    "description": "59-02 follow-up: no match_episodes RPC exists live; create match_episodes(vector(768)) with migration step 4 re-embed",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-16T18:11:47.844Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 3,
    "kind": "unmet-truth",
    "phase": "59",
    "file": "agents/memory/ltm.py",
    "line": null,
    "description": "59-02 finding: models/text-embedding-004 returns HTTP 404 for current key (absent from ListModels); embed_text degrades to [] until model availability resolved",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-16T18:11:48.794Z",
    "resolved_at": null,
    "milestone": null
  }
]
````
