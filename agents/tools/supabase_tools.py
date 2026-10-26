import logging
import asyncio
import json
import math
import re
import struct
import uuid
from typing import List, Dict, Tuple, Any, Optional
from datetime import datetime, timezone
from app.db.supabase_client import (
    SUPABASE_WRITE_DISABLED_SOURCE,
    get_client,
    get_write_client,
    is_write_configured,
)
from agents.state import CrisisState

logger = logging.getLogger(__name__)

_INCIDENT_SOURCE = "supabase.incidents"
_VALID_SEVERITIES = {"low", "medium", "high", "critical"}

# Columns refreshed on an idempotent replay (same incident_id / crisis_id).
# ``incident_id`` itself is the conflict target and is never in the SET clause.
# WS-A forecast columns ride along so a replayed crisis refreshes its stored
# forecast instead of leaving a stale pred_prob behind.
_FORECAST_COLUMNS = (
    "pred_prob",
    "raw_prob",
    "p_max",
    "weights_version",
    "active_sources",
    "forecast_created_at",
)

_INCIDENT_UPDATE_FIELDS = (
    "title",
    "description",
    "type",
    "severity",
    "status",
    "confidence",
    "lat",
    "lon",
    "location",
    "affected_area",
    "recommendations",
    "evidence",
    "updated_at",
) + _FORECAST_COLUMNS


def _coerce_float(value: Any) -> Optional[float]:
    """Best-effort float conversion; returns None for blank/non-finite input."""
    if value is None or value == "":
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _incident_key(value: Any) -> str:
    """Normalize crisis_id to a TEXT incident key (UUID passthrough, else UUIDv5)."""
    raw = str(value).strip() if value is not None else ""
    if not raw:
        return str(uuid.uuid4())
    try:
        return str(uuid.UUID(raw))
    except (ValueError, AttributeError, TypeError):
        return str(uuid.uuid5(uuid.NAMESPACE_URL, f"prehub:crisis:{raw}"))


def _to_ewkt_polygon(raw: Any) -> Optional[str]:
    """Convert a GeoJSON Polygon/ring (or existing WKT/EWKT) to PostGIS EWKT."""
    if not raw:
        return None
    if isinstance(raw, str):
        text = raw.strip()
        if text.upper().startswith(("SRID=", "POLYGON", "MULTIPOLYGON")):
            return text
        return None
    ring = raw
    if isinstance(raw, dict):
        geometry = raw.get("geometry") if isinstance(raw.get("geometry"), dict) else raw
        coords = geometry.get("coordinates")
        if not coords:
            return None
        if geometry.get("type") == "MultiPolygon" and isinstance(coords[0], (list, tuple)):
            coords = coords[0]
        if not isinstance(coords[0], (list, tuple)):
            return None
        ring = coords[0]
    if not isinstance(ring, (list, tuple)) or len(ring) < 3:
        return None
    points: List[Tuple[float, float]] = []
    for point in ring:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            return None
        x = _coerce_float(point[0])
        y = _coerce_float(point[1])
        if x is None or y is None:
            return None
        points.append((x, y))
    if len(points) < 3:
        return None
    if points[0] != points[-1]:
        points.append(points[0])
    return "SRID=4326;POLYGON(({}))".format(
        ", ".join(f"{x} {y}" for x, y in points)
    )


# ---------------------------------------------------------------------------
# Geometry -> GeoJSON normalization
#
# PostgREST returns PostGIS ``geometry`` columns as WKB/EWKB hex (``0103000020E6...``),
# which no frontend map can consume. ``get_hazard_polygons`` always emits a GeoJSON
# Polygon/MultiPolygon (or ``None`` when the stored value is empty/invalid) so a bad
# row can never break the deck.gl / Mapbox polygon layer.
# ---------------------------------------------------------------------------

_WKB_SRID_FLAG = 0x20000000
_WKB_Z_FLAG = 0x80000000
_WKB_M_FLAG = 0x40000000
_WKB_BASE_MASK = 0x1FFFFFFF

# Polygon base geometry types in the OGC/PostGIS type registry.
_WKB_POLYGON = 3
_WKB_MULTIPOLYGON = 6
_WKB_GEOMETRYCOLLECTION = 7

