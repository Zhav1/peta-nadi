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
from app.routers import health, incidents, agent_router, approvals, demo_router, commodity_router, corridor_router, routing_router, vehicles_router, news_router, outcomes_router, evaluation_router, auth_router, fleet_ingest_router, intermodal_router, geocode_router, travels_router, erp_router, bnpb_router
from app.services.redis_client import get_redis, close_redis

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


async def _poll_bmkg_loop():
    """Background polling loop for BMKG earthquake and weather warnings."""
    logger.info("Starting background BMKG poller task...")
    try:
        from app.adapters.bmkg_adapter import BMKGAdapter
        adapter = BMKGAdapter()
        while True:
            try:
                raw = await adapter.fetch()
                events = await adapter.parse(raw)
                if events:
                    r = get_redis()
                    for ev in events:
                        r.lpush("lrip:live_events", json.dumps(ev))
                    r.ltrim("lrip:live_events", 0, 49)  # Retain top 50 recent events
                    logger.info(f"Ingested {len(events)} live BMKG events into Redis lrip:live_events")
            except Exception as e:
                logger.warning(f"BMKG background poll error: {e}")
            await asyncio.sleep(60)  # Poll every 60 seconds
    except asyncio.CancelledError:
        logger.info("BMKG background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in BMKG poller loop: {e}")


async def _poll_tomtom_loop():
    """Background poller for TomTom traffic speeds & segment delays.

    Single fetch() per cycle (no separate health_check flow request — health is
    derived from fetch status). Interval from TOMTOM_POLL_SECONDS (default 1800s).
    Writes lrip:tomtom:segment:* for cache sharing with corridor/routing services.
    """
    logger.info("Starting background TomTom poller task...")
    try:
        from app.adapters.tomtom_adapter import TomTomAdapter, tomtom_poll_seconds
        adapter = TomTomAdapter()
        while True:
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
            except Exception as e:
                logger.warning(f"TomTom background poll error: {e}")
                try:
                    adapter.update_source_health("down")
                except Exception:
                    pass
            await asyncio.sleep(tomtom_poll_seconds())  # Interval from TOMTOM_POLL_SECONDS (default 1800s)
    except asyncio.CancelledError:
        logger.info("TomTom background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in TomTom poller loop: {e}")


async def _poll_open_meteo_loop():
    """Background poller for Open-Meteo atmospheric forecasts."""
    logger.info("Starting background Open-Meteo poller task...")
    try:
        from app.adapters.open_meteo_adapter import OpenMeteoAdapter
        adapter = OpenMeteoAdapter()
        while True:
            try:
                raw = await adapter.fetch()
                if raw:
                    events = await adapter.parse(raw)
                    if events:
                        r = get_redis()
                        r.set("lrip:cache:open_meteo", json.dumps(events), ex=25200)
                        logger.info("Open-Meteo weather forecast cached in Redis.")
                    else:
                        # Never clobber a good cache with an empty parse result.
                        logger.debug("Open-Meteo poll returned no events; retaining cached forecast")
            except Exception as e:
                logger.warning(f"Open-Meteo/Weather poll error: {e}")
            await asyncio.sleep(21600)  # Every 6 hours
    except asyncio.CancelledError:
        logger.info("Open-Meteo background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in Open-Meteo poller loop: {e}")


async def _poll_firms_loop():
    """Q6: Background poller for NASA FIRMS VIIRS_SNPP_NRT hotspots (3h satellite cadence).

    Provision path: NASA_FIRMS_MAP_KEY via Render env (sync:false) + .env.local
    locally (never commit). Without a key the loop stays honest-degraded and
    never fabricates hotspots — GET /api/v1/fire/hotspots returns degraded.
    Events land in lrip:events:nasa_firms with Redis 24h dedup (adapter-level).
    """
    logger.info("Starting background NASA FIRMS poller task (3h cadence)...")
    try:
        from app.adapters.nasa_firms_adapter import NASAFIRMSAdapter
        from app.services.redis_client import SOURCE_CACHE_PREFIX
        adapter = NASAFIRMSAdapter()
        while True:
            try:
                if not settings.nasa_firms_map_key:
                    logger.warning("NASA_FIRMS_MAP_KEY missing — FIRMS poller honest-degraded (butuh MAP_KEY)")
                    adapter.update_source_health("degraded")
                else:
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
            except Exception as e:
                logger.warning(f"NASA FIRMS background poll error: {e}")
                try:
                    adapter.update_source_health("down")
                except Exception:
                    pass
            await asyncio.sleep(10800)  # Every 3 hours
    except asyncio.CancelledError:
        logger.info("NASA FIRMS background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in NASA FIRMS poller loop: {e}")


