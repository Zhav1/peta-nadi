"""Cache-backed coordinator for the observed/forecast disaster input slice.

Public reads are Redis/cache-only. Refresh is explicit, budgeted, and keeps the
last successful per-source snapshot on network, parsing, or budget failures.

Redis contract (JSON, no expiry on Redis):
- `lrip:state:observed_disasters:source:{source}:v1` stores the per-source
  envelope: schema_version, source, status, updated_at, last_success_at,
  last_success_status, stale, attribution, source_url, item_count, items.
- `lrip:state:observed_disasters:v1` stores the assembled public snapshot:
  schema_version, updated_at, status, disaster_reports, official_warnings,
  sources. A healthy empty provider response writes `items: []` and clears
  that provider's prior items; failures retain items and mark them stale.

The central provider-budget service is intentionally lazy-imported. If it is
not installed or its reservation fails, outbound attempts are denied.
"""
from __future__ import annotations

import inspect
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

from app.adapters.bmkg_cap_adapter import (
    BMKG_ATTRIBUTION,
    BMKG_CAP_FEED_URL,
    BMKGCAPAdapter,
)
from app.adapters.bnpb_adapter import BNPBAdapter
from app.adapters.petabencana_adapter import (
    PETABENCANA_ATTRIBUTION,
    PETABENCANA_REPORTS_URL,
    PetaBencanaAdapter,
)

logger = logging.getLogger(__name__)

OBSERVED_SNAPSHOT_KEY = "lrip:state:observed_disasters:v1"
OBSERVED_SOURCE_KEY = "lrip:state:observed_disasters:source:{source}:v1"
LEGACY_BNPB_CACHE_KEY = "lrip:state:source:bnpb"
SCHEMA_VERSION = 1
SOURCE_METADATA = {
    "bmkg_cap": {
        "attribution": BMKG_ATTRIBUTION,
        "source_url": BMKG_CAP_FEED_URL,
        "enabled_flag": "BMKG_CAP_ENABLED",
    },
    "petabencana": {
        "attribution": PETABENCANA_ATTRIBUTION,
        "source_url": PETABENCANA_REPORTS_URL,
        "enabled_flag": "PETABENCANA_NONCOMMERCIAL_ENABLED",
    },
    "bnpb": {
        "attribution": "BNPB (Badan Nasional Penanggulangan Bencana)",
        "source_url": "https://data.bnpb.go.id/",
        "enabled_flag": "BNPB_OBSERVED_ENABLED",
    },
}
SUCCESS_STATUSES = {"ok", "ckan", "dibi", "bulletin"}
ReserveCallback = Callable[..., bool | Awaitable[bool]]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _decode_json(raw: Any) -> Optional[dict[str, Any]]:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _cache_read(key: str) -> Optional[dict[str, Any]]:
    try:
        from app.services.redis_client import cache_get
        return _decode_json(cache_get(key))
    except Exception as exc:
        logger.warning("Observed-disaster cache read failed for %s: %s", key, exc)
        return None


def _cache_write(key: str, value: dict[str, Any]) -> None:
    serialized = json.dumps(value, default=str, separators=(",", ":"))
    try:
        # Redis is the shared cache of record; no TTL keeps last-good snapshots
        # available for stale reads until a later successful refresh replaces it.
        from app.services.redis_client import get_redis
        get_redis().set(key, serialized)
    except Exception as exc:
        logger.warning("Observed-disaster Redis write failed for %s: %s", key, exc)
        try:
            # Match the existing Redis client memory fallback for local/offline use.
            from app.services.redis_client import cache_set
            cache_set(key, serialized, ex=30 * 86400)
        except Exception:
            logger.exception("Observed-disaster memory fallback failed for %s", key)


def _default_budget_callback() -> Optional[ReserveCallback]:
    try:
        from app.services.provider_budget import reserve_provider_budget
        return reserve_provider_budget
    except (ImportError, AttributeError):
        logger.warning("Provider budget service unavailable; observed-data refresh denied")
        return None


def _enabled(source: str) -> bool:
    flag = SOURCE_METADATA[source]["enabled_flag"]
    return os.getenv(flag, "").strip().lower() in {"1", "true", "yes", "on"}


def _read_source_state(source: str) -> Optional[dict[str, Any]]:
    state = _cache_read(OBSERVED_SOURCE_KEY.format(source=source))
    if state:
        return state
    # Legacy BNPB cache has no freshness/status envelope. It is exposed as stale
    # context only and never interpreted as an observed flood footprint.
    if source == "bnpb":
        try:
            from app.services.redis_client import cache_get
            old_raw = cache_get(LEGACY_BNPB_CACHE_KEY)
            old_items = json.loads(old_raw) if old_raw else None
            if isinstance(old_items, list):
                return {
                    "schema_version": SCHEMA_VERSION,
                    "source": source,
                    "status": "stale",
                    "updated_at": None,
                    "last_success_at": None,
                    "last_success_status": "legacy_cache_unverified",
                    "stale": True,
                    "attribution": SOURCE_METADATA[source]["attribution"],
                    "source_url": SOURCE_METADATA[source]["source_url"],
                    "item_count": len(old_items),
                    "items": [item for item in old_items if isinstance(item, dict)],
                }
        except Exception as exc:
            logger.debug("Legacy BNPB cache read failed: %s", exc)
    return None