_HEX_RE = re.compile(r"^(?:\\x)?([0-9a-fA-F]{16,})$")
_WKT_HEADER_RE = re.compile(
    r"^(?:SRID=\d+;)?\s*(MULTIPOLYGON|POLYGON|GEOMETRYCOLLECTION)\s*",
    re.IGNORECASE,
)
_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?")


class _WKBReader:
    """Minimal endian-aware WKB/EWKB reader (stdlib only, no shapely)."""

    def __init__(self, data: bytes) -> None:
        self.data = data
        self.pos = 0

    def _take(self, size: int) -> bytes:
        end = self.pos + size
        if end > len(self.data):
            raise ValueError("truncated WKB payload")
        chunk = self.data[self.pos:end]
        self.pos = end
        return chunk

    def byte(self) -> int:
        return self._take(1)[0]

    def uint32(self, little: bool) -> int:
        return struct.unpack("<I" if little else ">I", self._take(4))[0]

    def double(self, little: bool) -> float:
        return struct.unpack("<d" if little else ">d", self._take(8))[0]

    def point(self, little: bool, has_z: bool, has_m: bool) -> List[float]:
        x = self.double(little)
        y = self.double(little)
        if has_z:
            self.double(little)
        if has_m:
            self.double(little)
        return [x, y]

    def geometry(self) -> Optional[Dict[str, Any]]:
        little = self.byte() == 1
        type_int = self.uint32(little)
        has_z = bool(type_int & _WKB_Z_FLAG)
        has_m = bool(type_int & _WKB_M_FLAG)
        has_srid = bool(type_int & _WKB_SRID_FLAG)
        base = type_int & _WKB_BASE_MASK
        if base >= 1000:  # ISO WKB encodes Z/M as +1000/+2000/+3000
            iso, base = divmod(base, 1000)
            has_z = has_z or iso in (1, 3)
            has_m = has_m or iso in (2, 3)
        if has_srid:
            self.uint32(little)

        if base == 3:  # Polygon
            rings: List[List[List[float]]] = []
            for _ in range(self.uint32(little)):
                ring = [self.point(little, has_z, has_m) for _ in range(self.uint32(little))]
                rings.append(ring)
            return {"type": "Polygon", "coordinates": rings}

        if base == 6:  # MultiPolygon
            polygons = []
            for _ in range(self.uint32(little)):
                sub = self.geometry()
                if isinstance(sub, dict) and sub.get("type") == "Polygon":
                    polygons.append(sub.get("coordinates"))
            return {"type": "MultiPolygon", "coordinates": polygons}

        if base == _WKB_GEOMETRYCOLLECTION:
            geometries = []
            for _ in range(self.uint32(little)):
                sub = self.geometry()
                if isinstance(sub, dict):
                    geometries.append(sub)
            return {"type": "GeometryCollection", "geometries": geometries}

        return None  # Point/LineString/etc. cannot become a hazard polygon


def _parse_wkb_hex(value: str) -> Optional[Dict[str, Any]]:
    match = _HEX_RE.match(value.strip())
    if not match:
        return None
    try:
        reader = _WKBReader(bytes.fromhex(match.group(1)))
        return reader.geometry()
    except (ValueError, struct.error, TypeError):
        return None


def _parse_wkt(value: str) -> Optional[Dict[str, Any]]:
    """Parse the POLYGON/MULTIPOLYGON subset of WKT/EWKT."""
    header = _WKT_HEADER_RE.match(value.strip())
    if not header:
        return None
    geom_type = header.group(1).upper()
    body = value.strip()[header.end():]
    rings = []
    for ring_text in re.findall(r"\(([^()]*)\)", body):
        numbers = [float(n) for n in _NUMBER_RE.findall(ring_text)]
        ring = [[numbers[i], numbers[i + 1]] for i in range(0, len(numbers) - 1, 2)]
        if len(ring) >= 3:
            rings.append(ring)
    if not rings:
        return None
    if geom_type == "POLYGON":
        # A POLYGON may carry holes; the outer ring is enough for a hazard overlay.
        return {"type": "Polygon", "coordinates": rings}
    # MULTIPOLYGON: first ring group is the drawable hazard footprint.
    return {"type": "Polygon", "coordinates": [rings[0]]}


