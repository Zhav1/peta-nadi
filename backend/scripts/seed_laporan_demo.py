"""Seed randomized demo travels/rits so the Laporan tab renders real DB rows.

Uses the honest service layer (`travel_ledger_service.create_travel`) so every
rupiah in the ledger is derived from BPJT toll tariffs, Pertamina fuel rates,
and the 4-tier spoilage model — no fake percentages.

Idempotent & append-only:
  - Existing non-DEMO rows are never touched.
  - Re-running skips creation once >= N_TRAVELS DEMO rows exist.

Usage (from repo root):
    python backend/scripts/seed_laporan_demo.py
    SEED_COMPANY_ID=org-prehub-pilot python backend/scripts/seed_laporan_demo.py

Cleanup:
    DELETE FROM travels WHERE id LIKE 'DEMO-%';
    DELETE FROM truck_assets WHERE id LIKE 'DEMO-%';
"""
import os
import random
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db import local_storage  # noqa: E402
from app.schemas.travel import TravelCreate  # noqa: E402
from app.services import travel_ledger_service  # noqa: E402

COMPANY_ID = os.environ.get("SEED_COMPANY_ID", "pos_logistik")  # dispatcher tenant claim
COMPANY_NAME = os.environ.get("SEED_COMPANY_NAME", "PT Samudera Logistik Sumatra")
ACTOR = os.environ.get("SEED_ACTOR", "demo-dispatcher")
N_TRAVELS = int(os.environ.get("SEED_N_TRAVELS", "24"))
RNG_SEED = int(os.environ.get("SEED_RANDOM_SEED", "42"))

# [lon, lat] gazetteer points around North Sumatra.
PLACES = {
    "Medan": [98.6722, 3.5952],
    "Belawan": [98.6790, 3.7750],
    "Tebing Tinggi": [99.1611, 3.3285],
    "Pematang Siantar": [99.0628, 2.9597],
    "Binjai": [98.4853, 3.6001],
    "Lubuk Pakam": [98.8712, 3.5614],
    "Kisaran": [99.6126, 2.9844],
}

COMMODITIES = [
    "beras",
    "cabai_merah",
    "bawang_merah",
    "minyak_goreng",
    "daging_sapi",
    "ikan_segar",
]

TRUCKS = [
    {"truck_id": "BK-8821-XA", "name": "Truk Cold-Chain Berastagi #1",
     "driver_name": "Budi Santoso", "driver_phone": "+628126100001"},
    {"truck_id": "BK-7450-XB", "name": "Truk Sembako Medan #2",
     "driver_name": "Agus Wijaya", "driver_phone": "+628126100002"},
    {"truck_id": "BK-9133-XC", "name": "Truk Sayur Mayur #3",
     "driver_name": "Dewi Lestari", "driver_phone": "+628126100003"},
    {"truck_id": "BK-6287-XD", "name": "Truk Ikan Segar Belawan #4",
     "driver_name": "Joko Prasetyo", "driver_phone": "+628126100004"},
]

BASELINE_TOLLS = ["BELMERA", "MEDAN_TEBINGTINGGI"]


def _haversine_km(origin, dest) -> float:
    import math
    lon1, lat1 = float(origin[0]), float(origin[1])
    lon2, lat2 = float(dest[0]), float(dest[1])
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2)
    return 6371.0 * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def ensure_trucks() -> list:
    assets = []
    for i, t in enumerate(TRUCKS):
        data = {
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
            "notes": "Seed demo laporan",
            "created_by": ACTOR,
            "sync_status": "pending",
        }
        assets.append(local_storage.save_truck_asset(data))
    return assets


def pick_status(rng: random.Random) -> str:
    r = rng.random()
    if r < 0.60:
        return "delivered"
    if r < 0.80:
        return "rerouted"
    if r < 0.87:
        return "moving"
    if r < 0.93:
        return "planned"
    return "failed"


