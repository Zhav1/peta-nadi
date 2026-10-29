"""
PreHub : FastAPI Application Entry Point
"""
import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from contextlib import asynccontextmanager

# Resolve paths so imports like 'agents' and 'app' work regardless of CWD
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = os.path.dirname(backend_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import health, incidents, agent_router, approvals, demo_router, commodity_router, corridor_router, routing_router, vehicles_router, news_router, outcomes_router, evaluation_router, auth_router, fleet_ingest_router, intermodal_router, geocode_router, travels_router, erp_router, bnpb_router, internal_tick, dashboard_bootstrap
from app.services.redis_client import get_redis, close_redis

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Batch ingestion jobs (Phase 162 / M8)
#
# Every batch source is one *cycle* coroutine (`_run_*_cycle`) plus a thin
# in-process loop (`_poll_*_loop`) kept for local/dev. The production driver is
# the protected external tick (`POST /internal/tick` ->
# `app.services.job_scheduler`), which resolves these cycle functions through
# `app.main` at call time. Adapter imports stay *inside* the cycle bodies, so a
# thin-web boot never imports numpy/scipy/langgraph just to start the web
# process or to register routes.
#
# Cycle contract: exactly one pass, no sleep, raise on failure (the scheduler
# records `last_status=error` + `retry_after`; the in-process loop logs and
# keeps going). Per-source cadences live in `job_scheduler.JOB_SPECS`; the dev
# loops keep their original intervals.
# ---------------------------------------------------------------------------


async def _run_bmkg_cycle():
    """One BMKG earthquake/warning ingestion pass."""
    from app.adapters.bmkg_adapter import BMKGAdapter

    adapter = BMKGAdapter()
    raw = await adapter.fetch()
    events = await adapter.parse(raw)
    if events:
        r = get_redis()
        for ev in events:
            r.lpush("lrip:live_events", json.dumps(ev))
        r.ltrim("lrip:live_events", 0, 49)  # Retain top 50 recent events
        logger.info(f"Ingested {len(events)} live BMKG events into Redis lrip:live_events")
    return len(events or [])


async def _run_tomtom_cycle():
    """One TomTom traffic-speed pass (single fetch; health derived from status).

    Writes lrip:tomtom:segment:* for cache sharing with corridor/routing services.
    """
    from app.adapters.tomtom_adapter import TomTomAdapter, tomtom_poll_seconds

    adapter = TomTomAdapter()
    try:
        raw = await adapter.fetch()
        flow_items = raw.get("flow", [])
        if flow_items:
            r = get_redis()
            cache_ex = tomtom_poll_seconds()
            for item in flow_items:
                seg = item.get("flowSegmentData", {})
                name = item.get("_checkpoint_name", "checkpoint")
                free_speed = max(1.0, float(seg.get("freeFlowSpeed", 60.0)))
                curr_speed = float(seg.get("currentSpeed", 30.0))
                delay_min = max(0.0, (1.0 - (curr_speed / free_speed)) * 45.0)

                payload = {
                    "name": name,
                    "lat": item.get("_lat"),
                    "lon": item.get("_lon"),
                    "delay_min": round(delay_min, 1),
                    "currentTravelTime": seg.get("currentTravelTime", 0),
                    "currentSpeed": curr_speed,
                    "freeFlowSpeed": free_speed,
                    "timestamp": datetime.now(timezone.utc).timestamp()
                }
                r.set(f"lrip:tomtom:segment:{name}", json.dumps(payload), ex=cache_ex)
            logger.info(f"TomTom poller cached {len(flow_items)} segment delays in Redis.")

        fetch_status = raw.get("status", "ok")
        if fetch_status == "down":
            adapter.update_source_health("down")
        elif fetch_status == "degraded":
            adapter.update_source_health("degraded")
        else:
            adapter.update_source_health("ok")
        return len(flow_items)
    except Exception:
        try:
            adapter.update_source_health("down")
        except Exception:
            pass
        raise


async def _run_open_meteo_cycle():
    """One Open-Meteo atmospheric forecast pass."""
    from app.adapters.open_meteo_adapter import OpenMeteoAdapter

    adapter = OpenMeteoAdapter()
    raw = await adapter.fetch()
    if not raw:
        return 0
    events = await adapter.parse(raw)
    if not events:
        # Never clobber a good cache with an empty parse result.
        logger.debug("Open-Meteo poll returned no events; retaining cached forecast")
        return 0
    r = get_redis()
    r.set("lrip:cache:open_meteo", json.dumps(events), ex=25200)
    logger.info("Open-Meteo weather forecast cached in Redis.")
    return len(events)


async def _run_firms_cycle():
    """One NASA FIRMS VIIRS_SNPP_NRT hotspot pass (3h satellite cadence).

    Provision path: NASA_FIRMS_MAP_KEY via Render env (sync:false) + .env.local
    locally (never commit). Without a key the job stays honest-degraded and
    never fabricates hotspots — GET /api/v1/fire/hotspots returns degraded.
    Events land in lrip:events:nasa_firms with Redis 24h dedup (adapter-level).
    """
    from app.adapters.nasa_firms_adapter import NASAFIRMSAdapter
    from app.services.redis_client import SOURCE_CACHE_PREFIX

    adapter = NASAFIRMSAdapter()
    if not settings.nasa_firms_map_key:
        logger.warning("NASA_FIRMS_MAP_KEY missing — FIRMS poller honest-degraded (butuh MAP_KEY)")
        adapter.update_source_health("degraded")
        return 0
    try:
        raw = await adapter.fetch()
        events = await adapter.parse(raw)
        r = get_redis()
        if events:
            for ev in events:
                r.lpush("lrip:events:nasa_firms", json.dumps(ev))
            r.ltrim("lrip:events:nasa_firms", 0, 999)
            r.set(f"{SOURCE_CACHE_PREFIX}nasa_firms", json.dumps(events), ex=10800)
            logger.info(f"Ingested {len(events)} FIRMS hotspot events into Redis lrip:events:nasa_firms")
        else:
            logger.debug("FIRMS poll: no new corridor hotspots in this pass")
        adapter.update_source_health("ok")
        return len(events or [])
    except Exception:
        try:
            adapter.update_source_health("down")
        except Exception:
            pass
        raise


async def _run_bnpb_cycle():
    """One BNPB DIBI/bulletin disaster-event pass.

    Honest-degraded by design: DIBI + bnpb.go.id both unreachable means an
    empty parse, so the last-known-good cache is retained and
    GET /api/v1/bnpb/events keeps serving [] with status=unavailable.
    Events land in lrip:events:bnpb with adapter-level 7d Redis dedup.
    """
    from app.adapters.bnpb_adapter import BNPBAdapter
    from app.services.redis_client import SOURCE_CACHE_PREFIX, STREAM_BNPB

    adapter = BNPBAdapter()
    try:
        healthy = await adapter.health_check()
        if not healthy:
            adapter.update_source_health("degraded")
            logger.warning("BNPB health check failed; retaining cached disaster events")
            return 0
        raw = await adapter.fetch()
        events = await adapter.parse(raw)
        r = get_redis()
        if events:
            for ev in events:
                r.lpush(STREAM_BNPB, json.dumps(ev))
            r.ltrim(STREAM_BNPB, 0, 999)
            r.set(f"{SOURCE_CACHE_PREFIX}bnpb", json.dumps(events), ex=86400)
            logger.info(f"Ingested {len(events)} BNPB disaster events into Redis {STREAM_BNPB}")
        else:
            logger.debug("BNPB poll: no new Sumatra disaster events in this pass")
        adapter.update_source_health("ok")
        return len(events or [])
    except Exception:
        try:
            adapter.update_source_health("down")
        except Exception:
            pass
        raise


async def _run_news_cycle():
    """One Google News RSS ingestion pass (Supabase dedupe owned by the router)."""
    from app.routers.news_router import get_live_news

    await get_live_news(force_refresh=True)
    return True


async def _run_pihps_cycle():
    """One Bank Indonesia PIHPS commodity-price pass (no sleep)."""
    from app.scrapers.pihps_scraper import PIHPSScraper

    return await PIHPSScraper().run_once()


def _social_token() -> str:
    return str(getattr(settings, "twitter_bearer_token", "") or "").strip()


async def _record_social_disabled():
    """Publish the explicit ``disabled_no_token`` health state (never fabricate)."""
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        r = get_redis()
        # Set fields individually for Redis 3.0 compatibility (matches adapters).
        r.hset("lrip:health:social_scraper", "status", "disabled_no_token")
        r.hset("lrip:health:social_scraper", "updated_at", now_iso)
    except Exception as e:
        logger.warning(f"Could not record social scraper health state: {e}")
    logger.info("Social OSINT poller disabled: TWITTER_BEARER_TOKEN not configured.")


async def _run_social_cycle():
    """One citizen social OSINT pass (no token => explicit disabled state, exit)."""
    if not _social_token():
        await _record_social_disabled()
        return 0
    from app.scrapers.social_scraper import SocialScraper

    return await SocialScraper().run_once()


async def _poll_bmkg_loop():
    """Dev-only continuous BMKG loop (production uses the external tick)."""
    logger.info("Starting background BMKG poller task...")
    try:
        while True:
            try:
                await _run_bmkg_cycle()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"BMKG background poll error: {e}")
            await asyncio.sleep(60)  # Poll every 60 seconds (dev cadence)
    except asyncio.CancelledError:
        logger.info("BMKG background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in BMKG poller loop: {e}")


