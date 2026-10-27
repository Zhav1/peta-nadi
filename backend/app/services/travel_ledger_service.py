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
import json
import logging
import time
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
    REEFER_DEFAULT_LPH,
    get_fuel_rate_for_trip,
    get_spoilage_loss,
    payload_adjusted_kmpl,
    resolve_fuel_efficiency_kmpl,
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
    include_trips: bool = True,
) -> List[Dict[str, Any]]:
    if _supabase_enabled():
        try:
            from app.db import travel_supabase

            return travel_supabase.list_travels(
                company_id=company_id, status=status, truck_id=truck_id, limit=limit,
                include_trips=include_trips,
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


class FuelPlausibilityError(ValueError):
    """Raised when actual fuel implies an implausible economy (typo guard)."""


# Plausibility guard for actual fuel (demo-typo protection, e.g. 120L/73km):
# truck diesel economy is expected within 1.5–25 km/L. Anything outside is
# almost certainly an input typo and would otherwise create a huge negative
# saving + bogus spoilage signal. Actual fuel > 3x the expected baseline
# (distance / payload-adjusted efficiency, incl. reefer burn) is rejected
# with the same message.
MIN_PLAUSIBLE_KMPL = 1.5
MAX_PLAUSIBLE_KMPL = 25.0
FUEL_BASELINE_MULTIPLIER = 3.0


def _resolve_distance_km(data: Dict[str, Any]) -> float:
    """Declared baseline distance when > 0, else haversine gazetteer distance."""
    try:
        declared = data.get("baseline_distance_km")
        if declared is not None and float(declared) > 0:
            return float(declared)
    except (TypeError, ValueError):
        pass
    try:
        origin = data.get("origin_coords")
        dest = data.get("dest_coords")
        if origin and dest:
            return float(haversine_km(origin, dest))
    except (TypeError, ValueError):
        pass
    return 0.0


def _expected_baseline_fuel_liters(data: Dict[str, Any], truck: Optional[Dict[str, Any]]) -> Optional[float]:
    """Baseline fuel from distance / payload-adjusted efficiency (+ reefer burn)."""
    try:
        fctx = _resolve_trip_fuel_context(data, truck or {})
        eff = float(fctx.get("eff_adj") or 0.0)
        if eff <= 0:
            return None
        dist = _resolve_distance_km(data)
        if dist <= 0:
            return None
        base = dist / eff
        if fctx.get("reefer_active") and float(fctx.get("reefer_lph_used") or 0.0) > 0:
            try:
                base += float(fctx["reefer_lph_used"]) * (
                    float(data.get("baseline_time_hours") or 0.0)
                    + float(data.get("blocked_delay_hours") or 0.0)
                )
            except (TypeError, ValueError):
                pass
        return float(base) if base > 0 else None
    except Exception:
        return None


def validate_actual_fuel_plausibility(
    *,
    distance_km: float,
    actual_fuel_liters: float,
    baseline_fuel_expected: Optional[float] = None,
) -> None:
    """Reject demo-typo fuel (e.g. 120L/73km = 0.61 km/L) with a clear ID message."""
    try:
        d = float(distance_km)
        a = float(actual_fuel_liters)
    except (TypeError, ValueError):
        return
    if d <= 0 or a <= 0:
        return
    econ = d / a
    msg = (
        f"BBM aktual {a:g}L untuk {d:g}km = {econ:.2f} km/L "
        f"tidak wajar (batas 1.5–25 km/L). Cek ulang input."
    )
    if econ < MIN_PLAUSIBLE_KMPL or econ > MAX_PLAUSIBLE_KMPL:
        raise FuelPlausibilityError(msg)
    try:
        b = float(baseline_fuel_expected) if baseline_fuel_expected is not None else 0.0
    except (TypeError, ValueError):
        b = 0.0
    if b > 0 and a > FUEL_BASELINE_MULTIPLIER * b:
        raise FuelPlausibilityError(msg)


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


def _resolve_trip_fuel_context(
    travel: Dict[str, Any],
    truck: Optional[Dict[str, Any]] = None,
    at_date_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Resolve per-trip fuel math (Phase 2 fuel-spec contract).

    Efficiency: travel override -> asset `fuel_efficiency_kmpl` ->
    GOLONGAN_DEFAULT_KMPL[vehicle_golongan] -> legacy flat 3.5 (unknown
    golongan only). Payload penalty (documented formula):

        load_factor = clamp(cargo_tonnage / gross_weight_ton, 0, 1)
        eff_adj     = eff_base * (1 - 0.15 * load_factor)

    Reefer: when the commodity tier requires_reefer AND the unit is a reefer
    (travel override wins over the asset flag), trip fuel gains
    `reefer_lph * hours` (lph from travel/asset, else 2.0 default).

    Price: Supabase `fuel_prices` row effective at `created_at`
    (freeze-at-created_at: new trips price at creation, old rows keep their
    frozen rate unless explicitly repriced) with PERTAMINA_FALLBACK when no
    SK row applies; the inflation shock multiplies on top.
    """
    from app.services.spoilage_hedging_service import SpoilageHedgingService as _SHS

    _tier_key, tier_info = _SHS.classify_commodity(travel.get("commodity_key") or "beras")
    truck = truck or {}
    fuel_type = (travel.get("fuel_type") or truck.get("fuel_type") or "biosolar").lower()
    golongan = (travel.get("vehicle_golongan") or truck.get("vehicle_golongan") or "GOL_II").upper()
    shock = float(travel.get("inflation_shock_factor") or 0.0)
    tonnage = float(travel.get("cargo_tonnage") or 0.0)

    eff_override = travel.get("fuel_efficiency_kmpl")
    if eff_override is None:
        eff_override = truck.get("fuel_efficiency_kmpl")
    eff_base, eff_source = resolve_fuel_efficiency_kmpl(eff_override, golongan)

    try:
        gross = float(truck.get("gross_weight_ton") or 12.0)
    except (TypeError, ValueError):
        gross = 12.0
    eff_adj, load_factor = payload_adjusted_kmpl(eff_base, tonnage, gross)

    is_reefer_move = travel.get("is_reefer")
    if is_reefer_move is None:
        is_reefer_move = bool(truck.get("is_reefer"))
    else:
        is_reefer_move = bool(is_reefer_move)
    reefer_active = bool(tier_info.get("requires_reefer")) and is_reefer_move
    reefer_lph = travel.get("reefer_fuel_lph")
    if reefer_lph is None:
        reefer_lph = truck.get("reefer_fuel_lph")
    if reefer_lph is None and reefer_active:
        reefer_lph = REEFER_DEFAULT_LPH
    reefer_lph_used = float(reefer_lph) if reefer_lph is not None else 0.0

    at_date = at_date_override or travel.get("created_at")
    region = travel.get("region") or travel.get("province") or truck.get("region")
    rate_info = get_fuel_rate_for_trip(fuel_type, region=region, at_date=at_date)
    fuel_rate = float(rate_info["rate_idr"]) * (1.0 + max(0.0, shock))
    if eff_source == "legacy_3p5_flat" and rate_info.get("is_fallback"):
        fuel_source = "legacy_3p5"
    else:
        fuel_source = rate_info["source"]

    return {
        "tier_info": tier_info,
        "fuel_type": fuel_type,
        "golongan": golongan,
        "eff_base": float(eff_base),
        "eff_source": eff_source,
        "eff_adj": float(eff_adj),
        "load_factor": float(load_factor),
        "gross_weight_ton": float(gross),
        "is_reefer_move": bool(is_reefer_move),
        "reefer_active": bool(reefer_active),
        "reefer_lph_used": float(reefer_lph_used),
        "fuel_rate": float(fuel_rate),
        "fuel_base_rate_idr": float(rate_info["rate_idr"]),
        "fuel_sk_id": rate_info.get("fuel_sk_id"),
        "fuel_sk_number": rate_info.get("sk_number"),
        "fuel_effective_date": rate_info.get("effective_date"),
        "fuel_region": rate_info.get("region"),
        "fuel_source": fuel_source,
        "fuel_is_fallback": bool(rate_info.get("is_fallback")),
    }


def _apply_ledger(
    travel: Dict[str, Any],
    truck: Optional[Dict[str, Any]] = None,
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Recompute every cost/savings field in-place from the travel's raw inputs.

    Required keys: commodity_key, cargo_tonnage, vehicle_golongan, fuel_type,
    origin_coords, dest_coords, baseline_time_hours.
    """
    # Phase 2 fuel-spec math: per-truck efficiency + SK-frozen fuel price.
    # Freeze-at-created_at: the SK lookup is keyed on the row's created_at so
    # existing rows keep their frozen rate; only an explicit `_reprice_at_date`
    # (one-time backfill) reprices to the current SK.
    _truck_ctx = truck
    if _truck_ctx is None and travel.get("truck_id"):
        _truck_ctx = resolve_truck_asset(travel.get("truck_id") or "")
    _reprice_at = travel.pop("_reprice_at_date", None)
    _fctx = _resolve_trip_fuel_context(travel, _truck_ctx, at_date_override=_reprice_at)
    tier_info = _fctx["tier_info"]
    delta = float(tier_info["delta"])

    tonnage = float(travel.get("cargo_tonnage") or 0.0)
    declared_value = travel.get("cargo_value_idr")
    if declared_value and float(declared_value) > 0:
        cargo_value = float(declared_value)
        value_source = "declared"
    else:
        cargo_value = tonnage * 1000.0 * float(tier_info["default_price_per_kg"])
        value_source = "tier_default_price"

    fuel_type = _fctx["fuel_type"]
    golongan = _fctx["golongan"]
    fuel_rate = _fctx["fuel_rate"]
    eff_adj = _fctx["eff_adj"]
    reefer_active = _fctx["reefer_active"]
    reefer_lph_used = _fctx["reefer_lph_used"]

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
        _eff_div = eff_adj if eff_adj > 0 else TRUCK_FUEL_CONSUMPTION_KM_PER_LITER
        baseline_fuel = distance_km / _eff_div
        if reefer_active and reefer_lph_used > 0:
            baseline_fuel += reefer_lph_used * (baseline_time + blocked_delay)
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
        "fuel_rate_used_idr": _money(fuel_rate),
        "fuel_sk_id": _fctx["fuel_sk_id"],
        "fuel_sk_number": _fctx.get("fuel_sk_number"),
        "fuel_effective_date": _fctx.get("fuel_effective_date"),
        "fuel_source": _fctx["fuel_source"],
        "fuel_is_fallback": bool(_fctx["fuel_is_fallback"]),
        "fuel_efficiency_used_kmpl": _dec(eff_adj, 3),
        "fuel_efficiency_source": _fctx["eff_source"],
        "fuel_load_factor": _dec(_fctx["load_factor"], 3),
        "reefer_fuel_lph_used": _dec(reefer_lph_used, 3),
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
    if payload.actual_fuel_liters is not None:
        try:
            if float(payload.actual_fuel_liters) > 0:
                _dist = _resolve_distance_km(data)
                _base_exp = _expected_baseline_fuel_liters(data, truck)
                validate_actual_fuel_plausibility(
                    distance_km=_dist,
                    actual_fuel_liters=float(payload.actual_fuel_liters),
                    baseline_fuel_expected=_base_exp,
                )
                try:
                    _declared_base = float(data.get("baseline_fuel_liters") or 0.0)
                except (TypeError, ValueError):
                    _declared_base = 0.0
                if _declared_base > 0 and float(payload.actual_fuel_liters) > FUEL_BASELINE_MULTIPLIER * _declared_base:
                    _econ = _dist / float(payload.actual_fuel_liters) if _dist > 0 else 0.0
                    raise FuelPlausibilityError(
                        f"BBM aktual {float(payload.actual_fuel_liters):g}L untuk {_dist:g}km = {_econ:.2f} km/L "
                        f"tidak wajar (batas 1.5–25 km/L). Cek ulang input."
                    )
        except FuelPlausibilityError:
            raise
        except (TypeError, ValueError):
            pass
    _apply_ledger(data, truck=truck)
    saved = _persist_travel(data, db_path=db_path)
    invalidate_erp_cache(saved.get("company_id"))
    return saved


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

    _truck_u = resolve_truck_asset(data.get("truck_id") or "")
    if _truck_u is None and db_path:
        try:
            _truck_u = local_storage.get_truck_asset(data.get("truck_id") or "", db_path=db_path)
        except Exception:
            _truck_u = None
    if updates.get("actual_fuel_liters") is not None:
        try:
            _new_fuel = float(updates["actual_fuel_liters"])
        except (TypeError, ValueError):
            _new_fuel = 0.0
        if _new_fuel > 0:
            _dist_u = _resolve_distance_km(data)
            # Prefer the already-persisted distance when the payload omits it.
            if _dist_u <= 0:
                try:
                    _dist_u = float(existing.get("baseline_distance_km") or 0.0)
                except (TypeError, ValueError):
                    _dist_u = 0.0
            _base_exp_u = _expected_baseline_fuel_liters(data, _truck_u)
            validate_actual_fuel_plausibility(
                distance_km=_dist_u,
                actual_fuel_liters=_new_fuel,
                baseline_fuel_expected=_base_exp_u,
            )
            try:
                _declared_u = float(data.get("baseline_fuel_liters") or 0.0)
            except (TypeError, ValueError):
                _declared_u = 0.0
            if _declared_u > 0 and _new_fuel > FUEL_BASELINE_MULTIPLIER * _declared_u:
                _econ_u = _dist_u / _new_fuel if _dist_u > 0 else 0.0
                raise FuelPlausibilityError(
                    f"BBM aktual {_new_fuel:g}L untuk {_dist_u:g}km = {_econ_u:.2f} km/L "
                    f"tidak wajar (batas 1.5–25 km/L). Cek ulang input."
                )
    _apply_ledger(data, truck=_truck_u)
    if data.get("status") == "delivered" and not data.get("delivered_at"):
        data["delivered_at"] = payload.delivered_at or datetime.now().isoformat()
    saved = _persist_travel(data, db_path=db_path)
    invalidate_erp_cache(saved.get("company_id"))
    return saved


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

    # Per-trip efficiency inversion (Phase 2): never the global 3.5 constant.
    _truck_h = resolve_truck_asset(travel.get("truck_id") or "")
    if _truck_h is None and db_path:
        try:
            _truck_h = local_storage.get_truck_asset(travel.get("truck_id") or "", db_path=db_path)
        except Exception:
            _truck_h = None
    _fctx_h = _resolve_trip_fuel_context(travel, _truck_h)
    _eff_for_detour = _fctx_h["eff_adj"] if _fctx_h["eff_adj"] > 0 else TRUCK_FUEL_CONSUMPTION_KM_PER_LITER
    detour_distance = request.detour_distance_km
    if detour_distance is None:
        detour_distance = max(
            0.0,
            (float(travel.get("actual_fuel_liters") or 0.0) - float(travel.get("baseline_fuel_liters") or 0.0))
            * _eff_for_detour,
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
    solved = spoilage_hedging_service.solve_hedging_matrix(
        solve_req,
        request.inflation_shock_factor,
        fuel_efficiency_kmpl=_fctx_h["eff_base"],
        reefer_lph=_fctx_h["reefer_lph_used"] if _fctx_h["reefer_active"] else None,
        cargo_tonnage=float(travel.get("cargo_tonnage") or 0.0),
        gross_weight_ton=_fctx_h["gross_weight_ton"],
        is_reefer=_fctx_h["is_reefer_move"],
        fuel_rate_override=_fctx_h["fuel_rate"],
    )
    solved_dict = solved.model_dump()

    travel["hedging"] = solved_dict
    travel["hedging_policy"] = solved.optimal_policy
    travel["hedging_net_savings_idr"] = float(solved.net_savings_idr)
    travel["hedging_solved_at"] = datetime.now().isoformat()
    _persist_travel(travel, db_path=db_path)
    invalidate_erp_cache(travel.get("company_id"))
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
    _dist = travel.get("baseline_distance_km")
    _actual_fuel = travel.get("actual_fuel_liters")
    _recorded = travel.get("actual_recorded")
    try:
        _d = float(_dist) if _dist is not None else 0.0
        _f = float(_actual_fuel) if _actual_fuel is not None else 0.0
    except (TypeError, ValueError):
        _d, _f = 0.0, 0.0
    _has_actual = bool(_recorded) and _d > 0 and _f > 0 and _actual_fuel is not None
    _economy = round(_d / _f, 2) if _has_actual else None
    _l100 = round(100.0 / (_d / _f), 1) if _has_actual and (_d / _f) > 0 else None
    _fuel_source = travel.get("fuel_source")
    _is_fallback = travel.get("fuel_is_fallback")
    if _is_fallback is None:
        _is_fallback = _fuel_source in ("PERTAMINA_FALLBACK", "legacy_3p5")
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
        baseline_distance_km=float(_dist) if _dist is not None else None,
        actual_fuel_liters=float(_actual_fuel) if _actual_fuel is not None else None,
        actual_recorded=bool(_recorded) if _recorded is not None else None,
        fuel_rate_used_idr=float(travel["fuel_rate_used_idr"]) if travel.get("fuel_rate_used_idr") is not None else None,
        fuel_sk_id=travel.get("fuel_sk_id"),
        fuel_sk_number=travel.get("fuel_sk_number"),
        fuel_effective_date=str(travel["fuel_effective_date"]) if travel.get("fuel_effective_date") is not None else None,
        fuel_source=_fuel_source,
        fuel_is_fallback=bool(_is_fallback) if _fuel_source is not None or travel.get("fuel_is_fallback") is not None else None,
        fuel_efficiency_used_kmpl=float(travel["fuel_efficiency_used_kmpl"]) if travel.get("fuel_efficiency_used_kmpl") is not None else None,
        fuel_efficiency_source=travel.get("fuel_efficiency_source"),
        fuel_load_factor=float(travel["fuel_load_factor"]) if travel.get("fuel_load_factor") is not None else None,
        reefer_fuel_lph_used=float(travel["reefer_fuel_lph_used"]) if travel.get("reefer_fuel_lph_used") is not None else None,
        economy_kmpl=_economy,
        l_per_100km=_l100,
    )


# ==========================================
# ERP SQL-FIRST AGGREGATION + CACHE (Phase 5 perf)
# Totals are pushed to SQL (SUM/COUNT/GROUP BY) so the service never scans
# O(C×N) rows in Python; only the dispatcher detail window (≤1000 rows) is
# materialised. Responses are cached 120s per (company, scope, limit).
# Shape of ERPSummaryResponse is unchanged.
# ==========================================

_ERP_CACHE_TTL_SECONDS = 120
_ERP_CACHE_PREFIX = "lrip:cache:erp:"
_erp_mem: Dict[str, tuple] = {}


def _erp_cache_key(company_id: Optional[str], scope: str, limit: int) -> str:
    return f"{_ERP_CACHE_PREFIX}{company_id or 'all'}:{scope}:{limit}"


def _erp_cache_get(key: str) -> Optional[ERPSummaryResponse]:
    now = time.time()
    entry = _erp_mem.get(key)
    if entry and entry[0] > now:
        try:
            return ERPSummaryResponse(**json.loads(entry[1]))
        except Exception:
            _erp_mem.pop(key, None)
    elif entry:
        _erp_mem.pop(key, None)
    try:
        from app.services.redis_client import cache_get

        raw = cache_get(key)
        if raw:
            resp = ERPSummaryResponse(**json.loads(raw))
            _erp_mem[key] = (now + _ERP_CACHE_TTL_SECONDS, raw)
            return resp
    except Exception as exc:
        logger.debug(f"ERP cache read skipped: {exc}")
    return None


def _erp_cache_set(key: str, response: ERPSummaryResponse) -> None:
    try:
        raw = response.model_dump_json()
        _erp_mem[key] = (time.time() + _ERP_CACHE_TTL_SECONDS, raw)
        from app.services.redis_client import cache_set

        cache_set(key, raw, ex=_ERP_CACHE_TTL_SECONDS)
    except Exception as exc:
        logger.debug(f"ERP cache write skipped: {exc}")


def invalidate_erp_cache(company_id: Optional[str] = None) -> None:
    """Drop cached ERP summaries (called on create/update/hedging).

    Clears the process-local entries and best-effort Redis keys sharing the
    `lrip:cache:erp:` prefix. Never raises — caching must not break writes.
    """
    try:
        for key in [k for k in _erp_mem if k.startswith(_ERP_CACHE_PREFIX)]:
            _erp_mem.pop(key, None)
        try:
            import app.services.redis_client as _rc

            for key in [k for k in list(_rc._mem_kv) if k.startswith(_ERP_CACHE_PREFIX)]:
                _rc._mem_kv.pop(key, None)
                _rc._mem_expire.pop(key, None)
        except Exception:
            pass
        try:
            from app.services.redis_client import get_redis

            r = get_redis()
            cursor = 0
            while True:
                cursor, keys = r.scan(cursor=cursor, match=f"{_ERP_CACHE_PREFIX}*", count=100)
                if keys:
                    r.delete(*keys)
                if cursor == 0:
                    break
        except Exception as exc:
            logger.debug(f"ERP Redis invalidation skipped: {exc}")
    except Exception as exc:
        logger.debug(f"ERP cache invalidation skipped: {exc}")


def _totals_from_agg(agg: Dict[str, Any]) -> ERPTotals:
    """Build ERPTotals from summed fields — same formulas as _compute_totals."""
    total = int(agg.get("n") or 0)
    delivered = int(agg.get("delivered") or 0)
    failed = int(agg.get("failed") or 0)
    rok = int(agg.get("reroute_ok") or 0)
    rfail = int(agg.get("reroute_fail") or 0)
    attempts = rok + rfail
    sla_ok = int(agg.get("sla_ok") or 0)
    baseline_total = _money(agg.get("base") or 0.0)
    actual_total = _money(agg.get("actual") or 0.0)
    saved_total = _money(agg.get("saved") or 0.0)
    return ERPTotals(
        total_trips=total,
        active_trips=int(agg.get("active") or 0),
        delivered_trips=delivered,
        failed_trips=failed,
        reroute_success_count=rok,
        reroute_failed_count=rfail,
        reroute_success_rate_pct=_dec((rok / attempts) * 100.0, 2) if attempts else 0.0,
        sla_compliance_pct=_dec((sla_ok / delivered) * 100.0, 2) if delivered else 0.0,
        time_saved_hours=_dec(agg.get("th") or 0.0, 2),
        fuel_saved_liters=_dec(agg.get("fl") or 0.0, 2),
        cost_saved_idr=saved_total,
        baseline_cost_idr=baseline_total,
        actual_cost_idr=actual_total,
        cost_efficiency_pct=_dec((saved_total / baseline_total) * 100.0, 2) if baseline_total > 0 else 0.0,
        avg_cost_saved_per_trip_idr=_money(saved_total / total) if total else 0.0,
        savings_breakdown=ERPSavingsBreakdown(
            fuel_idr=_money(agg.get("f") or 0.0),
            toll_idr=_money(agg.get("t") or 0.0),
            spoilage_idr=_money(agg.get("s") or 0.0),
            labor_idr=_money(agg.get("l") or 0.0),
        ),
    )


def _company_summary_from_agg(agg: Dict[str, Any]) -> ERPCompanySummary:
    t = _totals_from_agg(agg)
    return ERPCompanySummary(
        company_id=str(agg.get("company_id")),
        total_trips=t.total_trips,
        delivered_trips=t.delivered_trips,
        failed_trips=t.failed_trips,
        reroute_success_count=t.reroute_success_count,
        reroute_success_rate_pct=t.reroute_success_rate_pct,
        time_saved_hours=t.time_saved_hours,
        fuel_saved_liters=t.fuel_saved_liters,
        cost_saved_idr=t.cost_saved_idr,
        cost_efficiency_pct=t.cost_efficiency_pct,
    )


def _merge_aggs(aggs: List[Dict[str, Any]]) -> Dict[str, Any]:
    merged: Dict[str, Any] = {"company_id": None}
    for key in ("n", "active", "delivered", "failed", "reroute_ok", "reroute_fail",
                "sla_ok", "base", "actual", "saved", "th", "fl", "f", "t", "s", "l"):
        merged[key] = sum(float(a.get(key) or 0.0) for a in aggs)
    return merged


def _erp_sql_aggregates(
    company_id: Optional[str] = None,
    db_path: Optional[str] = None,
) -> Optional[List[Dict[str, Any]]]:
    """SQL SUM/COUNT/GROUP BY per company. Returns None when unavailable.

    Order: Supabase RPC `erp_ledger_totals` (migration 022) → SQLite SUM
    query (local fallback) → None (caller uses the bounded Python path).
    """
    if _supabase_enabled():
        try:
            from app.db import travel_supabase
            from app.db.supabase_client import get_client

            sb = get_client()
            params = {"p_company_id": company_id} if company_id else {"p_company_id": None}
            try:
                resp = sb.rpc("erp_ledger_totals", params).execute()
                rows = resp.data or []
                if rows:
                    return [dict(r) for r in rows]
                # Zero rows: distinguish "no data" from "RPC missing" —
                # an empty ledger is a valid empty aggregate.
                return []
            except Exception as rpc_err:
                logger.debug(f"erp_ledger_totals RPC unavailable, using projection: {rpc_err}")
                return None
        except Exception as exc:
            logger.debug(f"Supabase ERP aggregate skipped: {exc}")
            return None
    try:
        from app.db import local_storage

        conn = local_storage.get_db_connection(db_path)
        try:
            where = "WHERE company_id = ?" if company_id else ""
            params: tuple = (company_id,) if company_id else ()
            cur = conn.execute(
                f"""SELECT company_id,
                    COUNT(*) AS n,
                    SUM(CASE WHEN status IN ('planned','moving','rerouted') THEN 1 ELSE 0 END) AS active,
                    SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered,
                    SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
                    SUM(CASE WHEN rerouted = 1 AND status IN ('rerouted','delivered')
                        AND saved_cost_idr > 0 THEN 1 ELSE 0 END) AS reroute_ok,
                    SUM(CASE WHEN rerouted = 1 AND (status='failed' OR saved_cost_idr < 0)
                        THEN 1 ELSE 0 END) AS reroute_fail,
                    SUM(CASE WHEN status='delivered' AND sla_deadline_hours > 0
                        AND actual_time_hours <= sla_deadline_hours THEN 1 ELSE 0 END) AS sla_ok,
                    COALESCE(SUM(baseline_cost_idr),0) AS base,
                    COALESCE(SUM(actual_cost_idr),0) AS actual,
                    COALESCE(SUM(saved_cost_idr),0) AS saved,
                    COALESCE(SUM(saved_time_hours),0) AS th,
                    COALESCE(SUM(saved_fuel_liters),0) AS fl,
                    COALESCE(SUM(saved_fuel_cost_idr),0) AS f,
                    COALESCE(SUM(saved_toll_idr),0) AS t,
                    COALESCE(SUM(saved_spoilage_idr),0) AS s,
                    COALESCE(SUM(saved_labor_idr),0) AS l
                FROM travels {where} GROUP BY company_id""",
                params,
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
        finally:
            conn.close()
    except Exception as exc:
        logger.debug(f"SQLite ERP aggregate skipped: {exc}")
        return None


def build_erp_summary(
    company_id: Optional[str] = None,
    include_trips: bool = True,
    limit: int = 500,
    db_path: Optional[str] = None,
) -> ERPSummaryResponse:
    """
    Aggregate the travel ledger into dispatcher/regulator ERP figures.

    `include_trips=False` returns tenant-level aggregates only (regulator macro
    view) — no per-rit commercial detail crosses the role boundary, and no
    trip rows are fetched at all (REGULATOR_AGGREGATE early-return).

    Perf (Phase 5): totals are pushed to SQL (SUM/COUNT/GROUP BY, unbounded)
    instead of Python O(C×N); only the dispatcher detail window is fetched
    (default 500, max 1000). Results are cached 120s per
    (company, scope, limit) and invalidated on create/update/hedging.
    Response shape is unchanged.
    """
    try:
        limit = int(limit or 500)
    except (TypeError, ValueError):
        limit = 500
    limit = max(1, min(limit, 1000))

    scope = "DISPATCHER_DETAIL" if include_trips else "REGULATOR_AGGREGATE"
    cache_key = _erp_cache_key(company_id, scope, limit)
    cached = _erp_cache_get(cache_key)
    if cached is not None:
        return cached

    per_company: List[ERPCompanySummary] = []
    totals: Optional[ERPTotals] = None

    # SQL-first aggregates (SUM saved_*/COUNT/GROUP BY company_id).
    sql_aggs = _erp_sql_aggregates(company_id=company_id, db_path=db_path)
    if sql_aggs is not None:
        for agg in sql_aggs:
            per_company.append(_company_summary_from_agg(agg))
        totals = _totals_from_agg(_merge_aggs(sql_aggs))

    rows: List[ERPTripRow] = []
    if totals is None:
        # Fallback: bounded numeric projection, same formulas as SQL path.
        if _supabase_enabled():
            try:
                from app.db import travel_supabase

                numeric_rows = travel_supabase.list_travels_numeric(
                    company_id=company_id, limit=limit
                )
                trips = [dict(r) for r in numeric_rows]
            except Exception as exc:
                logger.warning("Supabase numeric projection failed, using full rows: %s", exc)
                trips = _fetch_travels(company_id=company_id, limit=limit, db_path=db_path)
        else:
            trips = _fetch_travels(company_id=company_id, limit=limit, db_path=db_path)

        if include_trips:
            scope = "DISPATCHER_DETAIL"
            # Detail window only — totals already cover the full ledger.
            detail = trips if not _supabase_enabled() else _fetch_travels(
                company_id=company_id, limit=limit, db_path=db_path, include_trips=True
            )
            rows = [_trip_row(t) for t in detail]
        else:
            scope = "REGULATOR_AGGREGATE"
            rows = []

        companies = sorted({str(t.get("company_id")) for t in trips if t.get("company_id")})
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
    elif include_trips:
        # SQL totals hit; fetch only the dispatcher detail window (no JSONB
        # beyond what _trip_row needs — light projection when on Supabase).
        detail = _fetch_travels(
            company_id=company_id, limit=limit, db_path=db_path, include_trips=True
        )
        rows = [_trip_row(t) for t in detail]
    # else: REGULATOR_AGGREGATE early-return — trips rows never fetched.

    notes = [
        "Penghematan dihitung dari tarif tol BPJT (Golongan I–V), harga BBM Pertamina, dan peluruhan komoditas 4-tier.",
        "Reroute sukses = Trip yang dialihkan, selesai/berjalan, dan menghasilkan penghematan biaya bersih positif.",
        "Trip gagal = status failed. Reroute merugi = pengalihan rute namun biaya naik (tetap Terkirim, tercatat sebagai Rugi).",
    ]

    response = ERPSummaryResponse(
        generated_at=datetime.now().isoformat(),
        company_id=company_id,
        scope=scope,
        storage=_storage_backend(),
        totals=totals,
        per_company=per_company,
        trips=rows,
        business_notes=notes,
    )
    _erp_cache_set(cache_key, response)
    return response


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
