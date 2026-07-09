import asyncio
import logging
from abc import ABC
from typing import Any, List, Dict
from app.adapters.base import BaseAdapter
from app.services.redis_client import get_redis

logger = logging.getLogger(__name__)

class BaseScraper(BaseAdapter, ABC):
    normal_interval_seconds: int = 86400  # Default to 24 hours
    crisis_interval_seconds: int = 900    # Default to 15 minutes

    def __init__(self):
        # Set a default poll_interval_seconds before calling super().__init__()
        # as it will check for fields. BaseAdapter uses self.poll_interval_seconds.
        self.poll_interval_seconds = self.normal_interval_seconds
        super().__init__()

    def is_crisis_mode(self) -> bool:
        """Check if crisis mode is active in Redis KV."""
        try:
            r = get_redis()
            val = r.get("lrip:state:crisis_mode")
            return val == "active"
        except Exception as e:
            logger.error(f"Failed to check crisis mode in Redis for {self.source_name}: {e}")
            return False

    async def run(self):
        """Continuous polling loop that dynamically checks crisis mode status."""
        logger.info(f"Starting scraper for {self.source_name} (normal: {self.normal_interval_seconds}s, crisis: {self.crisis_interval_seconds}s)")
        
        while True:
            # Check crisis mode and adjust interval
            if self.is_crisis_mode():
                if self.poll_interval_seconds != self.crisis_interval_seconds:
                    logger.info(f"Crisis mode active. Shifting {self.source_name} interval from {self.poll_interval_seconds}s to {self.crisis_interval_seconds}s")
                    self.poll_interval_seconds = self.crisis_interval_seconds
            else:
                if self.poll_interval_seconds != self.normal_interval_seconds:
                    logger.info(f"Normal mode. Reverting {self.source_name} interval from {self.poll_interval_seconds}s to {self.normal_interval_seconds}s")
                    self.poll_interval_seconds = self.normal_interval_seconds
            
            try:
                is_healthy = await self.health_check()
                
                if not is_healthy:
                    logger.warning(f"Health check failed for {self.source_name}. Attempting to use cached fallback data.")
                    self.update_source_health("degraded")
                    cached_events = self.get_cached_events()
                    if cached_events:
                        logger.info(f"Publishing {len(cached_events)} cached fallback events for {self.source_name}")
                        self.publish(cached_events)
                else:
                    self.update_source_health("ok")
                    raw_data = await self.fetch()
                    events = await self.parse(raw_data)
                    
                    if events:
                        self.publish(events)
                        self.cache_events(events)
                        logger.info(f"Successfully processed and published {len(events)} events from {self.source_name}")
                    else:
                        logger.debug(f"No new events generated for {self.source_name}")
                        
            except Exception as e:
                logger.error(f"Error in poll loop of {self.source_name}: {e}", exc_info=True)
                self.update_source_health("down")
                
            await asyncio.sleep(self.poll_interval_seconds)
