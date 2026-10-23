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

Alerts are scoped by ``crisis_id`` only; there is intentionally no global
broadcast channel (ambient cross-tenant leakage guard).
"""
import asyncio
import logging
from typing import Any, Dict, Optional, Set

logger = logging.getLogger(__name__)

# crisis_id -> set of subscriber queues
_listeners: Dict[str, Set[asyncio.Queue]] = {}
# crisis_id -> last alert (replayed to late WebSocket subscribers)
_last_alert: Dict[str, Dict[str, Any]] = {}

_QUEUE_MAXSIZE = 16
_LAST_ALERT_MAX = 256


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


async def broadcast_validated_alert(alert: Dict[str, Any]) -> int:
    """Publishes an alert to in-process subscribers. Never raises.

    Returns the number of queues that accepted the alert. Slow/dead clients are
    dropped rather than blocking the agent pipeline.
    """
    crisis_id = str(alert.get("crisis_id") or "")
    if not crisis_id:
        logger.warning("broadcast_validated_alert called without crisis_id; skipped")
        return 0

    _last_alert[crisis_id] = alert
    # Bound the replay cache for long-running processes (dicts keep insert order).
    while len(_last_alert) > _LAST_ALERT_MAX:
        _last_alert.pop(next(iter(_last_alert)))
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
