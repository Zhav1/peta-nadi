from fastapi import APIRouter
from app.config import get_settings
from app.services.sumatra_scope import scope_asset_status
import logging
import asyncio
import time

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["health"])

_SOURCES_CACHE = {
    "data": None,
    "timestamp": 0.0
}
SOURCES_CACHE_TTL = 30.0

# Health contract shared with the pollers/adapters/scrapers:
#   adapters/base.py + scrapers/base_scraper.py -> lrip:health:source:{source_name}
#   main.py social poller / social scraper      -> lrip:health:social_scraper
#   db/supabase_client.py write guard           -> lrip:health:supabase_write
SOURCE_HEALTH_PREFIX = "lrip:health:source:"
SOCIAL_SCRAPER_HEALTH_KEY = "lrip:health:social_scraper"
SUPABASE_WRITE_HEALTH_KEY = "lrip:health:supabase_write"

# Redis/Supabase status token -> frontend status token. "unknown" is deliberate:
# absence of telemetry is not evidence of health.
_STATUS_MAP = {
    "ok": "healthy",
    "healthy": "healthy",
    "up": "healthy",
    "enabled": "healthy",
    "degraded": "degraded",
    "down": "down",
    "disabled": "disabled",
    "disabled_no_token": "disabled",
    "disabled_no_service_key": "degraded",
}

# `requires` is the Settings attribute that must be configured for the source to
# be usable. A missing key always demotes the source (never "healthy" by default).
_SOURCE_SPECS = [
    {
        "name": "BMKG",
        "db_name": "bmkg",
        "redis_key": f"{SOURCE_HEALTH_PREFIX}bmkg",
        "requires": None,
        "missing_note": None,
    },
    {
        "name": "TomTom",
        "db_name": "tomtom",
        "redis_key": f"{SOURCE_HEALTH_PREFIX}tomtom",
        "requires": "tomtom_api_key",
        "missing_note": "butuh TOMTOM_API_KEY — set di Render env / .env.local",
    },
    {
        "name": "AISstream",
        "db_name": "aisstream",
        "redis_key": f"{SOURCE_HEALTH_PREFIX}aisstream",
        "requires": "aisstream_api_key",
        "missing_note": "butuh AISSTREAM_API_KEY — set di Render env / .env.local",
    },
    {
        "name": "NASA FIRMS",
        "db_name": "nasa_firms",
        "redis_key": f"{SOURCE_HEALTH_PREFIX}nasa_firms",
        "requires": "nasa_firms_map_key",
        "missing_note": "butuh MAP_KEY — set NASA_FIRMS_MAP_KEY di Render env / .env.local",
    },
    {
        "name": "Social OSINT",
        "db_name": "social",
        "redis_key": SOCIAL_SCRAPER_HEALTH_KEY,
        "requires": "twitter_bearer_token",
        "missing_note": "butuh TWITTER_BEARER_TOKEN — poller disabled_no_token",
    },
    {
        "name": "Supabase Write",
        "db_name": None,
        "redis_key": SUPABASE_WRITE_HEALTH_KEY,
        "requires": "supabase_service_role_key",
        "missing_note": "butuh SUPABASE_SERVICE_ROLE_KEY (service_role, bukan anon) — write RLS ditolak",
    },
]


def _health_key_configured(requirement: str | None) -> bool:
    if not requirement:
        return True
    return bool(str(getattr(settings, requirement, "") or "").strip())


def _read_redis_health() -> dict[str, dict[str, str]]:
    """Read every source health hash written by pollers/adapters/scrapers.

    Redis is the fast dashboard lookup path; Supabase `data_sources` is the
    durable mirror. Anything unreadable is simply absent from the result.
    """
    from app.services.redis_client import get_redis

    r = get_redis()
    fallback_key = f"{SOURCE_HEALTH_PREFIX}social"
    keys = list(dict.fromkeys([spec["redis_key"] for spec in _SOURCE_SPECS] + [fallback_key]))

    # One pipeline round-trip: a down Redis fails fast instead of costing a
    # connect timeout per source.
    pipe = r.pipeline()
    for key in keys:
        pipe.hgetall(key)
    rows = pipe.execute()

    health: dict[str, dict[str, str]] = {
        key: row for key, row in zip(keys, rows) if row
    }

    # Social scraper publishes through BaseScraper (source:social); the poller
    # publishes the richer social_scraper key. Prefer the poller key when both
    # exist, but never lose the scraper fallback.
    if SOCIAL_SCRAPER_HEALTH_KEY not in health and fallback_key in health:
        health[SOCIAL_SCRAPER_HEALTH_KEY] = health[fallback_key]

    return health


