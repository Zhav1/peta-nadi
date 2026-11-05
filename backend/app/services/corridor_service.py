"""Cached-only corridor context reader.

Upstream polling belongs to source jobs. This module never contacts BMKG,
TomTom, Supabase commodity tables, or any other provider while serving a read.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

CORRIDOR_NAMES = {
    "sumatra_belawan_medan": "Koridor Arteri Utama Belawan–Medan–Tebing Tinggi",
    "sumatra_riau_pekanbaru": "Koridor Logistik Riau–Dumai–Pekanbaru",
    "sumatra_sumbar_padang": "Koridor Maritim & Arteri Teluk Bayur–Padang–Bukittinggi",
    "sumatra_sumsel_palembang": "Koridor Lintas Timur Palembang–Boom Baru",
    "sumatra_lampung_bakauheni": "Koridor Gerbang Selat Sunda Bakauheni–Panjang–Terbanggi Besar",
    "sumatra_aceh_malahayati": "Koridor Pintu Masuk Aceh–Malahayati–Banda Aceh",
}


def corridor_ids() -> list[str]:
    return list(CORRIDOR_NAMES)


def _unknown_context(corridor_id: str) -> dict[str, Any]:
    return {
        "corridor_id": corridor_id,
        "corridor_name": CORRIDOR_NAMES.get(corridor_id, f"Koridor Logistik Sumatera ({corridor_id})"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "is_fallback": True,
        "fallback_reasons": ["No cached corridor-specific evidence"],
        "weather": {"status": "unknown", "data": None},
        "traffic": {"status": "unknown", "data": None},
        "commodity_prices": {"status": "unknown", "data": None},
        "data_integrity": {
            "coverage": "unknown",
            "verified_sources": [],
            "bmkg_status": "unknown",
            "tomtom_status": "unknown",
            "commodity_status": "unknown",
        },
    }


async def get_corridor_context(
    corridor_id: str = "sumatra_belawan_medan", force_refresh: bool = False
) -> dict[str, Any]:
    """Return a corridor-specific cached section; never initiate a refresh.

    ``force_refresh`` remains accepted for source compatibility but is ignored:
    only coordinator-owned source jobs may make provider requests.
    """
    from app.services.public_operational_cache import read_public_operational_cache

    cache = read_public_operational_cache()
    section = cache.get("corridor_contexts") or {}
    contexts = section.get("data") if isinstance(section, dict) else None
    context = contexts.get(corridor_id) if isinstance(contexts, dict) else None
    if not isinstance(context, dict):
        return _unknown_context(corridor_id)

    result = dict(context)
    result.setdefault("corridor_id", corridor_id)
    result.setdefault("corridor_name", CORRIDOR_NAMES.get(corridor_id, corridor_id))
    result.setdefault("timestamp", section.get("observed_at") or datetime.now(timezone.utc).isoformat())
    result["is_fallback"] = bool(section.get("status") in ("unknown", "degraded", "stale") or not result.get("data_integrity", {}).get("verified_sources"))
    result["fallback_reasons"] = [section["error"]] if section.get("error") else []
    result.setdefault("weather", {"status": "unknown", "data": None})
    result.setdefault("traffic", {"status": "unknown", "data": None})
    result.setdefault("commodity_prices", {"status": "unknown", "data": None})
    result.setdefault("data_integrity", {"coverage": "unknown", "verified_sources": []})
    return result
