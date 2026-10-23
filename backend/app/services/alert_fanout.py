"""
In-process fan-out for validated crisis alerts.

Fan-out contract (documented so P4 is not silently dropped):

1. ``lrip:stream:validated_alerts`` (Redis Stream, written by Agent 6) is the
   authoritative cross-process/cross-worker bus. Any external consumer
   (worker, notifier, analytics) tails that stream.
2. This module adds an *in-process* pub/sub bridge so the FastAPI process can
   push the same alert to connected ``/ws/crisis/{crisis_id}`` sockets when the
   producer (Agent 6) runs inside this process (the normal SSE simulation path).
3. ``process_crisis_event`` also always embeds the alert in the terminal
   ``simulation_complete`` SSE event, so a client that only reads SSE still
   receives the validated alert even if it never opens a WebSocket.
4. ``consume_validated_alerts_stream`` closes the cross-process loop: this
   process tails the stream and re-broadcasts locally, so a WebSocket client
   attached to *this* process still receives alerts produced elsewhere. The
   in-process producer (step 2) and the stream consumer (step 4) both funnel
   through ``broadcast_validated_alert``, which deduplicates by
   ``(crisis_id, timestamp_or_hash)``: a client sees each alert exactly once
   even though it travelled both paths.

Alerts are scoped by ``crisis_id`` only; there is intentionally no global
broadcast channel (ambient cross-tenant leakage guard).
"""
import asyncio
import hashlib
import json
import logging
from collections import deque
from typing import Any, Deque, Dict, Optional, Set

logger = logging.getLogger(__name__)

# crisis_id -> set of subscriber queues
_listeners: Dict[str, Set[asyncio.Queue]] = {}
# crisis_id -> last alert (replayed to late WebSocket subscribers)
_last_alert: Dict[str, Dict[str, Any]] = {}

_QUEUE_MAXSIZE = 16
_LAST_ALERT_MAX = 256

# Cross-process bus written by Agent 6 (decision_support.py).
VALIDATED_ALERTS_STREAM = "lrip:stream:validated_alerts"

# Bounded dedup window: recently delivered alert identities. The set mirrors the
# deque for O(1) lookups; the deque is the eviction order.
_SEEN_ALERT_MAX = 256
_seen_alerts: Deque[str] = deque(maxlen=_SEEN_ALERT_MAX)
_seen_alert_set: Set[str] = set()

# Consumer tuning. ``$`` means "only alerts published after this process
# started" — replaying the whole stream would spam reconnecting WS clients with
# historical alerts on every boot.
_CONSUMER_START_ID = "$"
_CONSUMER_BLOCK_MS = 3000
_CONSUMER_BATCH = 20
_CONSUMER_INITIAL_BACKOFF = 1.0
_CONSUMER_MAX_BACKOFF = 30.0


