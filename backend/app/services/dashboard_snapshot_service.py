"""DB-backed dashboard bootstrap snapshot (Phase 163a / M8).

The first dashboard paint used to fan out to ~25-30 endpoints (phase 160
baseline: 50-94 requests, 9.8-73.8 s first data). This module composes the
dashboard **map bootstrap** sections **once per tick** and persists them in
Supabase ``dashboard_snapshots`` (migration 024) so the browser can read one row
instead of recomputing the world.

Contract
--------
* :func:`build_global_snapshot` composes the five map-bootstrap sections
  (``incidents``, ``news``, ``news_market_regime``, ``fire_hotspots``,
  ``weather_summary``)
  **in parallel** with a per-section timeout (:data:`SECTION_TIMEOUT_SECONDS`)
  and full isolation: a failed or slow section is marked ``degraded``/``timeout``
  and never fails the snapshot. The last good value for that section, if this
  process has one, is served with ``cached: true``.
* The frontend fetches weather/corridor live and lazy-mounts Analitik/Laporan/
  Evaluasi, so those sections are deliberately **not** composed here (they were
  ~800 KB of mostly-unread payload every tick).
* :func:`store_global_snapshot` upserts the row (``snapshot_key='global'``).
  Only the tick calls it: the read path (``GET /api/v1/dashboard/bootstrap``)
  only reads, so dashboard traffic can never trigger snapshot writes.
* :func:`read_global_snapshot` returns ``None`` on a missing row, an
  unreachable Supabase, or a ``schema_version`` mismatch. It never raises.
* :func:`build_and_store_global_snapshot` is the tick entry point: build +
  store, log ``snapshot_built``/``snapshot_failed``, never raise.

Sections are composed with the *existing* service/router functions (no internal
HTTP). Sync functions that hit Supabase run via ``asyncio.to_thread`` so they do
not block the event loop; the underlying news/incidents reads were moved
off-loop for the same reason. All heavy imports are inside the section bodies,
so importing this module stays cheap.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

logger = logging.getLogger(__name__)

SNAPSHOT_TABLE = "dashboard_snapshots"
GLOBAL_SNAPSHOT_KEY = "global"
SNAPSHOT_SCHEMA_VERSION = 1

# 2 x the 5-minute tick cadence: a row older than this is served with stale=true.
STALE_AFTER_SECONDS = 600

# Per-section budget. Sections run in parallel, so the snapshot build costs
# ~one timeout in the worst case, not N x timeout.
SECTION_TIMEOUT_SECONDS = 5.0

# Slow upstream sections get their own budget: the 5 s default cancelled the
# snapshot's weather read (the weather builder's own timeout is 12 s) and the
# FIRMS hotspot read, so the tick always stored a ``timeout``/degraded section
# instead of real data. Sections run in parallel, so the build still costs
# ~max() ~15 s — inside the tick's 30 s snapshot budget
# (:data:`internal_tick.SNAPSHOT_BUILD_TIMEOUT_SECONDS`). An explicit
# caller-supplied ``timeout`` (tests) is always kept verbatim.
SLOW_SECTION_TIMEOUTS: dict[str, float] = {
    "fire_hotspots": 15.0,
    "weather_summary": 12.0,
}

# Existing default corridor (corridor_router / corridor_service default).
DEFAULT_CORRIDOR_ID = "sumatra_belawan_medan"

# Last known good *data* per section for this process. Used only when a section
# fails: a degraded snapshot serves the previous value instead of null.
_LAST_GOOD: dict[str, Any] = {}

def reset_section_cache() -> None:
    """Drop the in-process last-good section cache (used by tests)."""
    _LAST_GOOD.clear()


def _section_truth(name: str, data: Any) -> str:
    """Map a successfully returned section payload to ``ok`` | ``stale`` | ``degraded``.

    ``fetch_fire_hotspots`` / ``fetch_weather_summary`` never raise: they return
    a degraded/stale envelope instead. A non-raising return used to look like
    ``ok`` and got stored with a fresh ``computed_at`` (the frontend then seeded
    a degraded payload as current data), so this helper reads the inner payload
    to keep the section truth aligned with the data actually being served.
    """
    if not isinstance(data, dict):
        return "ok"
    if name == "fire_hotspots":
        inner = str(data.get("status") or "").lower()
        if inner in ("degraded", "timeout"):
            return "degraded"
        if inner == "stale":
            return "stale"
        return "ok"
    if name == "weather_summary":
        inner_statuses: list[str] = []
        for key in ("cuaca", "waspada"):
            sub = data.get(key)
            if isinstance(sub, dict):
                inner_statuses.append(str(sub.get("status") or "").lower())
        if any(s in ("degraded", "timeout") for s in inner_statuses):
            return "degraded"
        if any(s == "stale" for s in inner_statuses):
            return "stale"
        return "ok"
    return "ok"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_timestamp(value: Any) -> Optional[datetime]:
    """Parse a PostgREST/Python timestamp into an aware UTC datetime."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = datetime.fromisoformat(text.replace(" ", "T").replace("Z", "+00:00"))
        except ValueError:
            logger.debug("dashboard snapshot: unparseable timestamp %r", value)
            return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _jsonable(value: Any) -> Any:
    """Convert a router/service return value into JSON-safe data."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    try:
        from fastapi.encoders import jsonable_encoder

        return jsonable_encoder(value)
    except Exception:
        # Last resort: never let a serialisation quirk fail a whole section.
        if hasattr(value, "model_dump"):
            try:
                return value.model_dump(mode="json")
            except Exception:
                pass
        import json

        try:
            return json.loads(json.dumps(value, default=str))
        except Exception:
            return repr(value)


def _elapsed_ms(started: float) -> int:
    return int(round((time.perf_counter() - started) * 1000))


# ---------------------------------------------------------------------------
# Section isolation
# ---------------------------------------------------------------------------

async def run_section(
    name: str,
    factory: Callable[[], Any],
    *,
    timeout: Optional[float] = None,
    cache: bool = True,
) -> tuple[dict, dict]:
    """Run one section in isolation.

    Returns ``(section, freshness)`` where ``section`` is
    ``{"status", "data"}`` (plus ``cached`` when a previous value is reused) and
    freshness is ``{"status", "ms"}`` (plus ``error`` on failure). Never raises
    for a section-level failure; ``CancelledError`` is always re-raised so a
    cancelled build can still be cancelled.

    A non-raising factory return can still yield ``stale`` or ``degraded`` when
    the inner payload says so (:func:`_section_truth`): ``degraded`` payloads
    are never stored as last-good, ``stale`` ones are.

    ``cache=False`` must be used for anything tenant-scoped: the last-good cache
    is keyed by section name only, and reusing a payload across callers would
    leak one tenant's fleet into another tenant's response.
    """
    limit = SECTION_TIMEOUT_SECONDS if timeout is None else float(timeout)
    started = time.perf_counter()
    try:
        value = factory()
        if inspect.isawaitable(value):
            value = await asyncio.wait_for(value, timeout=max(0.001, limit))
        data = _jsonable(value)
        ms = _elapsed_ms(started)
        truth = _section_truth(name, data)
        if truth == "degraded":
            # The upstream returned an envelope instead of raising (fire /
            # weather do): the section must not look fresh nor be stored as
            # last-good — a degraded read is not a good value by definition.
            error = "upstream degraded"
            logger.warning("dashboard snapshot section %s: %s", name, error)
            return (
                {"status": "degraded", "data": data, "error": error},
                {"status": "degraded", "ms": ms, "error": error},
            )
        if truth == "stale":
            # Real data, just not current: serve it with stale=true and keep
            # it eligible as the last-good value for a later failure.
            if cache:
                _LAST_GOOD[name] = data
            return {"status": "stale", "data": data}, {"status": "stale", "ms": ms}
        if cache:
            _LAST_GOOD[name] = data
        return {"status": "ok", "data": data}, {"status": "ok", "ms": ms}
    except asyncio.CancelledError:
        raise
    except asyncio.TimeoutError:
        ms = _elapsed_ms(started)
        error = f"section exceeded {limit:.1f}s"
        logger.warning("dashboard snapshot section %s: %s", name, error)
        return _failure_section(name, "timeout", ms, error, cache=cache)
    except Exception as exc:
        ms = _elapsed_ms(started)
        error = f"{type(exc).__name__}: {exc}"
        logger.warning("dashboard snapshot section %s failed: %s", name, error)
        return _failure_section(name, "degraded", ms, error, cache=cache)


def _failure_section(
    name: str, status: str, ms: int, error: str, *, cache: bool = True
) -> tuple[dict, dict]:
    """Build the degraded section, reusing the last good value when available.

    Section shape is always ``{status, data}`` plus ``error`` on failure and
    ``cached`` when a previous value was reused, so the client has one shape to
    render the per-section freshness badge from.
    """
    section: dict[str, Any] = {"status": status, "data": None, "error": error}
    freshness: dict[str, Any] = {"status": status, "ms": ms, "error": error}
    if cache and name in _LAST_GOOD:
        section["data"] = _LAST_GOOD[name]
        section["cached"] = True
        freshness["cached"] = True
    return section, freshness


# ---------------------------------------------------------------------------
# Public snapshot facade
# ---------------------------------------------------------------------------

def section_plan(corridor_id: str = DEFAULT_CORRIDOR_ID) -> dict[str, Callable[[], Awaitable[Any]]]:
    """Legacy plan hook kept empty to prevent request-path provider access."""
    return {}


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

async def build_global_snapshot(
    *,
    corridor_id: Optional[str] = None,
    timeout: Optional[float] = None,
) -> dict:
    """Build the curated projection from scheduled source-cache/DB readers only."""
    from app.services.public_snapshot_service import build_public_snapshot

    public = await build_public_snapshot()
    return {
        "snapshot_key": public.get("snapshot_key"),
        "schema_version": public.get("schema_version"),
        "computed_at": public.get("computed_at"),
        "source_freshness": public.get("source_freshness") or {},
        "payload": public.get("sections") or {},
        "coverage": public.get("coverage") or {},
        "stale": public.get("stale", True),
        "shadow_mode": True,
    }


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def _client():
    """Service-role-first Supabase client (the read model must bypass RLS)."""
    from app.db.supabase_client import get_write_client

    return get_write_client()


def store_global_snapshot(snapshot: dict) -> dict:
    """Reject legacy writes; the private ``dashboard_snapshots`` table is unchanged."""
    raise RuntimeError(
        "dashboard_snapshots writes are disabled; publish the fenced public projection instead"
    )


def read_global_snapshot() -> Optional[dict]:
    """Compatibility reader backed by the new public singleton, never the old table."""
    try:
        from app.services.public_snapshot_service import _read_public_snapshot_sync

        public = _read_public_snapshot_sync()
    except Exception as exc:
        logger.warning("public dashboard snapshot read failed: %s", exc)
        return None
    if not public:
        return None
    return {
        "snapshot_key": public.get("snapshot_key"),
        "schema_version": public.get("schema_version"),
        "computed_at": public.get("computed_at"),
        "source_freshness": public.get("source_freshness") or {},
        "payload": public.get("sections") or {},
    }


def snapshot_age_seconds(snapshot: Optional[dict], now: Optional[datetime] = None) -> Optional[float]:
    """Age of a snapshot in seconds (``None`` when it has no usable timestamp)."""
    if not snapshot:
        return None
    computed_at = _parse_timestamp(snapshot.get("computed_at"))
    if computed_at is None:
        return None
    return max(0.0, ((now or utcnow()) - computed_at).total_seconds())


# ---------------------------------------------------------------------------
# Tick entry point
# ---------------------------------------------------------------------------

async def build_and_store_global_snapshot(*, lease=None, corridor_id: Optional[str] = None) -> dict:
    """Compatibility entry point requiring a live fenced publication lease."""
    if lease is None:
        return {"status": "error", "error": "active fenced lease required"}
    from app.services.public_snapshot_service import refresh_public_snapshot

    return await refresh_public_snapshot(lease=lease)