def _valid_ring(raw: Any) -> Optional[List[List[float]]]:
    """Validate + close a [[lon, lat], ...] ring; None when it cannot be drawn."""
    if not isinstance(raw, (list, tuple)) or len(raw) < 3:
        return None
    ring: List[List[float]] = []
    for point in raw:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            return None
        lon = _coerce_float(point[0])
        lat = _coerce_float(point[1])
        if lon is None or lat is None:
            return None
        ring.append([lon, lat])
    if len(ring) < 3:
        return None
    if ring[0] != ring[-1]:
        ring.append(list(ring[0]))
    return ring


def _normalize_geojson_polygon(raw: Any) -> Optional[Dict[str, Any]]:
    """Coerce GeoJSON / GeoJSON-string / WKB-hex / WKT / ring-array to a GeoJSON polygon.

    Returns ``None`` for empty, unparseable or non-areal geometry so callers can
    degrade honestly instead of forwarding a value the map would choke on.
    """
    if raw is None or raw == "":
        return None

    if isinstance(raw, dict):
        if "geometry" in raw and isinstance(raw["geometry"], dict):
            return _normalize_geojson_polygon(raw["geometry"])
        declared_type = str(raw.get("type") or "").strip().lower()
        if declared_type in {"point", "multipoint", "linestring", "multilinestring"}:
            return None  # cannot be drawn as a hazard area
        if raw.get("type") == "FeatureCollection":
            for feature in raw.get("features") or []:
                polygon = _normalize_geojson_polygon(feature)
                if polygon:
                    return polygon
            return None
        if raw.get("type") == "GeometryCollection":
            for geometry in raw.get("geometries") or []:
                polygon = _normalize_geojson_polygon(geometry)
                if polygon:
                    return polygon
            return None
        coordinates = raw.get("coordinates")

    elif isinstance(raw, str):
        text = raw.strip()
        if text.startswith("{"):
            try:
                return _normalize_geojson_polygon(json.loads(text))
            except (ValueError, TypeError):
                return None
        if text.upper().startswith(("SRID=", "POLYGON", "MULTIPOLYGON", "GEOMETRYCOLLECTION")):
            return _normalize_geojson_polygon(_parse_wkt(text))
        return _normalize_geojson_polygon(_parse_wkb_hex(text))

    elif isinstance(raw, (list, tuple)):
        coordinates = raw

    else:
        return None

    if not isinstance(coordinates, (list, tuple)) or not coordinates:
        return None

    # A bare ring: [[lon, lat], ...]
    if isinstance(coordinates[0], (list, tuple)) and coordinates[0] and isinstance(
        coordinates[0][0], (int, float)
    ):
        ring = _valid_ring(coordinates)
        return {"type": "Polygon", "coordinates": [ring]} if ring else None

    # A list of rings (Polygon coordinates) or a list of polygons (MultiPolygon).
    first = coordinates[0]
    if isinstance(first, (list, tuple)) and first and isinstance(first[0], (list, tuple)):
        if first[0] and isinstance(first[0][0], (int, float)):
            rings = [r for r in (_valid_ring(item) for item in coordinates) if r]
            return {"type": "Polygon", "coordinates": rings} if rings else None
        polygons = []
        for polygon in coordinates:
            if isinstance(polygon, (list, tuple)) and polygon:
                ring = _valid_ring(polygon[0])
                if ring:
                    polygons.append([ring])
        if not polygons:
            return None
        if len(polygons) == 1:
            return {"type": "Polygon", "coordinates": polygons[0]}
        return {"type": "MultiPolygon", "coordinates": polygons}

    return None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km, clamped so floating point never raises."""
    earth_radius_km = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * earth_radius_km * math.asin(math.sqrt(min(1.0, max(0.0, a))))


def _extract_incident_id(res: Any, fallback: str) -> str:
    """Return the persisted incident id, tolerating minimal/empty PostgREST responses."""
    rows = getattr(res, "data", None)
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        return str(rows[0].get("incident_id") or rows[0].get("id") or fallback)
    return fallback


def _strip_forecast_columns(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Return the payload without WS-A forecast columns (pre-migration fallback)."""
    return {k: v for k, v in payload.items() if k not in _FORECAST_COLUMNS}