async def _poll_tomtom_loop():
    """Dev-only continuous TomTom loop (production uses the external tick).

    Interval from TOMTOM_POLL_SECONDS (default 1800s).
    """
    logger.info("Starting background TomTom poller task...")
    try:
        from app.adapters.tomtom_adapter import tomtom_poll_seconds

        while True:
            try:
                await _run_tomtom_cycle()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"TomTom background poll error: {e}")
            await asyncio.sleep(tomtom_poll_seconds())
    except asyncio.CancelledError:
        logger.info("TomTom background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in TomTom poller loop: {e}")


async def _poll_open_meteo_loop():
    """Dev-only continuous Open-Meteo loop (production uses the external tick)."""
    logger.info("Starting background Open-Meteo poller task...")
    try:
        while True:
            try:
                await _run_open_meteo_cycle()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"Open-Meteo/Weather poll error: {e}")
            await asyncio.sleep(21600)  # Every 6 hours (dev cadence)
    except asyncio.CancelledError:
        logger.info("Open-Meteo background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in Open-Meteo poller loop: {e}")


async def _poll_firms_loop():
    """Dev-only continuous NASA FIRMS loop (production uses the external tick)."""
    logger.info("Starting background NASA FIRMS poller task (3h cadence)...")
    try:
        while True:
            try:
                await _run_firms_cycle()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"NASA FIRMS background poll error: {e}")
            await asyncio.sleep(10800)  # Every 3 hours (dev cadence)
    except asyncio.CancelledError:
        logger.info("NASA FIRMS background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in NASA FIRMS poller loop: {e}")


