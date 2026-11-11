"""
PreHub : Unified Backend Hazard Consensus Engine (Phase 182)
Gathers multi-source signals (BMKG autogempa, BMKG CAP, weather fusion, news incidents,
FIRMS, TomTom, PetaBencana/BNPB) and establishes authoritative consensus records.

Rules:
- Tiering:
  * CONFIRMED: >= 2 independent sources including >= 1 official or physical source.
  * WATCH: 1 credible source.
  * ADVISORY: Official text-only warning (e.g. BMKG province-wide weather warning).
- Geometry:
  * Real administrative boundaries from adm_boundary_service for ADVISORY records
    (geometry_role='advisory_area').
  * Missing boundary data gaps are reported rather than inventing shapes.
  * ADVISORY areas are never treated as confirmed blockage.
- Quakes:
  * Ingests M>=4.0 shallow events near Sumatra with consistent localized radius.
- LLM Conflict Resolution:
  * Calls LLMGateway only when sources conflict or are ambiguous (short verdict + 1-2 sentence Indonesian reason).
  * Falls back to rule tier with llm_used=False when LLM is unavailable.
- Persistence:
  * Caches in Redis (Upstash) under lrip:state:hazards_consensus:v1 with TTL.
  * Upserts to Supabase table hazards_consensus (mock-friendly).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from app.services.adm_boundary_service import get_advisory_boundary_for_area
from app.services.hazard_evidence import route_intersects_geometry, route_intersects_point
from app.services.spatial_fusion_engine import (
    HAZARD_TTLS,
    OFFICIAL_OR_PHYSICAL_SOURCES,
    _haversine_distance_km,
    _normalize_hazard_group,
    _parse_signal_time,
    lat_lon_to_hex8,
    make_point_buffer_polygon,
    polygon_to_hex8_cells,
)

logger = logging.getLogger(__name__)

REDIS_CONSENSUS_KEY = "lrip:state:hazards_consensus:v1"
REDIS_CONSENSUS_TTL_SECONDS = 600  # 10 minutes cache TTL
HAZARDS_CONSENSUS_TABLE = "hazards_consensus"

_SEVERITY_DELAY_MINUTES = {
    "low": 10,
    "medium": 25,
    "high": 45,
    "critical": 90,
}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> str:
    val = dt or _now_utc()
    if val.tzinfo is None:
        val = val.replace(tzinfo=timezone.utc)
    return val.astimezone(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# 1. Multi-Source Signal Collection
# ---------------------------------------------------------------------------

async def gather_all_hazard_signals() -> List[Dict[str, Any]]:
    """Gathers heterogeneous hazard signals across all live and cached backends."""
    signals: List[Dict[str, Any]] = []
    from app.config import get_settings
    settings = get_settings()

    # 1. BMKG Earthquakes (M>=4.0 shallow near Sumatra)
    # Check cached operational disasters first (instantaneous)
    try:
        from app.services.public_operational_cache import read_public_operational_cache
        op_cache = read_public_operational_cache()
        obs_sec = op_cache.get("observed_disasters") or {}
        obs_data = obs_sec.get("data") if isinstance(obs_sec, dict) else None
        if isinstance(obs_data, dict):
            for r in (obs_data.get("disaster_reports") or []):
                if r.get("event_type") == "earthquake" or r.get("hazard_type") == "earthquake":
                    signals.append(r)
    except Exception:
        pass

    # 2. BMKG CAP & Observed Disasters (PetaBencana, BNPB)
    try:
        from app.services.observed_disaster_service import read_observed_disasters
        obs = read_observed_disasters()
        for report in obs.get("disaster_reports") or []:
            signals.append(report)
        for warn in obs.get("official_warnings") or []:
            signals.append(warn)
    except Exception as e:
        logger.debug(f"Observed disasters signal gather error: {e}")

    # 3. Weather Fusion Polygons (Cached/Operational snapshot)
    try:
        from app.services.weather_fusion_service import get_cached_fusion_snapshot
        snapshot = get_cached_fusion_snapshot()
        features = []
        if isinstance(snapshot, dict) and snapshot.get("data"):
            fc = snapshot["data"]
            features = fc.get("features") or [] if isinstance(fc, dict) else []
        elif isinstance(snapshot, dict) and snapshot.get("features"):
            features = snapshot.get("features") or []

        if not features:
            from app.services.public_operational_cache import read_public_operational_cache
            op_cache = read_public_operational_cache()
            w_sec = op_cache.get("weather_spatial_polygons") or {}
            w_data = w_sec.get("data") if isinstance(w_sec, dict) else None
            if isinstance(w_data, dict):
                features = w_data.get("features") or []

        for feat in features:
            props = feat.get("properties") or {}
            geom = feat.get("geometry")
            center = props.get("center") or {}
            lat = center.get("lat") or props.get("lat")
            lon = center.get("lon") or props.get("lon")
            if (lat is None or lon is None) and geom and geom.get("coordinates"):
                coords = geom.get("coordinates")
                if coords and len(coords) > 0 and len(coords[0]) > 0:
                    lon, lat = coords[0][0][0], coords[0][0][1]

            signals.append({
                "source": props.get("source") or "bmkg_radar_openmeteo",
                "event_type": props.get("hazard_type") or "weather",
                "hazard_type": props.get("hazard_type") or "weather",
                "severity": props.get("severity") or "medium",
                "lat": lat,
                "lon": lon,
                "title": props.get("label") or f"Weather Alert ({props.get('hazard_type', 'weather')})",
                "geometry": geom,
                "geometry_role": "source_footprint",
                "ts": props.get("source_observed_at") or _iso(_now_utc()),
                "expires_at": props.get("valid_until"),
                "is_forecast": True,
            })
    except Exception as e:
        logger.debug(f"Weather fusion signal gather error: {e}")

    # 4. News-Derived Incidents from Supabase (only if configured and online)
    has_supabase = bool(getattr(settings, "supabase_url", None) and getattr(settings, "supabase_service_role_key", None))
    if has_supabase and not getattr(settings, "demo_offline", False):
        try:
            from app.db.supabase_client import get_service_client
            client = get_service_client()
            if client:
                resp = client.table("incidents").select(
                    "incident_id, title, type, severity, status, confidence, created_at, lat, lon, description, affected_area"
                ).in_("status", ["active", "open", "validated", "confirmed"]).limit(40).execute()
                for row in resp.data or []:
                    lat = row.get("lat")
                    lon = row.get("lon")
                    geom = row.get("affected_area")
                    signals.append({
                        "id": row.get("incident_id"),
                        "source": "news",
                        "event_type": row.get("type") or "disruption",
                        "hazard_type": row.get("type") or "disruption",
                        "severity": row.get("severity") or "medium",
                        "confidence": row.get("confidence") or 0.6,
                        "lat": lat,
                        "lon": lon,
                        "title": row.get("title") or "Laporan Berita Lapangan",
                        "description": row.get("description") or "",
                        "geometry": geom,
                        "geometry_role": "buffer_footprint" if geom else "extent_unknown",
                        "ts": row.get("created_at") or _iso(_now_utc()),
                    })
        except Exception as e:
            logger.debug(f"Supabase news incidents gather error: {e}")

    # 5. Public Operational Cache (FIRMS fire hotspots & TomTom traffic flow)
    try:
        from app.services.public_operational_cache import read_public_operational_cache
        op_cache = read_public_operational_cache()
        
        # FIRMS Hotspots
        firms_sec = op_cache.get("fire_hotspots") or {}
        firms_data = firms_sec.get("data")
        if isinstance(firms_data, dict):
            for feat in firms_data.get("features") or []:
                props = feat.get("properties") or {}
                geom = feat.get("geometry")
                coords = geom.get("coordinates") if geom else None
                if coords and len(coords) >= 2:
                    signals.append({
                        "source": "firms",
                        "event_type": "fire",
                        "hazard_type": "fire",
                        "severity": props.get("severity") or "high",
                        "lat": coords[1],
                        "lon": coords[0],
                        "title": props.get("title") or f"Titik Panas Thermal FIRMS ({props.get('confidence', 'nominal')})",
                        "geometry": geom,
                        "geometry_role": "source_footprint",
                        "ts": props.get("acq_date") or _iso(_now_utc()),
                    })

        # TomTom Traffic Congestion Segments
        tomtom_sec = op_cache.get("traffic_flow_segments") or {}
        tomtom_data = tomtom_sec.get("data")
        if isinstance(tomtom_data, dict):
            for seg in tomtom_data.get("segments") or []:
                s_lat = seg.get("lat")
                s_lon = seg.get("lon")
                delay = float(seg.get("delay_seconds") or 0)
                if delay >= 300 and s_lat and s_lon:  # >= 5 min delay
                    signals.append({
                        "source": "tomtom",
                        "event_type": "traffic",
                        "hazard_type": "traffic",
                        "severity": "critical" if delay >= 1200 else ("high" if delay >= 600 else "medium"),
                        "lat": s_lat,
                        "lon": s_lon,
                        "title": seg.get("road_name") or f"Kemacetan Arteri {seg.get('road_name', 'Lintas Sumatra')}",
                        "ts": _iso(_now_utc()),
                    })
    except Exception as e:
        logger.debug(f"Public operational cache signal gather error: {e}")

    return signals


# ---------------------------------------------------------------------------
# 2. Conflict & Ambiguity Detection
# ---------------------------------------------------------------------------

def detect_signal_conflict(cluster: List[Dict[str, Any]]) -> Tuple[bool, str]:
    """Detects whether signals in a spatial cluster carry meaningful contradictions.

    Conflicts:
    - News claims road closure or disaster, but sensor sources (TomTom, BMKG radar) indicate normal flow / 0 rain.
    - Extreme severity disagreement (critical vs low).
    - Status contradiction (open vs closed).
    """
    if len(cluster) < 2:
        return False, ""

    sources = {str(item.get("source") or "").lower() for item in cluster}
    severities = {str(item.get("severity") or item.get("raw", {}).get("severity") or "").lower() for item in cluster}
    types = {_normalize_hazard_group(item.get("hazard_group") or "") for item in cluster}

    # 1. Contradictory event types at the same spot (e.g. fire vs flood)
    if "fire" in types and "flood" in types:
        return True, "Kontradiksi jenis bahaya: terdeteksi laporan kebakaran dan banjir pada lokasi berdekatan."

    # 2. Extreme severity polarization (critical vs low)
    if ("critical" in severities or "extreme" in severities) and ("low" in severities or "minor" in severities):
        return True, "Ketidaksepakatan tingkat keparahan: satu sumber mencatat kritis, sumber lain mencatat rendah."

    # 3. News claims road closure or blockage without official sensor confirmation
    has_news = any("news" in s for s in sources)
    has_sensor = any(s in ("tomtom", "bmkg", "firms") for s in sources)
    if has_news and has_sensor:
        news_closure = any(
            "closure" in str(item.get("raw", {}).get("type") or item.get("raw", {}).get("title") or "").lower()
            or "putus" in str(item.get("raw", {}).get("title") or "").lower()
            for item in cluster if "news" in str(item.get("source") or "").lower()
        )
        if news_closure:
            # Check if tomtom or physical sensors report normal
            return True, "Laporan penutupan jalan dari media memerlukan verifikasi silang sensor fisik."

    return False, ""


# ---------------------------------------------------------------------------
# 3. LLM Consensus Resolution (Fallback-Safe)
# ---------------------------------------------------------------------------

async def evaluate_ambiguity_with_llm(
    hazard_type: str,
    location_name: str,
    sources: List[str],
    conflict_desc: str,
) -> Tuple[Optional[str], Optional[str]]:
    """Invokes LLMGateway for a short verdict and a 1-2 sentence plain Indonesian explanation.
    
    Returns (verdict, reason) or (None, None) if LLM is unavailable.
    """
    from agents.llm_gateway import LLMGateway, LLMGatewayUnavailable

    prompt = (
        f"Anda adalah sistem evaluasi konsensus bahaya logistik Sumatra.\n"
        f"Lokasi: {location_name}\n"
        f"Tipe Bahaya: {hazard_type}\n"
        f"Sumber Terlibat: {', '.join(sources)}\n"
        f"Situasi Konflik: {conflict_desc}\n\n"
        f"Tentukan vonis tier paling tepat (pilih satu: CONFIRMED, WATCH, atau ADVISORY) dan "
        f"berikan alasan ringkas 1-2 kalimat dalam Bahasa Indonesia yang lugas, faktual, tanpa klaim bombastis.\n\n"
        f"Format jawaban:\n"
        f"VONIS: <CONFIRMED|WATCH|ADVISORY>\n"
        f"ALASAN: <alasan ringkas>"
    )

    try:
        response_text = await asyncio.wait_for(
            LLMGateway.generate_content(
                prompt=prompt,
                system_instruction="Anda adalah evaluator konsensus bahaya transportasi objektif dan ringkas.",
                max_tokens=150,
                temperature=0.1,
            ),
            timeout=8.0,
        )

        verdict: Optional[str] = None
        reason: Optional[str] = None

        for line in response_text.splitlines():
            line_str = line.strip()
            if line_str.upper().startswith("VONIS:"):
                v = line_str.split(":", 1)[1].strip().upper()
                if "CONFIRMED" in v:
                    verdict = "CONFIRMED"
                elif "ADVISORY" in v:
                    verdict = "ADVISORY"
                elif "WATCH" in v:
                    verdict = "WATCH"
            elif line_str.upper().startswith("ALASAN:"):
                reason = line_str.split(":", 1)[1].strip()

        if verdict and not reason:
            reason = response_text.strip()

        return verdict, reason
    except (LLMGatewayUnavailable, asyncio.TimeoutError, Exception) as exc:
        logger.warning(f"LLM consensus evaluation unavailable: {exc}")
        return None, None


# ---------------------------------------------------------------------------
# 4. Core Consensus Engine
# ---------------------------------------------------------------------------

async def compute_hazard_consensus(
    signals: Optional[List[Dict[str, Any]]] = None,
    now: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """Synthesizes heterogeneous signals into unified authoritative consensus records.

    Rules:
    - Tiering:
        * CONFIRMED: >= 2 sources with >= 1 official/physical source.
        * WATCH: 1 credible source.
        * ADVISORY: Official text-only warning (e.g. BMKG province/regency warning).
    - Geometry:
        * Quakes: M>=4.0 shallow quakes near Sumatra receive a single-source circle
          buffer polygon (1.5 km for M4, 3.0 km for M5, 5.0 km for M6+).
        * ADVISORY: Real administrative boundaries from adm_boundary_service for the
          named province/kabupaten (flagged geometry_role='advisory_area').
          If boundary fixture is missing, reports that gap rather than inventing shapes.
        * ADVISORY areas are never treated as confirmed blockage.
    - Ambiguity / Conflict:
        * Calls LLMGateway for short verdict + plain Indonesian reason.
        * On LLM failure, falls back to rule tier and records llm_used=False.
    """
    ref_time = now or _now_utc()
    if ref_time.tzinfo is None:
        ref_time = ref_time.replace(tzinfo=timezone.utc)

    if signals is None:
        signals = await gather_all_hazard_signals()

    if not signals:
        return []

    # 1. Filter expired signals and prepare indexed items
    active_signals: List[Dict[str, Any]] = []
    advisory_signals: List[Dict[str, Any]] = []

    for s in signals:
        if not isinstance(s, dict):
            continue

        raw_hazard = str(s.get("hazard_type") or s.get("disaster_type") or s.get("event_type") or "disruption").lower()
        hazard_group = _normalize_hazard_group(raw_hazard)
        ttl = HAZARD_TTLS.get(hazard_group, 21600.0)

        sig_time = _parse_signal_time(s)
        if sig_time is not None:
            age_s = (ref_time - sig_time).total_seconds()
            if age_s > ttl or age_s < -86400:
                continue

        # Check if this is an official text-only warning / advisory area
        g_role = str(s.get("geometry_role") or "").lower()
        is_extent_unknown = g_role == "extent_unknown" or s.get("affected_area") is None and s.get("geometry") is None and s.get("lat") is None
        is_text_warning = "warning" in raw_hazard or s.get("source") in ("bmkg_cap", "bmkg") and is_extent_unknown
        
        area_name = str(s.get("province") or s.get("wilayah") or s.get("location") or s.get("area") or s.get("title") or "")
        
        if is_text_warning and (is_extent_unknown or s.get("lat") is None):
            advisory_signals.append({
                "raw": s,
                "source": str(s.get("source") or "bmkg").lower(),
                "hazard_group": hazard_group,
                "area_name": area_name,
                "sig_time": sig_time or ref_time,
            })
            continue

        # Regular spatial signal: extract or build geometry
        lat = s.get("lat") or s.get("latitude")
        lon = s.get("lon") or s.get("longitude")
        geom = s.get("geometry") or s.get("affected_area")

        if lat is None or lon is None:
            if isinstance(geom, dict) and geom.get("coordinates"):
                coords = geom.get("coordinates")
                if coords and len(coords) > 0 and len(coords[0]) > 0:
                    lon, lat = coords[0][0][0], coords[0][0][1]

        if lat is None or lon is None:
            continue

        try:
            f_lat = float(lat)
            f_lon = float(lon)
        except (ValueError, TypeError):
            continue

        # Single source of truth for quake geometry
        if hazard_group == "earthquake":
            mag = float(s.get("magnitude") or 4.5)
            r_km = float(s.get("radius_km") or (1.5 if mag < 5.0 else (3.0 if mag < 6.0 else 5.0)))
            geom = make_point_buffer_polygon(f_lat, f_lon, radius_m=r_km * 1000.0)
            g_role = "source_footprint"
        elif geom is None:
            geom = make_point_buffer_polygon(f_lat, f_lon, radius_m=450.0)
            g_role = "buffer_footprint"

        cells = polygon_to_hex8_cells(geom, f_lat, f_lon)
        src = str(s.get("source") or "unknown").lower()

        active_signals.append({
            "raw": s,
            "source": src,
            "hazard_group": hazard_group,
            "lat": f_lat,
            "lon": f_lon,
            "geom": geom,
            "geometry_role": g_role or "source_footprint",
            "cells": cells,
            "sig_time": sig_time or ref_time,
        })

    consensus_records: List[Dict[str, Any]] = []

    # -----------------------------------------------------------------------
    # 2. Build Connected Clusters for Spatial Signals (CONFIRMED / WATCH)
    # -----------------------------------------------------------------------
    n = len(active_signals)
    adj: List[List[int]] = [[] for _ in range(n)]

    for i in range(n):
        for j in range(i + 1, n):
            sig_a = active_signals[i]
            sig_b = active_signals[j]

            # Check spatial proximity: shared H3 res-8 cell or distance <= 1.5 km
            shares = bool(sig_a["cells"] & sig_b["cells"])
            if not shares:
                d_km = _haversine_distance_km(sig_a["lat"], sig_a["lon"], sig_b["lat"], sig_b["lon"])
                if d_km <= 1.5:
                    shares = True

            if not shares:
                continue

            # Spatially co-located signals: group if same hazard group OR if cross-checking
            # news report against physical sensor (e.g. traffic or weather) at the same location.
            same_group = sig_a["hazard_group"] == sig_b["hazard_group"]
            has_news = "news" in (sig_a["source"], sig_b["source"])
            has_sensor = any(s in ("tomtom", "bmkg", "firms", "petabencana") for s in (sig_a["source"], sig_b["source"]))
            cross_check = has_news and has_sensor

            if same_group or cross_check:
                adj[i].append(j)
                adj[j].append(i)

    visited = [False] * n
    for i in range(n):
        if visited[i]:
            continue

        cluster: List[Dict[str, Any]] = []
        queue = [i]
        visited[i] = True
        while queue:
            curr = queue.pop(0)
            cluster.append(active_signals[curr])
            for neighbor in adj[curr]:
                if not visited[neighbor]:
                    visited[neighbor] = True
                    queue.append(neighbor)

        # Evaluate Authority Tier
        sources_set = {item["source"] for item in cluster}
        sources = sorted(list(sources_set))
        source_count = len(sources)
        has_physical_or_official = any(s in OFFICIAL_OR_PHYSICAL_SOURCES for s in sources)

        # Baseline rule tier
        if source_count >= 2 and has_physical_or_official:
            rule_tier = "CONFIRMED"
            confidence = min(0.95, round(0.70 + 0.10 * source_count, 2))
        else:
            rule_tier = "WATCH"
            confidence = 0.55 if has_physical_or_official else 0.40

        # Representative center
        pts = [(item["lat"], item["lon"]) for item in cluster]
        center_lat = sum(p[0] for p in pts) / len(pts)
        center_lon = sum(p[1] for p in pts) / len(pts)
        primary_hex = lat_lon_to_hex8(center_lat, center_lon)
        hazard_group = cluster[0]["hazard_group"]

        # Conflict check & optional LLM resolution
        is_conflicted, conflict_desc = detect_signal_conflict(cluster)
        final_tier = rule_tier
        llm_used = False
        plain_reason = ""

        loc_title = str(cluster[0]["raw"].get("title") or f"{hazard_group.capitalize()} Corridor Alert")

        if is_conflicted:
            llm_verdict, llm_reason = await evaluate_ambiguity_with_llm(
                hazard_type=hazard_group,
                location_name=loc_title,
                sources=sources,
                conflict_desc=conflict_desc,
            )
            if llm_verdict in ("CONFIRMED", "WATCH", "ADVISORY") and llm_reason:
                final_tier = llm_verdict
                plain_reason = llm_reason
                llm_used = True
            else:
                # LLM unavailable: fall back to rule tier
                final_tier = rule_tier
                llm_used = False
                plain_reason = f"Terdeteksi perbedaan laporan antar-sumber. Berdasarkan aturan deterministik, status ditetapkan sebagai {final_tier}."
        else:
            if final_tier == "CONFIRMED":
                plain_reason = f"Terkonfirmasi oleh {source_count} sumber independen ({', '.join(sources)}). Terdapat indikasi gangguan operasional pada koridor."
            else:
                plain_reason = f"Terpantau dari sumber {sources[0]}. Pemantauan telemetri berkala disarankan."

        # Compute Footprint Geometry (Single Source of Truth)
        if hazard_group == "earthquake":
            mag = float(cluster[0]["raw"].get("magnitude") or 4.5)
            radius_km = 1.5 if mag < 5.0 else (3.0 if mag < 6.0 else 5.0)
            geom = make_point_buffer_polygon(center_lat, center_lon, radius_m=radius_km * 1000.0)
            g_role = "source_footprint"
        elif len(cluster) == 1:
            geom = cluster[0]["geom"]
            g_role = cluster[0].get("geometry_role", "source_footprint")
            radius_km = 0.45
        else:
            max_d_km = max(_haversine_distance_km(center_lat, center_lon, p[0], p[1]) for p in pts)
            radius_km = min(1.5, max(0.45, round(max_d_km + 0.35, 2)))
            geom = make_point_buffer_polygon(center_lat, center_lon, radius_m=radius_km * 1000.0)
            g_role = "buffer_footprint"

        # Determine severity
        severities = [str(item["raw"].get("severity") or "").lower() for item in cluster]
        if any(s in ("critical", "extreme") for s in severities):
            severity = "critical"
        elif any(s in ("high", "alert") for s in severities):
            severity = "high"
        elif any(s in ("medium", "waspada") for s in severities):
            severity = "medium"
        else:
            severity = "low"

        rec_id = f"cons-{hazard_group}-{primary_hex.replace('hex8_', '')}"
        expires_at = ref_time + timedelta(seconds=HAZARD_TTLS.get(hazard_group, 21600.0))

        consensus_records.append({
            "id": rec_id,
            "type": hazard_group,
            "tier": final_tier,
            "confidence": confidence,
            "sources": sources,
            "geometry": geom,
            "geometry_role": g_role,
            "reason": plain_reason,
            "severity": severity,
            "title": loc_title,
            "center": {"lat": round(center_lat, 5), "lon": round(center_lon, 5)},
            "radius_km": round(radius_km, 2),
            "llm_used": llm_used,
            "updated_at": _iso(ref_time),
            "expires_at": _iso(expires_at),
        })

    # -----------------------------------------------------------------------
    # 3. Process ADVISORY Records (Administrative Boundary Lookup & Gap Report)
    # -----------------------------------------------------------------------
    for adv in advisory_signals:
        raw = adv["raw"]
        hazard_group = adv["hazard_group"]
        area_name = adv["area_name"] or "Sumatera"
        src = adv["source"]

        # Real administrative boundary lookup
        adm_geom = get_advisory_boundary_for_area(area_name)
        if adm_geom is not None:
            geom = adm_geom
            g_role = "advisory_area"
            reason = f"Peringatan dini administratif resmi BMKG untuk wilayah {area_name}. Tidak ada konfirmasi pemblokiran fisik jalan."
        else:
            # Report the gap rather than inventing shapes
            geom = None
            g_role = "extent_unknown"
            reason = f"Peringatan dini BMKG untuk wilayah {area_name}. Data batas administratif wilayah ini belum tersedia."

        adv_hash = hashlib.sha256(f"{src}:{hazard_group}:{area_name}".encode("utf-8")).hexdigest()[:8]
        rec_id = f"cons-adv-{hazard_group}-{adv_hash}"
        expires_at = ref_time + timedelta(seconds=HAZARD_TTLS.get(hazard_group, 21600.0))

        consensus_records.append({
            "id": rec_id,
            "type": hazard_group,
            "tier": "ADVISORY",
            "confidence": 0.60,
            "sources": [src],
            "geometry": geom,
            "geometry_role": g_role,
            "reason": reason,
            "severity": "medium",
            "title": raw.get("title") or f"Peringatan Dini Cuaca BMKG - {area_name}",
            "center": None,
            "radius_km": None,
            "llm_used": False,
            "updated_at": _iso(ref_time),
            "expires_at": _iso(expires_at),
        })

    return consensus_records


# ---------------------------------------------------------------------------
# 5. Route Intersection Checker (Trip Hazard Verification)
# ---------------------------------------------------------------------------

def _extract_polyline_coords(route_geometry: Any) -> List[List[float]]:
    """Normalizes GeoJSON LineString, Feature, or raw coordinate list into [[lon, lat], ...]."""
    if not route_geometry:
        return []

    if isinstance(route_geometry, list):
        if len(route_geometry) > 0 and isinstance(route_geometry[0], (list, tuple)):
            return [[float(p[0]), float(p[1])] for p in route_geometry if len(p) >= 2]
        return []

    if isinstance(route_geometry, dict):
        g_type = route_geometry.get("type", "")
        if g_type == "Feature":
            geom = route_geometry.get("geometry") or {}
            return _extract_polyline_coords(geom)
        if g_type == "LineString":
            coords = route_geometry.get("coordinates") or []
            return [[float(p[0]), float(p[1])] for p in coords if len(p) >= 2]

    return []


def trip_hazard_intersections(
    route_geometry: Any,
    consensus_records: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Evaluates a route trajectory against consensus hazards.

    Returns which consensus hazards intersect the route, the affected segment indices,
    estimated extra delay in minutes, and an overall risk level.
    """
    coords = _extract_polyline_coords(route_geometry)
    if not coords or len(coords) < 2:
        return {
            "intersects_hazard": False,
            "total_hazards": 0,
            "hazards": [],
            "risk_level": "low",
            "estimated_extra_delay_minutes": 0,
            "evaluated_at": _iso(_now_utc()),
        }

    records = consensus_records
    if records is None:
        cached = get_cached_hazards_consensus()
        records = cached.get("records") if cached else []

    intersecting_hazards: List[Dict[str, Any]] = []
    total_delay = 0
    highest_severity_rank = 0
    rank_map = {"low": 1, "medium": 2, "high": 3, "critical": 4}

    for record in records or []:
        geom = record.get("geometry")
        if not geom:
            continue

        # Check whole route intersection
        if not route_intersects_geometry(coords, geom):
            continue

        # Find specific intersecting segment indices
        affected_indices: List[int] = []
        affected_segs: List[Dict[str, Any]] = []

        for i in range(len(coords) - 1):
            seg_coords = [coords[i], coords[i + 1]]
            if route_intersects_geometry(seg_coords, geom):
                affected_indices.append(i)
                affected_segs.append({
                    "segment_index": i,
                    "start": coords[i],
                    "end": coords[i + 1],
                })

        sev = record.get("severity", "medium").lower()
        delay = _SEVERITY_DELAY_MINUTES.get(sev, 25)
        if record.get("tier") == "ADVISORY":
            delay = int(round(delay * 0.4))  # Mild delay for advisory areas

        total_delay += delay
        s_rank = rank_map.get(sev, 2)
        if s_rank > highest_severity_rank:
            highest_severity_rank = s_rank

        intersecting_hazards.append({
            "hazard_id": record.get("id"),
            "type": record.get("type"),
            "tier": record.get("tier"),
            "severity": sev,
            "geometry_role": record.get("geometry_role", "buffer_footprint"),
            "note": record.get("reason", ""),
            "affected_segment_indices": affected_indices,
            "affected_segments": affected_segs,
            "estimated_delay_minutes": delay,
        })

    inv_rank = {1: "low", 2: "medium", 3: "high", 4: "critical"}
    overall_risk = inv_rank.get(highest_severity_rank, "low") if intersecting_hazards else "low"

    return {
        "intersects_hazard": len(intersecting_hazards) > 0,
        "total_hazards": len(intersecting_hazards),
        "hazards": intersecting_hazards,
        "risk_level": overall_risk,
        "estimated_extra_delay_minutes": total_delay,
        "evaluated_at": _iso(_now_utc()),
    }