def _forecast_provenance(state: CrisisState) -> Dict[str, Any]:
    """Derive stored-forecast columns from state WITHOUT recomputing consensus.

    graph.py's consensus_gate_node keeps only ``overall_confidence`` (calibrated
    P) and ``consensus_breakdown`` (the stored w_k*p_k channel terms) on state,
    so the raw independence product is recovered exactly from those terms:
    ``raw = 1 - prod(1 - v_k)``. Breakdown values are rounded to 4dp, so the
    recovery carries at most ~1e-4 rounding versus the in-graph raw value.
    ``weights_version`` follows the E-channel term: a nonzero economics
    contribution means the ECONOMIC_ACTIVE profile earned its vote, otherwise
    the PHYSICAL_ONLY profile. ``active_sources`` lists the contributing
    channels. Anything unknown stays None (NULL) — the live aggregate excludes
    NULL-pred rows instead of defaulting them, so honesty is preserved even
    when the breakdown is absent.
    """
    from agents.tools.consensus_gate import (
        SENSOR_WEIGHTS_ECONOMIC_ACTIVE,
        SENSOR_WEIGHTS_PHYSICAL_ONLY,
    )

    def _p_max_for(weights: Dict[str, float]) -> float:
        prod = 1.0
        for w in weights.values():
            prod *= 1.0 - float(w)
        return round(1.0 - prod, 4)

    blank: Dict[str, Any] = {
        "pred_prob": None,
        "raw_prob": None,
        "p_max": None,
        "weights_version": None,
        "active_sources": None,
        "forecast_created_at": None,
    }

    pred = _coerce_float(state.get("overall_confidence"))
    breakdown = state.get("consensus_breakdown")
    if pred is None or not isinstance(breakdown, dict) or not breakdown:
        return blank

    terms = []
    contributors = []
    for channel, value in breakdown.items():
        v = _coerce_float(value)
        if v is None:
            continue
        v = min(1.0, max(0.0, v))
        terms.append(1.0 - v)
        if v > 0.0:
            contributors.append(str(channel))
    if not terms:
        return blank

    raw = 1.0
    for t in terms:
        raw *= t
    raw = round(1.0 - raw, 4)

    econ_term = _coerce_float(breakdown.get("economics")) or 0.0
    econ_active = econ_term > 0.0
    weights_version = "ECONOMIC_ACTIVE" if econ_active else "PHYSICAL_ONLY"
    weights = SENSOR_WEIGHTS_ECONOMIC_ACTIVE if econ_active else SENSOR_WEIGHTS_PHYSICAL_ONLY

    return {
        "pred_prob": pred,
        "raw_prob": raw,
        "p_max": _p_max_for(weights),
        "weights_version": weights_version,
        "active_sources": contributors,
        "forecast_created_at": datetime.now(timezone.utc).isoformat(),
    }


