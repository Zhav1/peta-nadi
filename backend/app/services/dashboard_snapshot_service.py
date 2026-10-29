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

# Existing default corridor (corridor_router / corridor_service default).
DEFAULT_CORRIDOR_ID = "sumatra_belawan_medan"

# Last known good *data* per section for this process. Used only when a section
# fails: a degraded snapshot serves the previous value instead of null.
_LAST_GOOD: dict[str, Any] = {}

def reset_section_cache() -> None:
    """Drop the in-process last-good section cache (used by tests)."""
    _LAST_GOOD.clear()


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
        if cache:
            _LAST_GOOD[name] = data
        ms = _elapsed_ms(started)
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
# Map bootstrap section plan (5 sections)
# ---------------------------------------------------------------------------

def section_plan(corridor_id: str = DEFAULT_CORRIDOR_ID) -> dict[str, Callable[[], Awaitable[Any]]]:
    """Return the map-bootstrap section factories (name -> async callable).

    The five sections the dashboard seeds from
    ``GET /api/v1/dashboard/bootstrap``. Weather/corridor are
    fetched live by the frontend, and Analitik/Laporan/Evaluasi are lazy-mounted,
    so persisting them every tick only inflated the row (~796 KB, of which
    ~785 KB was news). ``weather_summary`` is counts-only (same shape as
    ``GET /api/v1/weather/summary``), never polygons.

    ``corridor_id`` is kept for call-site compatibility (the bootstrap endpoint
    passes it) even though no remaining section is corridor-scoped.

    Exposed as a function so tests can substitute a small plan without touching
    the real services.
    """
    async def incidents():
        from app.routers.incidents import list_incidents

        return await list_incidents(status=None, severity=None, limit=50)

    async def news_live():
        """Direct 40-article read — not ``get_live_news``.

        ``get_live_news`` runs the 150-article breadth contract, the re-tier
        write-back and may schedule ingestion. The snapshot needs a compact
        display payload, so it reads the table directly.
        """
        from app.services.news_aggregator import fetch_news_from_supabase

        articles = await fetch_news_from_supabase(limit=40, include_regional=True)
        return {
            "status": "ok",
            "total": len(articles),
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "articles": articles,
        }

    async def news_market_regime():
        from app.routers.news_router import get_market_regime

        return await get_market_regime()

    async def fire_hotspots():
        from app.auth.supabase_auth import default_guest_session
        from app.routers.routing_router import fetch_fire_hotspots

        return await fetch_fire_hotspots(current_user=default_guest_session())

    async def weather_summary():
        """Counts-only weather counters (same shape as /weather/summary).

        Delegates to the existing summary builder with a default guest
        session. Isolation in ``run_section`` marks timeouts/failures as
        ``timeout``/``degraded`` with ``data: None`` (or the last-good
        payload) — never a fake zero.
        """
        from app.auth.supabase_auth import default_guest_session
        from app.routers.routing_router import fetch_weather_summary

        return await fetch_weather_summary(current_user=default_guest_session())

    return {
        "incidents": incidents,
        "news": news_live,
        "news_market_regime": news_market_regime,
        "fire_hotspots": fire_hotspots,
        "weather_summary": weather_summary,
    }


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