async def _poll_bnpb_loop():
    """Dev-only continuous BNPB loop (production uses the external tick)."""
    logger.info("Starting background BNPB poller task (1h cadence)...")
    try:
        while True:
            try:
                await _run_bnpb_cycle()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"BNPB background poll error: {e}")
            await asyncio.sleep(3600)  # Every 1 hour (dev cadence)
    except asyncio.CancelledError:
        logger.info("BNPB background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in BNPB poller loop: {e}")


async def _run_aisstream():
    """Background WebSocket listener for AIS maritime vessels."""
    logger.info("Starting background AISstream WebSocket task...")
    try:
        from app.adapters.aisstream_adapter import get_aisstream_adapter
        adapter = get_aisstream_adapter()
        await adapter.run()
    except asyncio.CancelledError:
        logger.info("AISstream WebSocket task canceled.")
    except Exception as e:
        logger.warning(f"AISstream background error: {e}")


async def _poll_news_loop():
    """Dev-only continuous news loop (production uses the external tick)."""
    logger.info("Starting background News poller task...")
    try:
        while True:
            try:
                await _run_news_cycle()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"News poller error: {e}")
            await asyncio.sleep(300)  # Every 5 minutes (dev cadence)
    except asyncio.CancelledError:
        logger.info("News poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in News poller loop: {e}")


async def _poll_pihps_loop():
    """Dev-only continuous PIHPS loop (scraper owns normal/crisis cadence)."""
    logger.info("Starting background PIHPS poller task...")
    try:
        from app.scrapers.pihps_scraper import PIHPSScraper
        scraper = PIHPSScraper()
        await scraper.run()
    except asyncio.CancelledError:
        logger.info("PIHPS background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in PIHPS poller loop: {e}")