def _persist_incident_inner(supabase: Any, db_payload: Dict[str, Any]) -> Tuple[Any, bool]:
    """Persist idempotently on ``incident_id`` (never a bare insert).

    Strategy: a cheap existence check, then update the existing row (true
    replay) or ``upsert(..., on_conflict="incident_id")`` for a first write.
    This keeps replays off the unique-constraint path *and* lets us log reuse.

    Returns ``(response, reused)``. Falls back to update/insert for older
    PostgREST deployments that reject ``on_conflict``, and re-applies the update
    if an insert races the replay.
    """
    incident_id = db_payload["incident_id"]
    update_fields = {key: db_payload[key] for key in _INCIDENT_UPDATE_FIELDS if key in db_payload}

    reused = False
    try:
        existing = (
            supabase.table("incidents")
            .select("incident_id")
            .eq("incident_id", incident_id)
            .limit(1)
            .execute()
        )
        rows = getattr(existing, "data", None)
        # Strict list check: mock clients return non-list sentinels, which must
        # not be mistaken for an existing row.
        reused = isinstance(rows, list) and bool(rows)
    except Exception as lookup_exc:
        logger.debug(
            "incident idempotency pre-check failed (%s); using upsert", lookup_exc
        )

    if reused:
        try:
            res = (
                supabase.table("incidents")
                .update(update_fields)
                .eq("incident_id", incident_id)
                .execute()
            )
            return res, True
        except Exception as update_exc:
            logger.warning(
                "Update of existing incident %s failed (%s); falling back to upsert",
                incident_id,
                update_exc,
            )

    try:
        res = (
            supabase.table("incidents")
            .upsert(db_payload, on_conflict="incident_id")
            .execute()
        )
        return res, reused
    except Exception as upsert_exc:
        logger.warning(
            "incidents.upsert unavailable (%s); falling back to check-then-update",
            upsert_exc,
        )

    try:
        res = (
            supabase.table("incidents")
            .update(update_fields)
            .eq("incident_id", incident_id)
            .execute()
        )
        rows = getattr(res, "data", None)
        if isinstance(rows, list) and not rows:
            # Nothing matched: first write for this incident_id.
            return supabase.table("incidents").insert(db_payload).execute(), False
        return res, True
    except Exception as update_exc:
        logger.warning(
            "incidents.update fallback failed (%s); attempting insert", update_exc
        )

    try:
        return supabase.table("incidents").insert(db_payload).execute(), False
    except Exception as insert_exc:
        # Replay raced the insert (or replay hit the unique constraint): update
        # the existing row instead of returning an empty id.
        logger.info(
            "Idempotent reuse: incident_id=%s already exists (%s); updating row",
            incident_id,
            insert_exc,
        )
        return (
            supabase.table("incidents")
            .update(update_fields)
            .eq("incident_id", incident_id)
            .execute(),
            True,
        )


def _persist_incident(supabase: Any, db_payload: Dict[str, Any]) -> Tuple[Any, bool]:
    """Persist idempotently; retry without forecast columns on pre-migration DBs.

    Deployments that have not applied migration 021 reject the WS-A forecast
    columns (PostgREST schema-cache error naming the column). In that case the
    write is retried once with the forecast columns stripped so the incident
    itself is never lost — the row simply carries NULL pred and is excluded
    from the live aggregate until the migration lands.
    """
    try:
        return _persist_incident_inner(supabase, db_payload)
    except Exception as exc:
        has_forecast = any(col in db_payload for col in _FORECAST_COLUMNS)
        names_column = any(col in str(exc) for col in _FORECAST_COLUMNS)
        if has_forecast and names_column:
            logger.warning(
                "incidents forecast columns rejected (%s); retrying without them "
                "(apply migration 021_pred_tersimpan.sql to persist pred)",
                exc,
            )
            return _persist_incident_inner(supabase, _strip_forecast_columns(db_payload))
        raise


