import asyncio
import hashlib
import json
import logging
import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from agents.state import CrisisState, NormalizedEvent, AgentFinding
from agents.memory.stm import get_async_redis, is_seen, mark_seen
from agents.tools.supabase_tools import get_source_health

logger = logging.getLogger(__name__)

# Sources whose events are operator/UI initiated and must never be suppressed by
# the short-lived `lrip:seen` dedup TTL (an interactive map simulation re-run is a
# new, intentional observation). Legacy simulation/test spellings are retained so
# the existing demo and benchmark replay paths keep bypassing dedup.
DEDUP_EXEMPT_SOURCES = frozenset({
    "interactive_ui",
    "manual_trigger",
    "simulator",
    "simulation",
    "simulated",
    "internal_simulator",
    "test",
})

# Confidence is grounded in the weather signal itself, never in Supabase
# `data_sources` health. A live warning raises the baseline into 0.85-0.95.
WEATHER_BASELINE_CONFIDENCE = 0.65
WEATHER_WARNING_CONFIDENCE = 0.85
WEATHER_MAX_CONFIDENCE = 0.95

# PIHPS z-score gate for the fast pre-consensus economic signal.
PIHPS_ANOMALY_Z = 1.5
PIHPS_WINDOW_DAYS = 14


def _as_float(value: Any) -> Optional[float]:
    """Best-effort finite float conversion (booleans and blanks are ignored)."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _load_mapping(value: Any) -> Dict[str, Any]:
    """Coerce a JSON string / mapping into a dict; anything else becomes {}."""
    if isinstance(value, dict):
        return value
    if isinstance(value, (str, bytes)):
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _source_health_ratio(status: str) -> float:
    """Diagnostic ratio for the source-health channel (never used as confidence)."""
    return {"green": 1.0, "yellow": 0.5, "red": 0.0}.get(str(status).lower(), 0.5)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km (used to pick the nearest weather feature)."""
    radius = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(min(1.0, max(0.0, a))))


def _first_number(source: Dict[str, Any], keys: Tuple[str, ...]) -> Optional[float]:
    """Return the first parseable numeric value for ``keys``."""
    for key in keys:
        if key in source:
            value = _as_float(source.get(key))
            if value is not None:
                return value
    return None


_PRECIP_KEYS = (
    "precipitation_mm_24h",
    "precipitation_mm",
    "rainfall_mm",
    "rainfall_rate_mm_per_hour",
    "rain_mm",
    "rain_rate_mmh",
    "precipitation",
)
_FLOOD_KEYS = ("flood_risk_pct", "flood_risk", "flood_pct")
_WIND_KEYS = ("windspeed_kmh", "wind_speed_kmh", "wind_kmh", "windspeed")
_LEVEL_KEYS = ("warning_level", "bmkg_warning_level", "alert_level")
_CODE_KEYS = ("bmkg_code", "code", "weather_code")
_PAYLOAD_SEVERITY_KEYS = ("severity", "alert_severity")


def _nearest_weather_payload(
    payload: Dict[str, Any], lat: Optional[float], lon: Optional[float]
) -> Dict[str, Any]:
    """Pick the weather feature nearest (lat, lon) from a FeatureCollection."""
    features = payload.get("features")
    if not isinstance(features, list) or not features:
        return payload

    best: Optional[Dict[str, Any]] = None
    best_rank: Tuple[int, float] = (2, float("inf"))
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            continue
        distance = 0.0
        feature_lat = _as_float(properties.get("lat"))
        feature_lon = _as_float(properties.get("lon"))
        if lat is not None and lon is not None and feature_lat is not None and feature_lon is not None:
            distance = _haversine_km(lat, lon, feature_lat, feature_lon)
        # Prefer the closest feature that carries disruption numerics.
        has_numeric = any(
            key in properties for key in (_PRECIP_KEYS + _FLOOD_KEYS + _WIND_KEYS)
        )
        rank = (0 if has_numeric else 1, distance)
        if rank < best_rank:
            best = properties
            best_rank = rank
    return best or payload


