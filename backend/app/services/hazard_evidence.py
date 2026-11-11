"""Shared, conservative hazard-evidence contract for route decisions.

Contract ``hazard-evidence-v1`` deliberately separates verified blockage from
forecast/uncertain risk and from missing or stale evidence. Geometry is never
expanded to a guessed default radius.
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

HAZARD_EVIDENCE_VERSION = "hazard-evidence-v1"
MAX_OBSERVATION_AGE = timedelta(hours=6)
POINT_MATCH_TOLERANCE_KM = 0.1

_CONFIRMED = "CONFIRMED_BLOCKAGE"
_PRECAUTIONARY = "PRECAUTIONARY_RISK"
_UNKNOWN = "UNKNOWN"
_CLEAR = "CLEAR"
_ACTIVE_STATUSES = {"active", "validated", "confirmed", "open", "ongoing"}
_OFFICIAL_SOURCES = {
    "bpjt", "bnpb", "bmkg", "polri", "kepolisian", "kemenhub",
    "kementerian perhubungan", "dishub", "pelindo", "bkhit", "basarnas",
}
_ROAD_IMPACT_TYPES = {
    "road_closure", "flood", "landslide", "earthquake", "wildfire",
    "volcanic_eruption", "other_disruption", "congestion",
}


def _parse_json(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return None
    return value


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    return isinstance(value, str) and value.strip().lower() in {"1", "true", "yes", "verified", "confirmed"}


def _as_utc(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _walk_evidence(value: Any) -> Iterable[Dict[str, Any]]:
    """Yield evidence dictionaries without interpreting descriptive prose."""
    value = _parse_json(value)
    if isinstance(value, dict):
        yield value
        for child in value.values():
            if isinstance(child, (dict, list, tuple)):
                yield from _walk_evidence(child)
    elif isinstance(value, (list, tuple)):
        for child in value:
            yield from _walk_evidence(child)


def _source_names(row: Dict[str, Any], evidence: Any) -> List[str]:
    names: List[str] = []
    for item in [row, *_walk_evidence(evidence)]:
        for key in ("source", "source_name", "publisher", "agency", "source_type"):
            raw = item.get(key)
            if isinstance(raw, str) and raw.strip():
                names.append(raw.strip().lower())
    return list(dict.fromkeys(names))


def _is_official(sources: Sequence[str], row: Dict[str, Any], evidence_items: Sequence[Dict[str, Any]]) -> bool:
    if _truthy(row.get("official_source")) or _truthy(row.get("is_official")):
        return True
    for item in evidence_items:
        if _truthy(item.get("official_source")) or _truthy(item.get("is_official")):
            return True
    normalized = [source.replace("https://", "").replace("http://", "").split("/")[0] for source in sources]
    return any(
        source == official or source.startswith(official + ".")
        or source.startswith(official + ":") or source.startswith(official + " ")
        for source in normalized for official in _OFFICIAL_SOURCES
    )


def _geometry(row: Dict[str, Any]) -> Any:
    return row.get("geometry") or row.get("polygon") or row.get("affected_area") or row.get("affected_polygon")


def _has_observed_geometry(row: Dict[str, Any], evidence_items: Sequence[Dict[str, Any]]) -> bool:
    provenance = str(
        row.get("geometry_provenance") or row.get("geometry_source") or ""
    ).strip().lower()
    for item in evidence_items:
        provenance = provenance or str(
            item.get("geometry_provenance") or item.get("geometry_source") or ""
        ).strip().lower()
    if provenance in {"generated", "modeled", "estimated", "synthetic", "inferred"}:
        return False
    observed_markers = {"observed", "official", "surveyed", "source_footprint", "measured"}
    if provenance in observed_markers:
        return _geometry(row) is not None
    for item in [row, *evidence_items]:
        if _truthy(item.get("geometry_observed")) or _truthy(item.get("footprint_verified")):
            return _geometry(row) is not None
    return False


def normalize_hazard_evidence(
    hazard: Dict[str, Any],
    *,
    now: Optional[datetime] = None,
    max_age: timedelta = MAX_OBSERVATION_AGE,
) -> Dict[str, Any]:
    """Normalize a raw incident into the shared v1 evidence shape.

    Official, current road closures can be hard exclusions only when they have
    a source footprint (an observed polygon or observed source point). Other
    impacts require explicit physical verification and corroboration. Forecast,
    modeled, generated-geometry, stale and unproven inputs cannot become blocks.
    """
    row = hazard if isinstance(hazard, dict) else {}
    evidence = _parse_json(row.get("evidence"))
    evidence_items = list(_walk_evidence(evidence))
    prior_contract = row.get("hazard_evidence")
    if isinstance(prior_contract, dict) and prior_contract.get("version") == HAZARD_EVIDENCE_VERSION:
        evidence_items.append(prior_contract)
    sources = _source_names(row, evidence)
    prior_source_names = prior_contract.get("source_names", []) if isinstance(prior_contract, dict) else []
    for source_name in prior_source_names:
        if isinstance(source_name, str) and source_name.strip():
            sources.append(source_name.strip().lower())
    sources = list(dict.fromkeys(sources))
    now_utc = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    incident_id = str(row.get("incident_id") or row.get("id") or "").strip()
    if not incident_id:
        identity = json.dumps(
            {
                "type": row.get("type") or row.get("incident_type"),
                "lat": row.get("lat"),
                "lon": row.get("lon"),
                "observed_at": row.get("observed_at") or row.get("updated_at"),
                "source": sources,
            },
            sort_keys=True,
            default=str,
        )
        incident_id = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]

    evidence_times = [
        item.get(key)
        for item in evidence_items
        for key in ("observed_at", "reported_at", "event_time", "published_at")
        if item.get(key)
    ]
    observed_at = _as_utc(
        row.get("observed_at") or row.get("reported_at") or row.get("event_time")
        or row.get("published_at") or next(iter(evidence_times), None)
    )
    valid_until = _as_utc(row.get("valid_until") or row.get("expires_at") or row.get("forecast_valid_until"))
    status = str(row.get("status") or "").strip().lower()
    hazard_type = str(row.get("type") or row.get("incident_type") or row.get("hazard_type") or "unknown").strip().lower()
    is_simulated = _truthy(row.get("is_simulated")) or any(_truthy(item.get("is_simulated")) for item in evidence_items)
    is_forecast = (
        _truthy(row.get("is_forecast")) or _truthy(row.get("modeled"))
        or bool(row.get("forecast_valid_until"))
        or any(_truthy(item.get("is_forecast")) or _truthy(item.get("modeled")) for item in evidence_items)
        or "forecast" in hazard_type or "modeled" in hazard_type
        or any("forecast" in source or "model" in source for source in sources)
    )
    current = (
        observed_at is not None
        and observed_at <= now_utc + timedelta(minutes=5)
        and now_utc - observed_at <= max_age
        and (valid_until is None or valid_until >= now_utc)
        and status in _ACTIVE_STATUSES
        and not is_simulated
    )

    geometry = _geometry(row)
    observed_geometry = _has_observed_geometry(row, evidence_items)
    try:
        lat = float(row["lat"]) if row.get("lat") is not None else None
        lon = float(row["lon"]) if row.get("lon") is not None else None
        if lat is not None and (not math.isfinite(lat) or not -90 <= lat <= 90):
            lat = None
        if lon is not None and (not math.isfinite(lon) or not -180 <= lon <= 180):
            lon = None
    except (TypeError, ValueError):
        lat = lon = None

    point_footprint = lat is not None and lon is not None and _is_official(sources, row, evidence_items)
    geometry_provenance = "observed" if observed_geometry else "generated" if geometry is not None else "unknown"
    footprint_available = (observed_geometry and geometry is not None) or point_footprint

    confidence_raw = row.get("confidence")
    try:
        confidence = float(confidence_raw) if confidence_raw is not None and confidence_raw != "" else None
    except (TypeError, ValueError):
        confidence = None
    if confidence is not None and not math.isfinite(confidence):
        confidence = None

    physical_verified = any(
        _truthy(item.get(key))
        for item in [row, *evidence_items]
        for key in ("impact_verified", "physical_impact_verified", "physical_blockage_confirmed")
    )
    corroborated = any(
        _truthy(item.get("impact_corroborated"))
        or _truthy(item.get("corroborated"))
        or _truthy(item.get("independent_sources_count", 0) >= 2 if isinstance(item.get("independent_sources_count"), (int, float)) else False)
        for item in [row, *evidence_items]
    )
    verified_impact = (
        hazard_type in _ROAD_IMPACT_TYPES
        and physical_verified and corroborated
        and confidence is not None and confidence >= 0.85
        and observed_geometry
    )
    official_closure = hazard_type in {"road_closure", "port_closure"} and _is_official(sources, row, evidence_items)
    is_advisory = (
        str(row.get("tier") or "").upper() == "ADVISORY"
        or str(row.get("geometry_role") or "").lower() == "advisory_area"
        or _truthy(row.get("is_advisory"))
    )

    if not current:
        classification = _UNKNOWN
        reason = "stale_or_missing_current_source_evidence"
    elif is_advisory:
        classification = _PRECAUTIONARY
        reason = "advisory_warning_area"
    elif is_forecast:
        classification = _PRECAUTIONARY
        reason = "forecast_or_modeled_risk"
    elif (official_closure and footprint_available) or verified_impact:
        classification = _CONFIRMED
        reason = "official_current_closure" if official_closure else "corroborated_physical_impact"
    elif geometry is not None and geometry_provenance == "generated":
        classification = _PRECAUTIONARY
        reason = "generated_geometry_is_not_a_confirmed_footprint"
    elif hazard_type == "road_closure" and lat is not None and lon is not None:
        classification = _PRECAUTIONARY
        reason = "current_report_point_without_official_or_corroborated_verification"
    elif row.get("center") and row.get("radiusKm", row.get("radius_km")) is not None:
        classification = _PRECAUTIONARY
        reason = "unverified_circle_input"
    else:
        classification = _UNKNOWN
        reason = "insufficient_verification_or_footprint"

    return {
        "evidence_id": f"{HAZARD_EVIDENCE_VERSION}:{incident_id}",
        "version": HAZARD_EVIDENCE_VERSION,
        "incident_id": incident_id,
        "classification": classification,
        "reason": reason,
        "hazard_type": hazard_type,
        "tier": row.get("tier"),
        "is_advisory": is_advisory,
        "geometry_role": row.get("geometry_role"),
        "source_names": sources,
        "observed_at": observed_at.isoformat() if observed_at else None,
        "valid_until": valid_until.isoformat() if valid_until else None,
        "is_current": current,
        "is_forecast": is_forecast,
        "is_simulated": is_simulated,
        "confidence": confidence,
        "official_source": _is_official(sources, row, evidence_items),
        "geometry": geometry,
        "geometry_provenance": geometry_provenance,
        "point": [lon, lat] if point_footprint else None,
        "risk_center": _normalize_center(row.get("center"), lon, lat),
        "radius_km": _explicit_radius(row),
    }


def _normalize_center(raw: Any, lon: Optional[float], lat: Optional[float]) -> Optional[List[float]]:
    if isinstance(raw, (list, tuple)) and len(raw) >= 2:
        try:
            x, y = float(raw[0]), float(raw[1])
            if math.isfinite(x) and math.isfinite(y) and -180 <= x <= 180 and -90 <= y <= 90:
                return [x, y]
        except (TypeError, ValueError):
            return None
    return [lon, lat] if lon is not None and lat is not None else None


def _explicit_radius(row: Dict[str, Any]) -> Optional[float]:
    raw = row.get("radius_km", row.get("radiusKm"))
    try:
        value = float(raw) if raw is not None and raw != "" else None
    except (TypeError, ValueError):
        return None
    if value is None:
        return None
    return value if math.isfinite(value) and value > 0 else None


def _point_in_ring(point: Tuple[float, float], ring: Sequence[Sequence[float]]) -> bool:
    x, y = point
    inside = False
    if len(ring) < 3:
        return False
    j = len(ring) - 1
    for i, current in enumerate(ring):
        previous = ring[j]
        xi, yi = float(current[0]), float(current[1])
        xj, yj = float(previous[0]), float(previous[1])
        if (yi > y) != (yj > y):
            cross_x = (xj - xi) * (y - yi) / ((yj - yi) or 1e-15) + xi
            if x < cross_x:
                inside = not inside
        j = i
    return inside


def _orientation(a: Sequence[float], b: Sequence[float], c: Sequence[float]) -> float:
    return (float(b[0]) - float(a[0])) * (float(c[1]) - float(a[1])) - (float(b[1]) - float(a[1])) * (float(c[0]) - float(a[0]))


def _segments_intersect(a: Sequence[float], b: Sequence[float], c: Sequence[float], d: Sequence[float]) -> bool:
    o1, o2 = _orientation(a, b, c), _orientation(a, b, d)
    o3, o4 = _orientation(c, d, a), _orientation(c, d, b)

    def on_segment(p: Sequence[float], q: Sequence[float], r: Sequence[float]) -> bool:
        return (
            min(float(p[0]), float(r[0])) <= float(q[0]) <= max(float(p[0]), float(r[0]))
            and min(float(p[1]), float(r[1])) <= float(q[1]) <= max(float(p[1]), float(r[1]))
        )

    if (o1 < 0) != (o2 < 0) and (o3 < 0) != (o4 < 0):
        return True
    return (
        (o1 == 0 and on_segment(a, c, b))
        or (o2 == 0 and on_segment(a, d, b))
        or (o3 == 0 and on_segment(c, a, d))
        or (o4 == 0 and on_segment(c, b, d))
    )


def _polygon_rings(geometry: Any) -> List[List[List[float]]]:
    if not isinstance(geometry, dict):
        return []
    kind, coordinates = geometry.get("type"), geometry.get("coordinates")
    if kind == "Polygon" and isinstance(coordinates, list):
        return [r for r in coordinates if isinstance(r, list)]
    if kind == "MultiPolygon" and isinstance(coordinates, list):
        return [ring for polygon in coordinates if isinstance(polygon, list) for ring in polygon if isinstance(ring, list)]
    return []


def route_intersects_geometry(route: Sequence[Sequence[float]], geometry: Any) -> bool:
    """Exact 2D route/polyline intersection against supplied polygon footprint."""
    rings = _polygon_rings(geometry)
    if not rings or len(route) < 1:
        return False
    outer_rings = rings[::]  # Polygon holes are conservatively treated as footprint.
    if any(_point_in_ring((float(point[0]), float(point[1])), ring) for point in route for ring in outer_rings):
        return True
    for start, end in zip(route, route[1:]):
        for ring in rings:
            for edge_start, edge_end in zip(ring, ring[1:]):
                if _segments_intersect(start, end, edge_start, edge_end):
                    return True
    return False


def _point_to_segment_km(point: Sequence[float], start: Sequence[float], end: Sequence[float]) -> float:
    lat0 = math.radians((float(start[1]) + float(end[1]) + float(point[1])) / 3.0)
    scale_x = 111.32 * max(0.01, math.cos(lat0))
    ax, ay = float(start[0]) * scale_x, float(start[1]) * 111.32
    bx, by = float(end[0]) * scale_x, float(end[1]) * 111.32
    px, py = float(point[0]) * scale_x, float(point[1]) * 111.32
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq)) if length_sq else 0.0
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def route_intersects_point(route: Sequence[Sequence[float]], point: Sequence[float]) -> bool:
    if len(point) < 2 or not route:
        return False
    if len(route) == 1:
        return _point_to_segment_km(point, route[0], route[0]) <= POINT_MATCH_TOLERANCE_KM
    return any(
        _point_to_segment_km(point, start, end) <= POINT_MATCH_TOLERANCE_KM
        for start, end in zip(route, route[1:])
    )


def assess_route_hazards(
    route: Sequence[Sequence[float]],
    evidence_items: Sequence[Dict[str, Any]],
    *,
    coverage_status: str = "unknown",
) -> Dict[str, Any]:
    """Assess route clearance without converting missing evidence to clear."""
    encountered: List[Dict[str, Any]] = []
    penalty = 0.0
    for item in evidence_items:
        classification = item.get("classification", _UNKNOWN)
        geometry = item.get("geometry")
        point = item.get("point")
        radius = item.get("radius_km")
        intersects = route_intersects_geometry(route, geometry)
        if not intersects and point:
            intersects = route_intersects_point(route, point)
        risk_center = item.get("risk_center") or point
        if not intersects and risk_center and classification == _PRECAUTIONARY:
            intersects = route_intersects_point(route, risk_center)
        if not intersects and radius and risk_center and len(route) > 1:
            intersects = any(
                _point_to_segment_km(risk_center, start, end) <= float(radius)
                for start, end in zip(route, route[1:])
            )
        if intersects:
            encountered.append(item)
            if classification == _CONFIRMED:
                return {
                    "status": "BLOCKED", "clearance_status": "BLOCKED",
                    "risk_score": 1.0, "evidence_ids": [item.get("evidence_id")],
                    "evidence_version": HAZARD_EVIDENCE_VERSION,
                    "reason": item.get("reason"),
                }
            if classification == _PRECAUTIONARY:
                penalty = max(penalty, 0.35 if item.get("is_forecast") else 0.25)
            elif classification == _UNKNOWN:
                return {
                    "status": _UNKNOWN, "clearance_status": "REVIEW", "risk_score": None,
                    "evidence_ids": [item.get("evidence_id")],
                    "evidence_version": HAZARD_EVIDENCE_VERSION,
                    "reason": item.get("reason") or "hazard evidence unknown",
                }

    if encountered:
        return {
            "status": "PRECAUTIONARY_RISK", "clearance_status": "REVIEW",
            "risk_score": penalty, "evidence_ids": [item.get("evidence_id") for item in encountered],
            "evidence_version": HAZARD_EVIDENCE_VERSION,
            "reason": "; ".join(dict.fromkeys(str(item.get("reason") or "uncertain hazard") for item in encountered)),
        }
    if str(coverage_status).lower() in {"complete", "verified_complete"} and all(
        item.get("classification") != _UNKNOWN for item in evidence_items
    ):
        return {
            "status": _CLEAR, "clearance_status": _CLEAR, "risk_score": 0.0,
            "evidence_ids": [item.get("evidence_id") for item in evidence_items],
            "evidence_version": HAZARD_EVIDENCE_VERSION,
            "reason": "complete_current_evidence_no_intersection",
        }
    return {
        "status": _UNKNOWN, "clearance_status": "REVIEW", "risk_score": None,
        "evidence_ids": [item.get("evidence_id") for item in evidence_items],
        "evidence_version": HAZARD_EVIDENCE_VERSION,
        "reason": "hazard_coverage_or_current_evidence_unknown",
    }
