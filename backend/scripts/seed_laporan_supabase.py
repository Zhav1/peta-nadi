"""Seed randomized demo travels/rits DIRECTLY into Supabase.

The Laporan tab reads Supabase-primary now (`travel_ledger_service` ->
`travel_supabase`), so this seed populates BOTH local dev and Render: both
environments read the same Supabase tables (`truck_assets`, `travels` from
migration 014). Unlike `seed_laporan_demo.py` (SQLite) and
`seed_laporan_render.py` (REST POSTs), this writes via the honest service
layer, so every rupiah is derived from BPJT tariffs, Pertamina fuel rates,
and the 4-tier spoilage model.

Idempotent: re-running skips creation once >= SEED_N_TRAVELS DEMO rows exist.
Existing non-DEMO rows are never touched.

Requirements (env):
    SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (preferred; bypasses RLS) or
    SUPABASE_ANON_KEY (works: migration 014 grants authenticated writes).

Usage (from repo root):
    python backend/scripts/seed_laporan_supabase.py
    SEED_COMPANY_ID=pos_logistik SEED_N_TRAVELS=18 python backend/scripts/seed_laporan_supabase.py

Cleanup (Supabase SQL editor):
    DELETE FROM travels WHERE id LIKE 'DEMO-%';
    DELETE FROM truck_assets WHERE id LIKE 'DEMO-%';
"""
import os
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from seed_laporan_demo import (  # noqa: E402
    COMPANY_ID,
    COMPANY_NAME,
    ACTOR,
    PLACES,
    COMMODITIES,
    TRUCKS,
    BASELINE_TOLLS,
    pick_status,
)
from app.schemas.travel import TravelCreate  # noqa: E402
from app.services import travel_ledger_service  # noqa: E402
from app.db import travel_supabase  # noqa: E402

N_TRAVELS = max(1, min(int(os.environ.get("SEED_N_TRAVELS", "18")), 60))
RNG_SEED = int(os.environ.get("SEED_RANDOM_SEED", "42"))


def _require_supabase() -> None:
    if not travel_supabase.is_configured():
        print(
            "[seed] FAIL: Supabase not configured. Set SUPABASE_URL plus "
            "SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY in .env. "
            "No rows written anywhere — refusing to silently seed the wrong store."
        )
        sys.exit(2)


def ensure_trucks() -> None:
    for i, t in enumerate(TRUCKS):
        travel_ledger_service.save_truck_asset({
            "id": f"DEMO-ASSET-{i + 1:02d}",
            "truck_id": t["truck_id"],
            "name": t["name"],
            "modality": "truck",
            "vehicle_golongan": "GOL_II",
            "driver_name": t["driver_name"],
            "driver_phone": t["driver_phone"],
            "company_id": COMPANY_ID,
            "company_name": COMPANY_NAME,
            "gross_weight_ton": 12.0,
            "fuel_type": "biosolar",
            "notes": "Seed demo laporan (supabase)",
            "created_by": ACTOR,
        })
    print(f"[seed] upserted {len(TRUCKS)} truck assets (company={COMPANY_ID})")


def _haversine_km(origin, dest) -> float:
    import math
    lon1, lat1 = float(origin[0]), float(origin[1])
    lon2, lat2 = float(dest[0]), float(dest[1])
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2)
    return 6371.0 * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def build_kwargs(rng: random.Random) -> dict:
    truck = rng.choice(TRUCKS)
    commodity = rng.choice(COMMODITIES)
    tonnage = round(rng.uniform(2.0, 12.0), 1)
    origin_name, dest_name = rng.sample(list(PLACES.keys()), 2)
    origin, dest = PLACES[origin_name], PLACES[dest_name]
    baseline_time = round(rng.uniform(4.0, 14.0), 1)
    blocked_delay = round(rng.uniform(0.0, 6.0), 1)
    status = pick_status(rng)
    rerouted = status == "rerouted" or (status == "delivered" and rng.random() < 0.35)

    kwargs = {
        "truck_id": truck["truck_id"],
        "origin_name": origin_name,
        "origin_coords": origin,
        "destination_name": dest_name,
        "dest_coords": dest,
        "commodity_key": commodity,
        "cargo_tonnage": tonnage,
        "sla_deadline_hours": max(
            1.0, round(baseline_time + blocked_delay * 0.5 + rng.uniform(-1.0, 2.0), 1)
        ),
        "baseline_time_hours": baseline_time,
        "blocked_delay_hours": blocked_delay,
        "baseline_toll_segments": list(BASELINE_TOLLS),
        "rerouted": rerouted,
        "disruption_id": f"DISRUPSI-BANJIR-{rng.randint(1, 4):02d}"
        if (rerouted or blocked_delay > 2) else None,
        "status": status,
        "notes": "Seed demo laporan (supabase)",
    }
    if status in ("delivered", "rerouted"):
        est_fuel = _haversine_km(origin, dest) / 3.5
        kwargs["actual_time_hours"] = round(
            max(0.5, baseline_time + blocked_delay - rng.uniform(0.5, blocked_delay + 1.5)), 1
        )
        kwargs["actual_fuel_liters"] = round(est_fuel * rng.uniform(0.85, 0.98), 1)
        kwargs["actual_toll_segments"] = ["BELMERA"] if rerouted else list(BASELINE_TOLLS)
    elif status == "failed" and rng.random() < 0.5:
        est_fuel = _haversine_km(origin, dest) / 3.5
        kwargs["actual_time_hours"] = round(baseline_time + blocked_delay + rng.uniform(2.0, 4.0), 1)
        kwargs["actual_fuel_liters"] = round(est_fuel * 1.3, 1)
        kwargs["rerouted"] = True
    return kwargs