async def _poll_bnpb_loop():
    """Background poller for BNPB DIBI/bulletin disaster events (1h cadence).

    Honest-degraded by design: DIBI + bnpb.go.id both unreachable means an
    empty parse, so the last-known-good cache is retained and
    GET /api/v1/bnpb/events keeps serving [] with status=unavailable.
    Events land in lrip:events:bnpb with adapter-level 7d Redis dedup.
    """
    logger.info("Starting background BNPB poller task (1h cadence)...")
    try:
        from app.adapters.bnpb_adapter import BNPBAdapter
        from app.services.redis_client import SOURCE_CACHE_PREFIX, STREAM_BNPB
        adapter = BNPBAdapter()
        while True:
            try:
                healthy = await adapter.health_check()
                if not healthy:
                    adapter.update_source_health("degraded")
                    logger.warning("BNPB health check failed; retaining cached disaster events")
                else:
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
            except Exception as e:
                logger.warning(f"BNPB background poll error: {e}")
                try:
                    adapter.update_source_health("down")
                except Exception:
                    pass
            await asyncio.sleep(3600)  # Every 1 hour
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
    """Background poller for Google News RSS feeds."""
    logger.info("Starting background News poller task...")
    try:
        from app.routers.news_router import get_live_news
        while True:
            try:
                await get_live_news(force_refresh=True)
            except Exception as e:
                logger.warning(f"News poller error: {e}")
            await asyncio.sleep(300)  # Every 5 minutes
    except asyncio.CancelledError:
        logger.info("News poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in News poller loop: {e}")


async def _poll_pihps_loop():
    """Background poller for Bank Indonesia PIHPS commodity prices (24h normal / 15m crisis)."""
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
    """Background poller for citizen social OSINT (Twitter/X).

    No token means no data: publish an explicit ``disabled_no_token`` health
    state and exit cleanly instead of synthesising citizen reports or running a
    second scrape path. The existing SocialScraper owns cadence and publishing.
    """
    logger.info("Starting background Social OSINT poller task...")
    token = str(getattr(settings, "twitter_bearer_token", "") or "").strip()
    if not token:
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            r = get_redis()
            # Set fields individually for Redis 3.0 compatibility (matches adapters).
            r.hset("lrip:health:social_scraper", "status", "disabled_no_token")
            r.hset("lrip:health:social_scraper", "updated_at", now_iso)
        except Exception as e:
            logger.warning(f"Could not record social scraper health state: {e}")
        logger.info("Social OSINT poller disabled: TWITTER_BEARER_TOKEN not configured.")
        return

    try:
        from app.scrapers.social_scraper import SocialScraper
        await SocialScraper().run()
    except asyncio.CancelledError:
        logger.info("Social OSINT background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in Social OSINT poller loop: {e}")


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

    # Start all background tasks. `--workers > 1` duplicates every poller per
    # process, so only the primary API process (POLLERS_ENABLED=true, default)
    # runs ingestion; extra replicas serve HTTP only.
    tasks = []
    if bool(getattr(settings, "pollers_enabled", True)):
        bmkg_task = asyncio.create_task(_poll_bmkg_loop())
        tomtom_task = asyncio.create_task(_poll_tomtom_loop())
        open_meteo_task = asyncio.create_task(_poll_open_meteo_loop())
        firms_task = asyncio.create_task(_poll_firms_loop())
        ais_task = asyncio.create_task(_run_aisstream())
        news_task = asyncio.create_task(_poll_news_loop())
        pihps_task = asyncio.create_task(_poll_pihps_loop())
        social_task = asyncio.create_task(_poll_social_osint_loop())
        bnpb_task = asyncio.create_task(_poll_bnpb_loop())
        tasks = [bmkg_task, tomtom_task, open_meteo_task, firms_task, ais_task, news_task, pihps_task, social_task, bnpb_task]
    else:
        logger.warning(
            "BOOT: POLLERS_ENABLED=false — HTTP-only process; background pollers not started"
        )

    # Cross-process validated-alert bridge. Every API process tails its own copy
    # of lrip:stream:validated_alerts so /ws/crisis/{crisis_id} clients see
    # alerts produced by another worker. Not gated on POLLERS_ENABLED: WebSocket
    # fan-out is per-process even for HTTP-only replicas. Redis being down is
    # handled inside the consumer (exponential backoff, never crashes boot).
    alert_consumer_task = None
    try:
        from app.services.alert_fanout import consume_validated_alerts_stream
        alert_consumer_task = asyncio.create_task(consume_validated_alerts_stream())
        logger.info("BOOT: validated-alert stream consumer registered")
    except Exception as e:
        logger.warning(f"Validated-alert stream consumer not started: {e}")

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
    if alert_consumer_task is not None:
        alert_consumer_task.cancel()
        try:
            await alert_consumer_task
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"Validated-alert stream consumer shutdown error: {e}")
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