async def _poll_social_osint_loop():
    """Dev-only continuous social OSINT loop (scraper owns normal/crisis cadence).

    No token means no data: publish an explicit ``disabled_no_token`` health
    state and exit cleanly instead of synthesising citizen reports or running a
    second scrape path. The existing SocialScraper owns cadence and publishing.
    """
    logger.info("Starting background Social OSINT poller task...")
    if not _social_token():
        await _record_social_disabled()
        return

    try:
        from app.scrapers.social_scraper import SocialScraper
        await SocialScraper().run()
    except asyncio.CancelledError:
        logger.info("Social OSINT background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in Social OSINT poller loop: {e}")


# ---------------------------------------------------------------------------
# Continuous consumers (AIS WebSocket + validated-alert fan-out)
#
# These are NOT batch ingestion: they are long-lived per-process streams that
# must survive thin-web mode. They are deferred by
# `CONTINUOUS_TASK_DELAY_SECONDS` (default 75s) and supervised with exponential
# backoff, so the boot spike, the first `/health` and the first login get the
# CPU first. A failure is logged, never fatal.
# ---------------------------------------------------------------------------

_CONTINUOUS_RESTART_BACKOFF_SECONDS = 5.0
_CONTINUOUS_MAX_BACKOFF_SECONDS = 300.0


async def _consume_validated_alerts():
    """Tail the cross-process validated-alert stream (Redis handle owned inside)."""
    from app.services.alert_fanout import consume_validated_alerts_stream

    await consume_validated_alerts_stream()


async def _supervised_continuous(name: str, runner, delay: float):
    """Wait out the boot window, then run `runner` supervised with backoff."""
    try:
        await asyncio.sleep(max(0.0, delay))
        backoff = _CONTINUOUS_RESTART_BACKOFF_SECONDS
        while True:
            try:
                await runner()
                logger.info("%s exited; restarting in %.0fs", name, backoff)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning("%s background error (retrying in %.0fs): %s", name, backoff, e)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, _CONTINUOUS_MAX_BACKOFF_SECONDS)
    except asyncio.CancelledError:
        logger.info("%s task canceled.", name)
        raise


def _schedule_continuous(name: str, runner, delay: float):
    """Create the supervised, delayed continuous task (kept for observability)."""
    task = asyncio.create_task(
        _supervised_continuous(name, runner, delay),
        name=f"prehub:{name}",
    )
    logger.info(
        "BOOT: %s deferred %.0fs (boot window reserved for /health and login)",
        name,
        max(0.0, delay),
    )
    return task