def rename_and_backdate(rows: list, rng: random.Random) -> None:
    """Rename RIT-* ids to DEMO-* and spread created_at over ~45 days, in Supabase."""
    from app.db.supabase_client import get_write_client

    sb = get_write_client()
    for row in rows:
        days_ago = rng.randint(0, 44)
        created_at = (datetime.now() - timedelta(
            days=days_ago,
            hours=rng.randint(0, 23),
            minutes=rng.randint(0, 59),
        )).isoformat()
        new_id = row["id"].replace("RIT-", "DEMO-RIT-", 1)
        if not new_id.startswith("DEMO-"):
            new_id = f"DEMO-{row['id']}"
        patch: dict = {"id": new_id, "created_at": created_at}
        if row.get("status") == "delivered":
            patch["delivered_at"] = (
                datetime.fromisoformat(created_at)
                + timedelta(hours=float(row.get("actual_time_hours") or 0.0))
            ).isoformat()
        sb.table("travels").update(patch).eq("id", row["id"]).execute()
        row["id"] = new_id
        row["created_at"] = created_at


def existing_demo_count() -> int:
    try:
        rows = travel_supabase.list_travels(limit=5000)
    except Exception as exc:
        print(f"[seed] FAIL: cannot read Supabase travels: {exc}")
        sys.exit(1)
    return sum(1 for t in rows if str(t.get("id", "")).startswith("DEMO-"))


def main() -> None:
    _require_supabase()
    rng = random.Random(RNG_SEED)
    print(f"[seed] company_id={COMPANY_ID} target_rows={N_TRAVELS}")
    ensure_trucks()

    existing = existing_demo_count()
    print(f"[seed] existing DEMO travels in Supabase: {existing}")
    if existing >= N_TRAVELS:
        print(f"[seed] already seeded (>= {N_TRAVELS} DEMO rows). Skipping creation.")
    else:
        created = []
        for _ in range(N_TRAVELS - existing):
            payload = TravelCreate(**build_kwargs(rng))
            created.append(travel_ledger_service.create_travel(payload, actor=ACTOR))
        rename_and_backdate(created, rng)
        print(f"[seed] created {len(created)} travels in Supabase")

    summary = travel_ledger_service.build_erp_summary(company_id=COMPANY_ID)
    assert summary.storage == "supabase", f"expected supabase backend, got {summary.storage}"
    assert summary.totals.total_trips > 0, "ERP summary is empty after seeding!"
    assert summary.totals.delivered_trips > 0, "No delivered trips in seeded data!"

    t = summary.totals
    print(f"[verify] scope={summary.scope} storage={summary.storage}")
    print(f"[verify] total={t.total_trips} delivered={t.delivered_trips} "
          f"failed={t.failed_trips} active={t.active_trips}")
    print(f"[verify] saved Rp {t.cost_saved_idr:,.0f} "
          f"(baseline Rp {t.baseline_cost_idr:,.0f} actual Rp {t.actual_cost_idr:,.0f})")
    print("[seed] clean: DELETE FROM travels WHERE id LIKE 'DEMO-%'; "
          "DELETE FROM truck_assets WHERE id LIKE 'DEMO-%';")


if __name__ == "__main__":
    main()