def _build_source_entry(
    spec: dict,
    redis_health: dict[str, dict[str, str]],
    db_map: dict[str, dict],
) -> dict:
    """Merge Redis telemetry, the DB mirror and env capability into one entry."""
    redis_row = redis_health.get(spec["redis_key"]) or {}
    db_row = db_map.get(spec["db_name"]) if spec.get("db_name") else None
    has_telemetry = bool(redis_row) or bool(db_row)

    raw_status = redis_row.get("status") or (db_row or {}).get("status")

    # Supabase write has no poller loop: when the service-role key is configured
    # but no write has happened yet, report the guard's capability flag instead
    # of an ambiguous "unknown". A missing key is handled by the gate below.
    capability_fallback = False
    if not raw_status and spec["name"] == "Supabase Write" and _health_key_configured("supabase_service_role_key"):
        try:
            from app.db.supabase_client import get_write_status
            raw_status = get_write_status()
            capability_fallback = bool(raw_status)
        except Exception:
            raw_status = None

    status = _STATUS_MAP.get(str(raw_status or "").strip().lower(), "unknown")

    if not _health_key_configured(spec.get("requires")):
        # Capability gate: an absent key can never be masked by a stale 'ok'.
        status = "disabled" if spec["requires"] == "twitter_bearer_token" else "degraded"
        note = spec["missing_note"]
    elif redis_row:
        note = "redis_health"
    elif capability_fallback:
        note = "configured — menunggu write telemetry"
    elif has_telemetry:
        note = "data_sources"
    else:
        note = "no telemetry yet — poller belum menulis health key"

    return {
        "name": spec["name"],
        "status": status,
        "last_seen": redis_row.get("updated_at") or (db_row or {}).get("updated_at"),
        "note": note,
    }


@router.get("/health")
@router.get("/api/v1/health")
async def health_check():
    """System health check endpoint (liveness only; sources report separately)."""
    return {
        "status": "ok",
        "version": settings.version,
        "environment": settings.environment,
        "service": "prehub-api",
    }


@router.get("/api/v1/health/sources")
async def source_health_check():
    """
    Get per-source health status from Redis health hashes (primary) merged with
    the Supabase 'data_sources' mirror, with a 30s cache.

    Redis is read for every adapter key plus the social-scraper and Supabase
    write guards, so a missing/degraded source is never reported as healthy.
    """
    now = time.time()
    if _SOURCES_CACHE["data"] is not None and (now - _SOURCES_CACHE["timestamp"]) < SOURCES_CACHE_TTL:
        return _SOURCES_CACHE["data"]

    # Redis health telemetry (fast path). Failure means "no evidence", not "ok".
    try:
        redis_health = await asyncio.to_thread(_read_redis_health)
    except Exception as e:
        logger.warning(f"Redis health telemetry unavailable: {e}")
        redis_health = {}

    # Durable mirror in Supabase. Stale rows are still overridden by Redis/env.
    db_map: dict[str, dict] = {}
    try:
        from app.db.supabase_client import get_client
        sb = get_client()

        result = await asyncio.to_thread(
            lambda: sb.table("data_sources").select("*").execute()
        )
        db_items = result.data or []
        db_map = {str(item.get("name", "")).lower(): item for item in db_items}
    except Exception as e:
        logger.warning(f"Supabase data_sources unavailable; using Redis/env health only: {e}")

    sources = [_build_source_entry(spec, redis_health, db_map) for spec in _SOURCE_SPECS]
    payload = {
        "sources": sources,
        # Filtered aircraft/FIRMS layers fail closed when this asset is gone.
        # Surfacing it here makes a missing scope asset observable instead of
        # silently blanking two map layers.
        "map_scope": scope_asset_status(),
    }
    _SOURCES_CACHE["data"] = payload
    _SOURCES_CACHE["timestamp"] = now
    return payload