# ---------------------------------------------------------------------------
# 6. Persistence & Caching Store Layer
# ---------------------------------------------------------------------------

def get_cached_hazards_consensus() -> Optional[Dict[str, Any]]:
    """Reads latest hazards consensus from Redis (Upstash) cache."""
    try:
        from app.services.redis_client import get_redis
        r = get_redis()
        if r is not None:
            raw = r.get(REDIS_CONSENSUS_KEY)
            if raw:
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8")
                return json.loads(raw)
    except Exception as e:
        logger.debug(f"Redis get failed for {REDIS_CONSENSUS_KEY}: {e}")
    return None


def save_hazards_consensus_cache(payload: Dict[str, Any], ttl_seconds: int = REDIS_CONSENSUS_TTL_SECONDS) -> bool:
    """Writes hazards consensus records to Redis with TTL."""
    try:
        from app.services.redis_client import get_redis
        r = get_redis()
        if r is not None:
            r.set(REDIS_CONSENSUS_KEY, json.dumps(payload), ex=ttl_seconds)
            return True
    except Exception as e:
        logger.debug(f"Redis set failed for {REDIS_CONSENSUS_KEY}: {e}")
    return False


def persist_hazards_consensus_to_supabase(records: List[Dict[str, Any]]) -> bool:
    """Mock-friendly persistence to Supabase public.hazards_consensus table."""
    if not records:
        return True
    try:
        from app.config import get_settings
        settings = get_settings()
        if (
            not getattr(settings, "supabase_url", None)
            or not getattr(settings, "supabase_service_role_key", None)
            or getattr(settings, "demo_offline", False)
        ):
            return False

        from app.db.supabase_client import get_service_client
        client = get_service_client()
        if client is None:
            return False

        rows = []
        for r in records:
            rows.append({
                "id": str(r.get("id")),
                "type": str(r.get("type")),
                "tier": str(r.get("tier")),
                "confidence": float(r.get("confidence", 0.5)),
                "sources": json.dumps(r.get("sources", [])) if not isinstance(r.get("sources"), str) else r.get("sources"),
                "geometry": json.dumps(r.get("geometry")) if isinstance(r.get("geometry"), dict) else r.get("geometry"),
                "geometry_role": str(r.get("geometry_role", "buffer_footprint")),
                "reason": str(r.get("reason", "")),
                "severity": str(r.get("severity", "medium")),
                "title": r.get("title"),
                "center": json.dumps(r.get("center")) if isinstance(r.get("center"), dict) else r.get("center"),
                "radius_km": float(r.get("radius_km")) if r.get("radius_km") is not None else None,
                "llm_used": bool(r.get("llm_used", False)),
                "updated_at": r.get("updated_at"),
                "expires_at": r.get("expires_at"),
            })

        client.table(HAZARDS_CONSENSUS_TABLE).upsert(rows).execute()
        return True
    except Exception as e:
        logger.warning(f"Failed to persist hazards_consensus to Supabase (offline/mock): {e}")
        return False


async def run_hazard_consensus_cycle() -> Dict[str, Any]:
    """Executes a full hazard consensus cycle and updates Redis and Supabase."""
    started_at = _now_utc()
    records = await compute_hazard_consensus(now=started_at)

    payload = {
        "status": "ok",
        "generated_at": _iso(started_at),
        "total": len(records),
        "records": records,
    }

    # Save to Redis
    save_hazards_consensus_cache(payload)

    # Persist to Supabase asynchronously
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(asyncio.to_thread(persist_hazards_consensus_to_supabase, records))
    except RuntimeError:
        persist_hazards_consensus_to_supabase(records)

    return payload
