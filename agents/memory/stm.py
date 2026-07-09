import json
import logging
from typing import Optional
from redis.asyncio import Redis
from app.config import get_settings
from agents.state import CrisisState

logger = logging.getLogger(__name__)
settings = get_settings()

_async_redis_client: Optional[Redis] = None


def get_async_redis() -> Redis:
    """Get or create the async Redis client."""
    global _async_redis_client
    if _async_redis_client is None:
        _async_redis_client = Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
        )
        logger.info(f"Async Redis client initialized: {settings.redis_url.split('@')[-1]}")
    return _async_redis_client


async def close_async_redis():
    """Close the async Redis client connection."""
    global _async_redis_client
    if _async_redis_client:
        await _async_redis_client.aclose()
        _async_redis_client = None
        logger.info("Async Redis connection closed")


async def save_crisis_state(crisis_id: str, state: CrisisState, ttl_seconds: int = 86400):
    """Serializes the CrisisState as JSON and saves to Redis."""
    r = get_async_redis()
    key = f"lrip:crisis:{crisis_id}"
    try:
        serialized = json.dumps(state, default=str)
        await r.set(key, serialized, ex=ttl_seconds)
        logger.debug(f"Saved crisis state to Redis key: {key}")
    except Exception as e:
        logger.error(f"Failed to save crisis state for {crisis_id}: {e}")


async def load_crisis_state(crisis_id: str) -> Optional[CrisisState]:
    """Loads and deserializes the CrisisState from Redis."""
    r = get_async_redis()
    key = f"lrip:crisis:{crisis_id}"
    try:
        data = await r.get(key)
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error(f"Failed to load crisis state for {crisis_id}: {e}")
    return None


async def mark_seen(event_hash: str, ttl_seconds: int = 300):
    """Marks an event as seen by setting a key in Redis with a TTL."""
    r = get_async_redis()
    key = f"lrip:seen:{event_hash}"
    try:
        await r.set(key, "1", ex=ttl_seconds)
    except Exception as e:
        logger.error(f"Failed to mark event {event_hash} as seen: {e}")


async def is_seen(event_hash: str) -> bool:
    """Checks if an event has been seen recently."""
    r = get_async_redis()
    key = f"lrip:seen:{event_hash}"
    try:
        val = await r.get(key)
        return val is not None
    except Exception as e:
        logger.error(f"Failed to check if event {event_hash} was seen: {e}")
        return False