async def write_incident(
    state: CrisisState,
    degraded_sources: Optional[List[str]] = None,
) -> str:
    """Persist a validated alert into Supabase using the backend write client.

    Payload is restricted to the real ``incidents`` columns. Fields that have no
    column (is_simulated, region, evidence chains, forecasts) are packed into the
    ``evidence`` JSONB column instead of top-level keys, which previously made
    every insert fail with a PostgREST "column does not exist" error.

    Idempotency: the write is an upsert on ``incident_id`` (derived from
    ``crisis_id``), so replaying the same crisis updates the existing row and
    returns its id instead of failing on the unique constraint.

    Resilience: when ``SUPABASE_SERVICE_ROLE_KEY`` is missing the write path
    cannot bypass RLS. Rather than attempting an anon write that is denied
    silently, the call is skipped and ``degraded_sources`` reports
    ``supabase_write_disabled``; the caller's in-memory state remains replayable.
    """
    degraded = degraded_sources if degraded_sources is not None else []

    if not is_write_configured():
        if SUPABASE_WRITE_DISABLED_SOURCE not in degraded:
            degraded.append(SUPABASE_WRITE_DISABLED_SOURCE)
        logger.warning(
            "write_incident skipped (crisis_id=%s): SUPABASE_SERVICE_ROLE_KEY "
            "missing, anon writes would be denied by RLS; degraded_sources=%s. "
            "Demo/replay state is preserved in memory.",
            state.get("crisis_id"),
            degraded,
        )
        return ""

    try:
        supabase = get_write_client()

        evidence_chain = {
            "data_collection": state.get("data_collection_finding"),
            "osint_hazard": state.get("osint_hazard_finding"),
            "prediction": state.get("prediction_finding"),
            "route_optimization": state.get("route_optimization_finding"),
            "economic_intelligence": state.get("economic_intelligence_finding"),
        }

        severity = str(state.get("severity") or "").strip().lower()
        if severity not in _VALID_SEVERITIES:
            severity = "medium"

        lat = _coerce_float(state.get("lat"))
        lon = _coerce_float(state.get("lon"))
        location = (
            f"SRID=4326;POINT({lon} {lat})"
            if lat is not None and lon is not None
            else None
        )

        affected_area = _to_ewkt_polygon(
            state.get("affected_area") or state.get("affected_polygon")
        )

        description = state.get("description")
        if not description:
            description = state.get("decision_support_output") or ""

        db_payload = {
            "incident_id": _incident_key(state.get("crisis_id")),
            "title": state.get("title") or "Unnamed Crisis Event",
            "description": description,
            "type": state.get("type") or "unknown",
            "severity": severity,
            "status": state.get("status") or "validated",
            "confidence": _coerce_float(state.get("overall_confidence")) or 0.0,
            "lat": lat,
            "lon": lon,
            "location": location,
            "affected_area": affected_area,
            "recommendations": state.get("route_recommendations") or [],
            "evidence": {
                "is_simulated": bool(state.get("is_simulated", False)),
                "region": state.get("region"),
                "evidence_chain": evidence_chain,
                "inflation_forecast": state.get("inflation_forecast"),
                "causal_chain": state.get("causal_chain") or [],
                "decision_support_output": state.get("decision_support_output"),
            },
            "updated_at": datetime.now(timezone.utc).isoformat(),
            # WS-A stored forecast: calibrated P + raw recovered from the stored
            # breakdown terms + profile P_max + contributing channels. The
            # evidence block above is untouched (evidence_chain preserved).
            **_forecast_provenance(state),
        }

        res, reused = await asyncio.to_thread(_persist_incident, supabase, db_payload)
        incident_id = _extract_incident_id(res, db_payload["incident_id"])

        if reused:
            logger.info(
                "Idempotent incident replay: crisis_id=%s reused incident_id=%s "
                "(evidence/recommendations/status/confidence refreshed)",
                state.get("crisis_id"),
                incident_id,
            )
        else:
            logger.info(
                "Successfully saved incident to Supabase (idempotent upsert): %s "
                "(crisis_id=%s)",
                incident_id,
                state.get("crisis_id"),
            )
        return incident_id
    except Exception as e:
        if _INCIDENT_SOURCE not in degraded:
            degraded.append(_INCIDENT_SOURCE)
        logger.warning(
            "Failed to write incident to Supabase; degraded_sources=%s error=%s",
            degraded,
            e,
            exc_info=True,
        )
        return ""


# Explicit projection keeps legacy schemas working via the select("*") retry.
# ``id`` + ``evidence`` are read so the news-ingestor provenance tag (below) is
# available and id-only rows still normalize.
_HAZARD_COLUMNS = (
    "id, incident_id, title, type, severity, status, lat, lon, affected_area, "
    "location, evidence"
)

# Provenance tag written by backend.app.services.unified_news_ingestor into
# incidents.evidence (public.incidents has no source_type column).
_NEWS_INGESTOR_ORIGIN = "news_ingestor"
_NEWS_INGESTOR_EVIDENCE_KEYS = ("source_type", "ingestion_origin", "ingested_by", "origin")
_NEWS_INGESTOR_TITLE_PREFIX = "[News Alert]"