async def _prewarm_dashboard() -> None:
    """One-shot dashboard prewarm: snapshot build+store and fusion warm.

    Runs detached after boot; never raises, never blocks startup. A failure is
    logged and the 5-minute external tick remains the steady-state writer, so
    this never duplicates periodic work.
    """
    try:
        from app.services import dashboard_snapshot_service

        status = await dashboard_snapshot_service.build_and_store_global_snapshot()
        if isinstance(status, dict) and status.get("status") == "ok":
            logger.info(
                "BOOT: dashboard prewarm ok (%s sections, computed_at=%s)",
                status.get("sections"),
                status.get("computed_at"),
            )
        else:
            logger.warning(
                "BOOT: dashboard prewarm did not store a snapshot: %s",
                (status or {}).get("error", status),
            )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning(f"BOOT: dashboard prewarm snapshot failed (non-fatal): {exc}")
    try:
        from app.routers import routing_router

        await routing_router._load_fusion_snapshot()
        logger.info("BOOT: weather fusion prewarm done")
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning(f"BOOT: weather fusion prewarm failed (non-fatal): {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    logger.info(f"Starting {settings.app_name} v{settings.version} [{settings.environment}]")
    if settings.demo_offline:
        logger.warning("BOOT: DEMO_OFFLINE=true — mock LLM branch active; production must run DEMO_OFFLINE=false")
    else:
        logger.info("BOOT: DEMO_OFFLINE=false — live LLM gateway active (opencode-first, fail-loud)")
    # Startup: verify Redis connection
    try:
        r = get_redis()
        r.ping()
        logger.info("Redis connection: OK")
    except Exception as e:
        logger.warning(f"Redis connection failed: {e} : continuing without Redis")

    # Startup: flag a missing service-role key before the first incident write.
    # Without it the anon client is RLS-denied and writes vanish silently.
    try:
        from app.db.supabase_client import init_write_health
        init_write_health()
    except Exception as e:
        logger.warning(f"Supabase write health check failed: {e}")

    # Start background work. Three independent switches (Phase 162):
    #   POLLERS_ENABLED            — master switch for any in-process worker.
    #   INPROCESS_BATCH_POLLERS    — the 8 batch ingestion loops. Production sets
    #                                this false ("thin web"); the external tick
    #                                POST /internal/tick is then the only driver.
    #   CONTINUOUS_TASK_DELAY_SECONDS — boot delay for AIS + alert fan-out.
    # `--workers > 1` duplicates every worker per process; extra replicas should
    # run POLLERS_ENABLED=false.
    pollers_enabled = bool(getattr(settings, "pollers_enabled", True))
    batch_pollers_enabled = pollers_enabled and bool(
        getattr(settings, "inprocess_batch_pollers", True)
    )

    tasks = []
    if batch_pollers_enabled:
        bmkg_task = asyncio.create_task(_poll_bmkg_loop())
        tomtom_task = asyncio.create_task(_poll_tomtom_loop())
        open_meteo_task = asyncio.create_task(_poll_open_meteo_loop())
        firms_task = asyncio.create_task(_poll_firms_loop())
        news_task = asyncio.create_task(_poll_news_loop())
        pihps_task = asyncio.create_task(_poll_pihps_loop())
        social_task = asyncio.create_task(_poll_social_osint_loop())
        bnpb_task = asyncio.create_task(_poll_bnpb_loop())
        tasks = [bmkg_task, tomtom_task, open_meteo_task, firms_task, news_task, pihps_task, social_task, bnpb_task]
    elif pollers_enabled:
        logger.info(
            "BOOT: INPROCESS_BATCH_POLLERS=false — thin web. Batch ingestion is "
            "driven by the protected external tick (POST /internal/tick, "
            "5-minute cron); nothing batch runs in this process."
        )
    else:
        logger.warning(
            "BOOT: POLLERS_ENABLED=false — HTTP-only process; background pollers not started"
        )

    continuous_delay = float(
        getattr(settings, "continuous_task_delay_seconds", 75.0) or 0.0
    )

    # AIS is continuous, not batch: it keeps running in thin-web mode. Both it
    # and the alert fan-out are deferred so boot, /health and login win the CPU.
    if pollers_enabled:
        tasks.append(_schedule_continuous("aisstream", _run_aisstream, continuous_delay))
    else:
        logger.warning("BOOT: POLLERS_ENABLED=false — AISstream WebSocket not started")

    # Cross-process validated-alert bridge. Every API process tails its own copy
    # of lrip:stream:validated_alerts so /ws/crisis/{crisis_id} clients see
    # alerts produced by another worker. Not gated on POLLERS_ENABLED: WebSocket
    # fan-out is per-process even for HTTP-only replicas. Redis being down is
    # handled inside the consumer (exponential backoff, never crashes boot).
    tasks.append(
        _schedule_continuous(
            "validated_alert_fanout", _consume_validated_alerts, continuous_delay
        )
    )

    # Best-effort JWKS pre-warm (Phase 161). The first asymmetric token
    # verification otherwise pays the JWKS TLS fetch inside the auth dependency —
    # i.e. on the login SLO. Runs in a worker thread so boot is not blocked, and
    # a failure is logged rather than fatal (verification retries on demand).
    jwks_task = None
    if getattr(settings, "supabase_jwks_key", "") or getattr(settings, "supabase_url", ""):
        try:
            from app.auth.supabase_auth import prewarm_jwks
            jwks_task = asyncio.create_task(asyncio.to_thread(prewarm_jwks))
            logger.info("BOOT: JWKS pre-warm scheduled")
        except Exception as e:
            logger.warning(f"JWKS pre-warm not scheduled (non-fatal): {e}")
    else:
        logger.info("BOOT: JWKS pre-warm skipped (no SUPABASE_URL / SUPABASE_JWKS_KEY)")

    # Unit B prewarm: build+store the global snapshot and warm the weather
    # fusion once after boot. Detached so startup is never blocked; tracked in
    # `tasks` so shutdown cancels it. The 5-minute external tick stays the only
    # periodic writer.
    try:
        prewarm_task = asyncio.create_task(_prewarm_dashboard(), name="prehub:dashboard-prewarm")
        tasks.append(prewarm_task)
        logger.info("BOOT: dashboard prewarm scheduled")
    except Exception as e:
        logger.warning(f"BOOT: dashboard prewarm not scheduled (non-fatal): {e}")

    yield  # Application runs here

    # Shutdown
    logger.info("Shutting down background workers...")
    if jwks_task is not None:
        jwks_task.cancel()
        try:
            await jwks_task
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"JWKS pre-warm shutdown error: {e}")
    for t in tasks:
        t.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    close_redis()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="PreHub: Sistem Peringatan Dini dan Rekomendasi Mitigasi Gangguan Distribusi Pangan Berbasis Data Multisumber.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS : allow Next.js frontend on localhost, 127.0.0.1, Vercel deployments, and Render
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https?://((localhost|127\.0\.0\.1)(:\d+)?|.*\.vercel\.app|.*\.onrender\.com)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["health"])
async def root():
    """Root status endpoint providing service metadata and discovery links."""
    return {
        "status": "ok",
        "service": "prehub-api",
        "version": settings.version,
        "docs": "/docs",
        "health": "/health"
    }


