"""Fail-closed Supabase coordination for shared refresh work.

All leases are durable and fenced. Callers must pass the returned owner/fence
pair to publication or completion; an expired or superseded worker cannot write.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from typing import Any, Optional

logger = logging.getLogger(__name__)


class CoordinationUnavailable(RuntimeError):
    """The shared coordination database is unavailable or not migrated."""


@dataclass(frozen=True)
class RefreshLease:
    lease_name: str
    owner_id: str
    fence: int
    expires_at: Optional[str] = None


def _service_client():
    # Coordination must never fall back to the anon client or process-local state.
    from app.db.supabase_client import get_service_client

    return get_service_client()


def _first(value: Any) -> Any:
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _rpc_sync(function: str, params: dict[str, Any]) -> Any:
    try:
        response = _service_client().rpc(function, params).execute()
        return _first(getattr(response, "data", None))
    except Exception as exc:
        raise CoordinationUnavailable(f"{function} failed: {exc}") from exc


async def acquire_refresh_lease(
    lease_name: str,
    *,
    ttl_seconds: int,
    owner_id: Optional[str] = None,
) -> Optional[RefreshLease]:
    """Acquire a shared lease, returning its monotonically fenced owner token.

    ``None`` means another live owner holds the lease. Database/RPC failure
    raises :class:`CoordinationUnavailable`; it is never interpreted as success.
    """
    owner = str(owner_id or uuid.uuid4())
    result = await asyncio.to_thread(
        _rpc_sync,
        "acquire_refresh_lease",
        {
            "p_lease_name": str(lease_name),
            "p_owner_id": owner,
            "p_ttl_seconds": max(1, int(ttl_seconds)),
        },
    )
    if not isinstance(result, dict) or not result.get("acquired"):
        return None
    try:
        return RefreshLease(
            lease_name=str(result["lease_name"]),
            owner_id=str(result["owner_id"]),
            fence=int(result["fence"]),
            expires_at=(str(result["expires_at"]) if result.get("expires_at") else None),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise CoordinationUnavailable("acquire_refresh_lease returned an invalid token") from exc


async def release_refresh_lease(lease: RefreshLease) -> bool:
    """Release only the exact owner/fence pair that acquired the lease."""
    result = await asyncio.to_thread(
        _rpc_sync,
        "release_refresh_lease",
        {
            "p_lease_name": lease.lease_name,
            "p_owner_id": lease.owner_id,
            "p_fence": lease.fence,
        },
    )
    return bool(result)


async def complete_scheduled_job(
    lease: RefreshLease,
    *,
    job_name: str,
    status: str,
    error: Optional[str] = None,
    retry_after_seconds: int = 120,
) -> bool:
    """Persist a job result and release its lease atomically, owner-checked."""
    result = await asyncio.to_thread(
        _rpc_sync,
        "complete_scheduled_job",
        {
            "p_job_name": str(job_name),
            "p_owner_id": lease.owner_id,
            "p_fence": lease.fence,
            "p_status": str(status),
            "p_error": (str(error)[:500] if error else None),
            "p_retry_after_seconds": max(1, int(retry_after_seconds)),
        },
    )
    return bool(result)


async def read_public_snapshot_sections() -> dict[str, dict]:
    """Read durable per-section last-good values (service-role RPC only)."""
    result = await asyncio.to_thread(_rpc_sync, "read_public_snapshot_sections", {})
    if not isinstance(result, dict):
        raise CoordinationUnavailable("read_public_snapshot_sections returned invalid data")
    return {str(key): value for key, value in result.items() if isinstance(value, dict)}


async def publish_public_snapshot(lease: RefreshLease, snapshot: dict) -> bool:
    """Atomically update durable section cache and its curated public projection.

    SQL rechecks owner, fence, and expiry while holding the lease row lock in the
    same transaction as both writes.
    """
    result = await asyncio.to_thread(
        _rpc_sync,
        "publish_public_dashboard_snapshot",
        {
            "p_lease_name": lease.lease_name,
            "p_owner_id": lease.owner_id,
            "p_fence": lease.fence,
            "p_snapshot": snapshot,
        },
    )
    return bool(result)