def seed_travels(rng: random.Random) -> list:
    created = []
    loss_assigned = 0
    for i in range(N_TRAVELS):
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
            "sla_deadline_hours": round(baseline_time + blocked_delay * 0.5 + rng.uniform(-1.0, 2.0), 1),
            "baseline_time_hours": baseline_time,
            "blocked_delay_hours": blocked_delay,
            "baseline_toll_segments": list(BASELINE_TOLLS),
            "rerouted": rerouted,
            "disruption_id": f"DISRUPSI-BANJIR-{rng.randint(1, 4):02d}" if (rerouted or blocked_delay > 2) else None,
            "status": status,
            "notes": "Seed demo laporan",
        }
        # SLA must stay positive (schema gt=0).
        kwargs["sla_deadline_hours"] = max(1.0, kwargs["sla_deadline_hours"])

        if status in ("delivered", "rerouted"):
            est_fuel = _haversine_km(origin, dest) / 3.5
            is_loss = loss_assigned < 2 and rng.random() < 0.12
            if is_loss:
                # Honest loss row: realised outcome worse than the blocked baseline.
                loss_assigned += 1
                kwargs["actual_time_hours"] = round(baseline_time + blocked_delay + rng.uniform(2.0, 5.0), 1)
                kwargs["actual_fuel_liters"] = round(est_fuel * rng.uniform(1.2, 1.4), 1)
                kwargs["actual_toll_segments"] = list(BASELINE_TOLLS)
                if status == "delivered" and rng.random() < 0.5:
                    kwargs["status"] = "failed"  # reroute that raised cost -> failed
            else:
                kwargs["actual_time_hours"] = round(
                    max(0.5, baseline_time + blocked_delay - rng.uniform(0.5, blocked_delay + 1.5)), 1
                )
                kwargs["actual_fuel_liters"] = round(est_fuel * rng.uniform(0.85, 0.98), 1)
                # Reroute avoids one toll segment -> honest toll savings.
                kwargs["actual_toll_segments"] = (
                    ["BELMERA"] if rerouted else list(BASELINE_TOLLS)
                )
        elif status == "failed" and rng.random() < 0.5:
            est_fuel = _haversine_km(origin, dest) / 3.5
            kwargs["actual_time_hours"] = round(baseline_time + blocked_delay + rng.uniform(2.0, 4.0), 1)
            kwargs["actual_fuel_liters"] = round(est_fuel * 1.3, 1)
            kwargs["rerouted"] = True

        payload = TravelCreate(**kwargs)
        row = travel_ledger_service.create_travel(payload, actor=ACTOR)
        created.append(row)
    return created


def backdate_rows(rows: list, rng: random.Random) -> None:
    conn = local_storage.get_db_connection()
    try:
        with conn:
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
                delivered_at = None
                if row.get("status") == "delivered":
                    delivered_at = (datetime.fromisoformat(created_at)
                                    + timedelta(hours=float(row.get("actual_time_hours") or 0.0))).isoformat()
                conn.execute(
                    "UPDATE travels SET id = ?, created_at = ?, delivered_at = ? WHERE id = ?",
                    (new_id, created_at, delivered_at, row["id"]),
                )
                row["id"] = new_id
                row["created_at"] = created_at
    finally:
        conn.close()


def main() -> None:
    rng = random.Random(RNG_SEED)
    existing = [t for t in local_storage.list_travels(limit=5000)
                if str(t.get("id", "")).startswith("DEMO-")]
    print(f"[seed] company_id={COMPANY_ID} existing DEMO travels={len(existing)}")
    ensure_trucks()
    print(f"[seed] upserted {len(TRUCKS)} truck assets")

    if len(existing) >= N_TRAVELS:
        print(f"[seed] already seeded (>= {N_TRAVELS} DEMO rows). Skipping creation.")
    else:
        rows = seed_travels(rng)
        backdate_rows(rows, rng)
        print(f"[seed] created {len(rows)} travels")

    summary = travel_ledger_service.build_erp_summary(company_id=COMPANY_ID)
    assert summary.totals.total_trips > 0, "ERP summary is empty after seeding!"
    assert summary.totals.delivered_trips > 0, "No delivered trips in seeded data!"

    print(f"[verify] scope={summary.scope} storage={summary.storage}")
    t = summary.totals
    print(f"[verify] total={t.total_trips} delivered={t.delivered_trips} "
          f"failed={t.failed_trips} active={t.active_trips}")
    print(f"[verify] reroute ok={t.reroute_success_count} fail={t.reroute_failed_count} "
          f"rate={t.reroute_success_rate_pct}% sla={t.sla_compliance_pct}%")
    print(f"[verify] saved Rp {t.cost_saved_idr:,.0f} "
          f"(baseline Rp {t.baseline_cost_idr:,.0f} actual Rp {t.actual_cost_idr:,.0f})")

    by_status: dict = {}
    by_commodity: dict = {}
    for trip in summary.trips:
        by_status[trip.status] = by_status.get(trip.status, 0) + 1
        by_commodity[trip.commodity_key] = by_commodity.get(trip.commodity_key, 0) + 1
    print(f"[verify] per-status={by_status}")
    print(f"[verify] per-commodity={by_commodity}")
    sample = sorted(summary.trips, key=lambda x: x.saved_cost_idr, reverse=True)
    if sample:
        print(f"[verify] top saving: {sample[0].id} Rp {sample[0].saved_cost_idr:,.0f}")
        print(f"[verify] worst row:  {sample[-1].id} Rp {sample[-1].saved_cost_idr:,.0f}")

    reg = travel_ledger_service.build_erp_summary(company_id=None, include_trips=False)
    assert reg.scope == "REGULATOR_AGGREGATE"
    print(f"[verify] regulator aggregate total={reg.totals.total_trips} "
          f"companies={[c.company_id for c in reg.per_company]}")

    print("[seed] re-run: python backend/scripts/seed_laporan_demo.py")
    print("[seed] clean:  DELETE FROM travels WHERE id LIKE 'DEMO-%'; "
          "DELETE FROM truck_assets WHERE id LIKE 'DEMO-%';")


if __name__ == "__main__":
    main()
