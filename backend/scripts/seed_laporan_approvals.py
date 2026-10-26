"""Seed demo decision-trace approvals so the Laporan audit ledger renders real rows.

Uses the honest local SQLite mirror (`local_storage.save_decision_trace`) — the
same function the offline fallback in `backend/app/routers/approvals.py` uses.
No Supabase writes, no invented economics: rows are plain operator commits
(ACCEPT / REJECT / OVERRIDE) with [DEMO]-prefixed notes so the UI can badge
them honestly as Demo vs Real (juri validity).

Idempotent & append-only:
  - Existing non-DEMO rows are never touched.
  - Re-running skips creation once >= N_APPROVALS DEMO rows exist.
  - Demo identity convention (no schema migration): incident_id LIKE 'DEMO-%'
    AND notes LIKE '[DEMO]%'. The frontend `isDemoApproval()` helper detects
    exactly this convention.

Usage (from repo root):
    python backend/scripts/seed_laporan_approvals.py
    SEED_N_APPROVALS=8 python backend/scripts/seed_laporan_approvals.py

Cleanup:
    DELETE FROM route_decision_traces WHERE incident_id LIKE 'DEMO-%';
"""
import os
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db import local_storage  # noqa: E402

N_APPROVALS = int(os.environ.get("SEED_N_APPROVALS", "6"))
RNG_SEED = int(os.environ.get("SEED_APPROVALS_RANDOM_SEED", "7"))
ACTOR = os.environ.get("SEED_ACTOR", "demo-dispatcher")

# 6 honest demo commits: 3 ACCEPT, 1 REJECT, 2 OVERRIDE.
DEMO_PLAN = [
    {"incident_id": "DEMO-INC-BANJIR-01", "route_id": "R-ALT-TOL-01", "action": "ACCEPT",
     "tactical_action": "REROUTE", "operator_id": ACTOR,
     "notes": "[DEMO] Seed demonstrasi: ACCEPT pengalihan via Tol Belawan — bukan transaksi operasional nyata.",
     "days_ago": 1},
    {"incident_id": "DEMO-INC-BANJIR-01", "route_id": "R-ALT-BYPASS-02", "action": "ACCEPT",
     "tactical_action": "REROUTE", "operator_id": ACTOR,
     "notes": "[DEMO] Seed demonstrasi: ACCEPT bypass Tebing Tinggi — bukan transaksi operasional nyata.",
     "days_ago": 3},
    {"incident_id": "DEMO-INC-MACET-02", "route_id": "R-BASE-01", "action": "REJECT",
     "tactical_action": "HOLD", "operator_id": ACTOR,
     "notes": "[DEMO] Seed demonstrasi: REJECT — armada bertahan di jalur awal — bukan transaksi operasional nyata.",
     "days_ago": 6},
    {"incident_id": "DEMO-INC-BANJIR-03", "route_id": "R-ALT-PEL-04", "action": "OVERRIDE",
     "tactical_action": "CONTINUE", "operator_id": ACTOR,
     "notes": "[DEMO] Seed demonstrasi: OVERRIDE penyesuaian segmen tol — bukan transaksi operasional nyata.",
     "days_ago": 10},
    {"incident_id": "DEMO-INC-CUACA-04", "route_id": "R-ALT-MARITIM-01", "action": "ACCEPT",
     "tactical_action": "REROUTE", "operator_id": ACTOR,
     "notes": "[DEMO] Seed demonstrasi: ACCEPT opsi intermodal Belawan — bukan transaksi operasional nyata.",
     "days_ago": 14},
    {"incident_id": "DEMO-INC-MACET-02", "route_id": "R-ALT-TOL-02", "action": "OVERRIDE",
     "tactical_action": "CONTINUE", "operator_id": ACTOR,
     "notes": "[DEMO] Seed demonstrasi: OVERRIDE lanjutan koridor Siantar — bukan transaksi operasional nyata.",
     "days_ago": 19},
]


def main() -> None:
    rng = random.Random(RNG_SEED)
    existing = [t for t in local_storage.list_decision_traces(limit=5000)
                if str(t.get("incident_id", "")).startswith("DEMO-")]
    real = [t for t in local_storage.list_decision_traces(limit=5000)
            if not str(t.get("incident_id", "")).startswith("DEMO-")]
    print(f"[seed] existing DEMO approvals={len(existing)} real approvals={len(real)}")

    if len(existing) >= N_APPROVALS:
        print(f"[seed] already seeded (>= {N_APPROVALS} DEMO rows). Skipping creation.")
    else:
        plan = DEMO_PLAN[: max(0, min(N_APPROVALS, len(DEMO_PLAN)))]
        # If N_APPROVALS > plan length, cycle with fresh incident suffixes.
        while len(plan) < N_APPROVALS:
            base = rng.choice(DEMO_PLAN)
            copy = dict(base)
            copy["incident_id"] = f"DEMO-INC-XTRA-{rng.randint(10, 99):02d}"
            copy["days_ago"] = rng.randint(0, 30)
            plan.append(copy)
        for spec in plan:
            created_at = (datetime.now() - timedelta(
                days=int(spec["days_ago"]),
                hours=rng.randint(0, 23),
                minutes=rng.randint(0, 59),
            )).isoformat()
            saved = local_storage.save_decision_trace({
                "incident_id": spec["incident_id"],
                "route_id": spec["route_id"],
                "action": spec["action"],
                "tactical_action": spec["tactical_action"],
                "operator_id": spec["operator_id"],
                "recommended_route": {},
                "custom_constraints": {},
                "notes": spec["notes"],
                "sync_status": "synced",
                "created_at": created_at,
            })
            print(f"[seed] demo approval id={saved['id']} incident={saved['incident_id']} "
                  f"action={saved['action']} created_at={saved['created_at']}")

    demo = [t for t in local_storage.list_decision_traces(limit=5000)
            if str(t.get("incident_id", "")).startswith("DEMO-")]
    # Backfill: pre-existing DEMO- rows from other seeders may lack the [DEMO]
    # notes tag — label them in place so the UI badge stays honest.
    conn = local_storage.get_db_connection()
    try:
        with conn:
            cur = conn.execute(
                "UPDATE route_decision_traces SET notes = '[DEMO] ' || COALESCE(notes, '') "
                "WHERE incident_id LIKE 'DEMO-%' AND UPPER(COALESCE(notes, '')) NOT LIKE '%[DEMO]%'"
            )
            if cur.rowcount:
                print(f"[seed] backfilled [DEMO] label onto {cur.rowcount} pre-existing rows")
    finally:
        conn.close()
    demo = [t for t in local_storage.list_decision_traces(limit=5000)
            if str(t.get("incident_id", "")).startswith("DEMO-")]
    real = [t for t in local_storage.list_decision_traces(limit=5000)
            if not str(t.get("incident_id", "")).startswith("DEMO-")]
    assert len(demo) >= min(N_APPROVALS, 5), "Demo approvals missing after seeding!"
    by_action: dict = {}
    for t in demo:
        by_action[t.get("action")] = by_action.get(t.get("action"), 0) + 1
    unlabeled = [t for t in demo if "[DEMO]" not in str(t.get("notes", "")).upper()]
    assert not unlabeled, f"Unlabeled DEMO rows found: {len(unlabeled)}"
    print(f"[verify] demo={len(demo)} real={len(real)} by_action={by_action}")
    print("[seed] re-run: python backend/scripts/seed_laporan_approvals.py")
    print("[seed] clean:  DELETE FROM route_decision_traces WHERE incident_id LIKE 'DEMO-%';")


if __name__ == "__main__":
    main()
