import json
import logging
import time
from collections import OrderedDict
from typing import Optional, Tuple
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError
from app.config import get_settings
from app.services.redis_client import STM_PREFIX
from agents.state import CrisisState

logger = logging.getLogger(__name__)
settings = get_settings()

# Canonical STM key prefix shared with backend/app/services/redis_client.py.
# The old agents-only prefix "lrip:crisis:" drifted from the backend contract
# ("lrip:state:crisis:"); it is still read once for backward compatibility.
LEGACY_STM_PREFIX = "lrip:crisis:"

_async_redis_client: Optional[Redis] = None

# Process-local degradation tier. When Redis is unreachable (ConnectionError /
# TimeoutError) the pipeline must keep running for the current process instead of
# losing dedup/STM state entirely. Both stores are hard-bounded so a long outage
# cannot grow memory without limit; entries are evicted oldest-first (FIFO).
_LOCAL_STORE_MAX_ENTRIES = 500
_LOCAL_STM_STORE: "OrderedDict[str, Tuple[str, Optional[float]]]" = OrderedDict()
_LOCAL_SEEN_STORE: "OrderedDict[str, Tuple[str, Optional[float]]]" = OrderedDict()

# Redis being down is a degraded path, not a programming error: only these
# exceptions (plus the generic safety net below) trigger the local fallback.
_REDIS_DOWN_ERRORS = (RedisConnectionError, RedisTimeoutError, ConnectionError, TimeoutError)


def _local_set(
    store: "OrderedDict[str, Tuple[str, Optional[float]]]",
    key: str,
    value: str,
    ttl_seconds: Optional[int],
) -> None:
    """Insert/refresh a bounded process-local entry with an optional TTL."""
    expires_at = (
        time.monotonic() + ttl_seconds
        if ttl_seconds and ttl_seconds > 0
        else None
    )
    store[key] = (value, expires_at)
    store.move_to_end(key)
    while len(store) > _LOCAL_STORE_MAX_ENTRIES:
        store.popitem(last=False)


def _local_get(
    store: "OrderedDict[str, Tuple[str, Optional[float]]]", key: str
) -> Optional[str]:
    """Read a process-local entry, dropping it when its TTL has elapsed."""
    entry = store.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if expires_at is not None and expires_at <= time.monotonic():
        store.pop(key, None)
        return None
    store.move_to_end(key)
    return value


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
    """Serializes the CrisisState as JSON and saves to the canonical Redis STM key."""
    r = get_async_redis()
    key = f"{STM_PREFIX}{crisis_id}"
    serialized = json.dumps(state, default=str)
    try:
        await r.set(key, serialized, ex=ttl_seconds)
        # Drop the drifted legacy key so readers cannot observe a stale snapshot.
        try:
            await r.delete(f"{LEGACY_STM_PREFIX}{crisis_id}")
        except Exception:
            pass
        logger.debug(f"Saved crisis state to Redis key: {key}")
    except _REDIS_DOWN_ERRORS as e:
        _local_set(_LOCAL_STM_STORE, key, serialized, ttl_seconds)
        logger.warning(
            f"Redis unavailable ({e}); saved crisis state for {crisis_id} to "
            "process-local STM fallback"
        )
    except Exception as e:
        logger.error(f"Failed to save crisis state for {crisis_id}: {e}")


async def load_crisis_state(crisis_id: str) -> Optional[CrisisState]:
    """Loads and deserializes the CrisisState from the canonical Redis STM key."""
    r = get_async_redis()
    key = f"{STM_PREFIX}{crisis_id}"
    try:
        data = await r.get(key)
        if not data:
            # Backward compatibility: migrate a snapshot written under the old key.
            legacy_key = f"{LEGACY_STM_PREFIX}{crisis_id}"
            data = await r.get(legacy_key)
            if data:
                try:
                    await r.set(key, data, ex=86400)
                    await r.delete(legacy_key)
                except Exception:
                    pass
        if data:
            return json.loads(data)
        # A snapshot saved while Redis was down lives only in this process.
        local_data = _local_get(_LOCAL_STM_STORE, key)
        return json.loads(local_data) if local_data else None
    except _REDIS_DOWN_ERRORS as e:
        local_data = _local_get(_LOCAL_STM_STORE, key)
        if local_data:
            logger.warning(
                f"Redis unavailable ({e}); loaded crisis state for {crisis_id} "
                "from process-local STM fallback"
            )
            try:
                return json.loads(local_data)
            except (TypeError, ValueError):
                return None
        logger.error(f"Failed to load crisis state for {crisis_id}: {e}")
    except Exception as e:
        logger.error(f"Failed to load crisis state for {crisis_id}: {e}")
    return None


async def mark_seen(event_hash: str, ttl_seconds: int = 300):
    """Marks an event as seen by setting a key in Redis with a TTL."""
    r = get_async_redis()
    key = f"lrip:seen:{event_hash}"
    try:
        await r.set(key, "1", ex=ttl_seconds)
    except _REDIS_DOWN_ERRORS as e:
        _local_set(_LOCAL_SEEN_STORE, key, "1", ttl_seconds)
        logger.warning(
            f"Redis unavailable ({e}); marked event {event_hash} as seen in "
            "process-local dedup fallback"
        )
    except Exception as e:
        logger.error(f"Failed to mark event {event_hash} as seen: {e}")


async def is_seen(event_hash: str) -> bool:
    """Checks if an event has been seen recently."""
    r = get_async_redis()
    key = f"lrip:seen:{event_hash}"
    try:
        val = await r.get(key)
        if val is not None:
            return True
        # A mark_seen() that degraded during a Redis outage is only visible here.
        return _local_get(_LOCAL_SEEN_STORE, key) is not None
    except _REDIS_DOWN_ERRORS as e:
        local_val = _local_get(_LOCAL_SEEN_STORE, key)
        if local_val is not None:
            logger.warning(
                f"Redis unavailable ({e}); checked event {event_hash} in "
                "process-local dedup fallback"
            )
            return True
        logger.error(f"Failed to check if event {event_hash} was seen: {e}")
        return False
    except Exception as e:
        logger.error(f"Failed to check if event {event_hash} was seen: {e}")
        return False
