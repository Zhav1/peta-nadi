"""
PreHub : Supabase persistence adapter for the truck-asset master + travel/rit ledger.

Supabase is the PRIMARY store (survives Render free-plan filesystem wipes);
SQLite (`local_storage`) is only a dev fallback when Supabase env is missing.

Table contracts live in `infra/supabase/migrations/014_truck_assets_and_travels.sql`:
  - truck_assets : master asset keyed by truck_id (nopol)
  - travels     : transactional rit ledger, JSONB coords/segments/hedging

Row shape here mirrors `local_storage` dicts (origin_coords/dest_coords as
[lon, lat] lists, hedging as dict) so the service layer stays store-agnostic.
"""
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    """True when Supabase creds are present (URL + anon and/or service key)."""
    try:
        from app.config import get_settings

        s = get_settings()
        has_url = bool((s.supabase_url or "").strip())
        has_key = bool((s.supabase_anon_key or "").strip()) or bool(
            (s.supabase_service_role_key or "").strip()
        )
        return has_url and has_key
    except Exception:
        return False


def _read_client():
    """Anon client for reads (public SELECT policy); service client if anon missing."""
    from app.db.supabase_client import get_client, get_write_client

    try:
        return get_client()
    except RuntimeError:
        return get_write_client()


def _write_client():
    """Service-role client when configured (bypasses RLS), else anon with health flag."""
    from app.db.supabase_client import get_write_client

    return get_write_client()


# ==========================================
# TRUCK ASSETS
# ==========================================

_ASSET_FIELDS = (
    "id", "truck_id", "name", "modality", "vin", "vehicle_golongan",
    "driver_name", "driver_phone", "company_id", "company_name",
    "gross_weight_ton", "fuel_type", "fuel_efficiency_kmpl", "is_reefer",
    "reefer_fuel_lph", "notes", "created_by",
    "sync_status", "created_at", "updated_at",
)


def _asset_to_row(data: Dict[str, Any]) -> Dict[str, Any]:
    row = {k: data.get(k) for k in _ASSET_FIELDS if data.get(k) is not None}
    # Let the server default (019: gen_random_uuid()::text) fire when the
    # caller omits id — same omit-when-absent pattern as _travel_to_row.
    # Omitting (not minting) keeps the PK stable across repeated upserts of
    # the same truck_id.
    if not row.get("id"):
        row.pop("id", None)
    row["sync_status"] = "synced"
    return row


def _row_to_asset(r: Dict[str, Any]) -> Dict[str, Any]:
    def _opt_float(key: str) -> Optional[float]:
        v = r.get(key)
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    return {
        "id": r.get("id"),
        "truck_id": r.get("truck_id"),
        "name": r.get("name"),
        "modality": r.get("modality") or "truck",
        "vin": r.get("vin"),
        "vehicle_golongan": r.get("vehicle_golongan") or "GOL_II",
        "driver_name": r.get("driver_name"),
        "driver_phone": r.get("driver_phone"),
        "company_id": r.get("company_id"),
        "company_name": r.get("company_name"),
        "gross_weight_ton": float(r.get("gross_weight_ton") or 0.0),
        "fuel_type": r.get("fuel_type") or "biosolar",
        "fuel_efficiency_kmpl": _opt_float("fuel_efficiency_kmpl"),
        "is_reefer": bool(r.get("is_reefer")) if r.get("is_reefer") is not None else False,
        "reefer_fuel_lph": _opt_float("reefer_fuel_lph"),
        "notes": r.get("notes"),
        "created_by": r.get("created_by"),
        "sync_status": r.get("sync_status") or "synced",
        "created_at": r.get("created_at"),
        "updated_at": r.get("updated_at"),
    }