def _weather_signals(
    state: Dict[str, Any],
    normalized_event: Optional[NormalizedEvent],
) -> Dict[str, Any]:
    """Extract the weather telemetry available for this event at (lat, lon)."""
    lat = _as_float(state.get("lat"))
    lon = _as_float(state.get("lon"))

    payloads: List[Tuple[Dict[str, Any], bool]] = []

    raw_event = state.get("raw_event")
    if isinstance(raw_event, dict):
        payloads.append((raw_event, True))
        for key in ("raw", "raw_payload", "weather", "weather_data", "bmkg", "bmkg_warning", "bmkg_telemetry"):
            nested = _load_mapping(raw_event.get(key))
            if nested:
                payloads.append((nested, True))

    for value in (
        state.get("raw"),
        state.get("raw_payload"),
        state.get("weather"),
        state.get("weather_data"),
        state.get("weather_fusion"),
        state.get("bmkg_warning"),
        state.get("bmkg_telemetry"),
    ):
        if isinstance(value, list):
            payloads.append(({"features": value}, True))
            continue
        nested = _load_mapping(value)
        if nested:
            payloads.append((nested, True))

    if normalized_event:
        nested = _load_mapping(normalized_event.get("raw_payload"))
        if nested:
            # The normalized payload mirrors the event's own severity; that is
            # crisis severity, not weather severity, so it must not be scored.
            payloads.append((nested, False))

    # Top-level numeric keys (webhook payloads that put weather fields at root).
    if any(key in state for key in _PRECIP_KEYS + _FLOOD_KEYS + _WIND_KEYS):
        payloads.append((state, False))

    signals: Dict[str, Any] = {
        "precipitation_mm": None,
        "flood_risk_pct": None,
        "wind_kmh": None,
        "warning_level": "",
        "bmkg_code": None,
        "payload_confidence": None,
        "payload_severity": "",
        "has_telemetry": False,
    }

    for payload, allow_payload_severity in payloads:
        if not payload:
            continue
        selected = _nearest_weather_payload(payload, lat, lon)
        precip = _first_number(selected, _PRECIP_KEYS)
        flood = _first_number(selected, _FLOOD_KEYS)
        wind = _first_number(selected, _WIND_KEYS)
        level = ""
        for key in _LEVEL_KEYS:
            raw_level = selected.get(key)
            if isinstance(raw_level, str) and raw_level.strip():
                level = raw_level.strip().upper()
                break
        code_value = _first_number(selected, _CODE_KEYS)
        payload_conf = (
            _as_float(selected.get("confidence")) if allow_payload_severity else None
        )
        payload_severity = ""
        if allow_payload_severity:
            for key in _PAYLOAD_SEVERITY_KEYS:
                raw_sev = selected.get(key)
                if isinstance(raw_sev, str) and raw_sev.strip():
                    payload_severity = raw_sev.strip().lower()
                    break

        if precip is not None:
            signals["precipitation_mm"] = max(signals["precipitation_mm"] or precip, precip)
            signals["has_telemetry"] = True
        if flood is not None:
            signals["flood_risk_pct"] = max(signals["flood_risk_pct"] or flood, flood)
            signals["has_telemetry"] = True
        if wind is not None:
            signals["wind_kmh"] = max(signals["wind_kmh"] or wind, wind)
            signals["has_telemetry"] = True
        if level and not signals["warning_level"]:
            signals["warning_level"] = level
            signals["has_telemetry"] = True
        if code_value is not None and signals["bmkg_code"] is None:
            signals["bmkg_code"] = int(code_value)
            signals["has_telemetry"] = True
        if payload_conf is not None:
            signals["payload_confidence"] = max(signals["payload_confidence"] or payload_conf, payload_conf)
        if payload_severity and not signals["payload_severity"]:
            signals["payload_severity"] = payload_severity

    return signals


