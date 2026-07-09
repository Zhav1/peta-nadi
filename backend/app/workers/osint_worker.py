"""
osint_worker.py — Concurrent orchestrator runner for all OSINT scrapers.

Usage:
    python -m app.workers.osint_worker
"""
import asyncio
import logging
import signal
import sys
import os

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.config import get_settings
from app.scrapers.pihps_scraper import PIHPSScraper
from app.scrapers.marketplace_scraper import MarketplaceScraper
from app.scrapers.social_scraper import SocialScraper

# Load configuration
settings = get_settings()

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("osint_worker")

class OSINTWorker:
    def __init__(self):
        self.scrapers = [
            PIHPSScraper(),
            MarketplaceScraper(),
            SocialScraper()
        ]
        self.tasks = []
        self.running = False

    async def start(self):
        """Start all scrapers concurrently."""
        logger.info("Initializing PetaNadi OSINT worker...")
        self.running = True
        
        # Gather all run tasks
        self.tasks = [asyncio.create_task(scraper.run()) for scraper in self.scrapers]
        
        logger.info(f"Concurrently running {len(self.tasks)} active OSINT scrapers.")
        try:
            await asyncio.gather(*self.tasks, return_exceptions=True)
        except asyncio.CancelledError:
            logger.info("Worker tasks canceled.")
        except Exception as e:
            logger.error(f"OSINT worker encountered fatal error: {e}", exc_info=True)

    def stop(self):
        """Stop all running tasks."""
        if not self.running:
            return
        
        logger.info("Stopping OSINT worker...")
        self.running = False
        for task in self.tasks:
            if not task.done():
                task.cancel()
        logger.info("All tasks requested to cancel.")

async def main():
    worker = OSINTWorker()
    loop = asyncio.get_running_loop()
    
    # Handle shutdown signals for clean termination
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
        # For Windows Proactor loop compatibility with signals/subprocess
        if sys.platform == 'win32':
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Exiting on SIGINT.")
