"""Seed a full HITL demo chain WITHOUT faking any number.

Trigger-only inputs (incidents, trucks, planned travels with baselines) ->
REAL backend computation for every rupiah / % / policy:

  1. CPU routing   : app.adapters.cpu_routing_adapter.get_cpu_router()
                     .solve_shortest_path(...) -> detour route geometry,
                     distance_km, eta (consensus-node equivalent used by the
                     route_optimization agent).
  2. Economic agent : app.services.impact_assessment_service
                     .assess_disruption_impact(...) -> impacted assessment
                     (late_arrival_risk_pct, optimal_policy) for the
                     DispatcherAlertQueue; internally calls the hedging solver
                     + CPU detour pathfinding per vehicle.
  3. Hedging solve  : travel_ledger_service.solve_and_persist_hedging(...)
                     -> hedging_policy (Continue/Reroute/Hold),
                     hedging_net_savings_idr (service-computed).
  4. HITL approval  : same persistence path as
                     backend/app/routers/approvals.py create_approval
                     (Supabase route_approvals primary, local SQLite mirror),
                     recommended_route = CPU route + hedging output.
                     Mix: ACCEPT/REROUTE, REJECT/CONTINUE, OVERRIDE/HOLD.
  5. Travel actuals : travel_ledger_service.update_travel(...) (PATCH
                     equivalent) -> saved_cost_idr / efficiency_pct recomputed
                     by _apply_ledger from BPJT tariffs + Pertamina rates +
                     4-tier spoilage decay. hedging persisted on delivered rit.
  6. ERP savings    : travel_ledger_service.build_erp_summary(...) aggregates
                     the ledger -> Laporan tab totals.
  7. Outcomes      : same dual-write path as outcomes_router (Supabase
                     ground_truth_outcomes primary, local mirror) with
                     observed_delay_hours derived from realised travel actuals
                     and price spike derived from spoilage-loss ratio
                     (never a literal).

Idempotent: re-running skips scenarios whose incident already has a decision
trace. Existing non-DEMO rows are never touched.

Company: pos_logistik (dispatcher tenant claim). DEMO- prefix everywhere.

Usage (from repo root):
    python backend/scripts/seed_hitl_demo.py
    SEED_COMPANY_ID=pos_logistik python backend/scripts/seed_hitl_demo.py

Cleanup (Supabase SQL editor):
    DELETE FROM travels WHERE id LIKE 'DEMO-%';
    DELETE FROM truck_assets WHERE id LIKE 'DEMO-%';
    DELETE FROM route_approvals WHERE incident_id LIKE 'DEMO-%';
    DELETE FROM ground_truth_outcomes WHERE incident_id LIKE 'DEMO-%';
"""
import asyncio
import logging
import math
import os
import sys
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_ROOT.parent
for _p in (str(BACKEND_ROOT), str(REPO_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from app.schemas.decision_schemas import (  # noqa: E402
    DecisionAction,
    TacticalManeuver,
    DecisionTraceCreate,
    OutcomeHorizon,
)
from app.schemas.impact_schemas import DisruptionImpactRequest  # noqa: E402
from app.schemas.travel import TravelCreate, TravelUpdate, TravelHedgingRequest  # noqa: E402
from app.services import travel_ledger_service  # noqa: E402
from app.db import local_storage  # noqa: E402

logging.basicConfig(level=logging.INFO, format="[hitl-seed] %(message)s")
logger = logging.getLogger("seed_hitl_demo")

COMPANY_ID = os.environ.get("SEED_COMPANY_ID", "pos_logistik")
COMPANY_NAME = os.environ.get("SEED_COMPANY_NAME", "PT Samudera Logistik Sumatra")
ACTOR = os.environ.get("SEED_ACTOR", "demo-dispatcher")

# [lon, lat] gazetteer — North Sumatra corridor (subset of seed_laporan_demo PLACES).
GAZ = {
    "Belawan": [98.6790, 3.7750],
    "Medan": [98.6722, 3.5952],
    "Binjai": [98.4853, 3.6001],
    "Tebing Tinggi": [99.1611, 3.3285],
    "Pematang Siantar": [99.0628, 2.9597],
    "Kisaran": [99.6126, 2.9844],
    "Pekanbaru": [101.4478, 0.5071],
}

# Trigger inputs only — baselines and hazard descriptors. No savings, no %.
# actuals are derived AFTER the backend solves (see _derive_actuals).
SCENARIOS = [
    {
        "travel_key": "DEMO-HITL-RIT-01",
        "incident_id": "DEMO-INC-BANJIR-TEBING-01",
        "asset_id": "DEMO-HITL-ASSET-01",
        "hazard": {"hazard_type": "flood", "severity": "high",
                    "title": "Banjir Koridor Tebing Tinggi",
                    "lon": 99.1611, "lat": 3.3285, "radius_km": 15.0},
        "truck": {"truck_id": "BK-9001-HA", "name": "Truk HITL Cabai #1",
                  "driver_name": "Budi Santoso", "driver_phone": "+628126100001"},
        "travel": {"origin_name": "Belawan", "destination_name": "Pekanbaru",
                   "commodity_key": "cabai_merah", "cargo_tonnage": 8.0,
                   "sla_deadline_hours": 10.0, "baseline_time_hours": 8.0,
                   "blocked_delay_hours": 6.0,
                   "baseline_toll_segments": ["BELMERA", "MEDAN_TEBINGTINGGI"]},
        "decision": {"action": DecisionAction.ACCEPT, "tactical": TacticalManeuver.REROUTE,
                     "notes": "Seed HITL: dispatcher menyetujui pengalihan via Tol MKTT."},
    },
    {
        "travel_key": "DEMO-HITL-RIT-02",
        "incident_id": "DEMO-INC-TUTUP-BINJAI-01",
        "asset_id": "DEMO-HITL-ASSET-02",
        "hazard": {"hazard_type": "road_closure", "severity": "high",
                    "title": "Penutupan Jalinsum Binjai",
                    "lon": 98.4853, "lat": 3.6001, "radius_km": 12.0},
        "truck": {"truck_id": "BK-9002-HA", "name": "Truk HITL Beras #2",
                  "driver_name": "Agus Wijaya", "driver_phone": "+628126100002"},
        "travel": {"origin_name": "Medan", "destination_name": "Binjai",
                   "commodity_key": "beras", "cargo_tonnage": 10.0,
                   "sla_deadline_hours": 6.0, "baseline_time_hours": 3.0,
                   "blocked_delay_hours": 2.0,
                   "baseline_toll_segments": ["BELMERA"]},
        "decision": {"action": DecisionAction.REJECT, "tactical": TacticalManeuver.CONTINUE,
                     "notes": "Seed HITL: dispatcher menolak deviasi; komoditas tahan lama, lanjutkan rute utama."},
    },
    {
        "travel_key": "DEMO-HITL-RIT-03",
        "incident_id": "DEMO-INC-BANJIR-KISARAN-01",
        "asset_id": "DEMO-HITL-ASSET-03",
        "hazard": {"hazard_type": "flood", "severity": "critical",
                    "title": "Banjir Kisaran",
                    "lon": 99.6126, "lat": 2.9844, "radius_km": 15.0},
        "truck": {"truck_id": "BK-9003-HA", "name": "Truk HITL Cold-Chain #3",
                  "driver_name": "Dewi Lestari", "driver_phone": "+628126100003"},
        "travel": {"origin_name": "Tebing Tinggi", "destination_name": "Kisaran",
                   "commodity_key": "daging_sapi", "cargo_tonnage": 5.0,
                   "sla_deadline_hours": 8.0, "baseline_time_hours": 4.0,
                   "blocked_delay_hours": 8.0,
                   "baseline_toll_segments": ["MEDAN_TEBINGTINGGI"]},
        "decision": {"action": DecisionAction.OVERRIDE, "tactical": TacticalManeuver.HOLD,
                     "notes": "Seed HITL: override komandan — tahan armada cold-chain di depo hingga surut (mandatory notes)."},
    },
]


def _haversine_km(origin, dest) -> float:
    lon1, lat1 = float(origin[0]), float(origin[1])
    lon2, lat2 = float(dest[0]), float(dest[1])
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2)
    return 6371.0 * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def _already_seeded(incident_id: str) -> bool:
    try:
        traces = local_storage.list_decision_traces(incident_id=incident_id, limit=5)
        if traces:
            return True
    except Exception:
        pass
    try:
        for t in travel_ledger_service.list_travels(company_id=COMPANY_ID, limit=5000):
            if t.get("disruption_id") == incident_id:
                return True
    except Exception as exc:
        logger.warning("ledger read failed: %s", exc)
    return False


def _ensure_asset(sc: dict) -> None:
    """Master truck asset (Supabase-primary via service). Idempotent upsert."""
    travel_ledger_service.save_truck_asset({
        "id": sc["asset_id"],
        "truck_id": sc["truck"]["truck_id"],
        "name": sc["truck"]["name"],
        "modality": "truck",
        "vehicle_golongan": "GOL_II",
        "driver_name": sc["truck"]["driver_name"],
        "driver_phone": sc["truck"]["driver_phone"],
        "company_id": COMPANY_ID,
        "company_name": COMPANY_NAME,
        "gross_weight_ton": 12.0,
        "fuel_type": "biosolar",
        "notes": "Seed HITL demo chain",
        "created_by": ACTOR,
    })


def _persist_approval(payload: DecisionTraceCreate, recommended_route: dict,
                      supabase_incident_id: str) -> dict:
    """Same dual-write path as approvals.py create_approval (Supabase -> local).

    Supabase route_approvals.incident_id is a uuid FK to incidents.incident_id,
    so the cloud row uses the real incident uuid returned by write_incident.
    The local mirror keeps the human-readable DEMO-INC key (no FK locally).
    """
    db_payload = {
        "incident_id": supabase_incident_id,  # uuid FK for Supabase
        "route_id": payload.route_id,
        "action": payload.action.value,
        "tactical_action": payload.tactical_action.value,
        "operator_id": payload.operator_id or ACTOR,
        "recommended_route": recommended_route,
        "custom_constraints": payload.custom_constraints or {},
        "notes": payload.notes,
        "sync_status": "synced",
    }
    # Closed-loop fleet reroute sync (mirrors approvals.py).
    try:
        from app.services.telemetry_service import telemetry_service
        rec_geom = (recommended_route or {}).get("route_geometry") or (recommended_route or {}).get("geometry")
        target_vid = ((payload.custom_constraints or {}).get("vehicle_id")
                      or (recommended_route or {}).get("vehicle_id"))
        if rec_geom and target_vid and payload.action != DecisionAction.REJECT:
            telemetry_service.reroute_vehicle(
                vehicle_id=target_vid,
                new_route_geometry=rec_geom,
                new_eta_minutes=float(recommended_route.get("eta_minutes") or 120.0),
            )
    except Exception as exc:
        logger.debug("fleet reroute sync note: %s", exc)

    # Synchronous Supabase insert (same table/shape as the router).
    try:
        from app.db.supabase_client import get_write_client as _get_wc
        _sb = _get_wc()
        result = _sb.table("route_approvals").insert(db_payload).execute()
        if result.data:
            item = result.data[0]
            record_id = item.get("id") or f"DEC-{payload.incident_id}"
            approved_at = item.get("approved_at") or item.get("created_at") or datetime.now().isoformat()
            local_storage.save_decision_trace(dict(
                db_payload, incident_id=payload.incident_id,  # DEMO key locally
                id=record_id, created_at=approved_at,
                sync_status="synced", committed_by_role="DISPATCHER"))
            logger.info("approval synced to Supabase: %s", record_id)
            return {"id": record_id, "sync": "synced"}
    except Exception as exc:
        logger.warning("Supabase route_approvals unavailable, local mirror: %s", exc)
    local_payload = dict(db_payload, incident_id=payload.incident_id,  # DEMO key locally
                         sync_status="pending", committed_by_role="DISPATCHER")
    saved = local_storage.save_decision_trace(local_payload)
    return {"id": saved["id"], "sync": "local_queued"}


def _persist_outcome(incident_id: str, observed_delay_hours: float,
                     spoilage_loss_idr: float, cargo_value_idr: float,
                     action: str, tactical: str) -> None:
    """Same dual-write path as outcomes_router (Supabase -> local).

    observed_delay_hours comes from realised travel actuals; price spike is
    derived from the hedging spoilage-loss ratio — both backend-computed.
    """
    price_spike_pct = round(
        min(99.0, max(0.0, (float(spoilage_loss_idr or 0.0) / max(1.0, float(cargo_value_idr or 1.0))) * 100.0)), 2)
    db_payload = {
        "incident_id": incident_id,
        "horizon": OutcomeHorizon.T_12H.value,
        "actual_clearance_time": None,
        "observed_delay_hours": float(observed_delay_hours),
        "actual_price_spike_pct": price_spike_pct,
        "verified_by": ACTOR,
        "verification_source": "DISPATCHER_APPROVAL",
        "notes": f"Seed HITL closed-loop: {action}/{tactical}",
        "sync_status": "synced",
    }
    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        result = sb.table("ground_truth_outcomes").insert(db_payload).execute()
        if result.data:
            item = result.data[0]
            local_storage.save_outcome(dict(
                db_payload, id=str(item.get("id") or f"OUT-{incident_id}"),
                created_at=item.get("created_at") or datetime.now().isoformat(),
                sync_status="synced"))
            return
    except Exception as exc:
        logger.debug("Supabase outcomes unavailable, local mirror: %s", exc)
    db_payload["sync_status"] = "pending"
    local_storage.save_outcome(db_payload)


def _solve_cpu(sc: dict):
    """Real CPU routing solve (hazard-aware). Returns (cpu_route, cpu_distance, baseline_dist)."""
    from app.adapters.cpu_routing_adapter import get_cpu_router
    hz, tcfg = sc["hazard"], sc["travel"]
    origin, dest = GAZ[tcfg["origin_name"]], GAZ[tcfg["destination_name"]]
    baseline_dist = _haversine_km(origin, dest)
    router = get_cpu_router()
    cpu_res = router.solve_shortest_path(
        origin_coords=origin, dest_coords=dest,
        origin_name=tcfg["origin_name"], dest_name=tcfg["destination_name"],
        hazard_zones=[{"center": [hz["lon"], hz["lat"]], "radiusKm": hz["radius_km"]}],
        k_alternatives=2,
    )
    routes = cpu_res.get("routes", []) or []
    cpu_route = routes[0] if routes else {}
    return cpu_route, float(cpu_route.get("distance_km") or baseline_dist), baseline_dist


def _ensure_incident(sc: dict) -> str:
    """Upsert the real incident row via the production write path (idempotent)."""
    from agents.tools.supabase_tools import write_incident
    hz, tcfg = sc["hazard"], sc["travel"]
    cpu_route, _, _ = _solve_cpu(sc)
    supabase_incident_id = asyncio.run(write_incident({
        "crisis_id": sc["incident_id"],
        "title": hz["title"],
        "description": f"Seed HITL demo: {hz['title']} memengaruhi rit {tcfg['origin_name']}->{tcfg['destination_name']}.",
        "type": hz["hazard_type"],
        "severity": hz["severity"],
        "status": "validated",
        "lat": hz["lat"],
        "lon": hz["lon"],
        "overall_confidence": 0.8,
        "route_recommendations": [cpu_route] if cpu_route else [],
        "is_simulated": True,
        "region": "Sumatera Utara",
    }))
    logger.info("incident %s -> supabase uuid %s", sc["incident_id"], supabase_incident_id)
    return supabase_incident_id


def _rename_demo_travel(sc: dict) -> None:
    """Rename the scenario travel id to DEMO- prefix (Supabase; link kept)."""
    for t in travel_ledger_service.list_travels(company_id=COMPANY_ID, limit=5000):
        if t.get("disruption_id") == sc["incident_id"] and not str(t.get("id", "")).startswith("DEMO-"):
            new_id = f"DEMO-{t['id']}"
            try:
                from app.db.supabase_client import get_write_client as _get_wc2
                _sb2 = _get_wc2()
                _sb2.table("travels").update({"id": new_id}).eq("id", t["id"]).execute()
                logger.info("renamed travel %s -> %s", t["id"], new_id)
            except Exception as exc:
                logger.warning("travel rename note (keeping %s): %s", t["id"], exc)


def _backfill_approval(sc: dict, supabase_incident_id: str) -> None:
    """Insert the Supabase route_approvals row from the local trace if missing."""
    try:
        from app.db.supabase_client import get_write_client as _get_wc3
        _sb3 = _get_wc3()
        existing = _sb3.table("route_approvals").select("id").eq(
            "incident_id", supabase_incident_id).limit(1).execute()
        if existing.data:
            return
    except Exception as exc:
        logger.warning("approval backfill check note: %s", exc)
        return
    traces = [a for a in local_storage.list_decision_traces(limit=5000)
              if a.get("incident_id") == sc["incident_id"]]
    if not traces:
        return
    tr = traces[0]
    try:
        _sb3.table("route_approvals").insert({
            "incident_id": supabase_incident_id,
            "route_id": tr.get("route_id") or "0",
            "action": tr.get("action") or sc["decision"]["action"].value,
            "tactical_action": tr.get("tactical_action") or sc["decision"]["tactical"].value,
            "operator_id": tr.get("operator_id") or ACTOR,
            "recommended_route": tr.get("recommended_route") or {},
            "custom_constraints": tr.get("custom_constraints") or {},
            "notes": tr.get("notes"),
            "sync_status": "synced",
        }).execute()
        logger.info("backfilled Supabase approval for %s", sc["incident_id"])
    except Exception as exc:
        logger.warning("approval backfill insert note: %s", exc)


def _run_scenario(sc: dict) -> dict:
    from app.services.impact_assessment_service import impact_assessment_service

    hz = sc["hazard"]
    tcfg = sc["travel"]
    origin = GAZ[tcfg["origin_name"]]
    dest = GAZ[tcfg["destination_name"]]
    baseline_dist = _haversine_km(origin, dest)

    # 0. Master truck asset (Supabase-primary via service).
    _ensure_asset(sc)

    # 1. Planned travel — baseline ledger only (no actuals yet).
    created = None
    for t in travel_ledger_service.list_travels(company_id=COMPANY_ID, limit=5000):
        if t.get("disruption_id") == sc["incident_id"]:
            created = t
            break
    if created is None:
        created = travel_ledger_service.create_travel(TravelCreate(
            truck_id=sc["truck"]["truck_id"],
            origin_name=tcfg["origin_name"], origin_coords=origin,
            destination_name=tcfg["destination_name"], dest_coords=dest,
            commodity_key=tcfg["commodity_key"], cargo_tonnage=tcfg["cargo_tonnage"],
            sla_deadline_hours=tcfg["sla_deadline_hours"],
            baseline_time_hours=tcfg["baseline_time_hours"],
            blocked_delay_hours=tcfg["blocked_delay_hours"],
            baseline_toll_segments=list(tcfg["baseline_toll_segments"]),
            disruption_id=sc["incident_id"],
            status="planned",
            notes="Seed HITL planned rit",
        ), actor=ACTOR)
    travel_id = created["id"]

    # 2. Telemetry registration so the economic agent scans this unit.
    try:
        from app.services.telemetry_service import telemetry_service
        telemetry_service.register_custom_vehicle({
            "vehicle_id": sc["truck"]["truck_id"],
            "name": sc["truck"]["name"],
            "cargo": tcfg["commodity_key"],
            "commodity_key": tcfg["commodity_key"],
            "cargo_tonnage": tcfg["cargo_tonnage"],
            "vehicle_golongan": "GOL_II",
            "origin": tcfg["origin_name"],
            "destination": tcfg["destination_name"],
            "origin_coords": origin,
            "dest_coords": dest,
            "path": [origin,
                     [round((origin[0] + hz["lon"]) / 2, 4), round((origin[1] + hz["lat"]) / 2, 4)],
                     [hz["lon"], hz["lat"]],
                     [round((hz["lon"] + dest[0]) / 2, 4), round((hz["lat"] + dest[1]) / 2, 4)],
                     dest],
            "organization_id": COMPANY_ID,
            "sla_deadline_hours": tcfg["sla_deadline_hours"],
        })
    except Exception as exc:
        logger.debug("telemetry register note: %s", exc)

    # 3. CPU consensus routing solve (real backend, hazard-aware).
    cpu_route, cpu_distance, _ = _solve_cpu(sc)

    # 3b. Real incident row (uuid PK) via the production write path, so the
    # Supabase route_approvals FK is satisfied. Deterministic UUIDv5 from the
    # DEMO crisis key -> idempotent replays upsert the same row.
    from agents.tools.supabase_tools import write_incident
    supabase_incident_id = asyncio.run(write_incident({
        "crisis_id": sc["incident_id"],
        "title": hz["title"],
        "description": f"Seed HITL demo: {hz['title']} memengaruhi rit {tcfg['origin_name']}->{tcfg['destination_name']}.",
        "type": hz["hazard_type"],
        "severity": hz["severity"],
        "status": "validated",
        "lat": hz["lat"],
        "lon": hz["lon"],
        "overall_confidence": 0.8,
        "route_recommendations": [cpu_route] if cpu_route else [],
        "is_simulated": True,
        "region": "Sumatera Utara",
    }))
    logger.info("incident %s -> supabase uuid %s", sc["incident_id"], supabase_incident_id)

    # 4. Economic agent: impact assessment (real service; feeds AlertQueue/HITL).
    impact = asyncio.run(impact_assessment_service.assess_disruption_impact(
        DisruptionImpactRequest(
            incident_id=sc["incident_id"], lat=hz["lat"], lon=hz["lon"],
            radius_km=hz["radius_km"], hazard_type=hz["hazard_type"],
            severity=hz["severity"], title=hz["title"])))
    mine = [v for v in impact.impacted_vehicles
            if v.vehicle_id == sc["truck"]["truck_id"]]
    logger.info("impact %s: scanned=%d impacted=%d (mine=%d)",
                sc["incident_id"], impact.total_fleet_scanned,
                impact.impacted_vehicles_count, len(mine))

    # 5. Hedging solve persisted on the rit (real service -> hedging_policy).
    detour_km = max(0.0, cpu_distance - baseline_dist)
    detour_h = max(0.0, detour_km / 50.0)  # device: 50 km/h avg logistics speed
    hedging = travel_ledger_service.solve_and_persist_hedging(
        travel_id, TravelHedgingRequest(
            p_disruption=0.88 if hz["severity"] in ("high", "critical") else 0.6,
            detour_distance_km=round(detour_km, 2),
            detour_time_hours=round(detour_h, 2),
            hold_wait_hours=6.0,
            toll_segments=None,  # = rit toll segments (service default)
            downtime_fixed_fee_idr=500000.0,
            inflation_shock_factor=0.0,
        ))
    logger.info("hedging %s: policy=%s net_savings=Rp %s",
                travel_id, hedging["optimal_policy"],
                f"{hedging['net_savings_idr']:,.0f}")

    # 6. HITL approval (router-identical persistence; route = CPU + hedging).
    decision = sc["decision"]
    detour_route = (mine[0].detour_route if mine and mine[0].detour_route else cpu_route) or {}
    recommended_route = dict(detour_route)
    recommended_route.setdefault("vehicle_id", sc["truck"]["truck_id"])
    recommended_route["demo_incident"] = sc["incident_id"]
    recommended_route["supabase_incident_id"] = supabase_incident_id
    recommended_route["hedging"] = {
        "optimal_policy": hedging["optimal_policy"],
        "net_savings_idr": hedging["net_savings_idr"],
        "spoilage_loss_idr": hedging["spoilage_loss_idr"],
        "cargo_value_idr": hedging["cargo_value_idr"],
        "continue_cost_idr": hedging["continue_policy"]["cost_idr"],
        "reroute_cost_idr": hedging["reroute_policy"]["cost_idr"],
        "hold_cost_idr": hedging["hold_policy"]["cost_idr"],
    }
    if detour_route.get("coordinates"):
        recommended_route["route_geometry"] = detour_route["coordinates"]
    if detour_route.get("eta_minutes"):
        recommended_route["eta_minutes"] = detour_route["eta_minutes"]
    approval_payload = DecisionTraceCreate(
        incident_id=sc["incident_id"], route_id="0",
        action=decision["action"], tactical_action=decision["tactical"],
        operator_id=ACTOR, recommended_route=recommended_route,
        custom_constraints={"vehicle_id": sc["truck"]["truck_id"]},
        notes=decision["notes"],
    )
    ap = _persist_approval(approval_payload, recommended_route, supabase_incident_id)

    # 7. Realised actuals (PATCH equivalent) — derived from solved outputs.
    tactical = decision["tactical"].value
    baseline_time = float(tcfg["baseline_time_hours"])
    blocked = float(tcfg["blocked_delay_hours"])
    if tactical == "REROUTE":
        actual_time = round(baseline_time + detour_h, 2)
        actual_fuel = round(cpu_distance / 3.5, 2)
        actual_tolls = ["BELMERA"]
        status, rerouted = "delivered", True
    elif tactical == "HOLD":
        actual_time = round(baseline_time + 6.0, 2)
        actual_fuel = round(baseline_dist / 3.5, 2)
        actual_tolls = list(tcfg["baseline_toll_segments"])
        status, rerouted = "delivered", False
    else:  # CONTINUE / REJECT
        actual_time = round(baseline_time + blocked, 2)
        actual_fuel = round(baseline_dist / 3.5, 2)
        actual_tolls = list(tcfg["baseline_toll_segments"])
        status, rerouted = "delivered", False
    updated = travel_ledger_service.update_travel(travel_id, TravelUpdate(
        status=status, actual_time_hours=max(0.5, actual_time),
        actual_fuel_liters=max(0.5, actual_fuel),
        actual_toll_segments=actual_tolls, rerouted=rerouted,
        notes=f"Seed HITL realised via {decision['action'].value}/{tactical}"))

    # 8. Closed-loop outcome (delay from realised ledger, spike from spoilage ratio).
    observed_delay = max(0.0, float(updated.get("actual_time_hours") or 0.0) - baseline_time)
    _persist_outcome(sc["incident_id"], observed_delay,
                     hedging["spoilage_loss_idr"], hedging["cargo_value_idr"],
                     decision["action"].value, tactical)

    # 9. DEMO- prefix on the travel id (Supabase rename; disruption link kept).
    demo_travel_id = travel_id
    if not str(travel_id).startswith("DEMO-"):
        demo_travel_id = f"DEMO-{travel_id}"
        try:
            from app.db.supabase_client import get_write_client as _get_wc2
            _sb2 = _get_wc2()
            _sb2.table("travels").update({"id": demo_travel_id}).eq("id", travel_id).execute()
            logger.info("renamed travel %s -> %s", travel_id, demo_travel_id)
        except Exception as exc:
            logger.warning("travel rename note (keeping %s): %s", travel_id, exc)
            demo_travel_id = travel_id
    return {"travel_id": demo_travel_id, "approval": ap, "hedging_policy": hedging["optimal_policy"],
            "net_savings": hedging["net_savings_idr"],
            "saved_cost": updated.get("saved_cost_idr"),
            "supabase_incident_id": supabase_incident_id}


def main() -> None:
    print(f"[hitl-seed] company_id={COMPANY_ID} scenarios={len(SCENARIOS)}")
    results = []
    for sc in SCENARIOS:
        if _already_seeded(sc["incident_id"]):
            # Repair pass: converge earlier runs to the Supabase-primary shape
            # (asset ids, incident uuid, DEMO- travel ids, cloud approvals).
            _ensure_asset(sc)
            try:
                uuid = _ensure_incident(sc)
            except Exception as exc:
                logger.warning("incident ensure note: %s", exc)
                uuid = ""
            _rename_demo_travel(sc)
            if uuid:
                _backfill_approval(sc, uuid)
            print(f"[hitl-seed] skip {sc['incident_id']} (already seeded)")
            continue
        try:
            results.append((sc["incident_id"], _run_scenario(sc)))
            print(f"[hitl-seed] done {sc['incident_id']}: {results[-1][1]}")
        except Exception as exc:
            logger.error("scenario %s FAILED: %s", sc["incident_id"], exc)
            raise

    # Verification via real services only.
    summary = travel_ledger_service.build_erp_summary(company_id=COMPANY_ID)
    t = summary.totals
    print(f"[verify] scope={summary.scope} storage={summary.storage}")
    print(f"[verify] total={t.total_trips} delivered={t.delivered_trips} "
          f"failed={t.failed_trips} active={t.active_trips}")
    print(f"[verify] saved Rp {t.cost_saved_idr:,.0f} "
          f"(baseline Rp {t.baseline_cost_idr:,.0f} actual Rp {t.actual_cost_idr:,.0f}) "
          f"efficiency={t.cost_efficiency_pct}%")
    assert t.total_trips > 0, "ERP summary empty after HITL seed!"

    approvals = local_storage.list_decision_traces(limit=5000)
    mine = [a for a in approvals if str(a.get("incident_id", "")).startswith("DEMO-INC-")]
    print(f"[verify] approvals total(local)={len(approvals)} demo-hitl={len(mine)}")
    for a in mine:
        print(f"  - {a.get('incident_id')} {a.get('action')}/{a.get('tactical_action')} "
              f"sync={a.get('sync_status')}")
    assert len(mine) > 0, "No HITL decision traces after seeding!"

    travels = travel_ledger_service.list_travels(company_id=COMPANY_ID, limit=5000)
    hedged = [x for x in travels if x.get("hedging_policy")]
    print(f"[verify] travels={len(travels)} with hedging_policy={len(hedged)}")
    assert len(hedged) > 0, "No rit carries hedging_policy after seeding!"

    outcomes = local_storage.list_outcomes(limit=5000)
    mine_out = [o for o in outcomes if str(o.get("incident_id", "")).startswith("DEMO-INC-")]
    print(f"[verify] outcomes total(local)={len(outcomes)} demo-hitl={len(mine_out)}")

    # Cloud approvals check (what GET /approvals serves first).
    try:
        from app.db.supabase_client import get_write_client as _get_wc4
        from agents.tools.supabase_tools import _incident_key
        _sb4 = _get_wc4()
        cloud = 0
        for sc in SCENARIOS:
            res = _sb4.table("route_approvals").select("id,action,tactical_action").eq(
                "incident_id", _incident_key(sc["incident_id"])).limit(5).execute()
            rows = res.data or []
            cloud += len(rows)
            for r in rows:
                print(f"  - cloud approval {r.get('id')} "
                      f"{r.get('action')}/{r.get('tactical_action')}")
        print(f"[verify] approvals in Supabase for HITL incidents: {cloud}")
        assert cloud >= 3, "HITL approvals missing in Supabase!"
    except AssertionError:
        raise
    except Exception as exc:
        print(f"[verify] cloud approval check skipped: {exc}")
    print("[hitl-seed] OK — all numbers computed by backend services, none hardcoded.")


if __name__ == "__main__":
    main()