# Routers
app.include_router(health.router)
# Protected external tick (M8 / Phase 162). Declares both /internal/tick and the
# /api/v1/internal/tick alias, so no prefix is applied here.
app.include_router(internal_tick.router)
# Dashboard bootstrap read model (M8 / Phase 163a). Declares both
# /api/v1/dashboard/bootstrap and the /dashboard/bootstrap alias.
app.include_router(dashboard_bootstrap.router)
app.include_router(incidents.router, prefix="/api/v1")
app.include_router(approvals.router, prefix="/api/v1")
app.include_router(corridor_router.router, prefix="/api/v1")
app.include_router(routing_router.router, prefix="/api/v1")
app.include_router(agent_router.router)
app.include_router(demo_router.router, prefix="/api")
app.include_router(demo_router.router, include_in_schema=False)  # Keep backward compatibility if anything hits /demo
app.include_router(commodity_router.router, prefix="/api/v1")
app.include_router(commodity_router.router, prefix="/api/v1/commodity", include_in_schema=False)
app.include_router(vehicles_router.router)
app.include_router(news_router.router)
app.include_router(outcomes_router.router, prefix="/api/v1")
app.include_router(evaluation_router.router, prefix="/api/v1")
app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(fleet_ingest_router.router, prefix="/api/v1")
app.include_router(travels_router.router, prefix="/api/v1")
app.include_router(erp_router.router, prefix="/api/v1")
app.include_router(intermodal_router.router, prefix="/api/v1")
app.include_router(geocode_router.router, prefix="/api/v1")
app.include_router(bnpb_router.router, prefix="/api/v1")


@app.websocket("/ws/crisis/{crisis_id}")
async def websocket_crisis_endpoint(websocket: WebSocket, crisis_id: str):
    """Real-time WebSocket endpoint for crisis streaming telemetry and agent events.

    Validated alerts are fanned out here from ``app.services.alert_fanout`` when
    Agent 6 runs in this process. Cross-process producers write to the Redis
    stream ``lrip:stream:validated_alerts``; the terminal SSE event
    ``simulation_complete`` also always carries an ``alert`` field, so SSE-only
    clients never miss the validated alert.
    """
    from app.services.alert_fanout import (
        get_last_alert,
        register_listener,
        unregister_listener,
    )

    await websocket.accept()
    alert_queue = register_listener(crisis_id)
    logger.info(f"WebSocket client connected for crisis: {crisis_id}")

    async def _pump_validated_alerts():
        while True:
            alert = await alert_queue.get()
            await websocket.send_json({
                "event": "validated_alert",
                "crisis_id": crisis_id,
                "data": alert,
            })

    pump_task = None
    try:
        await websocket.send_json({
            "event": "connected",
            "data": {
                "crisis_id": crisis_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": "active"
            }
        })

        # Late subscribers still receive the last validated alert for this crisis.
        last_alert = get_last_alert(crisis_id)
        if last_alert:
            await websocket.send_json({
                "event": "validated_alert",
                "crisis_id": crisis_id,
                "data": last_alert,
            })

        pump_task = asyncio.create_task(_pump_validated_alerts())

        while True:
            # Keep connection open, receive client heartbeat or commands
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected for crisis: {crisis_id}")
    except Exception as e:
        logger.warning(f"WebSocket error for crisis {crisis_id}: {e}")
    finally:
        if pump_task is not None:
            pump_task.cancel()
            try:
                await pump_task
            except asyncio.CancelledError:
                pass
            except Exception as pump_err:
                logger.debug(f"WebSocket alert pump stopped for {crisis_id}: {pump_err}")
        unregister_listener(crisis_id, alert_queue)


