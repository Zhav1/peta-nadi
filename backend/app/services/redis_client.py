"""
Redis client factory for PetaNadi.
Provides a connection to Redis Streams (event bus) and Redis KV (STM).
"""
import logging
import redis
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_redis_client: Optional[redis.Redis] = None

# Redis stream key constants — used across the entire codebase
STREAM_BMKG = "lrip:events:bmkg"
STREAM_TOMTOM = "lrip:events:tomtom"
STREAM_AISSTREAM = "lrip:events:aisstream"
STREAM_NASA_FIRMS = "lrip:events:nasa_firms"
STREAM_PIHPS = "lrip:events:pihps"
STREAM_SOCIAL = "lrip:events:social"

STM_PREFIX = "lrip:state:crisis:"          # STM key per crisis: lrip:state:crisis:{id}
SOURCE_CACHE_PREFIX = "lrip:state:source:" # Last-known-good cache: lrip:state:source:{name}


def get_redis() -> redis.Redis:
    """Get or create the Redis client (singleton)."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
        )
        logger.info(f"Redis client initialized: {settings.redis_url.split('@')[-1]}")
    return _redis_client


def close_redis():
    """Close the Redis connection on app shutdown."""
    global _redis_client
    if _redis_client:
        _redis_client.close()
        _redis_client = None
        logger.info("Redis connection closed")


def publish_event(stream: str, event: dict) -> str:
    """
    Publish an event to a Redis Stream.
    Returns the event ID assigned by Redis.
    
    Args:
        stream: Stream key (use constants above, e.g. STREAM_BMKG)
        event: Dict of string key-value pairs (all values must be strings)
    
    Returns:
        Redis-assigned event ID (e.g., '1234567890123-0')
    """
    r = get_redis()
    # Stringify all values (Redis Streams require string values)
    str_event = {k: str(v) for k, v in event.items()}
    event_id = r.xadd(stream, str_event, maxlen=10_000, approximate=True)
    logger.debug(f"Published to {stream}: id={event_id}")
    return event_id


def get_stm_state(crisis_id: str) -> dict:
    """Get the current Short-Term Memory state for an active crisis."""
    r = get_redis()
    raw = r.hgetall(f"{STM_PREFIX}{crisis_id}")
    return raw or {}


def set_stm_state(crisis_id: str, state: dict, ttl_seconds: int = 86400):
    """Update the STM state for an active crisis. TTL defaults to 24 hours."""
    r = get_redis()
    key = f"{STM_PREFIX}{crisis_id}"
    r.hset(key, mapping={k: str(v) for k, v in state.items()})
    r.expire(key, ttl_seconds)