def _is_news_ingestor_incident(row: Dict[str, Any]) -> bool:
    """True when an ``incidents`` row was synthesized from a news article.

    Such a polygon is a restatement of the article itself, so feeding it into
    the hazard-fusion ``+0.20`` boost would let one uncorroborated article
    corroborate itself. Detection prefers the explicit ``evidence.source_type``
    tag written by the ingestor, falls back to a top-level ``source_type`` /
    ``source`` column on deployments that have one, and finally to the
    ``[News Alert]`` title provenance prefix for pre-tag rows.
    """
    evidence = row.get("evidence")
    if isinstance(evidence, str):
        try:
            evidence = json.loads(evidence)
        except (TypeError, ValueError):
            evidence = None
    if isinstance(evidence, dict):
        for key in _NEWS_INGESTOR_EVIDENCE_KEYS:
            if _NEWS_INGESTOR_ORIGIN in str(evidence.get(key) or "").strip().lower():
                return True
    for key in ("source_type", "source"):
        if _NEWS_INGESTOR_ORIGIN in str(row.get(key) or "").strip().lower():
            return True
    return str(row.get("title") or "").startswith(_NEWS_INGESTOR_TITLE_PREFIX)


async def get_hazard_polygons(
    lat: float,
    lon: float,
    radius_km: float = 50,
    degraded_sources: Optional[List[str]] = None,
) -> List[Dict]:
    """Query active incidents near (lat, lon) and normalize their hazard polygons.

    Reads ``affected_area`` (PostGIS, migration 000) with a fallback to the
    legacy ``affected_polygon`` key, drops resolved/archived rows in Python, and
    distance-checks bounding-box hits so corner rows outside the radius are not
    returned as hazards. Rows synthesized from a news article by the news
    ingestor are skipped: a news restatement is not an independent hazard source
    and must never boost its own corroboration confidence.

    ``degraded_sources`` (optional) receives ``supabase_polygons`` when the query
    cannot answer, so the caller can distinguish a quiet area from a dead path
    instead of treating both as "no hazards".
    """
    degraded = degraded_sources if degraded_sources is not None else []
    center_lat = _coerce_float(lat)
    center_lon = _coerce_float(lon)
    if center_lat is None or center_lon is None:
        if "supabase_polygons" not in degraded:
            degraded.append("supabase_polygons")
        logger.warning(
            "get_hazard_polygons missing/invalid coordinates; degraded_sources=%s",
            degraded,
        )
        return []

    radius = _coerce_float(radius_km)
    if radius is None or radius <= 0:
        radius = 50.0
    delta = abs(radius) / 111.0  # Approx degrees

    try:
        supabase = get_client()

        def _query(columns: str):
            return (
                supabase.table("incidents")
                .select(columns)
                .gte("lat", center_lat - delta)
                .lte("lat", center_lat + delta)
                .gte("lon", center_lon - delta)
                .lte("lon", center_lon + delta)
                .execute()
            )

        try:
            res = await asyncio.to_thread(_query, _HAZARD_COLUMNS)
        except Exception as projection_exc:
            logger.warning(
                "get_hazard_polygons projection unavailable (%s); retrying select(*); "
                "degraded_sources=%s",
                projection_exc,
                degraded,
            )
            res = await asyncio.to_thread(_query, "*")

        hazards: List[Dict] = []
        for row in (getattr(res, "data", None) or []):
            if not isinstance(row, dict):
                continue

            status = str(row.get("status") or "").strip().lower()
            if status in {"resolved", "archived"}:
                continue

            # Anti-self-corroboration: a news-derived incident must not act as an
            # independent PostGIS polygon for the article it was created from.
            if _is_news_ingestor_incident(row):
                logger.debug(
                    "get_hazard_polygons: skipping news-ingestor incident %s "
                    "(news cannot corroborate itself)",
                    row.get("incident_id") or row.get("id") or "?",
                )
                continue

            polygon_raw = (
                row.get("affected_area")
                or row.get("affected_polygon")
                or row.get("polygon")
            )
            if not polygon_raw:
                continue
            # Always hand the map a GeoJSON polygon; invalid storage degrades to None
            # (the row is still reported as a hazard, just without drawable geometry).
            polygon = _normalize_geojson_polygon(polygon_raw)

            row_lat = _coerce_float(row.get("lat"))
            row_lon = _coerce_float(row.get("lon"))
            distance_km = None
            if row_lat is not None and row_lon is not None:
                distance_km = _haversine_km(center_lat, center_lon, row_lat, row_lon)
                if distance_km > radius * 1.001:
                    continue

            severity = str(row.get("severity") or "medium").strip().lower()
            hazard = {
                "incident_id": str(row.get("incident_id") or row.get("id") or ""),
                "title": row.get("title") or "",
                "type": row.get("type") or "unknown",
                "severity": severity or "medium",
                "polygon": polygon,
                "geometry": polygon,
                "geometry_format": "geojson" if polygon else None,
            }
            if polygon and polygon.get("type") == "Polygon":
                # Convenience ring for legacy consumers (deck.gl / Mapbox both take it).
                hazard["polygon_ring"] = (polygon.get("coordinates") or [None])[0]
            if row_lat is not None and row_lon is not None:
                hazard["lat"] = row_lat
                hazard["lon"] = row_lon
            if distance_km is not None:
                # Additive field: safe for existing SSE consumers.
                hazard["distance_km"] = round(distance_km, 3)
            hazards.append(hazard)
        return hazards
    except Exception as e:
        if "supabase_polygons" not in degraded:
            degraded.append("supabase_polygons")
        logger.warning(
            "Failed to query hazard polygons; degraded_sources=%s error=%s",
            degraded,
            e,
            exc_info=True,
        )
        return []


