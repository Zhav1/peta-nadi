"""
PreHub : Travel (Rit) Ledger & ERP Savings Aggregation Service.

Splits the master truck asset from the transactional travel/rit and derives
every rupiah figure from first principles:

  baseline_cost = fuel(baseline L × Pertamina rate)
                + BPJT toll (Golongan I–V)
                + spoilage(cargo value × 4-tier decay × blocked delay)
                + driver time cost (hours × overtime wage)

  actual_cost   = same formula on realised time / fuel / toll segments.

`saved_cost_idr` is baseline − actual, and is *split* into fuel / toll /
spoilage / labour components that sum exactly to the total. No percentage is
ever accepted from a client and no "18.5% / 14.2%" literals exist here.
"""
import math
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List

from app.db import local_storage
from app.schemas.travel import (
    TravelCreate,
    TravelUpdate,
    TravelHedgingRequest,
    ERPSavingsBreakdown,
    ERPTotals,
    ERPCompanySummary,
    ERPTripRow,
    ERPSummaryResponse,
)
from app.schemas.intermodal import HedgingSolveRequest
from app.services.spoilage_hedging_service import (
    SpoilageHedgingService,
    spoilage_hedging_service,
    TRUCK_FUEL_CONSUMPTION_KM_PER_LITER,
    DRIVER_OVERTIME_HOURLY_IDR,
    get_effective_fuel_rate,
    get_spoilage_loss,
)

logger = logging.getLogger(__name__)


# ==========================================
# SUPABASE-PRIMARY PERSISTENCE ROUTING
# ==========================================
# Supabase is the primary store so rows survive Render free-plan filesystem
# wipes. SQLite (`local_storage`) is only a dev fallback when Supabase env
# (SUPABASE_URL + ANON/SERVICE key) is missing or the call fails.

def _supabase_enabled() -> bool:
    try:
        from app.db import travel_supabase

        return travel_supabase.is_configured()
    except Exception:
        return False


def _persist_truck_asset(data: Dict[str, Any], db_path: Optional[str] = None) -> Dict[str, Any]:
    """Save a master truck asset: Supabase primary, SQLite fallback."""
    if _supabase_enabled():
        try:
            from app.db import travel_supabase

            saved = travel_supabase.save_truck_asset(data)
            saved["source"] = "master"
            return saved
        except Exception as exc:
            logger.warning("Supabase truck_assets save failed, falling back to SQLite: %s", exc)
    saved = local_storage.save_truck_asset(data, db_path=db_path)
    saved["source"] = "master"
    return saved


