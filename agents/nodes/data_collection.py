import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict
from agents.state import CrisisState, NormalizedEvent, AgentFinding
from agents.memory.stm import is_seen, mark_seen
from agents.tools.supabase_tools import get_source_health

logger = logging.getLogger(__name__)


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
        
    # 2. Deduplication check (simulations always execute)
    event_hash = generate_event_hash(state)
    logger.debug(f"Computed event hash: {event_hash}")
    
    if not is_sim and source not in ["simulation", "simulated", "test"]:
        if await is_seen(event_hash):
            logger.info(f"Duplicate event detected for hash: {event_hash}. Terminating path.")
            return {
                "status": "duplicate",
                "messages": state.get("messages", []) + ["DataCollectionAgent: Duplicate event suppressed."]
            }
            
        await mark_seen(event_hash)
    
    # 3. Lookup source health
    health_status = await get_source_health(source)
    confidence_map = {
        "green": 0.9,
        "yellow": 0.6,
        "red": 0.3
    }
    confidence = confidence_map.get(health_status, 0.7)
    
    # Adjust confidence if validation errors present
    if validation_errors:
        confidence = max(0.1, confidence - 0.2)
        
    # 4. Build finding and normalized event
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
    
    finding: AgentFinding = {
        "agent": "DataCollectionAgent",
        "confidence": confidence,
        "summary": f"Validated and normalized incoming {event_type} event from {source}. Severity: {severity}. Errors: {len(validation_errors)}",
        "data": {"validation_errors": validation_errors, "source_health": health_status},
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        from app.routers.agent_router import update_agent_status
        update_agent_status("DataCollectionAgent", "complete", confidence, finding["summary"])
    except Exception:
        pass
        
    logger.info(f"Agent 1 finished. Confidence: {confidence}")
    return {
        "normalized_event": normalized_event,
        "data_collection_finding": finding,
        "status": "validating",
        "messages": state.get("messages", []) + ["DataCollectionAgent: Event normalized and validated."],
        **updated_fields,
    }