def _weather_confidence(
    state: Dict[str, Any],
    normalized_event: Optional[NormalizedEvent],
    source: str,
    severity: str,
) -> Tuple[float, str]:
    """Derive DataCollection confidence from actual weather severity.

    Baseline 0.65 accelerates to 0.85-0.95 on active BMKG/weather-fusion
    warnings (explicit level, heavy precipitation, high flood risk, storm codes
    or gale-force wind). Supabase source health never influences this value.
    """
    signals = _weather_signals(state, normalized_event)
    confidence = WEATHER_BASELINE_CONFIDENCE
    basis: List[str] = []

    level = signals["warning_level"]
    if level:
        if level in ("AWAS", "RED", "DANGER", "EXTREME"):
            confidence = 0.95
        elif level in ("SIAGA", "ORANGE", "SEVERE"):
            confidence = 0.90
        elif level in ("WASPADA", "YELLOW", "ADVISORY"):
            confidence = WEATHER_WARNING_CONFIDENCE
        basis.append(f"warning_level={level}")

    precip = signals["precipitation_mm"]
    if precip is not None:
        if precip >= 50.0:
            confidence = max(confidence, 0.95)
        elif precip >= 20.0:
            confidence = max(confidence, 0.90)
        elif precip >= 10.0:
            confidence = max(confidence, WEATHER_WARNING_CONFIDENCE)
        basis.append(f"precipitation_mm={precip:.1f}")

    flood = signals["flood_risk_pct"]
    if flood is not None:
        if flood >= 85.0:
            confidence = max(confidence, 0.95)
        elif flood >= 70.0:
            confidence = max(confidence, 0.90)
        elif flood >= 50.0:
            confidence = max(confidence, WEATHER_WARNING_CONFIDENCE)
        basis.append(f"flood_risk_pct={flood:.1f}")

    wind = signals["wind_kmh"]
    if wind is not None:
        if wind >= 60.0:
            confidence = max(confidence, 0.92)
        elif wind >= 40.0:
            confidence = max(confidence, 0.87)
        elif wind >= 30.0:
            confidence = max(confidence, WEATHER_WARNING_CONFIDENCE)
        basis.append(f"wind_kmh={wind:.1f}")

    bmkg_code = signals["bmkg_code"]
    if bmkg_code in (95, 97):
        confidence = max(confidence, 0.90)
        basis.append(f"bmkg_code={bmkg_code}")

    payload_confidence = signals["payload_confidence"]
    if payload_confidence is not None and payload_confidence > confidence:
        confidence = min(WEATHER_MAX_CONFIDENCE, payload_confidence)
        basis.append(f"weather_fusion_confidence={payload_confidence:.2f}")

    payload_severity = signals["payload_severity"]
    if payload_severity in ("critical", "extreme"):
        confidence = max(confidence, 0.90)
        basis.append(f"weather_severity={payload_severity}")
    elif payload_severity == "high":
        confidence = max(confidence, WEATHER_WARNING_CONFIDENCE)
        basis.append(f"weather_severity={payload_severity}")

    # A BMKG-sourced event is itself an active official warning: its declared
    # severity carries the same 0.85-0.95 band as explicit telemetry.
    if not signals["has_telemetry"] and str(source).strip().lower() == "bmkg":
        if severity == "critical":
            confidence = 0.95
            basis.append("bmkg_source_severity=critical")
        elif severity == "high":
            confidence = 0.90
            basis.append("bmkg_source_severity=high")
        elif severity == "medium":
            confidence = WEATHER_WARNING_CONFIDENCE
            basis.append("bmkg_source_severity=medium")

    if not basis:
        basis.append("weather_baseline")

    return round(min(WEATHER_MAX_CONFIDENCE, confidence), 4), "; ".join(basis)


def _pihps_z_score(stats: Any) -> Optional[float]:
    """Resolve a commodity z-score from a PIHPS snapshot entry."""
    if not isinstance(stats, dict):
        return None
    z_score = _as_float(stats.get("z_score"))
    if z_score is not None:
        return z_score
    current = _as_float(stats.get("current") if stats.get("current") is not None else stats.get("price"))
    mean = _as_float(stats.get("mean"))
    std = _as_float(stats.get("std"))
    if current is None or mean is None or std is None or std <= 0:
        return None
    return (current - mean) / std


def _collect_pihps_anomalies(snapshot: Any) -> Dict[str, float]:
    """Return ``{commodity: |z|}`` for snapshot entries beyond the anomaly gate."""
    mapping = _load_mapping(snapshot)
    commodities = mapping.get("commodities") if isinstance(mapping.get("commodities"), dict) else mapping
    anomalies: Dict[str, float] = {}
    for commodity, stats in commodities.items():
        if not isinstance(commodity, str):
            continue
        z_score = _pihps_z_score(stats)
        if z_score is not None and abs(z_score) > PIHPS_ANOMALY_Z:
            anomalies[commodity] = abs(z_score)
    return anomalies