def save_truck_asset(data: Dict[str, Any]) -> Dict[str, Any]:
    """Upsert a master truck asset (conflict key: truck_id).

    Supabase-first: omit id when absent so the 019 server default
    (gen_random_uuid()::text) fires — the PK then stays stable across
    repeated upserts of the same truck_id. Client mint (TRKASSET-*) is kept
    only as a retry fallback for remotes without the 019 default.
    """
    sb = _write_client()
    payload = dict(data)
    row = _asset_to_row(payload)
    try:
        sb.table("truck_assets").upsert(row, on_conflict="truck_id").execute()
    except Exception:
        # Retry fallback: mint client-side once (SQLite/offline shape) when
        # the server has no id default yet.
        if not row.get("id"):
            import uuid as _uuid

            row["id"] = payload.get("id") or f"TRKASSET-{_uuid.uuid4().hex[:10]}"
            sb.table("truck_assets").upsert(row, on_conflict="truck_id").execute()
        else:
            raise
    saved = get_truck_asset(payload["truck_id"])
    return saved or _row_to_asset({**row, "id": row.get("id") or payload.get("id")})


def get_truck_asset(truck_id: str) -> Optional[Dict[str, Any]]:
    """Fetch one master asset, case-insensitive on truck_id."""
    sb = _read_client()
    resp = (
        sb.table("truck_assets")
        .select("*")
        .ilike("truck_id", truck_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return _row_to_asset(rows[0]) if rows else None


def list_truck_assets(company_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """List master assets, newest first, optionally scoped to a tenant."""
    sb = _read_client()
    q = sb.table("truck_assets").select("*").order("created_at", desc=True)
    if company_id:
        q = q.eq("company_id", company_id)
    resp = q.execute()
    return [_row_to_asset(r) for r in (resp.data or [])]


def delete_truck_asset(truck_id: str) -> bool:
    """Delete a master asset (travels keep their historical snapshot)."""
    sb = _write_client()
    sb.table("truck_assets").delete().ilike("truck_id", truck_id).execute()
    return True


# ==========================================
# TRAVELS / RIT LEDGER
# ==========================================

def _travel_to_row(data: Dict[str, Any]) -> Dict[str, Any]:
    """Map the service-layer travel dict onto Supabase `travels` columns."""
    row: Dict[str, Any] = {
        "id": data.get("id"),
        "truck_id": data.get("truck_id"),
        "truck_name": data.get("truck_name"),
        "company_id": data.get("company_id"),
        "driver_name": data.get("driver_name"),
        "origin_name": data.get("origin_name"),
        "origin_ref": data.get("origin_ref"),
        "origin_coords": data.get("origin_coords") or [0.0, 0.0],
        "destination_name": data.get("destination_name"),
        "destination_ref": data.get("destination_ref"),
        "dest_coords": data.get("dest_coords") or [0.0, 0.0],
        "commodity_key": data.get("commodity_key"),
        "cargo_tonnage": data.get("cargo_tonnage"),
        "cargo_value_idr": data.get("cargo_value_idr") or 0,
        "cargo_value_source": data.get("cargo_value_source") or "declared",
        "vehicle_golongan": data.get("vehicle_golongan") or "GOL_II",
        "fuel_type": data.get("fuel_type") or "biosolar",
        "sla_deadline_hours": data.get("sla_deadline_hours") or 0,
        "baseline_distance_km": data.get("baseline_distance_km") or 0,
        "distance_source": data.get("distance_source") or "declared",
        "baseline_time_hours": data.get("baseline_time_hours") or 0,
        "blocked_delay_hours": data.get("blocked_delay_hours") or 0,
        "baseline_fuel_liters": data.get("baseline_fuel_liters") or 0,
        "baseline_toll_segments": data.get("baseline_toll_segments") or [],
        "baseline_fuel_cost_idr": data.get("baseline_fuel_cost_idr") or 0,
        "baseline_toll_cost_idr": data.get("baseline_toll_cost_idr") or 0,
        "baseline_spoilage_idr": data.get("baseline_spoilage_idr") or 0,
        "baseline_labor_idr": data.get("baseline_labor_idr") or 0,
        "baseline_cost_idr": data.get("baseline_cost_idr") or 0,
        "actual_time_hours": data.get("actual_time_hours") or 0,
        "actual_recorded": bool(data.get("actual_recorded")),
        "actual_fuel_liters": data.get("actual_fuel_liters") or 0,
        "actual_toll_segments": data.get("actual_toll_segments") or [],
        "actual_fuel_cost_idr": data.get("actual_fuel_cost_idr") or 0,
        "actual_toll_cost_idr": data.get("actual_toll_cost_idr") or 0,
        "actual_spoilage_idr": data.get("actual_spoilage_idr") or 0,
        "actual_labor_idr": data.get("actual_labor_idr") or 0,
        "actual_cost_idr": data.get("actual_cost_idr") or 0,
        "saved_time_hours": data.get("saved_time_hours") or 0,
        "saved_fuel_liters": data.get("saved_fuel_liters") or 0,
        "saved_fuel_cost_idr": data.get("saved_fuel_cost_idr") or 0,
        "saved_toll_idr": data.get("saved_toll_idr") or 0,
        "saved_spoilage_idr": data.get("saved_spoilage_idr") or 0,
        "saved_labor_idr": data.get("saved_labor_idr") or 0,
        "saved_cost_idr": data.get("saved_cost_idr") or 0,
        "efficiency_pct": data.get("efficiency_pct") or 0,
        "rerouted": bool(data.get("rerouted")),
        "disruption_id": data.get("disruption_id"),
        "status": data.get("status") or "planned",
        "inflation_shock_factor": data.get("inflation_shock_factor") or 0,
        "hedging": data.get("hedging"),
        "hedging_policy": data.get("hedging_policy"),
        "hedging_net_savings_idr": data.get("hedging_net_savings_idr"),
        "hedging_solved_at": data.get("hedging_solved_at"),
        "notes": data.get("notes"),
        "fuel_rate_used_idr": data.get("fuel_rate_used_idr") or 0,
        "fuel_sk_id": data.get("fuel_sk_id"),
        "fuel_source": data.get("fuel_source"),
        "fuel_efficiency_used_kmpl": data.get("fuel_efficiency_used_kmpl"),
        "reefer_fuel_lph_used": data.get("reefer_fuel_lph_used"),
        "fuel_effective_date": data.get("fuel_effective_date"),
        "fuel_sk_number": data.get("fuel_sk_number"),
        "fuel_efficiency_source": data.get("fuel_efficiency_source"),
        "fuel_load_factor": data.get("fuel_load_factor"),
        "created_by": data.get("created_by"),
        "sync_status": "synced",
        "delivered_at": data.get("delivered_at"),
    }
    # Drop the auto-PK only when absent so inserts let callers set DEMO-/RIT- ids.
    if not row["id"]:
        del row["id"]
    return row


def _row_to_travel(r: Dict[str, Any]) -> Dict[str, Any]:
    """Map a Supabase `travels` row back onto the service-layer travel dict."""
    def _f(key: str) -> float:
        try:
            return float(r.get(key) or 0.0)
        except (TypeError, ValueError):
            return 0.0

    hedging_net = r.get("hedging_net_savings_idr")
    return {
        "id": r.get("id"),
        "truck_id": r.get("truck_id"),
        "truck_name": r.get("truck_name"),
        "company_id": r.get("company_id"),
        "driver_name": r.get("driver_name"),
        "origin_name": r.get("origin_name"),
        "origin_ref": r.get("origin_ref"),
        "origin_coords": r.get("origin_coords") or [],
        "destination_name": r.get("destination_name"),
        "destination_ref": r.get("destination_ref"),
        "dest_coords": r.get("dest_coords") or [],
        "commodity_key": r.get("commodity_key"),
        "cargo_tonnage": _f("cargo_tonnage"),
        "cargo_value_idr": _f("cargo_value_idr"),
        "cargo_value_source": r.get("cargo_value_source") or "declared",
        "vehicle_golongan": r.get("vehicle_golongan") or "GOL_II",
        "fuel_type": r.get("fuel_type") or "biosolar",
        "sla_deadline_hours": _f("sla_deadline_hours"),
        "baseline_distance_km": _f("baseline_distance_km"),
        "distance_source": r.get("distance_source") or "declared",
        "baseline_time_hours": _f("baseline_time_hours"),
        "blocked_delay_hours": _f("blocked_delay_hours"),
        "baseline_fuel_liters": _f("baseline_fuel_liters"),
        "baseline_toll_segments": r.get("baseline_toll_segments") or [],
        "actual_toll_segments": r.get("actual_toll_segments") or [],
        "baseline_fuel_cost_idr": _f("baseline_fuel_cost_idr"),
        "baseline_toll_cost_idr": _f("baseline_toll_cost_idr"),
        "baseline_spoilage_idr": _f("baseline_spoilage_idr"),
        "baseline_labor_idr": _f("baseline_labor_idr"),
        "baseline_cost_idr": _f("baseline_cost_idr"),
        "actual_time_hours": _f("actual_time_hours"),
        "actual_recorded": bool(r.get("actual_recorded")),
        "actual_fuel_liters": _f("actual_fuel_liters"),
        "actual_fuel_cost_idr": _f("actual_fuel_cost_idr"),
        "actual_toll_cost_idr": _f("actual_toll_cost_idr"),
        "actual_spoilage_idr": _f("actual_spoilage_idr"),
        "actual_labor_idr": _f("actual_labor_idr"),
        "actual_cost_idr": _f("actual_cost_idr"),
        "saved_time_hours": _f("saved_time_hours"),
        "saved_fuel_liters": _f("saved_fuel_liters"),
        "saved_fuel_cost_idr": _f("saved_fuel_cost_idr"),
        "saved_toll_idr": _f("saved_toll_idr"),
        "saved_spoilage_idr": _f("saved_spoilage_idr"),
        "saved_labor_idr": _f("saved_labor_idr"),
        "saved_cost_idr": _f("saved_cost_idr"),
        "efficiency_pct": _f("efficiency_pct"),
        "rerouted": bool(r.get("rerouted")),
        "disruption_id": r.get("disruption_id"),
        "status": r.get("status") or "planned",
        "hedging": r.get("hedging"),
        "hedging_policy": r.get("hedging_policy"),
        "hedging_net_savings_idr": float(hedging_net) if hedging_net is not None else None,
        "hedging_solved_at": r.get("hedging_solved_at"),
        "notes": r.get("notes"),
        "fuel_rate_used_idr": _f("fuel_rate_used_idr"),
        "fuel_sk_id": r.get("fuel_sk_id"),
        "fuel_source": r.get("fuel_source"),
        "fuel_efficiency_used_kmpl": r.get("fuel_efficiency_used_kmpl"),
        "reefer_fuel_lph_used": r.get("reefer_fuel_lph_used"),
        "fuel_effective_date": r.get("fuel_effective_date"),
        "fuel_sk_number": r.get("fuel_sk_number"),
        "fuel_efficiency_source": r.get("fuel_efficiency_source"),
        "fuel_load_factor": r.get("fuel_load_factor"),
        "fuel_is_fallback": (str(r.get("fuel_source")) in ("PERTAMINA_FALLBACK", "legacy_3p5")) if r.get("fuel_source") is not None else None,
        "inflation_shock_factor": _f("inflation_shock_factor"),
        "created_by": r.get("created_by"),
        "sync_status": r.get("sync_status") or "synced",
        "created_at": r.get("created_at"),
        "updated_at": r.get("updated_at"),
        "delivered_at": r.get("delivered_at"),
    }


def save_travel(data: Dict[str, Any]) -> Dict[str, Any]:
    """Upsert one rit ledger row (conflict key: id).

    Supabase-first: omit id when absent so the 019 server default
    (gen_random_uuid()::text) fires — no client pre-mint, so repeated saves
    never rotate the PK. Client mint (RIT-*) is kept only as a retry
    fallback for remotes without the 019 default.
    """
    sb = _write_client()
    payload = dict(data)
    row = _travel_to_row(payload)
    travel_id = row.get("id") or payload.get("id")
    if not travel_id:
        # No id yet: insert (no conflict key to upsert on) and return the
        # server-minted row from the insert response.
        try:
            resp = sb.table("travels").insert(row).execute()
        except Exception:
            import uuid as _uuid

            travel_id = f"RIT-{_uuid.uuid4().hex[:10]}"
            row["id"] = travel_id
            sb.table("travels").upsert(row, on_conflict="id").execute()
            saved = get_travel(travel_id)
            return saved or _row_to_travel({**row})
        rows = (resp.data or []) if resp else []
        if rows:
            return _row_to_travel(rows[0])
        return _row_to_travel({**row})
    sb.table("travels").upsert(row, on_conflict="id").execute()
    saved = get_travel(travel_id)
    return saved or _row_to_travel({**row})


def get_travel(travel_id: str) -> Optional[Dict[str, Any]]:
    """Fetch one rit by id."""
    sb = _read_client()
    resp = sb.table("travels").select("*").eq("id", travel_id).limit(1).execute()
    rows = resp.data or []
    return _row_to_travel(rows[0]) if rows else None


# Lightweight column projection for list/aggregate paths (Phase 5 perf).
# Full rows carry heavy JSONB (origin_coords, dest_coords, toll segments,
# hedging) that the ERP aggregate and regulator views never need — selecting
# only these keeps list payloads small. `include_trips=False` callers
# (REGULATOR_AGGREGATE) must use this projection.
_TRAVEL_LIGHT_COLUMNS = (
    "id, truck_id, truck_name, company_id, driver_name, origin_name, "
    "destination_name, commodity_key, cargo_tonnage, cargo_value_idr, "
    "sla_deadline_hours, baseline_cost_idr, baseline_time_hours, "
    "actual_cost_idr, actual_time_hours, actual_recorded, "
    "saved_time_hours, saved_fuel_liters, saved_cost_idr, saved_fuel_cost_idr, "
    "saved_toll_idr, saved_spoilage_idr, saved_labor_idr, efficiency_pct, "
    "rerouted, disruption_id, status, hedging_policy, "
    "hedging_net_savings_idr, created_at, updated_at, delivered_at"
)

# Numeric-only projection for server-side ERP aggregation (Phase 5 perf):
# no names, no timestamps, no JSONB — just the SUM/COUNT inputs.
_TRAVEL_NUMERIC_COLUMNS = (
    "company_id, status, rerouted, saved_cost_idr, baseline_cost_idr, "
    "actual_cost_idr, saved_time_hours, saved_fuel_liters, saved_fuel_cost_idr, "
    "saved_toll_idr, saved_spoilage_idr, saved_labor_idr, "
    "sla_deadline_hours, actual_time_hours"
)


def list_travels(
    company_id: Optional[str] = None,
    status: Optional[str] = None,
    truck_id: Optional[str] = None,
    limit: int = 500,
    include_trips: bool = True,
) -> List[Dict[str, Any]]:
    """List rits newest first, filtered by tenant / status / truck.

    `include_trips=False` selects only the light (non-JSONB) columns — for
    aggregate callers that never need coords/toll-segment/hedging payloads.
    Ordered by the composite (company_id, created_at desc) hint so the
    `idx_travels_company_created` index serves tenant-scoped lists.
    """
    sb = _read_client()
    cols = "*" if include_trips else _TRAVEL_LIGHT_COLUMNS
    # Composite order hint (company_id, created_at desc) matches the
    # migration-022 composite index; tenant lists become an index range scan.
    q = sb.table("travels").select(cols).order("company_id").order("created_at", desc=True).limit(limit)
    if company_id:
        q = q.eq("company_id", company_id)
    if status:
        q = q.eq("status", status)
    if truck_id:
        q = q.ilike("truck_id", truck_id)
    resp = q.execute()
    return [_row_to_travel(r) for r in (resp.data or [])]


def count_travels(
    company_id: Optional[str] = None,
    status: Optional[str] = None,
) -> int:
    """Exact COUNT(*) for the ledger (used for ERP total + limit windows)."""
    sb = _read_client()
    try:
        q = sb.table("travels").select("id", count="exact").limit(1)
        if company_id:
            q = q.eq("company_id", company_id)
        if status:
            q = q.eq("status", status)
        resp = q.execute()
        total = getattr(resp, "count", None)
        if isinstance(total, int):
            return total
        return len(resp.data or [])
    except Exception as exc:
        logger.warning("Supabase travels count failed: %s", exc)
        return -1


def list_travels_numeric(
    company_id: Optional[str] = None,
    limit: int = 1000,
) -> List[Dict[str, Any]]:
    """Numeric-only projection for ERP aggregation (no JSONB, no names)."""
    sb = _read_client()
    q = (
        sb.table("travels")
        .select(_TRAVEL_NUMERIC_COLUMNS)
        .order("company_id")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if company_id:
        q = q.eq("company_id", company_id)
    resp = q.execute()
    return list(resp.data or [])


def delete_travel(travel_id: str) -> bool:
    """Delete one rit from the Supabase ledger."""
    sb = _write_client()
    sb.table("travels").delete().eq("id", travel_id).execute()
    return True
