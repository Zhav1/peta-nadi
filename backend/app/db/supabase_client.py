"""
Supabase client factory for PetaNadi.
Provides a typed client for all database operations.
"""
import logging
from typing import Optional
from supabase import create_client, Client
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_supabase_client: Optional[Client] = None

# Pilot health flag: surfaced via Redis so ops can see *why* incident writes are
# being skipped instead of a silent RLS denial on the anon client.
SUPABASE_WRITE_HEALTH_KEY = "lrip:health:supabase_write"
SUPABASE_WRITE_ENABLED = "enabled"
SUPABASE_WRITE_DISABLED_NO_SERVICE_KEY = "disabled_no_service_key"
# Degraded-source token consumed by write_incident / demo router logging.
SUPABASE_WRITE_DISABLED_SOURCE = "supabase_write_disabled"

_write_health_recorded = False


def has_service_role_key() -> bool:
    """True when a non-blank SUPABASE_SERVICE_ROLE_KEY is configured."""
    return bool(str(settings.supabase_service_role_key or "").strip())


def get_write_status() -> str:
    """Current write-path capability flag (no network calls)."""
    return (
        SUPABASE_WRITE_ENABLED
        if has_service_role_key()
        else SUPABASE_WRITE_DISABLED_NO_SERVICE_KEY
    )


def is_write_configured() -> bool:
    """True when writes can bypass RLS (service-role key present)."""
    return has_service_role_key()


def record_write_health(status: Optional[str] = None) -> str:
    """Persist the write-path health flag to Redis (best effort, never raises)."""
    global _write_health_recorded
    status = status or get_write_status()
    try:
        from app.services.redis_client import get_redis

        get_redis().set(SUPABASE_WRITE_HEALTH_KEY, status)
        _write_health_recorded = True
    except Exception as exc:  # Redis down must never block startup or writes
        logger.warning(
            "Could not record %s=%s in Redis: %s",
            SUPABASE_WRITE_HEALTH_KEY,
            status,
            exc,
        )
    return status


def init_write_health() -> str:
    """Startup check: flag a missing service-role key before the first write.

    Without the service-role key the anon client is subject to RLS, so incident
    writes are denied silently. Flagging this at boot makes the demo degrade
    loudly (and keeps the in-memory replay path intact) instead of losing data.
    """
    status = get_write_status()
    if status == SUPABASE_WRITE_DISABLED_NO_SERVICE_KEY:
        logger.warning(
            "SUPABASE_SERVICE_ROLE_KEY missing: Supabase writes are DISABLED "
            "(%s=%s). Writes would fall back to the anon client and be denied "
            "by RLS; incident persistence will report degraded source '%s' "
            "until the true service_role key is set.",
            SUPABASE_WRITE_HEALTH_KEY,
            status,
            SUPABASE_WRITE_DISABLED_SOURCE,
        )
    else:
        logger.info(
            "Supabase write client: service-role key configured (%s=%s)",
            SUPABASE_WRITE_HEALTH_KEY,
            status,
        )
    return record_write_health(status)


def get_client() -> Client:
    """Get or create the Supabase client (singleton)."""
    global _supabase_client
    if _supabase_client is None:
        if not settings.supabase_url or not settings.supabase_anon_key:
            raise RuntimeError(
                "Supabase credentials not configured. "
                "Set SUPABASE_URL and SUPABASE_ANON_KEY in .env"
            )
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_anon_key,
        )
        logger.info(f"Supabase client initialized: {settings.supabase_url}")
    return _supabase_client


def get_service_client() -> Client:
    """
    Get a Supabase client with service role key.
    Use for admin operations that bypass Row Level Security (RLS).
    Never expose this client to the frontend.
    """
    if not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY not configured")
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )


def get_write_client() -> Client:
    """
    Client for backend write paths (ingestors, workers, routers).
    Prefers the service-role key so RLS-restricted mutations succeed; falls back
    to the anon client when the service key is not configured (local/demo).

    The fallback is *not* silent: it is flagged in Redis
    (``lrip:health:supabase_write = disabled_no_service_key``) so callers can
    degrade explicitly instead of treating an RLS denial as a successful write.
    """
    if settings.supabase_service_role_key:
        return get_service_client()
    global _write_health_recorded
    if not _write_health_recorded:
        logger.warning(
            "SUPABASE_SERVICE_ROLE_KEY not configured, using anon client for writes. "
            "Mutations on RLS-restricted tables (e.g. incidents, data_sources) will "
            "fail with 'new row violates row-level security policy'. Set the true "
            "service_role key in .env / Render dashboard. Flagging %s=%s.",
            SUPABASE_WRITE_HEALTH_KEY,
            SUPABASE_WRITE_DISABLED_NO_SERVICE_KEY,
        )
        record_write_health(SUPABASE_WRITE_DISABLED_NO_SERVICE_KEY)
    return get_client()