_SOURCE_STATUS_MAP = {
    # data_sources.status values written by the adapters/scrapers
    "ok": "green",
    "healthy": "green",
    "up": "green",
    "green": "green",
    "degraded": "yellow",
    "warning": "yellow",
    "stale": "yellow",
    "yellow": "yellow",
    "down": "red",
    "error": "red",
    "offline": "red",
    "red": "red",
}


async def get_source_health(source_name: str) -> str:
    """Queries data_sources for current status ('green', 'yellow', 'red').

    The live adapter contract writes ``data_sources.status`` as
    ok/degraded/down; the agent contract expects green/yellow/red. This maps
    between them and keeps ``source_health`` (legacy) as a read fallback.
    """
    if source_name in ["simulation", "simulated", "internal_simulator", "test", "bmkg"]:
        return "green"

    supabase = get_client()
    # Primary: canonical data_sources table (name column).
    # Fallback: legacy source_health table (source_name column).
    for table, name_column in (("data_sources", "name"), ("source_health", "source_name")):
        try:
            res = await asyncio.to_thread(
                lambda t=table, c=name_column: supabase.table(t)
                .select("status")
                .eq(c, source_name)
                .execute()
            )
            rows = res.data or []
            if rows:
                raw = str(rows[0].get("status") or "").strip().lower()
                return _SOURCE_STATUS_MAP.get(raw, "yellow")
        except Exception as e:
            logger.warning(
                "Failed to query source health from %s for %s: %s", table, source_name, e
            )

    return "yellow"  # Default fallback


async def load_entities_and_relations() -> Tuple[List[Dict], List[Dict]]:
    """Returns raw entity and relation rows for graph building.

    kg_entities/kg_relationships are canonical; the legacy MVP tables remain a
    fallback for older deployments.
    """
    supabase = get_client()

    async def _fetch(tables: Tuple[str, ...], label: str) -> List[Dict]:
        for table in tables:
            try:
                res = await asyncio.to_thread(
                    lambda t=table: supabase.table(t).select("*").execute()
                )
                return res.data or []
            except Exception as e:
                logger.warning("Failed to load %s from %s: %s", label, table, e)
        return []

    entities = await _fetch(("kg_entities", "entities"), "entities")
    relations = await _fetch(("kg_relationships", "entity_relations"), "relations")
    return entities, relations


async def load_road_graph() -> List[Dict]:
    """Reads road_graph_edges table."""
    try:
        supabase = get_client()
        res = await asyncio.to_thread(
            lambda: supabase.table("road_graph_edges").select("*").execute()
        )
        return res.data or []
    except Exception as e:
        logger.error(f"Failed to load road graph edges: {e}")
        return []
