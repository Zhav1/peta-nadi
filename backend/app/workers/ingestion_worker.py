"""
ingestion_worker.py : Concurrent orchestrator runner for all data adapters.

Usage:
    python -m app.workers.ingestion_worker
"""
import asyncio
import logging
import signal
import sys
import os
from typing import Any, Dict, List

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.config import get_settings
from app.adapters.bmkg_adapter import BMKGAdapter
from app.adapters.tomtom_adapter import TomTomAdapter
from app.adapters.aisstream_adapter import AISstreamAdapter
from app.adapters.nasa_firms_adapter import NASAFIRMSAdapter
from app.adapters.open_meteo_adapter import OpenMeteoAdapter
from app.adapters.bnpb_adapter import BNPBAdapter

# Load configuration
settings = get_settings()

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("ingestion_worker")

class IngestionWorker:
    def __init__(self):
        self.adapters = [
            BMKGAdapter(),
            TomTomAdapter(),
            AISstreamAdapter(),
            NASAFIRMSAdapter(),
            OpenMeteoAdapter(),
            BNPBAdapter()
        ]
        self.tasks = []
        self.running = False

    async def start(self):
        """Start all adapters concurrently."""
        logger.info("Initializing PetaNadi Ingestion worker...")
        self.running = True
        
        # Gather all run tasks
        self.tasks = [asyncio.create_task(adapter.run()) for adapter in self.adapters]
        
        logger.info(f"Concurrently running {len(self.tasks)} active ingestion adapters.")
        try:
            results = await asyncio.gather(*self.tasks, return_exceptions=True)
            for adapter, result in zip(self.adapters, results):
                if isinstance(result, BaseException):
                    logger.error(
                        f"Ingestion adapter {type(adapter).__name__} failed: {result}",
                        exc_info=result,
                    )
        except asyncio.CancelledError:
            logger.info("Worker tasks canceled.")
        except Exception as e:
            logger.error(f"Ingestion worker encountered fatal error: {e}", exc_info=True)

    def stop(self):
        """Stop all running tasks."""
        if not self.running:
            return
        
        logger.info("Stopping Ingestion worker...")
        self.running = False
        for task in self.tasks:
            if not task.done():
                task.cancel()
        logger.info("All tasks requested to cancel.")

    async def run_news_gate2_review(
        self,
        articles: List[Dict[str, Any]],
        timeout_seconds: float = 60.0,
        max_concurrency: int = 5,
    ) -> Dict[str, Any]:
        """Selective async Gate-2 background review for uncertain news items.

        SPEC-LOCKED M5 Phase A Q2+Q7: delegates to
        app.nlp.news_extractor.run_gate2_async_verification (uncertain /
        YELLOW / conf<0.7 / ambiguous ONLY; full-body 2500ch+ fetch,
        mimo-v2.6-pro low-effort reasoning, single web-search verify, W/T/I/E
        consensus re-check, 5-conc, 60s/item timeout, MD5 cache, schema v6).
        Still-uncertain items resolve to DROPPED_IRRELEVANT (koroborasi
        kurang). Never raises — returns a status dict.
        """
        try:
            from app.nlp.news_extractor import run_gate2_async_verification
        except Exception as ie:
            logger.debug(f"News Gate-2 review skipped (import): {ie}")
            return {"status": "skipped", "reason": "import_unavailable", "reviewed": 0}
        try:
            refined = await run_gate2_async_verification(
                [a for a in (articles or []) if isinstance(a, dict)],
                timeout_seconds=timeout_seconds,
                max_concurrency=max_concurrency,
            )
            reviewed = len(refined or [])
        except Exception as ge:
            logger.debug(f"News Gate-2 review failed: {ge}")
            return {"status": "degraded", "reason": str(ge), "reviewed": 0}
        return {"status": "success", "reviewed": reviewed}


async def run_news_gate2_background_task(
    articles: List[Dict[str, Any]],
    timeout_seconds: float = 60.0,
    max_concurrency: int = 5,
) -> Dict[str, Any]:
    """Module-level selective async Gate-2 background task (Q2+Q7).

    Fire-and-forget safe: `asyncio.create_task(run_news_gate2_background_task(...))`
    from the ingestion cycle. Never raises.
    """
    try:
        worker = IngestionWorker.__new__(IngestionWorker)
        worker.tasks = []
        worker.running = False
        return await worker.run_news_gate2_review(
            articles,
            timeout_seconds=timeout_seconds,
            max_concurrency=max_concurrency,
        )
    except Exception as e:
        logger.debug(f"News Gate-2 background task skipped: {e}")
        return {"status": "skipped", "reason": str(e), "reviewed": 0}

async def main():
    worker = IngestionWorker()
    loop = asyncio.get_running_loop()
    
    # Handle shutdown signals for clean termination (Unix-only normally, but works in some windows environments)
    # We will wrap in try/except for Windows signal compatibility
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, worker.stop)
        except NotImplementedError:
            # Signal handlers are not implemented for Windows ProactorEventLoop
            pass

    try:
        await worker.start()
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt received.")
        worker.stop()
    except Exception as e:
        logger.error(f"Fatal worker exception: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Exiting on SIGINT.")
