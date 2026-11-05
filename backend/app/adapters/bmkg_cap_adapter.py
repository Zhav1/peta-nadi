"""Bounded parser/client for BMKG's documented CAP nowcast warnings.

BMKG describes this feed as weather nowcast warnings, not observed flooding.
The parser keeps those warnings in their own section and only uses polygons
present in the source CAP document. No point, circle, or radius is synthesized.

Docs: https://data.bmkg.go.id/peringatan-dini-cuaca/
"""
from __future__ import annotations

import inspect
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional
from urllib.parse import urljoin, urlparse

import httpx

logger = logging.getLogger(__name__)

BMKG_CAP_FEED_URL = "https://www.bmkg.go.id/alerts/nowcast/id"
BMKG_ATTRIBUTION = "BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)"
BMKG_SERVICE_URL = "https://data.bmkg.go.id/peringatan-dini-cuaca/"
BMKG_ALERT_HOST = "www.bmkg.go.id"
MAX_CAP_DETAILS = 8
MAX_POLYGON_POINTS = 500

MAINLAND_PROVINCES = (
    "Aceh",
    "Sumatera Utara",
    "Sumatera Barat",
    "Riau",
    "Jambi",
    "Sumatera Selatan",
    "Bengkulu",
    "Lampung",
)
_PROVINCE_ALIASES = {
    "aceh": "Aceh",
    "sumatera utara": "Sumatera Utara",
    "sumut": "Sumatera Utara",
    "sumatera barat": "Sumatera Barat",
    "sumbar": "Sumatera Barat",
    "riau": "Riau",
    "jambi": "Jambi",
    "sumatera selatan": "Sumatera Selatan",
    "sumsel": "Sumatera Selatan",
    "bengkulu": "Bengkulu",
    "lampung": "Lampung",
}

ReserveCallback = Callable[..., bool | Awaitable[bool]]


def _tag(element: ET.Element) -> str:
    return element.tag.rsplit("}", 1)[-1].lower()


def _child_text(element: ET.Element, name: str) -> Optional[str]:
    for child in element.iter():
        if _tag(child) == name.lower() and child.text:
            value = child.text.strip()
            if value:
                return value
    return None


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        result = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if result.tzinfo is None:
        return None
    return result.astimezone(timezone.utc)


def _find_province(value: str) -> Optional[str]:
    text = re.sub(r"\s+", " ", value or "").strip().lower()
    for alias, province in sorted(_PROVINCE_ALIASES.items(), key=lambda item: -len(item[0])):
        if re.search(rf"(?<![a-z]){re.escape(alias)}(?![a-z])", text):
            return province
    return None


def _parse_source_polygon(text: str) -> Optional[dict[str, Any]]:
    """Convert a CAP lat,lon ring to GeoJSON only when the source supplied it."""
    points = []
    for pair in text.split():
        parts = pair.split(",")
        if len(parts) != 2:
            return None
        try:
            lat, lon = float(parts[0]), float(parts[1])
        except ValueError:
            return None
        if not (-6.5 <= lat <= 6.5 and 94.0 <= lon <= 108.0):
            return None
        points.append([lon, lat])
        if len(points) > MAX_POLYGON_POINTS:
            return None
    if len(points) < 3:
        return None
    if points[0] != points[-1]:
        points.append(points[0])
    return {"type": "Polygon", "coordinates": [points]}


def parse_cap_document(
    xml_text: str,
    *,
    now: Optional[datetime] = None,
    feed_context: str = "",
) -> list[dict[str, Any]]:
    """Parse valid, current CAP alerts in the eight mainland Sumatra provinces."""
    try:
        root = ET.fromstring(xml_text)
    except (ET.ParseError, TypeError, ValueError):
        return []

    now_utc = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    alerts = [element for element in root.iter() if _tag(element) == "alert"]
    if not alerts and _tag(root) == "alert":
        alerts = [root]

    parsed: list[dict[str, Any]] = []
    for alert in alerts:
        infos = [element for element in alert if _tag(element) == "info"]
        for info in infos:
            event = _child_text(info, "event")
            headline = _child_text(info, "headline") or event
            description = _child_text(info, "description") or ""

            effective = _parse_datetime(_child_text(info, "effective"))
            expires = _parse_datetime(_child_text(info, "expires"))
            if not effective or not expires or expires <= effective:
                continue
            if effective > now_utc or expires <= now_utc:
                continue

            area_descs = []
            polygons = []
            for area in (element for element in info if _tag(element) == "area"):
                area_desc = _child_text(area, "areadesc")
                if area_desc:
                    area_descs.append(area_desc)
                for child in area.iter():
                    if _tag(child) == "polygon" and child.text:
                        polygon = _parse_source_polygon(child.text.strip())
                        if polygon:
                            polygons.append(polygon)

            context = " ".join((feed_context, headline or "", description, *area_descs))
            province = _find_province(context)
            if province not in MAINLAND_PROVINCES:
                continue

            source_geometry = None
            if len(polygons) == 1:
                source_geometry = polygons[0]
            elif polygons:
                source_geometry = {
                    "type": "GeometryCollection",
                    "geometries": polygons,
                }

            identifier = _child_text(alert, "identifier") or ""
            warning: dict[str, Any] = {
                "id": identifier,
                "source": "bmkg_cap",
                "source_url": _child_text(info, "web") or BMKG_SERVICE_URL,
                "attribution": BMKG_ATTRIBUTION,
                "province": province,
                "event": event or "weather_warning",
                "title": (headline or event or "BMKG weather warning")[:240],
                "description": description[:1600],
                "effective": effective.isoformat(),
                "expires": expires.isoformat(),
                "status": "active_warning",
                "geometry_role": "forecast_warning_area" if source_geometry else "extent_unknown",
            }
            if source_geometry is not None:
                warning["affected_area"] = source_geometry
            parsed.append(warning)
    return parsed


