"""
Redis client factory for PetaNadi.
Provides a connection to Redis Streams (event bus) and Redis KV (STM).
"""
import logging
import redis
import json
from datetime import datetime, timezone
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_redis_client: Optional[redis.Redis] = None

# Redis stream key constants : used across the entire codebase
STREAM_BMKG = "lrip:events:bmkg"
STREAM_TOMTOM = "lrip:events:tomtom"
STREAM_AISSTREAM = "lrip:events:aisstream"
STREAM_NASA_FIRMS = "lrip:events:nasa_firms"
STREAM_PIHPS = "lrip:events:pihps"
STREAM_SOCIAL = "lrip:events:social"
STREAM_BNPB = "lrip:events:bnpb"

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
    Publish an event to a Redis Stream. Falls back to a Redis List
    if the Redis server does not support streams (Redis < 5.0).
    """
    r = get_redis()
    # Stringify all values (Redis Streams require string values)
    str_event = {k: str(v) for k, v in event.items()}
    
    try:
        event_id = r.xadd(stream, str_event, maxlen=10_000, approximate=True)
        logger.debug(f"Published to {stream} (Stream): id={event_id}")
    except redis.exceptions.ResponseError as e:
        if "unknown command" in str(e).lower() and "xadd" in str(e).lower():
            # Fallback to List for Redis < 5.0 (like local Windows Redis 3.0.504)
            serialized = json.dumps(str_event)
            r.lpush(stream, serialized)
            r.ltrim(stream, 0, 9999)  # Keep max 10,000 items
            event_id = f"fallback-list-{datetime.now(timezone.utc).timestamp()}"
            logger.debug(f"Published to fallback List {stream}: id={event_id}")
        else:
            raise e
            
    return str(event_id)


def get_stm_state(crisis_id: str) -> dict:
    """Get the current Short-Term Memory state for an active crisis.

    Stored as a JSON string (the same representation used by
    ``agents.memory.stm``) so both readers share one canonical key without a
    Redis WRONGTYPE conflict.
    """
    r = get_redis()
    raw = r.get(f"{STM_PREFIX}{crisis_id}")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def set_stm_state(crisis_id: str, state: dict, ttl_seconds: int = 86400):
    """Update the STM state for an active crisis. TTL defaults to 24 hours."""
    r = get_redis()
    key = f"{STM_PREFIX}{crisis_id}"
    r.set(key, json.dumps(state, default=str), ex=ttl_seconds)


# ------------------------------------------------------------------
# Backend-direct fallback when Redis is unavailable.
# Process-local memory so adapters/pollers keep working without Redis.
# Redis remains primary; memory is only used when Redis raises.
# ------------------------------------------------------------------
import time as _time

_mem_kv: dict = {}
_mem_expire: dict = {}


def _mem_get(key: str):
    exp = _mem_expire.get(key)
    if exp is not None and _time.time() > exp:
        _mem_kv.pop(key, None)
        _mem_expire.pop(key, None)
        return None
    return _mem_kv.get(key)


def _mem_set(key: str, value, ex: Optional[int] = None):
    _mem_kv[key] = value
    if ex:
        _mem_expire[key] = _time.time() + ex
    elif key in _mem_expire:
        _mem_expire.pop(key, None)


def dedup_seen_or_mark(key: str, ex: int = 3600) -> bool:
    """Return True if dedup key was already seen. Never raises.

    Tries Redis first; on any Redis error falls back to process-local
    memory so a Redis outage never drops live events.
    """
    try:
        r = get_redis()
        if r.get(key):
            return True
        r.set(key, "1", ex=ex)
        return False
    except Exception as e:
        logger.warning(f"Redis dedup unavailable, using memory fallback for {key}: {e}")
        if _mem_get(key):
            return True
        _mem_set(key, "1", ex=ex)
        return False


def cache_set(key: str, value: str, ex: int = 86400):
    """Best-effort cache write: Redis primary, memory fallback. Never raises."""
    try:
        get_redis().set(key, value, ex=ex)
    except Exception as e:
        logger.warning(f"Redis cache write failed, using memory fallback for {key}: {e}")
        _mem_set(key, value, ex=ex)


def cache_get(key: str) -> Optional[str]:
    """Best-effort cache read: Redis primary, memory fallback. Never raises."""
    try:
        val = get_redis().get(key)
        if val:
            return val
    except Exception as e:
        logger.warning(f"Redis cache read failed, using memory fallback for {key}: {e}")
    return _mem_get(key)


def health_set(health_key: str, mapping: dict):
    """Best-effort health write: Redis primary, memory fallback. Never raises."""
    try:
        r = get_redis()
        for k, v in mapping.items():
            r.hset(health_key, k, v)
        return
    except Exception as e:
        logger.warning(f"Redis health write failed, using memory fallback for {health_key}: {e}")
    for k, v in mapping.items():
        _mem_set(f"{health_key}:{k}", v, ex=3600)
