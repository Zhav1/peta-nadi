"""
PetaNadi / LRIP — FastAPI Application Entry Point
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
from app.routers import health, incidents, agent_router, approvals, demo_router, commodity_router, corridor_router, routing_router
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

    # Start background tasks
    bmkg_task = asyncio.create_task(_poll_bmkg_loop())

    yield  # Application runs here

    # Shutdown
    logger.info("Shutting down...")
    bmkg_task.cancel()
    close_redis()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="AI-powered logistics resilience and disaster response intelligence platform.",
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
