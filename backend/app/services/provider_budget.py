"""Atomic, fail-closed application budgets for upstream refresh attempts."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Optional

logger = logging.getLogger(__name__)


def _daily_limits() -> dict[str, int]:
    from app.config import get_settings

    raw = str(getattr(get_settings(), "provider_budget_daily_limits", "") or "")
    limits: dict[str, int] = {}
    for item in raw.split(","):
        name, separator, value = item.partition("=")
        if not separator:
            continue
        try:
            limit = int(value.strip())
        except ValueError:
            continue
        if name.strip() and limit > 0:
            limits[name.strip().lower()] = limit
    return limits


async def reserve_provider_budget(
    source: str,
    units: int = 1,
    request_id: Optional[str] = None,
) -> bool:
    """Reserve daily provider units exactly once per ``(source, request_id)``.

    Limits are app-configured safety caps, not claims about provider quotas.
    Missing limits, an unconfigured source, or a database/RPC failure denies the
    request. Retries without reusing an idempotency key consume another unit.
    """
    key = str(source or "").strip().lower()
    try:
        count = int(units)
    except (TypeError, ValueError):
        return False
    limit = _daily_limits().get(key)
    if not key or count <= 0 or limit is None:
        logger.warning("provider budget denied source=%r: no valid configured limit", source)
        return False

    try:
        from app.services.refresh_coordinator import _rpc_sync

        result = await asyncio.to_thread(
            _rpc_sync,
            "reserve_provider_budget",
            {
                "p_source": key,
                "p_units": count,
                "p_request_id": str(request_id or uuid.uuid4()),
                "p_daily_limit": limit,
            },
        )
    except Exception as exc:
        logger.warning("provider budget coordination unavailable for %s: %s", key, exc)
        return False
    return bool(result)
