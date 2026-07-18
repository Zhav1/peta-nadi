"""
ingestion_worker.py — Concurrent orchestrator runner for all data adapters.

Usage:
    python -m app.workers.ingestion_worker
"""
import asyncio
import logging
import signal
import sys
import os

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.config import get_settings
from app.adapters.bmkg_adapter import BMKGAdapter
from app.adapters.tomtom_adapter import TomTomAdapter
from app.adapters.aisstream_adapter import AISstreamAdapter
from app.adapters.nasa_firms_adapter import NASAFIRMSAdapter
from app.adapters.earth2_adapter import Earth2Adapter

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
            Earth2Adapter()
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
            await asyncio.gather(*self.tasks, return_exceptions=True)
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
