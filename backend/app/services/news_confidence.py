"""Phase 172 (M9) — honest per-article confidence for display.

SPEC decision 7: "Berita confidence = tier + calibrated consensus; the 0.86/0.94
constant is never displayed as confidence; unverified reads 'Belum terverifikasi'."

`confidence_score` on the row is the extractor's static tier constant
(``0.94`` for TIER_1_OFFICIAL, ``0.86`` for everything else). It is **deprecated
for display**: it says nothing about whether this article was corroborated.

This module derives the display contract from what actually happened:

    {"value": float | None, "label": str, "basis": str, "tier": str}

* ``value`` is the ingestor's ``calibrated_confidence`` (multi-sensor consensus,
  see ``unified_news_ingestor._verify_with_consensus_gate``) and only when real
  corroboration exists. Otherwise it is ``None`` — never a stand-in constant.
* ``basis``/``label``:
    - ``sensor_corroborated``  -> "Terverifikasi sensor"      (BMKG radar and/or
                                  TomTom flow corroborated the claim)
    - ``multi_source``         -> "Terkonfirmasi multi-sumber" (≥2 agents, no
                                  physical sensor channel)
    - ``single_source``        -> "Satu sumber"               (only the source's
                                  own OSINT authority/exposure channel — that is
                                  provenance, not corroboration, so no value)
    - ``unverified``           -> "Belum terverifikasi"       (nothing to show)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

TIER_1 = "TIER_1_OFFICIAL"
TIER_2 = "TIER_2_AUTHORITATIVE_PRESS"
KNOWN_TIERS = (TIER_1, TIER_2)

# Physical sensor channels (weather radar, traffic flow). The OSINT channel is
# the article's own provenance and the PIHPS channel is commodity exposure —
# neither counts as independent corroboration of the reported event.
SENSOR_AGENTS = ("BMKG_RADAR", "TOMTOM_FLOW")

LABEL_SENSOR = "Terverifikasi sensor"
LABEL_MULTI = "Terkonfirmasi multi-sumber"
LABEL_SINGLE = "Satu sumber"
LABEL_UNVERIFIED = "Belum terverifikasi"


def _as_mapping(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        import json

        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _audit_of(article: Dict[str, Any]) -> Dict[str, Any]:
    """verification_audit, whether it sits on the row or in ground_truth_metrics."""
    audit = _as_mapping(article.get("verification_audit"))
    if audit:
        return audit
    gtm = _as_mapping(article.get("ground_truth_metrics"))
    return _as_mapping(gtm.get("verification_audit"))


def _agents_of(article: Dict[str, Any], audit: Dict[str, Any]) -> List[str]:
    raw = audit.get("corroborating_agents")
    if raw is None:
        raw = article.get("corroborating_agents")
    if isinstance(raw, str):
        raw = [part.strip() for part in raw.split(",") if part.strip()]
    if not isinstance(raw, (list, tuple)):
        return []
    return [str(a).strip().upper() for a in raw if str(a).strip()]


def _calibrated_of(article: Dict[str, Any], audit: Dict[str, Any]) -> Optional[float]:
    raw = audit.get("calibrated_confidence")
    if raw is None:
        raw = article.get("calibrated_confidence")
    try:
        value = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    # 0.0 is what the consensus gate returns when it could not evaluate the
    # claim at all (SKIPPED_UNMATCHED); showing "0%" would be a different lie.
    if value <= 0.0 or value > 1.0:
        return None
    return round(value, 3)


def source_tier_of(article: Dict[str, Any]) -> str:
    tier = str(article.get("source_tier") or "").strip().upper()
    if tier in KNOWN_TIERS:
        return tier
    # Never invent a tier: unknown provenance is reported as Tier-2 press, the
    # conservative bucket the aggregator itself uses for unlabelled feeds.
    return tier or TIER_2


def build_display_confidence(article: Dict[str, Any]) -> Dict[str, Any]:
    """Derive the display contract for one article row. Never raises."""
    if not isinstance(article, dict):
        return {"value": None, "label": LABEL_UNVERIFIED, "basis": "unverified", "tier": TIER_2}

    tier = source_tier_of(article)
    audit = _audit_of(article)
    agents = _agents_of(article, audit)
    calibrated = _calibrated_of(article, audit)

    has_sensor = any(a in agents for a in SENSOR_AGENTS)
    # OSINT_AUTHORITY is the article's own provenance, not a second witness.
    independent = [a for a in agents if a != "OSINT_AUTHORITY"]

    if calibrated is None:
        # No calibrated consensus value → no number is shown, whatever the tier.
        return {"value": None, "label": LABEL_UNVERIFIED, "basis": "unverified", "tier": tier}

    if has_sensor:
        return {
            "value": calibrated,
            "label": LABEL_SENSOR,
            "basis": "sensor_corroborated",
            "tier": tier,
        }

    if len(independent) >= 2:
        return {
            "value": calibrated,
            "label": LABEL_MULTI,
            "basis": "multi_source",
            "tier": tier,
        }

    if independent:
        # One non-sensor channel (e.g. PIHPS exposure) is a single source of
        # evidence — not corroboration, so no percentage is displayed.
        return {"value": None, "label": LABEL_SINGLE, "basis": "single_source", "tier": tier}

    return {"value": None, "label": LABEL_UNVERIFIED, "basis": "unverified", "tier": tier}

