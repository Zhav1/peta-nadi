"""Phase 172 (M9) — per-feed news yield counters (diagnostic instrumentation).

SPEC decision 8: "measure per-feed yield first". Nothing in this module changes
ingest or read behaviour: every function is a best-effort observer that can never
raise into the caller.

Funnel stages (all counted per source)
--------------------------------------
* ``fetched``            — raw items returned by the feed parser this cycle.
* ``dropped_gate``       — items the admission gate rejected: cut by the ingest
                           extraction budget, or tiered ``DROPPED_IRRELEVANT``.
* ``published``          — items that survived ingest (tiered + geocoded) and
                           reached Supabase/Redis.
* ``dropped_stale``      — read-path rejections for the 48h freshness gate.
* ``dropped_ungeocoded`` — read-path rejections for the geo gate (no coordinates
                           / ``is_geocoded=False``).
* ``regional_admitted``  — gate-rejected rows the display read path admitted as
                           ``regional`` context (Phase 172.5). Display only.
* ``regional_dropped``   — gate-rejected rows that failed the regional
                           predicate too, so they stay ``dropped``.

``dropped_stale`` / ``dropped_ungeocoded`` are observed where they happen (the
read path when its 30 s cache misses), so they describe the sampled window, not
the whole hourly ingest. They are deduped per `(article id, stage)`
(`record_read_drop`) so a repeatedly re-scanned window cannot inflate one
rejected row into thousands of "drops". That is honest: there is no SQL rewrite
behind this.

Storage
-------
Hourly buckets (rolling 24h) in Redis, so several workers aggregate into one
report. The same counts are mirrored in process memory, which is the answer when
Redis is unavailable. When Redis is healthy the report sums the Redis buckets
plus this worker's *unflushed* deltas exactly once; the memory mirror is not
added on top (that would double count a flushed cycle).
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

YIELD_WINDOW_HOURS = 24
YIELD_KEY_PREFIX = "lrip:news:yield"
# Buckets live a little longer than the window so a report at :59 still sees the
# full 24h tail without the boundary hour expiring mid-read.
_BUCKET_TTL_SECONDS = (YIELD_WINDOW_HOURS + 2) * 3600

STAGES = (
    "fetched",
    "dropped_gate",
    "dropped_stale",
    "dropped_ungeocoded",
    "published",
    "regional_admitted",
    "regional_dropped",
)

_SOURCE_FIELD = "s"
_PROVINCE_FIELD = "p"
_LAST_SEEN_KEY = f"{YIELD_KEY_PREFIX}:last_seen"

# hour_index -> field -> count (this process, whole window)
_LOCAL_BUCKETS: Dict[int, Dict[str, int]] = {}
# hour_index -> field -> count (this process, not yet written to Redis)
_PENDING_BUCKETS: Dict[int, Dict[str, int]] = {}
_LOCAL_LAST_SEEN: Dict[str, float] = {}
_PENDING_LAST_SEEN: Dict[str, float] = {}


def _hour_index(ts: Optional[float] = None) -> int:
    return int((ts if ts is not None else time.time()) // 3600)


def _bucket_key(hour_index: int) -> str:
    return f"{YIELD_KEY_PREFIX}:h:{hour_index}"


def _window_hours(now: Optional[float] = None) -> list[int]:
    current = _hour_index(now)
    return list(range(current - (YIELD_WINDOW_HOURS - 1), current + 1))


def _prune_local(now: Optional[float] = None) -> None:
    """Keep only the rolling window in memory (bounded by 24 hourly buckets)."""
    horizon = _hour_index(now) - YIELD_WINDOW_HOURS
    for store in (_LOCAL_BUCKETS, _PENDING_BUCKETS):
        for hour in [h for h in store if h < horizon]:
            store.pop(hour, None)


def _bump(store: Dict[int, Dict[str, int]], hour: int, field: str, count: int) -> None:
    bucket = store.setdefault(hour, {})
    bucket[field] = bucket.get(field, 0) + count


def record_yield(
    source: Any,
    stage: str,
    province: Optional[Any] = None,
    count: int = 1,
) -> None:
    """Count one observation for `source` at `stage`. Never raises.

    Unknown stages and empty sources are ignored (a counter with no stage name
    would be noise, not measurement).
    """
    try:
        name = str(source or "").strip()
        if not name or stage not in STAGES:
            return
        amount = int(count)
        if amount <= 0:
            return
        now = time.time()
        hour = _hour_index(now)
        _prune_local(now)
        _bump(_LOCAL_BUCKETS, hour, f"{_SOURCE_FIELD}|{name}|{stage}", amount)
        _bump(_PENDING_BUCKETS, hour, f"{_SOURCE_FIELD}|{name}|{stage}", amount)
        prov = str(province or "").strip()
        if prov:
            _bump(_LOCAL_BUCKETS, hour, f"{_PROVINCE_FIELD}|{prov}|{stage}", amount)
            _bump(_PENDING_BUCKETS, hour, f"{_PROVINCE_FIELD}|{prov}|{stage}", amount)
        _LOCAL_LAST_SEEN[name] = now
        _PENDING_LAST_SEEN[name] = now
    except Exception as exc:  # pragma: no cover - instrumentation never breaks ingest
        logger.debug(f"News yield record skipped ({source}/{stage}): {exc}")


def _redis():
    """Redis handle, or None when unavailable. Never raises.

    A unit-test process must never write fictional yield counters into
    operational telemetry: the dev/test environment shares the project Redis URL,
    and a pytest run that exercises the ingest cycle would otherwise publish
    phantom per-feed numbers for 26 hours. Tests therefore stay on the in-process
    mirror, which is exactly the Redis-outage path.
    """
    import sys

    if "pytest" in sys.modules:
        return None
    try:
        from app.services.redis_client import get_redis

        return get_redis()
    except Exception:
        return None


# The read path re-evaluates the same ~150-row window on every cache miss (~30 s).
# Counting each observation would turn one rejected article into ~2,880 "drops"
# per day, which is not a yield number. Read-path drops are therefore deduped per
# `(article, stage)` per window: one row can be `dropped_gate` AND
# `regional_dropped` once, but no single stage is counted twice. The counter
# means "distinct articles rejected at this stage".
_READ_SEEN: Dict[str, float] = {}
_READ_SEEN_TTL_SECONDS = 3600
_READ_SEEN_MAX = 20000


def record_read_drop(
    article_id: Any,
    source: Any,
    stage: str,
    province: Optional[Any] = None,
    dedupe_ttl_seconds: int = _READ_SEEN_TTL_SECONDS,
) -> None:
    """Count a read-path observation once per (article id, stage). Never raises."""
    try:
        key = f"{str(article_id or '').strip()}|{stage}"
        if not str(article_id or "").strip():
            record_yield(source, stage, province)
            return
        now = time.monotonic()
        last = _READ_SEEN.get(key)
        if last is not None and (now - last) < dedupe_ttl_seconds:
            return
        if len(_READ_SEEN) > _READ_SEEN_MAX:
            horizon = now - dedupe_ttl_seconds
            for k in [k for k, ts in _READ_SEEN.items() if ts < horizon]:
                _READ_SEEN.pop(k, None)
        _READ_SEEN[key] = now
        record_yield(source, stage, province)
    except Exception as exc:  # pragma: no cover - instrumentation never breaks reads
        logger.debug(f"News read-drop record skipped ({article_id}/{stage}): {exc}")



def flush_yield_counters() -> str:
    """Write buffered deltas to Redis in one pipeline. Returns the storage used.

    A failed flush keeps the deltas pending so the next call retries; the local
    mirror still answers the report in the meantime.
    """
    if not _PENDING_BUCKETS and not _PENDING_LAST_SEEN:
        return "noop"
    r = _redis()
    if r is None:
        return "memory"
    try:
        pipe = r.pipeline()
        for hour, bucket in _PENDING_BUCKETS.items():
            if not bucket:
                continue
            key = _bucket_key(hour)
            for field, amount in bucket.items():
                pipe.hincrby(key, field, amount)
            pipe.expire(key, _BUCKET_TTL_SECONDS)
        for source, ts in _PENDING_LAST_SEEN.items():
            pipe.hset(_LAST_SEEN_KEY, source, f"{ts:.3f}")
        pipe.expire(_LAST_SEEN_KEY, _BUCKET_TTL_SECONDS)
        pipe.execute()
    except Exception as exc:
        logger.debug(f"News yield flush skipped (Redis unavailable): {exc}")
        return "memory"
    _PENDING_BUCKETS.clear()
    _PENDING_LAST_SEEN.clear()
    return "redis"


def _read_redis_window(hours: list[int]) -> Optional[Dict[str, Any]]:
    """Aggregate hourly hashes from Redis. None when Redis cannot be read."""
    r = _redis()
    if r is None:
        return None
    fields: Dict[str, int] = {}
    try:
        for hour in hours:
            raw = r.hgetall(_bucket_key(hour)) or {}
            for field, value in raw.items():
                try:
                    fields[str(field)] = fields.get(str(field), 0) + int(value)
                except (TypeError, ValueError):
                    continue
        last_seen_raw = r.hgetall(_LAST_SEEN_KEY) or {}
    except Exception as exc:
        logger.debug(f"News yield read skipped (Redis unavailable): {exc}")
        return None
    last_seen: Dict[str, float] = {}
    for source, value in last_seen_raw.items():
        try:
            last_seen[str(source)] = float(value)
        except (TypeError, ValueError):
            continue
    return {"fields": fields, "last_seen": last_seen}


def _local_window(hours: list[int], store: Dict[int, Dict[str, int]]) -> Dict[str, int]:
    fields: Dict[str, int] = {}
    for hour in hours:
        for field, value in store.get(hour, {}).items():
            fields[field] = fields.get(field, 0) + int(value)
    return fields


def _empty_source() -> Dict[str, Any]:
    return {stage: 0 for stage in STAGES} | {"last_seen_at": None}


def _iso(ts: Optional[float]) -> Optional[str]:
    if not ts:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def get_yield_report(window_hours: int = YIELD_WINDOW_HOURS) -> Dict[str, Any]:
    """Per-source + per-province yield over the rolling window.

    Shape::

        {"window_hours": 24, "storage": "redis"|"memory", "generated_at": ...,
         "sources": {"<source>": {fetched, dropped_gate, dropped_stale,
                                  dropped_ungeocoded, published, last_seen_at}},
         "provinces": {"<province>": {<same stages>}},
         "totals": {<same stages>}}
    """
    hours = _window_hours()[-max(1, int(window_hours)) :]
    redis_state = _read_redis_window(hours)
    if redis_state is not None:
        storage = "redis"
        fields = dict(redis_state["fields"])
        last_seen = dict(redis_state["last_seen"])
        # Add this worker's not-yet-flushed deltas exactly once.
        for field, value in _local_window(hours, _PENDING_BUCKETS).items():
            fields[field] = fields.get(field, 0) + value
        for source, ts in _PENDING_LAST_SEEN.items():
            last_seen[source] = max(last_seen.get(source, 0.0), ts)
    else:
        storage = "memory"
        fields = _local_window(hours, _LOCAL_BUCKETS)
        last_seen = {s: ts for s, ts in _LOCAL_LAST_SEEN.items() if ts}

    sources: Dict[str, Dict[str, Any]] = {}
    provinces: Dict[str, Dict[str, Any]] = {}
    totals = {stage: 0 for stage in STAGES}
    for field, value in fields.items():
        try:
            kind, name, stage = field.split("|", 2)
        except ValueError:
            continue
        if stage not in STAGES:
            continue
        target = sources if kind == _SOURCE_FIELD else provinces if kind == _PROVINCE_FIELD else None
        if target is None:
            continue
        entry = target.get(name) or _empty_source()
        entry[stage] = entry.get(stage, 0) + int(value)
        target[name] = entry
        if kind == _SOURCE_FIELD:
            # Totals are per-source sums only — adding the province mirror too
            # would double count every observation.
            totals[stage] = totals.get(stage, 0) + int(value)

    for name, entry in sources.items():
        entry["last_seen_at"] = _iso(last_seen.get(name))

    return {
        "window_hours": len(hours),
        "storage": storage,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": dict(sorted(sources.items(), key=lambda kv: (-kv[1].get("fetched", 0), kv[0]))),
        "provinces": dict(sorted(provinces.items())),
        "totals": totals,
        "note": (
            "fetched/dropped_gate/published are ingest-cycle counts; "
            "dropped_stale/dropped_ungeocoded/regional_admitted/regional_dropped "
            "are read-path observations of the sampled window."
        ),
    }


def reset_yield_counters() -> None:
    """Drop every in-process counter (tests / diagnostics reset)."""
    _LOCAL_BUCKETS.clear()
    _PENDING_BUCKETS.clear()
    _LOCAL_LAST_SEEN.clear()
    _PENDING_LAST_SEEN.clear()
    _READ_SEEN.clear()
