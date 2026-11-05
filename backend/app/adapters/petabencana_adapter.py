"""Bounded parser/client for PetaBencana crowdsourced point reports.

The endpoint returns user reports, not verified flood extent. Only source
points with an explicit mainland-province tag and a fresh timestamp are kept;
no radius or polygon is inferred.

Docs:
- https://docs.petabencana.id/master-1/routes/crowdsourced-reports
- https://docs.petabencana.id/informasi-lisensi-data
"""
from __future__ import annotations

import inspect
import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional

import httpx

logger = logging.getLogger(__name__)

PETABENCANA_REPORTS_URL = "https://api.petabencana.id/reports"
PETABENCANA_DOCS_URL = "https://docs.petabencana.id/master-1/routes/crowdsourced-reports"
PETABENCANA_LICENSE_URL = "https://docs.petabencana.id/informasi-lisensi-data"
PETABENCANA_ATTRIBUTION = "PetaBencana.id (crowdsourced reports; CC BY-NC 4.0)"
REPORT_WINDOW_SECONDS = 3600
MAX_REPORTS = 1000

MAINLAND_PROVINCES = {
    "aceh", "sumatera utara", "sumut", "north sumatra",
    "sumatera barat", "sumbar", "west sumatra", "riau", "jambi",
    "sumatera selatan", "sumsel", "south sumatra", "bengkulu", "lampung",
}
# ISO 3166-2 province codes used by the documented `admin` parameter model.
# `instance_region_code` values outside this explicit set are not guessed.
MAINLAND_ADMIN_CODES = {
    "ID-AC": "Aceh",
    "ID-SU": "Sumatera Utara",
    "ID-SB": "Sumatera Barat",
    "ID-RI": "Riau",
    "ID-JA": "Jambi",
    "ID-SS": "Sumatera Selatan",
    "ID-BE": "Bengkulu",
    "ID-LA": "Lampung",
}
_EVENT_TYPES = {
    "flood": "flood",
    "earthquake": "earthquake",
    "fire": "wildfire",
    "haze": "haze",
    "wind": "storm",
    "volcano": "volcanic_activity",
}
ReserveCallback = Callable[..., bool | Awaitable[bool]]