def _fetch_master_assets(company_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Master assets from Supabase when configured, else SQLite (never both)."""
    if _supabase_enabled():
        try:
            from app.db import travel_supabase

            return travel_supabase.list_truck_assets(company_id=company_id)
        except Exception as exc:
            logger.warning("Supabase truck_assets read failed, falling back to SQLite: %s", exc)
    return local_storage.list_truck_assets(company_id=company_id)


def _fetch_master_asset(truck_id: str) -> Optional[Dict[str, Any]]:
    if _supabase_enabled():
        try:
            from app.db import travel_supabase

            found = travel_supabase.get_truck_asset(truck_id)
            if found:
                return found
        except Exception as exc:
            logger.warning("Supabase truck_assets read failed, falling back to SQLite: %s", exc)
    return local_storage.get_truck_asset(truck_id)


def _delete_master_asset(truck_id: str, db_path: Optional[str] = None) -> bool:
    deleted = False
    if _supabase_enabled():
        try:
            from app.db import travel_supabase

            travel_supabase.delete_truck_asset(truck_id)
            deleted = True
        except Exception as exc:
            logger.warning("Supabase truck_assets delete failed, trying SQLite: %s", exc)
    return bool(local_storage.delete_truck_asset(truck_id, db_path=db_path)) or deleted


def _persist_travel(data: Dict[str, Any], db_path: Optional[str] = None) -> Dict[str, Any]:
    """Save one rit: Supabase primary, SQLite fallback. Returns the stored row."""
    if _supabase_enabled():
        try:
            from app.db import travel_supabase

            payload = dict(data)
            payload["sync_status"] = "synced"
            return travel_supabase.save_travel(payload)
        except Exception as exc:
            logger.warning("Supabase travels save failed, falling back to SQLite: %s", exc)
    payload = dict(data)
    payload["sync_status"] = "pending"
    return local_storage.save_travel(payload, db_path=db_path)


def _fetch_travel(travel_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Single-rit read: Supabase first, then SQLite (covers offline-created rows)."""
    if _supabase_enabled():
        try:
            from app.db import travel_supabase

            found = travel_supabase.get_travel(travel_id)
            if found:
                return found
        except Exception as exc:
            logger.warning("Supabase travels read failed, falling back to SQLite: %s", exc)
    return local_storage.get_travel(travel_id, db_path=db_path)


def _fetch_travels(
    company_id: Optional[str] = None,
    status: Optional[str] = None,
    truck_id: Optional[str] = None,
    limit: int = 5000,
    db_path: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if _supabase_enabled():
        try:
            from app.db import travel_supabase

            return travel_supabase.list_travels(
                company_id=company_id, status=status, truck_id=truck_id, limit=limit
            )
        except Exception as exc:
            logger.warning("Supabase travels read failed, falling back to SQLite: %s", exc)
    return local_storage.list_travels(
        company_id=company_id, status=status, truck_id=truck_id, limit=limit, db_path=db_path
    )


def _storage_backend() -> str:
    return "supabase" if _supabase_enabled() else "local_sqlite"


class TruckNotFoundError(Exception):
    """Raised when a travel references a truck_id absent from master + legacy stores."""


class TravelNotFoundError(Exception):
    """Raised when a travel/rit id does not exist."""


def _money(value: Any) -> float:
    return round(float(value or 0.0), 0)


def _dec(value: Any, digits: int = 2) -> float:
    return round(float(value or 0.0), digits)


def haversine_km(origin: List[float], destination: List[float]) -> float:
    """Great-circle distance in km between two [lon, lat] gazetteer points."""
    lon1, lat1 = float(origin[0]), float(origin[1])
    lon2, lat2 = float(destination[0]), float(destination[1])
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    )
    return radius * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def resolve_truck_asset(truck_id: str) -> Optional[Dict[str, Any]]:
    """
    Resolve a truck_id against the new master table first, then the legacy
    `custom_fleet_vehicles` store so pre-split customers keep working.
    """
    if not truck_id:
        return None

    asset = _fetch_master_asset(truck_id)
    if asset:
        mapped = dict(asset)
        mapped["source"] = "master"
        return mapped

    legacy = local_storage.get_custom_vehicle(truck_id)
    if legacy is None:
        wanted = truck_id.strip().upper()
        for item in local_storage.list_custom_vehicles():
            if str(item.get("vehicle_id", "")).strip().upper() == wanted:
                legacy = item
                break

    if legacy:
        return {
            "id": legacy.get("id"),
            "truck_id": legacy.get("vehicle_id"),
            "name": legacy.get("name") or legacy.get("vehicle_id"),
            "modality": legacy.get("modality") or "truck",
            "vin": legacy.get("vin"),
            "vehicle_golongan": legacy.get("vehicle_golongan") or "GOL_II",
            "driver_name": legacy.get("driver_name"),
            "driver_phone": legacy.get("driver_phone"),
            "company_id": legacy.get("organization_id"),
            "company_name": legacy.get("organization_id"),
            "gross_weight_ton": legacy.get("gross_weight_ton") or 12.0,
            "fuel_type": "biosolar",
            "source": "legacy_custom_fleet",
        }
    return None


def list_truck_assets_with_legacy(company_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Union of master truck assets and legacy custom fleet trucks (deduped)."""
    master = []
    seen = set()
    for asset in _fetch_master_assets(company_id=company_id):
        item = dict(asset)
        item["source"] = "master"
        master.append(item)
        seen.add(str(item.get("truck_id", "")).upper())

    for legacy in local_storage.list_custom_vehicles():
        vid = str(legacy.get("vehicle_id", ""))
        if not vid or vid.upper() in seen:
            continue
        if (legacy.get("modality") or "truck") != "truck":
            continue
        legacy_company = legacy.get("organization_id")
        if company_id and legacy_company and legacy_company != company_id:
            continue
        master.append({
            "id": legacy.get("id"),
            "truck_id": vid,
            "name": legacy.get("name") or vid,
            "modality": "truck",
            "vin": legacy.get("vin"),
            "vehicle_golongan": legacy.get("vehicle_golongan") or "GOL_II",
            "driver_name": legacy.get("driver_name"),
            "driver_phone": legacy.get("driver_phone"),
            "company_id": legacy_company,
            "company_name": legacy_company,
            "gross_weight_ton": legacy.get("gross_weight_ton") or 12.0,
            "fuel_type": "biosolar",
            "notes": None,
            "source": "legacy_custom_fleet",
            "created_at": legacy.get("created_at"),
            "updated_at": legacy.get("updated_at"),
        })
        seen.add(vid.upper())
    return master


def _apply_ledger(travel: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recompute every cost/savings field in-place from the travel's raw inputs.

    Required keys: commodity_key, cargo_tonnage, vehicle_golongan, fuel_type,
    origin_coords, dest_coords, baseline_time_hours.
    """
    tier_key, tier_info = SpoilageHedgingService.classify_commodity(travel.get("commodity_key") or "beras")
    delta = float(tier_info["delta"])

    tonnage = float(travel.get("cargo_tonnage") or 0.0)
    declared_value = travel.get("cargo_value_idr")
    if declared_value and float(declared_value) > 0:
        cargo_value = float(declared_value)
        value_source = "declared"
    else:
        cargo_value = tonnage * 1000.0 * float(tier_info["default_price_per_kg"])
        value_source = "tier_default_price"

    fuel_type = (travel.get("fuel_type") or "biosolar").lower()
    golongan = (travel.get("vehicle_golongan") or "GOL_II").upper()
    shock = float(travel.get("inflation_shock_factor") or 0.0)
    fuel_rate = get_effective_fuel_rate(fuel_type, shock)

    origin = travel.get("origin_coords") or [0.0, 0.0]
    dest = travel.get("dest_coords") or [0.0, 0.0]
    declared_distance = travel.get("baseline_distance_km")
    if declared_distance and float(declared_distance) > 0:
        distance_km = float(declared_distance)
        distance_source = "declared"
    else:
        distance_km = haversine_km(origin, dest)
        distance_source = "haversine_gazetteer"

    baseline_time = float(travel.get("baseline_time_hours") or 0.0)
    blocked_delay = float(travel.get("blocked_delay_hours") or 0.0)

    baseline_fuel = travel.get("baseline_fuel_liters")
    if baseline_fuel is None or float(baseline_fuel) <= 0:
        baseline_fuel = distance_km / TRUCK_FUEL_CONSUMPTION_KM_PER_LITER
    baseline_fuel = float(baseline_fuel)

    actual_recorded = bool(travel.get("actual_recorded"))
    if actual_recorded and travel.get("actual_time_hours"):
        actual_time = float(travel["actual_time_hours"])
    else:
        # No realised outcome yet: assume the trip ran the blocked baseline.
        actual_time = baseline_time + blocked_delay

    actual_fuel = travel.get("actual_fuel_liters")
    if actual_recorded and actual_fuel is not None:
        actual_fuel = float(actual_fuel)
    else:
        actual_fuel = baseline_fuel

    baseline_segments = list(travel.get("baseline_toll_segments") or [])
    actual_segments = travel.get("actual_toll_segments")
    if actual_segments is None:
        actual_segments = baseline_segments if not actual_recorded else []
    actual_segments = list(actual_segments)

    baseline_toll = SpoilageHedgingService.get_bpjt_toll_cost(baseline_segments, golongan)
    actual_toll = SpoilageHedgingService.get_bpjt_toll_cost(actual_segments, golongan)

    baseline_spoilage = get_spoilage_loss(cargo_value, delta, blocked_delay)
    actual_extra_delay = max(0.0, actual_time - baseline_time)
    actual_spoilage = get_spoilage_loss(cargo_value, delta, actual_extra_delay)

    baseline_labor = (baseline_time + blocked_delay) * DRIVER_OVERTIME_HOURLY_IDR
    actual_labor = actual_time * DRIVER_OVERTIME_HOURLY_IDR

    baseline_fuel_cost = _money(baseline_fuel * fuel_rate)
    actual_fuel_cost = _money(actual_fuel * fuel_rate)
    baseline_toll_cost = _money(baseline_toll)
    actual_toll_cost = _money(actual_toll)
    baseline_spoilage_cost = _money(baseline_spoilage)
    actual_spoilage_cost = _money(actual_spoilage)
    baseline_labor_cost = _money(baseline_labor)
    actual_labor_cost = _money(actual_labor)

    baseline_total = _money(
        baseline_fuel_cost + baseline_toll_cost + baseline_spoilage_cost + baseline_labor_cost
    )
    actual_total = _money(
        actual_fuel_cost + actual_toll_cost + actual_spoilage_cost + actual_labor_cost
    )

    # Split savings; the rounded components sum exactly to the reported total.
    saved_fuel = _money(baseline_fuel_cost - actual_fuel_cost)
    saved_toll = _money(baseline_toll_cost - actual_toll_cost)
    saved_spoilage = _money(baseline_spoilage_cost - actual_spoilage_cost)
    saved_labor = _money(baseline_labor_cost - actual_labor_cost)
    saved_total = _money(saved_fuel + saved_toll + saved_spoilage + saved_labor)

    travel.update({
        "cargo_value_idr": _money(cargo_value),
        "cargo_value_source": value_source,
        "baseline_distance_km": _dec(distance_km, 2),
        "distance_source": distance_source,
        "baseline_fuel_liters": _dec(baseline_fuel, 2),
        "baseline_toll_segments": baseline_segments,
        "actual_toll_segments": actual_segments,
        "baseline_fuel_cost_idr": baseline_fuel_cost,
        "baseline_toll_cost_idr": baseline_toll_cost,
        "baseline_spoilage_idr": baseline_spoilage_cost,
        "baseline_labor_idr": baseline_labor_cost,
        "baseline_cost_idr": baseline_total,
        "actual_time_hours": _dec(actual_time, 2),
        "actual_recorded": actual_recorded,
        "actual_fuel_liters": _dec(actual_fuel, 2),
        "actual_fuel_cost_idr": actual_fuel_cost,
        "actual_toll_cost_idr": actual_toll_cost,
        "actual_spoilage_idr": actual_spoilage_cost,
        "actual_labor_idr": actual_labor_cost,
        "actual_cost_idr": actual_total,
        "saved_time_hours": _dec((baseline_time + blocked_delay) - actual_time, 2),
        "saved_fuel_liters": _dec(baseline_fuel - actual_fuel, 2),
        "saved_fuel_cost_idr": saved_fuel,
        "saved_toll_idr": saved_toll,
        "saved_spoilage_idr": saved_spoilage,
        "saved_labor_idr": saved_labor,
        "saved_cost_idr": saved_total,
        "efficiency_pct": _dec((saved_total / baseline_total) * 100.0, 2) if baseline_total > 0 else 0.0,
    })
    return travel


def create_travel(payload: TravelCreate, actor: Optional[str] = None, db_path: Optional[str] = None) -> Dict[str, Any]:
    """Create one rit, resolving its master truck asset and computing the ledger."""
    truck = resolve_truck_asset(payload.truck_id)
    if not truck:
        raise TruckNotFoundError(
            f"Truk '{payload.truck_id}' tidak terdaftar. Daftarkan aset truk pada Langkah 1 terlebih dahulu."
        )

    data = payload.model_dump()
    data["truck_id"] = truck["truck_id"]
    data["truck_name"] = truck.get("name")
    data["company_id"] = truck.get("company_id")
    data["driver_name"] = truck.get("driver_name")
    data["vehicle_golongan"] = (data.get("vehicle_golongan") or truck.get("vehicle_golongan") or "GOL_II").upper()
    data["fuel_type"] = data.get("fuel_type") or truck.get("fuel_type") or "biosolar"
    data["actual_recorded"] = payload.actual_time_hours is not None
    data["status"] = payload.status.value if hasattr(payload.status, "value") else str(payload.status)
    data["created_by"] = actor or "dispatcher"
    _apply_ledger(data)
    return _persist_travel(data, db_path=db_path)


def update_travel(
    travel_id: str,
    payload: TravelUpdate,
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Apply realised outcomes to an existing rit and recompute the ledger."""
    existing = _fetch_travel(travel_id, db_path=db_path)
    if not existing:
        raise TravelNotFoundError(f"Rit '{travel_id}' tidak ditemukan.")

    updates = payload.model_dump(exclude_unset=True)
    data = dict(existing)
    for key, value in updates.items():
        if value is None:
            continue
        if key == "status" and hasattr(value, "value"):
            value = value.value
        data[key] = value

    if updates.get("actual_time_hours") is not None:
        data["actual_recorded"] = True

    _apply_ledger(data)
    if data.get("status") == "delivered" and not data.get("delivered_at"):
        data["delivered_at"] = payload.delivered_at or datetime.now().isoformat()
    return _persist_travel(data, db_path=db_path)


def solve_and_persist_hedging(
    travel_id: str,
    request: TravelHedgingRequest,
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Solve the Continue/Reroute/Hold matrix for one rit and persist the full
    decision (costs, optimal policy, net savings, rationale) on that row.
    """
    travel = _fetch_travel(travel_id, db_path=db_path)
    if not travel:
        raise TravelNotFoundError(f"Rit '{travel_id}' tidak ditemukan.")

    tonnage = float(travel.get("cargo_tonnage") or 0.0)
    if tonnage <= 0:
        raise ValueError("Rit tidak memiliki tonase muatan; solver pembusukan membutuhkan cargo_tonnage > 0.")

    detour_distance = request.detour_distance_km
    if detour_distance is None:
        detour_distance = max(
            0.0,
            (float(travel.get("actual_fuel_liters") or 0.0) - float(travel.get("baseline_fuel_liters") or 0.0))
            * TRUCK_FUEL_CONSUMPTION_KM_PER_LITER,
        )
    detour_time = request.detour_time_hours
    if detour_time is None:
        detour_time = max(0.0, float(travel.get("actual_time_hours") or 0.0) - float(travel.get("baseline_time_hours") or 0.0))

    solve_req = HedgingSolveRequest(
        vehicle_id=travel.get("truck_id") or travel_id,
        commodity=travel.get("commodity_key") or "beras",
        cargo_tonnage=min(100.0, max(0.1, tonnage)),
        origin=travel.get("origin_name") or "Asal",
        destination=travel.get("destination_name") or "Tujuan",
        vehicle_golongan=travel.get("vehicle_golongan") or "GOL_II",
        fuel_type=travel.get("fuel_type") or "biosolar",
        p_disruption=request.p_disruption,
        disruption_delay_hours=max(0.0, float(travel.get("blocked_delay_hours") or 0.0)),
        detour_distance_km=max(0.0, float(detour_distance)),
        detour_time_hours=max(0.0, float(detour_time)),
        toll_segments=request.toll_segments if request.toll_segments is not None else travel.get("baseline_toll_segments"),
        hold_wait_hours=request.hold_wait_hours,
        downtime_fixed_fee_idr=request.downtime_fixed_fee_idr,
    )
    solved = spoilage_hedging_service.solve_hedging_matrix(solve_req, request.inflation_shock_factor)
    solved_dict = solved.model_dump()

    travel["hedging"] = solved_dict
    travel["hedging_policy"] = solved.optimal_policy
    travel["hedging_net_savings_idr"] = float(solved.net_savings_idr)
    travel["hedging_solved_at"] = datetime.now().isoformat()
    _persist_travel(travel, db_path=db_path)
    return solved_dict


# ==========================================
# ERP SAVINGS AGGREGATION
# ==========================================

def _sum_breakdown(trips: List[Dict[str, Any]]) -> ERPSavingsBreakdown:
    return ERPSavingsBreakdown(
        fuel_idr=_money(sum(float(t.get("saved_fuel_cost_idr") or 0.0) for t in trips)),
        toll_idr=_money(sum(float(t.get("saved_toll_idr") or 0.0) for t in trips)),
        spoilage_idr=_money(sum(float(t.get("saved_spoilage_idr") or 0.0) for t in trips)),
        labor_idr=_money(sum(float(t.get("saved_labor_idr") or 0.0) for t in trips)),
    )


def _compute_totals(trips: List[Dict[str, Any]]) -> ERPTotals:
    total = len(trips)
    active = sum(1 for t in trips if t.get("status") in ("planned", "moving", "rerouted"))
    delivered = [t for t in trips if t.get("status") == "delivered"]
    failed = sum(1 for t in trips if t.get("status") == "failed")

    reroute_success = sum(
        1
        for t in trips
        if t.get("rerouted")
        and t.get("status") in ("rerouted", "delivered")
        and float(t.get("saved_cost_idr") or 0.0) > 0
    )
    reroute_failed = sum(
        1
        for t in trips
        if t.get("rerouted")
        and (t.get("status") == "failed" or float(t.get("saved_cost_idr") or 0.0) < 0)
    )
    reroute_attempts = reroute_success + reroute_failed

    sla_ok = 0
    for t in delivered:
        sla_hours = float(t.get("sla_deadline_hours") or 0.0)
        actual_hours = float(t.get("actual_time_hours") or 0.0)
        if sla_hours > 0 and actual_hours <= sla_hours:
            sla_ok += 1

    baseline_total = _money(sum(float(t.get("baseline_cost_idr") or 0.0) for t in trips))
    actual_total = _money(sum(float(t.get("actual_cost_idr") or 0.0) for t in trips))
    saved_total = _money(sum(float(t.get("saved_cost_idr") or 0.0) for t in trips))

    return ERPTotals(
        total_trips=total,
        active_trips=active,
        delivered_trips=len(delivered),
        failed_trips=failed,
        reroute_success_count=reroute_success,
        reroute_failed_count=reroute_failed,
        reroute_success_rate_pct=_dec((reroute_success / reroute_attempts) * 100.0, 2) if reroute_attempts else 0.0,
        sla_compliance_pct=_dec((sla_ok / len(delivered)) * 100.0, 2) if delivered else 0.0,
        time_saved_hours=_dec(sum(float(t.get("saved_time_hours") or 0.0) for t in trips), 2),
        fuel_saved_liters=_dec(sum(float(t.get("saved_fuel_liters") or 0.0) for t in trips), 2),
        cost_saved_idr=saved_total,
        baseline_cost_idr=baseline_total,
        actual_cost_idr=actual_total,
        cost_efficiency_pct=_dec((saved_total / baseline_total) * 100.0, 2) if baseline_total > 0 else 0.0,
        avg_cost_saved_per_trip_idr=_money(saved_total / total) if total else 0.0,
        savings_breakdown=_sum_breakdown(trips),
    )


def _trip_row(travel: Dict[str, Any]) -> ERPTripRow:
    return ERPTripRow(
        id=travel["id"],
        truck_id=travel.get("truck_id") or "",
        truck_name=travel.get("truck_name"),
        origin_name=travel.get("origin_name") or "",
        destination_name=travel.get("destination_name") or "",
        commodity_key=travel.get("commodity_key") or "",
        cargo_tonnage=float(travel.get("cargo_tonnage") or 0.0),
        status=travel.get("status") or "planned",
        rerouted=bool(travel.get("rerouted")),
        disruption_id=travel.get("disruption_id"),
        saved_time_hours=_dec(travel.get("saved_time_hours"), 2),
        saved_fuel_liters=_dec(travel.get("saved_fuel_liters"), 2),
        saved_cost_idr=_money(travel.get("saved_cost_idr")),
        savings_breakdown=ERPSavingsBreakdown(
            fuel_idr=_money(travel.get("saved_fuel_cost_idr")),
            toll_idr=_money(travel.get("saved_toll_idr")),
            spoilage_idr=_money(travel.get("saved_spoilage_idr")),
            labor_idr=_money(travel.get("saved_labor_idr")),
        ),
        efficiency_pct=_dec(travel.get("efficiency_pct"), 2),
        hedging_policy=travel.get("hedging_policy"),
        created_at=travel.get("created_at"),
    )


def build_erp_summary(
    company_id: Optional[str] = None,
    include_trips: bool = True,
    db_path: Optional[str] = None,
) -> ERPSummaryResponse:
    """
    Aggregate the travel ledger into dispatcher/regulator ERP figures.

    `include_trips=False` returns tenant-level aggregates only (regulator macro
    view) — no per-rit commercial detail crosses the role boundary.
    """
    trips = _fetch_travels(company_id=company_id, limit=5000, db_path=db_path)

    if include_trips:
        scope = "DISPATCHER_DETAIL"
        rows = [_trip_row(t) for t in trips]
    else:
        scope = "REGULATOR_AGGREGATE"
        rows = []

    companies = sorted({str(t.get("company_id")) for t in trips if t.get("company_id")})
    per_company: List[ERPCompanySummary] = []
    for comp in companies:
        comp_trips = [t for t in trips if str(t.get("company_id")) == comp]
        comp_totals = _compute_totals(comp_trips)
        per_company.append(
            ERPCompanySummary(
                company_id=comp,
                total_trips=comp_totals.total_trips,
                delivered_trips=comp_totals.delivered_trips,
                failed_trips=comp_totals.failed_trips,
                reroute_success_count=comp_totals.reroute_success_count,
                reroute_success_rate_pct=comp_totals.reroute_success_rate_pct,
                time_saved_hours=comp_totals.time_saved_hours,
                fuel_saved_liters=comp_totals.fuel_saved_liters,
                cost_saved_idr=comp_totals.cost_saved_idr,
                cost_efficiency_pct=comp_totals.cost_efficiency_pct,
            )
        )

    totals = _compute_totals(trips)
    notes = [
        "Penghematan dihitung dari tarif tol BPJT (Golongan I–V), harga BBM Pertamina, dan peluruhan komoditas 4-tier.",
        "Reroute sukses = rit yang dialihkan, selesai/berjalan, dan menghasilkan penghematan biaya bersih positif.",
        "Rit gagal = status failed atau pengalihan rute yang justru menaikkan biaya aktual di atas baseline.",
    ]

    return ERPSummaryResponse(
        generated_at=datetime.now().isoformat(),
        company_id=company_id,
        scope=scope,
        storage=_storage_backend(),
        totals=totals,
        per_company=per_company,
        trips=rows,
        business_notes=notes,
    )


# ==========================================
# ROUTER-FACING READ/WRITE WRAPPERS
# (Supabase primary, SQLite fallback — same shapes as local_storage)
# ==========================================

def save_truck_asset(data: Dict[str, Any], db_path: Optional[str] = None) -> Dict[str, Any]:
    """Persist a master truck asset (used by POST /fleet/trucks)."""
    return _persist_truck_asset(data, db_path=db_path)


def delete_truck_asset(truck_id: str, db_path: Optional[str] = None) -> bool:
    """Delete a master truck asset from Supabase and/or SQLite."""
    return _delete_master_asset(truck_id, db_path=db_path)


def get_truck_asset_master(
    truck_id: str, db_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Read one master asset (no legacy fallback; used for tenant-collision checks)."""
    if _supabase_enabled():
        try:
            from app.db import travel_supabase

            found = travel_supabase.get_truck_asset(truck_id)
            if found:
                return found
        except Exception as exc:
            logger.warning("Supabase truck_assets read failed, falling back to SQLite: %s", exc)
    return local_storage.get_truck_asset(truck_id, db_path=db_path)


def get_travel(travel_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Read one rit (used by GET /fleet/travels/{id})."""
    return _fetch_travel(travel_id, db_path=db_path)


def list_travels(
    company_id: Optional[str] = None,
    status: Optional[str] = None,
    truck_id: Optional[str] = None,
    limit: int = 500,
    db_path: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List rits newest first (used by GET /fleet/travels)."""
    return _fetch_travels(
        company_id=company_id,
        status=status,
        truck_id=truck_id,
        limit=limit,
        db_path=db_path,
    )