def register_listener(crisis_id: str) -> asyncio.Queue:
    """Registers a bounded queue that receives alerts for one crisis."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    _listeners.setdefault(str(crisis_id), set()).add(queue)
    return queue


def unregister_listener(crisis_id: str, queue: asyncio.Queue) -> None:
    """Removes a previously registered queue (idempotent)."""
    key = str(crisis_id)
    listeners = _listeners.get(key)
    if not listeners:
        return
    listeners.discard(queue)
    if not listeners:
        _listeners.pop(key, None)


def get_last_alert(crisis_id: str) -> Optional[Dict[str, Any]]:
    """Returns the most recent validated alert for a crisis, if any."""
    return _last_alert.get(str(crisis_id))


def _alert_identity(alert: Dict[str, Any]) -> str:
    """Builds the dedup identity: ``(crisis_id, timestamp_or_hash)``.

    Producers stamp ``timestamp`` (ISO-8601) on the canonical payload, and the
    stream copy carries the same string, so the fast path matches exactly. If a
    producer omitted it, fall back to a hash over the stable identity fields so
    the in-process copy and the stream copy still collapse to one delivery.
    """
    crisis_id = str(alert.get("crisis_id") or "")
    timestamp = alert.get("timestamp") or alert.get("alert_timestamp") or alert.get("created_at")
    if timestamp:
        return f"{crisis_id}|{timestamp}"
    fingerprint = json.dumps(
        {
            "crisis_id": crisis_id,
            "incident_id": alert.get("incident_id"),
            "supabase_id": alert.get("supabase_id"),
            "title": alert.get("title"),
            "summary": alert.get("summary"),
        },
        sort_keys=True,
        default=str,
    )
    digest = hashlib.sha1(fingerprint.encode("utf-8")).hexdigest()
    return f"{crisis_id}|sha1:{digest}"


def was_alert_seen(alert: Dict[str, Any]) -> bool:
    """True when this exact alert was already delivered by this process."""
    return _alert_identity(alert) in _seen_alert_set


def mark_alert_seen(alert: Dict[str, Any]) -> bool:
    """Records an alert identity. Returns True when it was already present."""
    key = _alert_identity(alert)
    if key in _seen_alert_set:
        return True
    if len(_seen_alerts) == _SEEN_ALERT_MAX:
        # Evict oldest explicitly so the mirror set stays in sync.
        _seen_alert_set.discard(_seen_alerts.popleft())
    _seen_alerts.append(key)
    _seen_alert_set.add(key)
    return False


def _remember_last_alert(crisis_id: str, alert: Dict[str, Any]) -> None:
    """Stores the replay copy, bounding the cache for long-running processes."""
    _last_alert[crisis_id] = alert
    while len(_last_alert) > _LAST_ALERT_MAX:
        _last_alert.pop(next(iter(_last_alert)))


async def broadcast_validated_alert(alert: Dict[str, Any]) -> int:
    """Publishes an alert to in-process subscribers. Never raises.

    Returns the number of queues that accepted the alert. An alert that already
    travelled another path (in-process producer vs. stream consumer) is
    delivered once; duplicates return 0 and leave the replay copy intact.
    Slow/dead clients are dropped rather than blocking the agent pipeline.
    """
    crisis_id = str(alert.get("crisis_id") or "")
    if not crisis_id:
        logger.warning("broadcast_validated_alert called without crisis_id; skipped")
        return 0

    if mark_alert_seen(alert):
        # Already fanned out on the other bridge path. Keep the copy that was
        # actually delivered (the in-process payload carries notification
        # metadata + causal_chain); never downgrade the replay cache with the
        # leaner stream copy.
        if crisis_id not in _last_alert:
            _remember_last_alert(crisis_id, alert)
        logger.debug("Duplicate validated alert for crisis %s suppressed", crisis_id)
        return 0

    _remember_last_alert(crisis_id, alert)
    delivered = 0
    for queue in list(_listeners.get(crisis_id, ())):
        try:
            queue.put_nowait(alert)
            delivered += 1
        except asyncio.QueueFull:
            logger.warning(
                "Validated alert queue full for crisis %s; dropping oldest subscriber event",
                crisis_id,
            )
        except Exception as exc:  # never break the producer on a bad subscriber
            logger.warning("Failed to fan out validated alert for %s: %s", crisis_id, exc)
    return delivered


def _decode_field(value: Any) -> Any:
    """Decodes bytes stream fields (guards against decode_responses=False)."""
    if isinstance(value, (bytes, bytearray)):
        try:
            return value.decode("utf-8")
        except Exception:
            return value
    return value


def _parse_stream_alert(fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Maps raw stream fields onto the canonical validated-alert payload shape."""
    if not isinstance(fields, dict):
        return None
    data = {str(_decode_field(k)): _decode_field(v) for k, v in fields.items()}

    crisis_id = str(data.get("crisis_id") or "").strip()
    if not crisis_id:
        return None

    summary = data.get("summary")
    title = data.get("title")
    incident_id = data.get("incident_id") or data.get("supabase_id") or None
    supabase_id = data.get("supabase_id") or incident_id

    confidence: Any = data.get("overall_confidence")
    if confidence not in (None, ""):
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            pass  # keep the producer's raw value rather than inventing one
    else:
        confidence = None

    return {
        "crisis_id": crisis_id,
        "incident_id": incident_id,
        "supabase_id": supabase_id,
        "title": title,
        "summary": summary,
        "overall_confidence": confidence,
        "validated": True,
        "causal_chain": None,
        "timestamp": data.get("timestamp") or None,
    }


async def consume_validated_alerts_stream() -> None:
    """Tails ``lrip:stream:validated_alerts`` and fans alerts out in-process.

    Runs for the lifetime of the API process (started from the lifespan). Alerts
    produced by another worker/process therefore reach this process's
    ``/ws/crisis/{crisis_id}`` sockets. Redis being offline is not fatal: the
    loop backs off exponentially (1s → 30s) and resumes when Redis returns.
    """
    # Imported lazily so this module stays import-safe for the agent pipeline
    # (no module-level dependency on agents.memory.stm / app bootstrap).
    from agents.memory.stm import get_async_redis

    last_id = _CONSUMER_START_ID
    backoff = _CONSUMER_INITIAL_BACKOFF
    degraded = False
    logger.info("Validated-alert stream consumer started (stream=%s, last_id=%s)", VALIDATED_ALERTS_STREAM, last_id)

    try:
        while True:
            try:
                redis = get_async_redis()
                response = await redis.xread(
                    {VALIDATED_ALERTS_STREAM: last_id},
                    block=_CONSUMER_BLOCK_MS,
                    count=_CONSUMER_BATCH,
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                # Redis down / stream key wrong type / transient socket error.
                # Never log-spam: warn once per outage, then debug.
                if not degraded:
                    logger.warning(
                        "Validated-alert stream consumer degraded (%s); retrying with backoff", exc
                    )
                    degraded = True
                else:
                    logger.debug("Validated-alert stream consumer still degraded: %s", exc)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, _CONSUMER_MAX_BACKOFF)
                continue

            if degraded:
                logger.info("Validated-alert stream consumer recovered; resuming fan-out")
                degraded = False
            backoff = _CONSUMER_INITIAL_BACKOFF

            if not response:
                continue  # block timeout, no new alerts

            for _stream_name, entries in response:
                for entry_id, fields in entries:
                    last_id = entry_id
                    alert = _parse_stream_alert(fields)
                    if alert is None:
                        logger.debug("Skipping malformed validated alert entry %s", entry_id)
                        continue
                    try:
                        await broadcast_validated_alert(alert)
                    except Exception as exc:  # broadcast is no-raise, belt-and-braces
                        logger.warning("Failed to fan out streamed alert %s: %s", entry_id, exc)
    except asyncio.CancelledError:
        logger.info("Validated-alert stream consumer canceled.")
        raise
    except Exception:
        # Defensive: never let a malformed payload kill the bridge task.
        logger.exception("Validated-alert stream consumer stopped unexpectedly")
        raise