async def _pihps_anomalies_from_supabase(window_days: int = PIHPS_WINDOW_DAYS) -> Dict[str, float]:
    """Fallback: derive per-commodity z-scores from commodity_prices (14d window)."""
    from app.db.supabase_client import get_client

    since = (datetime.now(timezone.utc) - timedelta(days=window_days)).isoformat()

    def _query():
        return (
            get_client()
            .table("commodity_prices")
            .select("commodity,time,price_idr")
            .gte("time", since)
            .execute()
        )

    response = await asyncio.to_thread(_query)
    rows = getattr(response, "data", None) or []
    if not isinstance(rows, list):
        return {}

    series: Dict[str, List[Tuple[str, float]]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        commodity = row.get("commodity")
        price = _as_float(row.get("price_idr"))
        if not isinstance(commodity, str) or not commodity or price is None:
            continue
        series.setdefault(commodity, []).append((str(row.get("time") or ""), price))

    anomalies: Dict[str, float] = {}
    for commodity, points in series.items():
        points.sort(key=lambda item: item[0])
        prices = [price for _, price in points]
        if len(prices) < 3:
            continue
        current = prices[-1]
        baseline = prices[:-1]
        mean = sum(baseline) / len(baseline)
        variance = sum((price - mean) ** 2 for price in baseline) / len(baseline)
        std = math.sqrt(variance)
        if std <= 0:
            continue
        z_score = (current - mean) / std
        if abs(z_score) > PIHPS_ANOMALY_Z:
            anomalies[commodity] = abs(z_score)
    return anomalies


async def _pre_economic_signal() -> Optional[Dict[str, Any]]:
    """Fast, non-LLM PIHPS pre-gate: Redis snapshot, then Supabase fallback."""
    anomalies: Dict[str, float] = {}
    snapshot_usable = False

    try:
        redis = get_async_redis()
        raw_snapshot = await redis.get("lrip:pihps:latest")
        snapshot = _load_mapping(raw_snapshot)
        if snapshot:
            snapshot_usable = True
            anomalies = _collect_pihps_anomalies(snapshot)
    except Exception as exc:
        logger.debug(f"PIHPS pre-gate Redis lookup skipped: {exc}")

    if not snapshot_usable:
        try:
            anomalies = await _pihps_anomalies_from_supabase()
        except Exception as exc:
            logger.debug(f"PIHPS pre-gate Supabase fallback skipped: {exc}")

    if not anomalies:
        return None

    max_z = max(anomalies.values())
    return {
        "confidence": round(min(0.95, 0.60 + 0.10 * max_z), 4),
        "anomalous_commodities": sorted(anomalies.keys()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# Canonical province slugs for the Pan-Sumatra operating area. Aliases cover
# English names, Indonesian names, common abbreviations, and the main logistics
# gateways that appear in news/social payloads.
SUMATRA_REGION_ALIASES: Dict[str, tuple] = {
    "aceh": (
        "aceh", "nanggroe aceh darussalam", "nad", "banda aceh", "sabang",
        "lhokseumawe", "langsa", "meulaboh",
    ),
    "north_sumatra": (
        "north sumatra", "north sumatera", "sumatera utara", "sumatra utara",
        "sumut", "medan", "belawan", "belawan port", "pelabuhan belawan",
        "binjai", "deli serdang", "kualanamu", "pematangsiantar",
        "pematang siantar", "tebing tinggi", "sibolga", "tanjung balai",
        "jalinsum", "trans sumatra",
    ),
    "west_sumatra": (
        "west sumatra", "west sumatera", "sumatera barat", "sumatra barat",
        "sumbar", "padang", "bukittinggi", "payakumbuh", "sitinjau lauik",
    ),
    "riau": (
        "riau", "pekanbaru", "dumai", "kampar", "bengkalis", "siak",
    ),
    "jambi": (
        "jambi", "muara bulian", "kuala tungkal", "muaro jambi",
    ),
    "south_sumatra": (
        "south sumatra", "south sumatera", "sumatera selatan",
        "sumatra selatan", "sumsel", "palembang", "prabumulih",
        "lubuklinggau", "kayu agung", "pelabuhan panjang",
    ),
    "bengkulu": (
        "bengkulu", "curup", "mukomuko",
    ),
    "lampung": (
        "lampung", "bandar lampung", "bakauheni", "kalianda", "metro",
        "pelabuhan panjang lampung",
    ),
    "bangka_belitung": (
        "bangka belitung", "kepulauan bangka belitung", "babel",
        "pangkalpinang", "bangka", "belitung",
    ),
    "kepulauan_riau": (
        "kepulauan riau", "riau islands", "kepri", "batam",
        "tanjungpinang", "bintan", "karimun",
    ),
    "sumatra": ("sumatra", "sumatera"),
}


def normalize_region(value: Any) -> str:
    """Canonicalize a region label to a stable slug.

    ``north_sumatra`` / ``North Sumatra`` / ``Sumatera Utara`` / ``Sumut`` all
    collapse to ``north_sumatra``; every other Sumatran province follows the
    same rule. Unknown labels are returned as a lowercase underscore slug so
    callers never receive an empty/ambiguous value.
    """
    if value is None:
        return ""

    raw = str(value).strip().lower()
    if not raw:
        return ""

    key = re.sub(r"[_\-]+", " ", raw)
    key = re.sub(r"\s+", " ", key).strip()
    for prefix in ("provinsi ", "province of ", "province "):
        if key.startswith(prefix):
            key = key[len(prefix):].strip()
            break

    slug = key.replace(" ", "_")
    for canonical, aliases in SUMATRA_REGION_ALIASES.items():
        if slug == canonical or key in aliases:
            return canonical

    return slug


def region_matches_text(region: Any, text: Any) -> bool:
    """True when text names the region, one of its gateways, or a corridor alias."""
    canonical = normalize_region(region)
    haystack = str(text or "").lower()
    if not canonical or not haystack:
        return False

    aliases = SUMATRA_REGION_ALIASES.get(canonical, ())
    if any(alias in haystack for alias in aliases):
        return True

    # Unknown region labels still get a literal check (underscore variant too).
    return canonical.replace("_", " ") in haystack or canonical in haystack


def _text_from_raw(raw: Any) -> str:
    """Extract human-readable text from a raw field (JSON string or mapping)."""
    if isinstance(raw, dict):
        for key in ("raw_text", "text", "description", "summary", "title"):
            val = raw.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
        return ""

    if isinstance(raw, str) and raw.strip():
        candidate = raw.strip()
        try:
            parsed = json.loads(candidate)
        except (ValueError, TypeError):
            return candidate
        if isinstance(parsed, dict):
            return _text_from_raw(parsed)
        return ""

    return ""


def extract_payload_text(payload: Any) -> str:
    """Resolve the best available text from an incoming event payload.

    Priority follows the ingestion contract: ``text`` → ``description`` →
    ``raw`` (JSON unwrapped) → ``raw_text`` → ``title``.
    """
    if not isinstance(payload, dict):
        return ""

    for key in ("text", "description"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()

    raw_text = _text_from_raw(payload.get("raw"))
    if raw_text:
        return raw_text

    for key in ("raw_text", "title"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()

    return ""


def _source_from_state(state: Dict[str, Any], is_sim: bool) -> str:
    """Preserve the caller-declared source; only fall back when it is absent."""
    declared = state.get("source")
    if isinstance(declared, str) and declared.strip():
        return declared.strip()
    raw_event = state.get("raw_event")
    if isinstance(raw_event, dict):
        nested_source = raw_event.get("source")
        if isinstance(nested_source, str) and nested_source.strip():
            return nested_source.strip()
    return "simulation" if is_sim else "unknown"


# Canonical state channel -> accepted spellings. The dashboard has historically
# sent camelCase while agents/APIs read snake_case; LangGraph only carries keys
# declared on CrisisState, so accepting both here keeps an operator's OD/cargo
# selection intact end-to-end.
_OPERATIONAL_ALIASES: Dict[str, tuple] = {
    "origin": ("origin", "start_location", "origin_id", "origin_node"),
    "destination": ("destination", "end_location", "dest_id", "destination_node"),
    "origin_coords": ("origin_coords", "originCoords"),
    "dest_coords": ("dest_coords", "destCoords"),
    "commodity": ("commodity", "commodity_key", "commodityKey"),
    "cargo_tonnage": ("cargo_tonnage", "cargoTonnage", "cargo_ton", "cargoTon"),
    "has_bkhit_cert": ("has_bkhit_cert", "hasBkhitCert", "bkhit_cert", "bkhitCert"),
    "vehicle_gross_weight_ton": (
        "vehicle_gross_weight_ton", "vehicleGrossWeightTon", "gross_weight_ton",
    ),
    "modality": ("modality", "transport_modality", "transportModality"),
    "radius_km": ("radius_km", "radiusKm"),
}


def _first_present(state: Dict[str, Any], keys: tuple) -> Any:
    """Return the first explicitly-set, non-None value for ``keys``."""
    for key in keys:
        if key in state:
            value = state.get(key)
            if value is not None:
                return value
    return None


def _coerce_float(value: Any) -> Any:
    """Coerce numeric payload values; return None when not finite/parseable."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) != float("inf") else None


def _coerce_bool(value: Any) -> Any:
    """Coerce booleans without turning the string ``"false"`` into True."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ("1", "true", "yes", "y", "on"):
            return True
        if normalized in ("0", "false", "no", "n", "off"):
            return False
    return None


def _coerce_coords(value: Any) -> Any:
    """Accept ``[lon, lat]`` (or ``{lat, lon}``) and return a float pair."""
    if value is None:
        return None
    if isinstance(value, dict):
        lat, lon = value.get("lat"), value.get("lon")
        if lat is not None and lon is not None:
            parsed = [_coerce_float(lon), _coerce_float(lat)]
            return parsed if all(v is not None for v in parsed) else None
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return None
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        parsed = [_coerce_float(value[0]), _coerce_float(value[1])]
        return parsed if all(v is not None for v in parsed) else None
    return None


def normalize_operational_fields(state: Dict[str, Any]) -> Dict[str, Any]:
    """Mirror camelCase OD/cargo payload keys onto canonical snake_case keys.

    Only canonical keys are emitted; unresolved values are left absent so the
    RouteOptimizationAgent can apply its documented defaults. Input keys are
    never removed, keeping the change additive for older callers.
    """
    normalized: Dict[str, Any] = {}

    for channel in ("origin", "destination"):
        value = _first_present(state, _OPERATIONAL_ALIASES[channel])
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        normalized[channel] = value

    for channel in ("commodity", "modality"):
        for key in _OPERATIONAL_ALIASES[channel]:
            value = state.get(key)
            if value is not None and str(value).strip():
                normalized[channel] = str(value).strip()
                break

    for channel in ("origin_coords", "dest_coords"):
        value = _coerce_coords(_first_present(state, _OPERATIONAL_ALIASES[channel]))
        if value is not None:
            normalized[channel] = value

    for channel in ("cargo_tonnage", "vehicle_gross_weight_ton", "radius_km"):
        value = _coerce_float(_first_present(state, _OPERATIONAL_ALIASES[channel]))
        if value is not None:
            normalized[channel] = value

    has_bkhit = _coerce_bool(_first_present(state, _OPERATIONAL_ALIASES["has_bkhit_cert"]))
    if has_bkhit is not None:
        normalized["has_bkhit_cert"] = has_bkhit

    return normalized


def generate_event_hash(event: dict) -> str:
    """Generates a stable hash of the event payload for deduplication."""
    # Focus on event type, location, and severity
    payload_str = f"{event.get('type') or event.get('event_type')}:{event.get('lat')}:{event.get('lon')}:{event.get('region')}"
    return hashlib.sha256(payload_str.encode()).hexdigest()[:16]


async def data_collection_agent(state: CrisisState) -> dict:
    """Agent 1: Validates, deduplicates, and normalizes raw Redis/incoming events."""
    logger.info("Agent 1 [DataCollectionAgent] running...")

    event_type = state.get("type") or state.get("event_type") or "unknown"
    severity = state.get("severity") or "medium"
    is_sim = bool(state.get("is_simulated"))
    # Simulation is a provenance flag, not a source override. The caller's
    # declared source is preserved so social/citizen reports stay attributable.
    source = _source_from_state(state, is_sim)
    lat = state.get("lat")
    lon = state.get("lon")
    region = state.get("region")
    region_slug = normalize_region(region)

    validation_errors = []

    # 1. Validate fields
    if event_type == "unknown":
        validation_errors.append("Missing event type")
    if lat is None and lon is None and not region:
        validation_errors.append("Missing location (lat/lon or region)")
    if source == "unknown":
        validation_errors.append("Missing source")

    # Normalize severity
    valid_severities = ['low', 'medium', 'high', 'critical']
    severity = severity.lower()
    if severity not in valid_severities:
        severity = 'medium'
        validation_errors.append(f"Normalized invalid severity to 'medium'")

    # 2. Build the normalized event BEFORE the dedup check. Duplicate events are
    # still fully normalized so callers always receive a usable payload.
    raw_payload = dict(state)
    normalized_ops = normalize_operational_fields(state)
    if normalized_ops:
        # Persist the canonical spellings in the evidence payload as well, so
        # downstream agents/readers do not have to re-resolve camelCase aliases.
        raw_payload.update(normalized_ops)
    payload_text = extract_payload_text(state)
    if payload_text:
        raw_payload["text"] = payload_text
    if region_slug:
        # Canonical slug for every downstream region comparison; keep the
        # caller's spelling separately for auditability.
        if region and str(region).strip() != region_slug:
            raw_payload.setdefault("region_raw", region)
        raw_payload["region"] = region_slug

    normalized_event: NormalizedEvent = {
        "source": source,
        "event_type": event_type,
        "severity": severity,
        "raw_payload": raw_payload,
        "validated": len(validation_errors) == 0,
        "validation_errors": validation_errors
    }
    # NormalizedEvent's TypedDict is the shared contract; `region` is an
    # additive field consumed by the OSINT spatial gate (canonical slug).
    if region_slug:
        normalized_event["region"] = region_slug  # type: ignore[typeddict-unknown-key]

    updated_fields: Dict[str, Any] = dict(normalized_ops)
    if region_slug:
        updated_fields["region"] = region_slug

    # 3. Deduplication check. Operator/UI-initiated and simulated events always
    # execute: a 300s `lrip:seen` TTL must never swallow an interactive map sim.
    event_hash = generate_event_hash(state)
    logger.debug(f"Computed event hash: {event_hash}")

    raw_event = state.get("raw_event")
    raw_event_source = (
        str(raw_event.get("source") or "").strip().lower()
        if isinstance(raw_event, dict)
        else ""
    )
    effective_source = raw_event_source or str(source).strip().lower()
    dedup_enforced = not is_sim and effective_source not in DEDUP_EXEMPT_SOURCES

    if dedup_enforced and await is_seen(event_hash):
        logger.info(f"Duplicate event detected for hash: {event_hash}. Terminating path.")
        duplicate_finding: AgentFinding = {
            "agent": "DataCollectionAgent",
            "confidence": 0.0,
            "summary": (
                f"Duplicate {event_type} event suppressed (hash={event_hash}, source={source})."
            ),
            "data": {
                "duplicate": True,
                "event_hash": event_hash,
                "source": source,
                "severity": severity,
                "validation_errors": validation_errors,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return {
            "normalized_event": normalized_event,
            "data_collection_finding": duplicate_finding,
            "status": "duplicate",
            "messages": state.get("messages", [])
            + ["DataCollectionAgent: Duplicate event suppressed."],
            **updated_fields,
        }

    if dedup_enforced:
        await mark_seen(event_hash)

    # 4. Source health is DIAGNOSTIC ONLY. Confidence is grounded in the actual
    # weather severity at (lat, lon), not in Supabase data_sources status.
    health_status = await get_source_health(source)
    confidence, weather_basis = _weather_confidence(
        state, normalized_event, source, severity
    )

    # Adjust confidence if validation errors present
    if validation_errors:
        confidence = max(0.1, confidence - 0.2)

    # 5. Fast non-LLM PIHPS pre-gate (Redis snapshot, Supabase 14d fallback).
    pre_economic_signal = await _pre_economic_signal()

    # 6. Build finding
    finding: AgentFinding = {
        "agent": "DataCollectionAgent",
        "confidence": confidence,
        "summary": f"Validated and normalized incoming {event_type} event from {source}. Severity: {severity}. Errors: {len(validation_errors)}",
        "data": {
            "validation_errors": validation_errors,
            "source_health": health_status,
            "source_health_ratio": _source_health_ratio(health_status),
            "weather_basis": weather_basis,
            "distance_km": 0.0,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "distance_km": 0.0,
    }

    try:
        from app.routers.agent_router import update_agent_status
        update_agent_status("DataCollectionAgent", "complete", confidence, finding["summary"])
    except Exception:
        pass

    logger.info(f"Agent 1 finished. Confidence: {confidence}")

    result: Dict[str, Any] = {
        "normalized_event": normalized_event,
        "data_collection_finding": finding,
        "status": "validating",
        "messages": state.get("messages", []) + ["DataCollectionAgent: Event normalized and validated."],
        **updated_fields,
    }
    if pre_economic_signal:
        result["pre_economic_signal"] = pre_economic_signal
    return result