def parse_cap_feed(xml_text: str) -> list[dict[str, str]]:
    """Return bounded BMKG CAP detail links from the documented RSS/XML feed."""
    try:
        root = ET.fromstring(xml_text)
    except (ET.ParseError, TypeError, ValueError):
        return []
    results = []
    seen = set()
    for item in root.iter():
        if _tag(item) not in {"item", "entry"}:
            continue
        title = _child_text(item, "title") or ""
        description = _child_text(item, "description") or _child_text(item, "summary") or ""
        province = _find_province(f"{title} {description}")
        if not province:
            continue
        link = None
        for child in item.iter():
            if _tag(child) != "link":
                continue
            link = child.attrib.get("href") or child.text
            if link:
                break
        if not link:
            continue
        absolute = urljoin(BMKG_CAP_FEED_URL, link.strip())
        parsed_url = urlparse(absolute)
        if parsed_url.scheme != "https" or parsed_url.hostname != BMKG_ALERT_HOST:
            continue
        if "/alerts/nowcast/" not in parsed_url.path:
            continue
        if absolute in seen:
            continue
        seen.add(absolute)
        results.append({"url": absolute, "title": title[:240], "province": province})
        if len(results) >= MAX_CAP_DETAILS:
            break
    return results


class BMKGCAPAdapter:
    source = "bmkg_cap"
    source_url = BMKG_CAP_FEED_URL
    attribution = BMKG_ATTRIBUTION

    def __init__(self, reserve_provider_budget: Optional[ReserveCallback] = None):
        self.reserve_provider_budget = reserve_provider_budget

    async def _get(self, client: httpx.AsyncClient, url: str, request_id: str):
        callback = self.reserve_provider_budget
        if callback is None:
            return None
        try:
            permitted = callback(self.source, units=1, request_id=request_id)
            if inspect.isawaitable(permitted):
                permitted = await permitted
        except Exception as exc:
            logger.warning("BMKG request budget check failed closed: %s", exc)
            return None
        if not permitted:
            return None
        try:
            response = await client.get(url)
            response.raise_for_status()
            return response
        except Exception as exc:
            logger.warning("BMKG CAP request failed (%s): %s", url, exc)
            return None

    async def fetch(self, request_id: str) -> dict[str, Any]:
        """Fetch one RSS listing and at most one CAP detail per mainland province."""
        headers = {"User-Agent": "PreHub non-commercial Sumatra shadow pilot (contact@pidi.id)"}
        timeout = httpx.Timeout(8.0, connect=3.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, headers=headers) as client:
            feed_response = await self._get(client, BMKG_CAP_FEED_URL, f"{request_id}:feed")
            if feed_response is None:
                return {"status": "unavailable", "warnings": []}
            feed_links = parse_cap_feed(feed_response.text)
            if not feed_links:
                # A valid RSS document with zero current entries is a healthy empty.
                try:
                    ET.fromstring(feed_response.text)
                except ET.ParseError:
                    return {"status": "unavailable", "warnings": []}
                return {"status": "ok", "warnings": []}

            warnings = []
            failures = 0
            for link in feed_links:
                detail = await self._get(client, link["url"], f"{request_id}:{link['province']}")
                if detail is None:
                    failures += 1
                    continue
                warnings.extend(parse_cap_document(detail.text, feed_context=link["title"]))
            if failures:
                return {"status": "degraded", "warnings": warnings}
            return {"status": "ok", "warnings": warnings}
