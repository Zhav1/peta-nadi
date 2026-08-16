"""
PreHub — FastAPI Application Entry Point
"""
import asyncio
import json
import logging
import os
import sys
from contextlib import asynccontextmanager

# Resolve paths so imports like 'agents' and 'app' work regardless of CWD
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = os.path.dirname(backend_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import health, incidents, agent_router, approvals, demo_router, commodity_router, corridor_router, routing_router, vehicles_router, news_router
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
    """Background poller for TomTom traffic speeds & segment delays."""
    logger.info("Starting background TomTom poller task...")
    try:
        from app.adapters.tomtom_adapter import TomTomAdapter
        adapter = TomTomAdapter()
        while True:
            try:
                raw = await adapter.fetch()
                flow_items = raw.get("flow", [])
                if flow_items:
                    r = get_redis()
                    for item in flow_items:
                        seg = item.get("flowSegmentData", {})
                        name = item.get("_checkpoint_name", "checkpoint")
                        free_speed = max(1.0, float(seg.get("freeFlowSpeed", 60.0)))
                        curr_speed = float(seg.get("currentSpeed", 30.0))
                        delay_min = max(0.0, (1.0 - (curr_speed / free_speed)) * 45.0)
                        
                        payload = {
                            "name": name,
                            "delay_min": round(delay_min, 1),
                            "currentTravelTime": seg.get("currentTravelTime", 0),
                            "currentSpeed": curr_speed,
                            "freeFlowSpeed": free_speed,
                            "timestamp": datetime.now(timezone.utc).timestamp()
                        }
                        r.set(f"lrip:tomtom:segment:{name}", json.dumps(payload), ex=600)
                    logger.info(f"TomTom poller cached {len(flow_items)} segment delays in Redis.")
            except Exception as e:
                logger.warning(f"TomTom background poll error: {e}")
            await asyncio.sleep(300)  # Poll every 5 minutes
    except asyncio.CancelledError:
        logger.info("TomTom background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in TomTom poller loop: {e}")


async def _poll_earth2_loop():
    """Background poller for Open-Meteo atmospheric forecasts."""
    logger.info("Starting background Earth2/Open-Meteo poller task...")
    try:
        from app.adapters.earth2_adapter import Earth2Adapter
        adapter = Earth2Adapter()
        while True:
            try:
                raw = await adapter.fetch()
                if raw:
                    events = await adapter.parse(raw)
                    r = get_redis()
                    r.set("lrip:cache:earth2", json.dumps(events), ex=21600)
                    logger.info("Earth2/Open-Meteo weather forecast cached in Redis.")
            except Exception as e:
                logger.warning(f"Earth2/Weather poll error: {e}")
            await asyncio.sleep(21600)  # Every 6 hours
    except asyncio.CancelledError:
        logger.info("Earth2 background poller task canceled.")
    except Exception as e:
        logger.error(f"Fatal error in Earth2 poller loop: {e}")


async def _run_aisstream():
    """Background WebSocket listener for AIS maritime vessels."""
    logger.info("Starting background AISstream WebSocket task...")
    try:
        from app.adapters.aisstream_adapter import AISstreamAdapter
        adapter = AISstreamAdapter()
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    logger.info(f"Starting {settings.app_name} v{settings.version} [{settings.environment}]")
    # Startup: verify Redis connection
    try:
        r = get_redis()
        r.ping()
        logger.info("Redis connection: OK")
    except Exception as e:
        logger.warning(f"Redis connection failed: {e} — continuing without Redis")

    # Start all background tasks
    bmkg_task = asyncio.create_task(_poll_bmkg_loop())
    tomtom_task = asyncio.create_task(_poll_tomtom_loop())
    earth2_task = asyncio.create_task(_poll_earth2_loop())
    ais_task = asyncio.create_task(_run_aisstream())
    news_task = asyncio.create_task(_poll_news_loop())

    yield  # Application runs here

    # Shutdown
    logger.info("Shutting down background workers...")
    for t in [bmkg_task, tomtom_task, earth2_task, ais_task, news_task]:
        t.cancel()
    close_redis()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="PreHub: Sistem Peringatan Dini dan Rekomendasi Mitigasi Gangguan Distribusi Pangan Berbasis Data Multisumber.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(incidents.router, prefix="/api/v1")
app.include_router(approvals.router, prefix="/api/v1")
app.include_router(corridor_router.router, prefix="/api/v1")
app.include_router(routing_router.router, prefix="/api/v1")
app.include_router(agent_router.router)
app.include_router(demo_router.router)
app.include_router(commodity_router.router, prefix="/api/v1")
app.include_router(vehicles_router.router)
app.include_router(news_router.router)

