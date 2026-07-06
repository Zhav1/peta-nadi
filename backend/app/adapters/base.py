import asyncio
import json
import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from app.services.redis_client import publish_event, get_redis, SOURCE_CACHE_PREFIX
from app.db.supabase_client import get_client

logger = logging.getLogger(__name__)

class BaseAdapter(ABC):
    source_name: str          # e.g., 'bmkg', 'tomtom'
    stream_key: str           # e.g., 'lrip:events:bmkg'
    poll_interval_seconds: int = 300

    def __init__(self):
        if not hasattr(self, 'source_name') or not hasattr(self, 'stream_key'):
            raise TypeError("Adapters must define 'source_name' and 'stream_key'")

    @abstractmethod
    async def fetch(self) -> Any:
        """Fetch raw data from the external API."""
        pass

    @abstractmethod
    async def parse(self, raw_data: Any) -> List[Dict[str, Any]]:
        """Parse raw API data into normalized event dictionaries."""
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the external API endpoint is responsive."""
        pass

    async def run(self):
        """Continuous polling loop: health check -> fetch -> parse -> publish -> cache."""
        logger.info(f"Starting adapter for {self.source_name} (interval: {self.poll_interval_seconds}s)")
        
        while True:
            try:
                is_healthy = await self.health_check()
                
                if not is_healthy:
                    logger.warning(f"Health check failed for {self.source_name}. Attempting to use cached fallback data.")
                    self.update_source_health("degraded")
                    # Try to retrieve and publish cached events
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

    def publish(self, events: List[Dict[str, Any]]):
        """Publish a list of normalized events to the Redis stream."""
        for event in events:
            try:
                publish_event(self.stream_key, event)
            except Exception as e:
                logger.error(f"Failed to publish event to stream {self.stream_key} for {self.source_name}: {e}")

    def update_source_health(self, status: str):
        """Update source health in Supabase and Redis KV."""
        last_ok_at = None
        now_str = datetime.now(timezone.utc).isoformat()
        
        if status == "ok":
            last_ok_at = now_str
            
        # 1. Update Redis KV for fast dashboard lookup
        try:
            r = get_redis()
            health_key = f"lrip:health:source:{self.source_name}"
            # Set each field individually for Redis 3.0 compatibility
            r.hset(health_key, "status", status)
            r.hset(health_key, "updated_at", now_str)
            
            existing_last_ok = r.hget(health_key, "last_ok_at") or ""
            r.hset(health_key, "last_ok_at", last_ok_at or existing_last_ok)
        except Exception as e:
            logger.error(f"Failed to update Redis health state for {self.source_name}: {e}")

        # 2. Update Supabase data_sources table (gracefully skip if no credentials)
        try:
            supabase = get_client()
            update_data = {
                "status": status,
                "updated_at": now_str
            }
            if last_ok_at:
                update_data["last_ok_at"] = last_ok_at
                
            supabase.table("data_sources").update(update_data).eq("name", self.source_name).execute()
        except RuntimeError as e:
            # Expected if credentials are not configured in local development
            logger.debug(f"Supabase credentials not configured. Skipping DB health update for {self.source_name}.")
        except Exception as e:
            logger.error(f"Failed to update Supabase health for {self.source_name}: {e}")

    def cache_events(self, events: List[Dict[str, Any]]):
        """Cache current active events in Redis KV as fallback."""
        try:
            r = get_redis()
            cache_key = f"{SOURCE_CACHE_PREFIX}{self.source_name}"
            r.set(cache_key, json.dumps(events), ex=86400) # cache for 24h
        except Exception as e:
            logger.error(f"Failed to cache events in Redis for {self.source_name}: {e}")

    def get_cached_events(self) -> List[Dict[str, Any]]:
        """Retrieve cached fallback events from Redis KV."""
        try:
            r = get_redis()
            cache_key = f"{SOURCE_CACHE_PREFIX}{self.source_name}"
            cached_data = r.get(cache_key)
            if cached_data:
                return json.loads(cached_data)
        except Exception as e:
            logger.error(f"Failed to retrieve cached events from Redis for {self.source_name}: {e}")
        return []