def _parse_timestamp(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _coordinate(value: Any) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        coordinate = float(value)
    except ValueError:
        return None
    return coordinate if math.isfinite(coordinate) else None


def _province(properties: dict[str, Any]) -> Optional[str]:
    tags = properties.get("tags")
    tags = tags if isinstance(tags, dict) else {}
    code = str(tags.get("instance_region_code") or properties.get("admin") or "").strip()
    if code.upper() in MAINLAND_ADMIN_CODES:
        return MAINLAND_ADMIN_CODES[code.upper()]
    for candidate in (properties.get("province"), properties.get("region"), code):
        normalized = str(candidate or "").strip().lower()
        if normalized in MAINLAND_PROVINCES:
            aliases = {
                "sumut": "Sumatera Utara", "north sumatra": "Sumatera Utara",
                "sumbar": "Sumatera Barat", "west sumatra": "Sumatera Barat",
                "sumsel": "Sumatera Selatan", "south sumatra": "Sumatera Selatan",
            }
            return aliases.get(normalized, normalized.title() if normalized not in {"riau", "jambi", "aceh", "bengkulu", "lampung"} else normalized.title())
    return None


def _geometry_records(result: Any) -> Optional[list[tuple[dict[str, Any], Any]]]:
    """Return (properties, coordinates) for GeoJSON or TopoJSON point reports."""
    records: list[tuple[dict[str, Any], Any]] = []
    if not isinstance(result, dict):
        return None
    result_type = result.get("type")
    if result_type == "FeatureCollection":
        features = result.get("features")
        if not isinstance(features, list):
            return None
        for feature in features[:MAX_REPORTS]:
            if not isinstance(feature, dict):
                continue
            properties = feature.get("properties")
            geometry = feature.get("geometry")
            if isinstance(properties, dict) and isinstance(geometry, dict):
                records.append((properties, geometry.get("coordinates")))
        return records

    if result_type == "Topology":
        objects = result.get("objects")
        if not isinstance(objects, dict):
            return None
        output = objects.get("output")
        geometries = output.get("geometries") if isinstance(output, dict) else None
        if not isinstance(geometries, list):
            return None
        transform = result.get("transform")
        scale = transform.get("scale") if isinstance(transform, dict) else None
        translate = transform.get("translate") if isinstance(transform, dict) else None
        for geometry in geometries[:MAX_REPORTS]:
            if not isinstance(geometry, dict) or geometry.get("type") != "Point":
                continue
            props = geometry.get("properties")
            coords = geometry.get("coordinates")
            if not isinstance(props, dict) or not isinstance(coords, (list, tuple)):
                continue
            if isinstance(scale, (list, tuple)) and isinstance(translate, (list, tuple)) and len(coords) >= 2:
                x = _coordinate(coords[0])
                y = _coordinate(coords[1])
                scale_x = _coordinate(scale[0])
                scale_y = _coordinate(scale[1])
                translate_x = _coordinate(translate[0])
                translate_y = _coordinate(translate[1])
                if (
                    x is None or y is None or scale_x is None or scale_y is None
                    or translate_x is None or translate_y is None
                ):
                    continue
                coords = [
                    x * scale_x + translate_x,
                    y * scale_y + translate_y,
                ]
            records.append((props, coords))
        return records
    return None


def parse_reports(payload: Any, *, now: Optional[datetime] = None) -> list[dict[str, Any]]:
    """Normalize fresh, tagged report points; invalid/unknown reports are omitted."""
    if not isinstance(payload, dict):
        return []
    if payload.get("statusCode", 200) != 200:
        return []
    result = payload.get("result")
    records = _geometry_records(result)
    if records is None:
        return []

    now_utc = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    earliest = now_utc - timedelta(seconds=REPORT_WINDOW_SECONDS)
    events = []
    for properties, coordinates in records:
        if not isinstance(coordinates, (list, tuple)) or len(coordinates) < 2:
            continue
        lon = _coordinate(coordinates[0])
        lat = _coordinate(coordinates[1])
        if lat is None or lon is None:
            continue
        if lat == 0 and lon == 0:
            continue
        if not (-6.5 <= lat <= 6.5 and 94.0 <= lon <= 105.8):
            continue
        province = _province(properties)
        if not province:
            continue
        created_at = _parse_timestamp(properties.get("created_at"))
        if not created_at or created_at < earliest or created_at > now_utc + timedelta(minutes=5):
            continue
        provider_hazard = str(properties.get("disaster_type") or "").strip().lower()
        event_type = _EVENT_TYPES.get(provider_hazard)
        if not event_type:
            continue

        report_id = str(properties.get("pkey") or "").strip()
        events.append({
            "id": report_id or None,
            "source": "petabencana",
            "source_url": PETABENCANA_REPORTS_URL,
            "attribution": PETABENCANA_ATTRIBUTION,
            "license": "CC BY-NC 4.0 (non-commercial; attribution required)",
            "license_url": PETABENCANA_LICENSE_URL,
            "province": province,
            "event_type": event_type,
            "provider_hazard": provider_hazard,
            "title": str(properties.get("title") or "Crowdsourced disaster report")[:240],
            "description": str(properties.get("text") or "")[:1200],
            "lat": lat,
            "lon": lon,
            "reported_at": created_at.isoformat(),
            "report_status": str(properties.get("status") or "unknown")[:80],
            "verification_status": "unverified_crowdsourced_report",
            "geometry_role": "source_report_point",
        })
    return events


class PetaBencanaAdapter:
    source = "petabencana"
    source_url = PETABENCANA_REPORTS_URL
    attribution = PETABENCANA_ATTRIBUTION

    def __init__(self, reserve_provider_budget: Optional[ReserveCallback] = None):
        self.reserve_provider_budget = reserve_provider_budget

    async def fetch(self, request_id: str) -> dict[str, Any]:
        callback = self.reserve_provider_budget
        if callback is None:
            return {"status": "budget_unavailable", "reports": []}
        try:
            permitted = callback(self.source, units=1, request_id=request_id)
            if inspect.isawaitable(permitted):
                permitted = await permitted
        except Exception as exc:
            logger.warning("PetaBencana request budget check failed closed: %s", exc)
            return {"status": "budget_denied", "reports": []}
        if not permitted:
            return {"status": "budget_denied", "reports": []}

        headers = {"User-Agent": "PreHub non-commercial Sumatra shadow pilot (contact@pidi.id)"}
        params = {"timeperiod": REPORT_WINDOW_SECONDS, "geoformat": "geojson"}
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(8.0, connect=3.0),
                follow_redirects=False,
                headers=headers,
            ) as client:
                response = await client.get(PETABENCANA_REPORTS_URL, params=params)
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:
            logger.warning("PetaBencana reports request failed: %s", exc)
            return {"status": "unavailable", "reports": []}

        if not isinstance(payload, dict) or payload.get("statusCode", 200) != 200:
            return {"status": "unavailable", "reports": []}
        if _geometry_records(payload.get("result")) is None:
            return {"status": "unavailable", "reports": []}
        return {"status": "ok", "reports": parse_reports(payload)}
