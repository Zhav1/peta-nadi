"""
PreHub : One-time fuel-golongan backfill (Phase 2 of the fuel-spec goal).

Recomputes `baseline_fuel_liters` / `actual_fuel_liters` with per-truck
efficiency (asset override -> GOLONGAN_DEFAULT_KMPL -> legacy 3.5) AND
reprices fuel costs to the CURRENT SK (`fuel_prices` latest <= today) per
the locked decision, stamping `fuel_source = "migrated_golongan"`.

Modes:
  python backfill_fuel_golongan.py --dry-run [--limit N] [--company-id X]
  python backfill_fuel_golongan.py --apply    [--limit N] [--company-id X]

--dry-run prints the per-row audit (old vs new fuel/cost, eff used, rate
used) and changes nothing. --apply persists via the standard service
persistence path (Supabase primary, SQLite fallback) and appends an audit
log to `backend/scripts/backfill_fuel_golongan.audit.jsonl`.

Old rows are otherwise NEVER repriced: the ledger freezes fuel at
`created_at`, so only rows touched by this backfill (or newly created
trips) carry the new math.
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

# Ensure backend root is on sys.path when running standalone
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import local_storage  # noqa: E402
from app.services import travel_ledger_service as tls  # noqa: E402
from app.services.spoilage_hedging_service import (  # noqa: E402
    GOLONGAN_DEFAULT_KMPL,
    get_fuel_rate_for_trip,
)

AUDIT_LOG = Path(__file__).resolve().parent / "backfill_fuel_golongan.audit.jsonl"


def _audit(entry: dict) -> None:
    with open(AUDIT_LOG, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def run(dry_run: bool, limit: int, company_id=None) -> dict:
    supabase_on = False
    rows = []
    try:
        from app.db import travel_supabase

        if travel_supabase.is_configured():
            rows = travel_supabase.list_travels(company_id=company_id, limit=limit)
            supabase_on = True
    except Exception as exc:
        print(f"[backfill] Supabase read failed, using local SQLite: {exc}")
    if not supabase_on:
        rows = local_storage.list_travels(company_id=company_id, limit=limit)

    today_iso = date.today().isoformat()
    stats = {"scanned": 0, "would_update": 0, "updated": 0, "skipped": 0}
    preview = []
    for row in rows:
        stats["scanned"] += 1
        old_baseline_fuel = float(row.get("baseline_fuel_liters") or 0.0)
        old_actual_fuel = float(row.get("actual_fuel_liters") or 0.0)
        old_rate = float(row.get("fuel_rate_used_idr") or 0.0)
        old_source = row.get("fuel_source")

        data = dict(row)
        # Force current-SK repricing (locked decision) + golongan eff math.
        data["_reprice_at_date"] = today_iso
        # Clear declared-fuel overrides so golongan math applies, but keep
        # explicitly measured actuals (they are observations, not estimates).
        data.pop("baseline_fuel_liters", None)
        if not data.get("actual_recorded"):
            data.pop("actual_fuel_liters", None)
        tls._apply_ledger(data)
        data["fuel_source"] = "migrated_golongan"

        changed = (
            abs(float(data.get("baseline_fuel_liters") or 0.0) - old_baseline_fuel) > 1e-9
            or abs(float(data.get("fuel_rate_used_idr") or 0.0) - old_rate) > 1e-9
            or old_source != "migrated_golongan"
        )
        entry = {
            "id": row.get("id"),
            "truck_id": row.get("truck_id"),
            "golongan": data.get("vehicle_golongan"),
            "old_baseline_fuel_liters": old_baseline_fuel,
            "new_baseline_fuel_liters": float(data.get("baseline_fuel_liters") or 0.0),
            "old_actual_fuel_liters": old_actual_fuel,
            "new_actual_fuel_liters": float(data.get("actual_fuel_liters") or 0.0),
            "old_fuel_rate_used_idr": old_rate,
            "new_fuel_rate_used_idr": float(data.get("fuel_rate_used_idr") or 0.0),
            "fuel_sk_id": data.get("fuel_sk_id"),
            "fuel_effective_date": data.get("fuel_effective_date"),
            "eff_used_kmpl": data.get("fuel_efficiency_used_kmpl"),
            "company_id": row.get("company_id"),
        }
        if not changed:
            stats["skipped"] += 1
            continue
        stats["would_update"] += 1
        if len(preview) < 20:
            preview.append(entry)
        if not dry_run:
            data.pop("_reprice_at_date", None)
            tls._persist_travel(data)
            stats["updated"] += 1
            entry["applied"] = True
            _audit(entry)

    return {
        "mode": "dry-run" if dry_run else "apply",
        "storage": "supabase" if supabase_on else "local_sqlite",
        "golongan_defaults": dict(GOLONGAN_DEFAULT_KMPL),
        "current_sk_probe": {
            ft: get_fuel_rate_for_trip(ft, at_date=today_iso)
            for ft in ("biosolar", "dexlite", "pertamina_dex")
        },
        "stats": stats,
        "preview": preview,
        "audit_log": str(AUDIT_LOG) if not dry_run else None,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill golongan fuel math + current-SK reprice.")
    ap.add_argument("--dry-run", action="store_true", help="Audit only, change nothing.")
    ap.add_argument("--apply", action="store_true", help="Persist recomputed rows.")
    ap.add_argument("--limit", type=int, default=5000)
    ap.add_argument("--company-id", default=None)
    args = ap.parse_args()
    if bool(args.dry_run) == bool(args.apply):
        ap.error("Pass exactly one of --dry-run or --apply.")
    result = run(dry_run=args.dry_run, limit=args.limit, company_id=args.company_id)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