async def build_global_snapshot(
    *,
    corridor_id: Optional[str] = None,
    timeout: Optional[float] = None,
) -> dict:
    """Compose the map-bootstrap dashboard sections in parallel.

    Returns ``{snapshot_key, schema_version, computed_at, source_freshness,
    payload}`` where ``payload`` is ``{section: {data, status}}``. Section
    failures are isolated; this function only raises on a programming error in
    the gather itself (the callers still guard it).
    """
    corridor = corridor_id or DEFAULT_CORRIDOR_ID
    plan = section_plan(corridor)
    started = time.perf_counter()

    results = await asyncio.gather(
        *(run_section(name, factory, timeout=timeout) for name, factory in plan.items())
    )

    payload: dict[str, dict] = {}
    freshness: dict[str, dict] = {}
    for name, (section, fresh) in zip(plan.keys(), results):
        payload[name] = section
        freshness[name] = fresh

    snapshot = {
        "snapshot_key": GLOBAL_SNAPSHOT_KEY,
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "computed_at": utcnow().isoformat(),
        "source_freshness": freshness,
        "payload": payload,
    }
    ok = sum(1 for entry in freshness.values() if entry.get("status") == "ok")
    logger.info(
        "dashboard snapshot composed: %d/%d sections ok in %dms",
        ok,
        len(freshness),
        _elapsed_ms(started),
    )
    return snapshot


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def _client():
    """Service-role-first Supabase client (the read model must bypass RLS)."""
    from app.db.supabase_client import get_write_client

    return get_write_client()


def store_global_snapshot(snapshot: dict) -> dict:
    """Upsert ``snapshot_key='global'``. Raises on a Supabase failure."""
    row = {
        "snapshot_key": snapshot.get("snapshot_key") or GLOBAL_SNAPSHOT_KEY,
        "payload": snapshot.get("payload") or {},
        "computed_at": snapshot.get("computed_at") or utcnow().isoformat(),
        "schema_version": int(snapshot.get("schema_version") or SNAPSHOT_SCHEMA_VERSION),
        "source_freshness": snapshot.get("source_freshness") or {},
    }
    _client().table(SNAPSHOT_TABLE).upsert(row, on_conflict="snapshot_key").execute()
    return row


def read_global_snapshot() -> Optional[dict]:
    """Read the global row. ``None`` on missing / unreachable / version mismatch."""
    try:
        result = (
            _client()
            .table(SNAPSHOT_TABLE)
            .select("*")
            .eq("snapshot_key", GLOBAL_SNAPSHOT_KEY)
            .limit(1)
            .execute()
        )
    except Exception as exc:  # network, RLS, missing table, no key configured
        logger.warning("dashboard snapshot read failed: %s", exc)
        return None

    rows = getattr(result, "data", None) or []
    if not rows:
        return None

    row = rows[0] or {}
    try:
        version = int(row.get("schema_version") or SNAPSHOT_SCHEMA_VERSION)
    except (TypeError, ValueError):
        version = -1
    if version != SNAPSHOT_SCHEMA_VERSION:
        logger.warning(
            "dashboard snapshot schema_version=%s != %s; treating as a miss",
            row.get("schema_version"),
            SNAPSHOT_SCHEMA_VERSION,
        )
        return None

    computed_at = _parse_timestamp(row.get("computed_at"))
    return {
        "snapshot_key": str(row.get("snapshot_key") or GLOBAL_SNAPSHOT_KEY),
        "schema_version": version,
        "computed_at": computed_at.isoformat() if computed_at else None,
        "source_freshness": row.get("source_freshness") or {},
        "payload": row.get("payload") or {},
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

async def build_and_store_global_snapshot(
    *,
    corridor_id: Optional[str] = None,
) -> dict:
    """Build + persist the snapshot. Never raises; returns a status dict."""
    started = time.perf_counter()
    try:
        snapshot = await build_global_snapshot(corridor_id=corridor_id)
        await asyncio.to_thread(store_global_snapshot, snapshot)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning("snapshot_failed: %s", exc)
        return {
            "status": "error",
            "error": f"{type(exc).__name__}: {exc}",
            "ms": _elapsed_ms(started),
        }

    status = {
        "status": "ok",
        "snapshot_key": snapshot.get("snapshot_key"),
        "computed_at": snapshot.get("computed_at"),
        "sections": len(snapshot.get("payload") or {}),
        "ms": _elapsed_ms(started),
    }
    logger.info(
        "snapshot_built: %s sections, computed_at=%s, %dms",
        status["sections"],
        status["computed_at"],
        status["ms"],
    )
    return status