def _assemble_snapshot() -> dict[str, Any]:
    now = _now_iso()
    sources = {}
    disaster_reports = []
    official_warnings = []
    for source in SOURCE_METADATA:
        state = _read_source_state(source)
        if state is None:
            state = {
                "schema_version": SCHEMA_VERSION,
                "source": source,
                "status": "not_configured",
                "updated_at": None,
                "last_success_at": None,
                "last_success_status": None,
                "stale": True,
                "attribution": SOURCE_METADATA[source]["attribution"],
                "source_url": SOURCE_METADATA[source]["source_url"],
                "item_count": 0,
                "items": [],
            }
        raw_items = state.get("items")
        state_items: list[Any] = raw_items if isinstance(raw_items, list) else []
        sources[source] = {key: value for key, value in state.items() if key != "items"}
        if source == "bmkg_cap":
            official_warnings.extend(item for item in state_items if isinstance(item, dict))
        elif source == "petabencana":
            disaster_reports.extend(item for item in state_items if isinstance(item, dict))
        else:
            # BNPB CKAN products are aggregate statistics, not event observations.
            # Keep them in the source cache but don't turn their reference points
            # into active disaster reports.
            disaster_reports.extend(
                item for item in state_items
                if isinstance(item, dict) and item.get("status") != "stats"
            )

    overall = "ok" if any(source.get("status") == "ok" for source in sources.values()) else "degraded"
    return {
        "schema_version": SCHEMA_VERSION,
        "updated_at": now,
        "status": overall,
        "disaster_reports": disaster_reports,
        "official_warnings": official_warnings,
        "sources": sources,
    }


def _store_source_state(source: str, state: dict[str, Any]) -> None:
    _cache_write(OBSERVED_SOURCE_KEY.format(source=source), state)
    _cache_write(OBSERVED_SNAPSHOT_KEY, _assemble_snapshot())


async def _reserve_callback(
    callback: ReserveCallback,
    source: str,
    units: int = 1,
    request_id: Optional[str] = None,
) -> bool:
    try:
        result = callback(source, units=units, request_id=request_id)
        if inspect.isawaitable(result):
            result = await result
        return bool(result)
    except Exception as exc:
        logger.warning("Provider budget reservation failed closed for %s: %s", source, exc)
        return False


def _normalise_events(source: str, raw: dict[str, Any]) -> list[dict[str, Any]]:
    key = "warnings" if source == "bmkg_cap" else "reports" if source == "petabencana" else "items"
    values = raw.get(key)
    if not isinstance(values, list):
        return []
    return [item for item in values if isinstance(item, dict)]


async def refresh_observed_disasters(
    source: str,
    reserve_provider_budget: Optional[ReserveCallback] = None,
) -> dict[str, Any]:
    """Refresh one source; network calls are reserved individually and fail closed."""
    if source not in SOURCE_METADATA:
        raise ValueError(f"Unsupported observed-disaster source: {source}")

    now = _now_iso()
    previous = _read_source_state(source)
    enabled = _enabled(source)
    budget = reserve_provider_budget if reserve_provider_budget is not None else _default_budget_callback()
    request_id = f"observed:{source}:{uuid.uuid4()}"

    if not enabled or budget is None:
        status = "disabled" if not enabled else "budget_unavailable"
        state = dict(previous or {})
        state.update({
            "schema_version": SCHEMA_VERSION,
            "source": source,
            "status": status,
            "updated_at": now,
            "last_success_at": (previous or {}).get("last_success_at"),
            "last_success_status": (previous or {}).get("last_success_status"),
            "stale": True,
            "attribution": SOURCE_METADATA[source]["attribution"],
            "source_url": SOURCE_METADATA[source]["source_url"],
            "items": (previous or {}).get("items", []),
            "item_count": len((previous or {}).get("items", [])),
        })
        _store_source_state(source, state)
        return state

    callback = lambda requested_source, units=1, request_id=None: _reserve_callback(
        budget, requested_source, units=units, request_id=request_id
    )
    try:
        if source == "bmkg_cap":
            raw = await BMKGCAPAdapter(callback).fetch(request_id)
        elif source == "petabencana":
            raw = await PetaBencanaAdapter(callback).fetch(request_id)
        else:
            adapter = BNPBAdapter(callback)
            adapter.deduplicate = False
            raw = await adapter.fetch()
            if raw.get("status") in SUCCESS_STATUSES:
                raw["items"] = await adapter.parse(raw)
    except Exception as exc:
        logger.warning("Observed-disaster refresh failed for %s: %s", source, exc, exc_info=True)
        raw = {"status": "unavailable", "items": []}

    source_status = str(raw.get("status") or "unavailable") if isinstance(raw, dict) else "unavailable"
    if source_status not in SUCCESS_STATUSES:
        # Preserve the last successful item slice while publishing degraded state.
        state = dict(previous or {})
        state.update({
            "schema_version": SCHEMA_VERSION,
            "source": source,
            "status": "degraded",
            "updated_at": now,
            "last_success_at": (previous or {}).get("last_success_at"),
            "last_success_status": (previous or {}).get("last_success_status"),
            "stale": True,
            "error_status": source_status,
            "attribution": SOURCE_METADATA[source]["attribution"],
            "source_url": SOURCE_METADATA[source]["source_url"],
            "items": (previous or {}).get("items", []),
            "item_count": len((previous or {}).get("items", [])),
        })
        _store_source_state(source, state)
        return state

    items = _normalise_events(source, raw)
    state = {
        "schema_version": SCHEMA_VERSION,
        "source": source,
        "status": "ok",
        "updated_at": now,
        "last_success_at": now,
        "last_success_status": source_status,
        "stale": False,
        "attribution": SOURCE_METADATA[source]["attribution"],
        "source_url": SOURCE_METADATA[source]["source_url"],
        "item_count": len(items),
        "items": items,
    }
    _store_source_state(source, state)
    return state


def read_observed_disasters() -> dict[str, Any]:
    """Return only the shared cached snapshot; this function never performs GETs."""
    snapshot = _cache_read(OBSERVED_SNAPSHOT_KEY)
    if snapshot:
        return snapshot
    snapshot = _assemble_snapshot()
    return snapshot
