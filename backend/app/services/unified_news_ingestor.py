"""
PreHub : Unified News & Early Warning Ingestion Orchestrator (Supabase + Swarm)
Periodically ingests Pan-Sumatra live feeds, geocodes physical coordinates,
persists to Supabase public.news_articles, and automatically synthesizes
physical incidents into public.incidents, public.incident_impact_assessments,
and public.route_approvals for Globot-style Human-In-The-Loop review.
"""
import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
from urllib.parse import urlparse

import httpx

from app.services.news_aggregator import (
    fetch_all_multi_outlet_news,
    upsert_articles_to_supabase,
    resolve_canonical_article_url,
    resolve_canonical_article_url_async,
    fetch_existing_processed_articles_map,
    remember_processed_article,
    enrich_article_description_if_needed,
)
from app.nlp.news_extractor import extract_structured_news, extract_structured_news_batch
from app.services.redis_client import get_redis
from app.config import get_settings

logger = logging.getLogger(__name__)


def to_ewkt_polygon(ring: Any) -> Optional[str]:
    """Converts a GeoJSON coordinate ring or Polygon dict to EWKT for PostGIS."""
    if not ring:
        return None
    if isinstance(ring, dict):
        coords = ring.get("coordinates")
        if coords and isinstance(coords, list) and len(coords) > 0:
            ring = coords[0]
        else:
            return None
    if not isinstance(ring, (list, tuple)) or len(ring) < 3:
        return None
    pts = list(ring)
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    try:
        coords_str = ", ".join(f"{float(pt[0])} {float(pt[1])}" for pt in pts)
        return f"SRID=4326;POLYGON(({coords_str}))"
    except Exception:
        return None


class UnifiedNewsIngestor:
    """Orchestrates dynamic Pan-Sumatra news extraction, PostGIS persistence, and HITL disruption dispatch."""

    OSINT_STREAM_KEY = "lrip:stream:osint"
    OSINT_STREAM_MAXLEN = 10_000
    OSINT_STREAM_WARN_LENGTH = 15_000

    LINK_CHECK_TIMEOUT_SECONDS = 4.0
    LINK_CHECK_CONCURRENCY = 5
    LINK_LIVENESS_TTL_SECONDS = 900.0
    LINK_ALIVE = "alive"
    LINK_DEAD = "dead"
    LINK_UNKNOWN = "unknown"

    def __init__(self):
        self.is_running = False
        self._processed_disruption_ids = set()
        self._link_liveness_cache: Dict[str, Tuple[str, float]] = {}

    async def run_ingestion_cycle(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Executes a complete ingestion run:
        1. Fetch dynamic RSS & search feeds from 10 Sumatra bureaus
        2. Extract structured NLP intelligence + PostGIS coordinates
        3. Probe original article links so expired URLs are never presented as valid
        4. Upsert to Supabase public.news_articles
        5. Push to Redis stream lrip:stream:osint
        6. Synthesize high-severity events into public.incidents & public.route_approvals
        """
        logger.info("Starting Pan-Sumatra news ingestion cycle...")

        # 0. One-time self-healing DB remediation for contaminated Panjang incidents
        try:
            await self.remediate_contaminated_incidents()
        except Exception as _re:
            logger.debug(f"Incident auto-remediation check skipped: {_re}")
        
        # 1. Fetch raw articles
        raw_items = await fetch_all_multi_outlet_news()
        if not raw_items:
            logger.warning("No news articles returned from feeds.")
            return {"status": "empty", "ingested": 0, "disruptions_triggered": 0}

        # 1b. DB-first deduplication: reuse prior LLM classifications with 0 LLM calls.
        top_items = raw_items[:30]
        try:
            import hashlib as _hl
            pre_ids: list[str] = []
            pre_links: list[str] = []
            for _a in top_items:
                _t = _a.get("title", "")
                _l = _a.get("link") or _a.get("url") or ""
                if _l:
                    pre_links.append(str(_l))
                # Probe deterministic heuristic id used by extractor
                pre_ids.append(f"NEWS-{_hl.md5(f'{_t}:{_l}'.encode()).hexdigest()[:8]}")
            existing_map = fetch_existing_processed_articles_map(pre_ids, pre_links)
        except Exception:
            existing_map = {}

        unseen: list[Dict[str, Any]] = []
        reused: list[Dict[str, Any]] = []
        for _a in top_items:
            _t = _a.get("title", "")
            _l = _a.get("link") or _a.get("url") or ""
            import hashlib as _hl2
            _pid = f"NEWS-{_hl2.md5(f'{_t}:{_l}'.encode()).hexdigest()[:8]}"
            hit = existing_map.get(_pid) or existing_map.get(str(_l))
            if hit:
                # Rehydrate persisted tiering metadata from ground_truth_metrics.
                try:
                    gtm = hit.get("ground_truth_metrics") or {}
                    if isinstance(gtm, str):
                        import json as _js
                        gtm = _js.loads(gtm)
                    merged = dict(_a)
                    merged.update({k: v for k, v in hit.items()
                                   if k in ("id", "latitude", "longitude", "province", "region",
                                            "corridor_segment", "corridor_nodes", "incident_type",
                                            "severity", "temporal_phase", "zone_tier", "tier_reason",
                                            "custom_hazard_label", "impact_profile", "is_geocoded",
                                            "location_precision", "summary", "confidence_score",
                                            "affected_locations")})
                    for _k in ("zone_tier", "tier_reason", "custom_hazard_label",
                               "impact_profile", "is_geocoded", "location_precision",
                               "affected_locations", "schema_version"):
                        if merged.get(_k) is None and isinstance(gtm, dict) and gtm.get(_k) is not None:
                            merged[_k] = gtm[_k]
                    if not merged.get("id"):
                        merged["id"] = _pid
                    # Stale rows (schema_version != 7) must be re-extracted.
                    try:
                        _sv_hit = gtm.get("schema_version") if isinstance(gtm, dict) else None
                    except Exception:
                        _sv_hit = None
                    if _sv_hit != 7:
                        unseen.append(merged)
                        continue
                    reused.append(merged)
                    continue
                except Exception:
                    pass
            unseen.append(_a)

        # 2. Extract structured intelligence — ONE economical batched LLM call for unseen only.
        # Enrich short/title-only descriptions first so multi-regency bodies resolve.
        if unseen:
            try:
                import asyncio as _aio
                unseen = list(await _aio.gather(*[enrich_article_description_if_needed(dict(_a)) for _a in unseen]))
            except Exception:
                pass
        structured_articles: list[Dict[str, Any]] = list(reused)
        if unseen:
            try:
                batch_results = await extract_structured_news_batch(unseen)
                structured_articles.extend([a for a in batch_results if isinstance(a, dict)])
            except Exception as be:
                logger.warning(f"Batched extraction failed, falling back per-item: {be}")
                tasks = [extract_structured_news(a) for a in unseen]
                fallback = await asyncio.gather(*tasks, return_exceptions=True)
                structured_articles.extend([a for a in fallback if isinstance(a, dict)])

        # Ensure canonical article URLs and permalinks are resolved asynchronously across all items
        async def resolve_item(art: Dict[str, Any]):
            raw_url = art.get("link") or art.get("url") or ""
            title = art.get("title", "")
            source = art.get("source", "")
            resolved_url = await resolve_canonical_article_url_async(raw_url, title, source)
            art["link"] = resolved_url
            art["url"] = resolved_url

        await asyncio.gather(*(resolve_item(a) for a in structured_articles))

        # 3. Verify original source links (dead / alive / unknown provenance)
        await self._attach_link_liveness(structured_articles)

        # 4. Upsert to Supabase — persist ALL incl. DROPPED_IRRELEVANT so they are
        # remembered in DB and never re-tested by the LLM on the next cycle.
        upserted_count = await upsert_articles_to_supabase(structured_articles)
        for _art in structured_articles:
            try:
                remember_processed_article(_art)
            except Exception:
                pass

        # SPEC-LOCKED Q2+Q7 selective async Gate-2: uncertain / YELLOW /
        # conf<0.7 / ambiguous items are re-verified in the background
        # (5-conc, 60s/item, MD5 cache, schema v7) WITHOUT slowing the Gate-1
        # sync hot path above. Refined verdicts upsert themselves; the next
        # cycle's DB-first reuse serves them with 0 LLM calls.
        try:
            _gate2_candidates = [a for a in structured_articles if isinstance(a, dict)]
            if _gate2_candidates:
                asyncio.create_task(self.run_gate2_background_review(_gate2_candidates))
        except Exception as _g2e:
            logger.debug(f"Gate-2 background scheduling skipped: {_g2e}")

        # Filter DROPPED_IRRELEVANT before publishing to Redis / synthesizing incidents.
        publishable = [a for a in structured_articles
                       if a.get("zone_tier") != "DROPPED_IRRELEVANT"
                       and a.get("is_geocoded") is not False
                       and a.get("latitude") is not None
                       and a.get("longitude") is not None]

        # 5. Push to Redis Stream
        await self._publish_to_redis(publishable)

        # 6. Evaluate and trigger disruptions for road-blocking or critical events
        disruptions_triggered = await self._process_critical_disruptions(publishable)

        return {
            "status": "success",
            "total_fetched": len(raw_items),
            "structured_count": len(structured_articles),
            "publishable_count": len(publishable),
            "reused_from_cache": len(reused),
            "llm_batch_calls": 1 if unseen else 0,
            "upserted_supabase": upserted_count,
            "disruptions_triggered": disruptions_triggered,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    @staticmethod
    def _same_host(original_url: str, final_url: str) -> bool:
        """Compares hosts while ignoring case and a leading `www.` prefix.

        A redirect that lands on a different site (e.g. a paywall or aggregator) is
        treated as a dead source link, while a plain http→https or www hop is not.
        """
        def host_of(url: str) -> str:
            host = (urlparse(url).hostname or "").lower()
            return host[4:] if host.startswith("www.") else host

        original_host = host_of(original_url)
        return original_host == "" or host_of(final_url) == original_host

    async def _is_link_alive(self, url: str, client: "httpx.AsyncClient") -> str:
        """Probes a source URL and returns `alive`, `dead`, or `unknown`.

        Dead means the server answered with explicit 404/410, redirected to site root,
        or redirected to another host. Cloud anti-bot barriers (401, 403, 429) or consent
        pages on deep article paths remain `alive` so valid news remains clickable.
        Timeouts and transport errors stay `unknown`.
        """
        cached = self._link_liveness_cache.get(url)
        if cached and (time.monotonic() - cached[1]) < self.LINK_LIVENESS_TTL_SECONDS:
            return cached[0]

        verdict = self.LINK_UNKNOWN
        try:
            response = await client.get(url)
            final_url = str(response.url)
            final_path = urlparse(final_url).path
            if response.status_code in (404, 410):
                verdict = self.LINK_DEAD
            elif final_path in ("", "/"):
                verdict = self.LINK_DEAD
            elif not self._same_host(url, final_url):
                if any(x in final_url for x in ("consent", "captcha", "cloudflare", "login", "auth")):
                    verdict = self.LINK_ALIVE
                else:
                    verdict = self.LINK_DEAD
            elif response.status_code in (401, 403, 429):
                verdict = self.LINK_ALIVE
            elif response.status_code < 400:
                verdict = self.LINK_ALIVE
            else:
                verdict = self.LINK_UNKNOWN
        except httpx.TimeoutException:
            logger.debug(f"News link liveness probe timed out for {url}")
        except httpx.HTTPError as exc:
            logger.debug(f"News link liveness probe failed for {url}: {exc}")

        if verdict != self.LINK_UNKNOWN:
            self._link_liveness_cache[url] = (verdict, time.monotonic())
        return verdict

    async def _attach_link_liveness(self, articles: List[Dict[str, Any]]) -> None:
        """Tags every article with `link_alive` for downstream Supabase, Redis and UI consumers."""
        if not articles:
            return

        semaphore = asyncio.Semaphore(self.LINK_CHECK_CONCURRENCY)

        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=self.LINK_CHECK_TIMEOUT_SECONDS,
        ) as client:
            async def probe(article: Dict[str, Any]) -> None:
                link = article.get("link") or article.get("url")
                if not link:
                    article["link_alive"] = self.LINK_UNKNOWN
                    return
                article["link"] = str(link)
                article["url"] = str(link)
                async with semaphore:
                    article["link_alive"] = await self._is_link_alive(str(link), client)

            await asyncio.gather(*(probe(article) for article in articles))

    async def _publish_to_redis(self, articles: List[Dict[str, Any]]):
        """Pushes structured news to Redis stream lrip:stream:osint for multi-agent ingestion."""
        try:
            r = get_redis()
            for art in articles[:10]:
                payload = {
                    "id": str(art.get("id", "")),
                    "source": str(art.get("source", "news")),
                    "source_tier": str(art.get("source_tier", "TIER_2_AUTHORITATIVE_PRESS")),
                    "event_type": "disruption_news",
                    "incident_type": str(art.get("incident_type", "logistics_news")),
                    "title": str(art.get("title", "")),
                    "summary": str(art.get("summary", "")),
                    "severity": str(art.get("severity", "medium")),
                    "temporal_phase": str(art.get("temporal_phase", "active_disruption")),
                    "lead_time_hours": str(art.get("lead_time_hours", 0.0)),
                    "province": str(art.get("province", "Sumatera")),
                    "region": str(art.get("region", "Sumatera")),
                    "latitude": str(art.get("latitude") or 0.0),
                    "longitude": str(art.get("longitude") or 0.0),
                    "corridor_segment": str(art.get("corridor_segment", "Jalur Logistik Utama")),
                    "commodities_affected": ",".join(art.get("commodities_affected", ["Komoditas Pangan Pokok"])),
                    "lane_status": str(art.get("ground_truth_metrics", {}).get("lane_status", "CLEAR")),
                    "link": str(art.get("link", "")),
                    "url": str(art.get("url") or art.get("link", "")),
                    "published_at": str(art.get("published_at") or art.get("pubDate") or datetime.now(timezone.utc).isoformat()),
                    "link_alive": str(art.get("link_alive", "unknown")),
                    "confidence_score": str(art.get("confidence_score", 0.85)),
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                r.xadd(self.OSINT_STREAM_KEY, payload, maxlen=self.OSINT_STREAM_MAXLEN, approximate=True)

            try:
                stream_length = r.xlen(self.OSINT_STREAM_KEY)
                logger.debug(f"OSINT stream length after publish: {stream_length}")
                if stream_length > self.OSINT_STREAM_WARN_LENGTH:
                    logger.warning(
                        f"OSINT stream {self.OSINT_STREAM_KEY} length {stream_length} "
                        f"exceeds operational threshold {self.OSINT_STREAM_WARN_LENGTH}"
                    )
            except Exception:
                pass
        except Exception as e:
            logger.debug(f"Redis news publishing skipped: {e}")

    def _verify_with_consensus_gate(self, art: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """
        Stage 2: Multi-sensor consensus escalation via agents.tools.consensus_gate.
        Channels:
        - W (Meteorological): BMKG Radar + Open-Meteo precipitation at (lat, lon)
        - T (Traffic Flow): TomTom traffic congestion / delay
        - I (OSINT Press Authority): Official Press vs Regional media tier
        - E (PIHPS Commodity Exposure): Strategic food corridor sensitivity
        """
        try:
            from agents.tools.consensus_gate import compute_consensus, cross_validate_news_with_bmkg
        except ModuleNotFoundError:
            import sys, os
            workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
            if workspace_root not in sys.path:
                sys.path.insert(0, workspace_root)
            from agents.tools.consensus_gate import compute_consensus, cross_validate_news_with_bmkg

        from app.nlp.news_extractor import PHYSICAL_BLOCKAGE_PREDICATES

        lat = art.get("latitude")
        lon = art.get("longitude")
        if lat is None or lon is None:
            return "YELLOW_CLARIFY", {
                "consensus_probability": 0.0,
                "corroborating_agents": [],
                "escalation_status": "SKIPPED_UNMATCHED"
            }

        # SPEC-LOCKED M5 Phase A Q1 hard island bbox (94-108E/-6.5..6.5N):
        # out-of-Sumatra coordinates never synthesize zones or incidents.
        try:
            _latf, _lonf = float(lat), float(lon)
            if not (94.0 <= _lonf <= 108.0 and -6.5 <= _latf <= 6.5):
                _reason_oos = ("Lokasi di luar Pulau Sumatera (di luar bbox 94-108E/-6.5..6.5N); "
                               "di luar cakupan koridor logistik Sumatera.")
                art["zone_tier"] = "DROPPED_IRRELEVANT"
                try:
                    if "ground_truth_metrics" not in art or not isinstance(art["ground_truth_metrics"], dict):
                        art["ground_truth_metrics"] = {}
                    art["ground_truth_metrics"]["zone_tier"] = "DROPPED_IRRELEVANT"
                    art["ground_truth_metrics"]["tier_reason"] = _reason_oos
                except Exception:
                    pass
                return "DROPPED_IRRELEVANT", {
                    "consensus_probability": 0.0,
                    "corroborating_agents": [],
                    "escalation_status": "SKIPPED_OUT_OF_SUMATRA",
                    "escalation_reasoning": _reason_oos,
                }
        except (TypeError, ValueError):
            pass

        # 1. Channel W: Weather (BMKG Radar / Open-Meteo)
        weather_conf = 0.10
        w_telemetry = art.get("weather_telemetry") or {}
        if not w_telemetry:
            try:
                r = get_redis()
                cached_weather = r.get(f"lrip:weather:point:{lat:.2f}:{lon:.2f}") if r else None
                if cached_weather:
                    import json as _js
                    w_telemetry = _js.loads(cached_weather)
            except Exception as we:
                logger.debug(f"Weather sensor cache check skipped: {we}")

        # Deterministic BMKG physical sensor cross-validation
        bmkg_cross = cross_validate_news_with_bmkg(art, w_telemetry if w_telemetry else None)
        if bmkg_cross.get("is_corroborated"):
            weather_conf = float(bmkg_cross.get("composite_confidence", 0.70))
        elif w_telemetry:
            rain_mm = float(w_telemetry.get("rainfall_mm") or w_telemetry.get("precipitation_mm") or 0.0)
            if rain_mm > 0.0:
                weather_conf = 0.35
            else:
                weather_conf = 0.10
        else:
            # Strictly PURGED: Never inflate weather_conf from article title keywords!
            weather_conf = 0.10

        # 2. Channel T: TomTom Traffic Flow Telemetry
        traffic_conf = 0.15
        try:
            r = get_redis()
            corridor = art.get("corridor_segment", "")
            seg_key = f"lrip:tomtom:segment:{corridor}"
            cached_traffic = r.get(seg_key) if r else None
            if cached_traffic:
                import json as _js
                t_data = _js.loads(cached_traffic)
                delay_min = float(t_data.get("delay_min", 0.0))
                curr_spd = float(t_data.get("currentSpeed", 30.0))
                free_spd = float(t_data.get("freeFlowSpeed", 60.0))
                if delay_min >= 25.0 or (free_spd > 0 and (curr_spd / free_spd) < 0.45):
                    traffic_conf = 0.85
                elif delay_min >= 10.0 or (free_spd > 0 and (curr_spd / free_spd) < 0.70):
                    traffic_conf = 0.60
            elif "macet" in str(art.get("title", "")).lower() or "antrean" in str(art.get("title", "")).lower():
                traffic_conf = 0.40  # Conservative unverified traffic hint
        except Exception as te:
            logger.debug(f"Traffic sensor check skipped: {te}")

        # 3. Channel I: OSINT Authority Tier
        source_name = str(art.get("source", "")).lower()
        source_tier = str(art.get("source_tier", "")).upper()
        if source_tier == "TIER_1_OFFICIAL" or any(w in source_name for w in ("antara", "bmkg", "bnpb", "bpbd", "kemenhub")):
            osint_conf = 0.90
        elif any(w in source_name for w in ("detik", "waspada", "kompas", "tribun")):
            osint_conf = 0.75
        else:
            osint_conf = 0.60

        # 4. Channel E: PIHPS Food Commodity Sensitivity
        commodities = art.get("commodities_affected") or []
        has_staple = any(c in commodities for c in ["Cabai Merah", "Beras BULOG", "Minyak Goreng", "Bawang Merah"])
        econ_conf = 0.70 if has_staple else 0.20

        state = {
            "data_collection_finding": {
                "confidence": weather_conf,
                "timestamp": art.get("published_at"),
                "distance_km": float(bmkg_cross.get("spatial_delta_km", 5.0) if bmkg_cross.get("spatial_delta_km", 9999.0) < 9999.0 else 5.0),
                "is_corroborated": bmkg_cross.get("is_corroborated", False),
            },
            "prediction_finding": {"confidence": traffic_conf, "timestamp": art.get("published_at"), "distance_km": 5.0},
            "osint_hazard_finding": {"confidence": osint_conf, "timestamp": art.get("published_at"), "distance_km": 5.0},
            "economic_intelligence_finding": {"confidence": econ_conf, "timestamp": art.get("published_at"), "distance_km": 5.0},
            "bmkg_cross_validation": bmkg_cross,
        }

        consensus_res = compute_consensus(state)
        p_disruption = float(consensus_res.get("raw_probability", 0.0))
        calibrated_conf = float(consensus_res.get("overall_confidence", 0.0))
        breakdown = consensus_res.get("consensus_breakdown", {})

        corroborating_agents = []
        if weather_conf >= 0.5:
            corroborating_agents.append("BMKG_RADAR")
        if traffic_conf >= 0.5:
            corroborating_agents.append("TOMTOM_FLOW")
        if osint_conf >= 0.7:
            corroborating_agents.append("OSINT_AUTHORITY")
        if econ_conf >= 0.5:
            corroborating_agents.append("PIHPS_COMMODITY")

        full_text = f"{art.get('title', '')} {art.get('summary', '')} {art.get('raw_description', '')}".lower()
        has_physical_obstruction = any(w in full_text for w in PHYSICAL_BLOCKAGE_PREDICATES)
        loc_prec = str(art.get("location_precision", "corridor_point")).lower()
        is_vague_region = loc_prec in ("kabupaten_kota", "province_only")

        # Hard invariant: Regency mention only can NEVER be RED_CONFIRMED
        if is_vague_region and not has_physical_obstruction:
            final_tier = "YELLOW_CLARIFY"
            escalation_status = "TIER_C_REGENCY_CAPPED"
            reasoning = "Penyebutan setingkat Kabupaten/Kota tanpa titik koridor spesifik; dibatasi pada Zona Kuning (advisory)."
        elif (p_disruption >= 0.70 and len(corroborating_agents) >= 2) or has_physical_obstruction:
            final_tier = "RED_CONFIRMED"
            escalation_status = "TERKONFIRMASI_MULTI_SENSOR" if len(corroborating_agents) >= 2 else "BLOKADE_FISIK_TERKONFIRMASI"
            reasoning = (f"Konsensus multi-sensor {round(p_disruption * 100, 1)}% terkoroborasi "
                         f"({', '.join(corroborating_agents)}) pada koridor logistik.")
        else:
            final_tier = "YELLOW_CLARIFY"
            escalation_status = "ESKALASI_PENALARAN"
            reasoning = "Kandidat insiden belum mencapai ambang batas multi-sensor (P < 0.70); dialihkan untuk review operator."

        audit_payload = {
            "consensus_probability": round(p_disruption, 3),
            "calibrated_confidence": round(calibrated_conf, 3),
            "corroborating_agents": corroborating_agents,
            "escalation_status": escalation_status,
            "escalation_reasoning": reasoning,
            "location_tier": "TIER_A" if loc_prec in ("corridor_point", "exact_node") else "TIER_B" if loc_prec == "kecamatan_kelurahan" else "TIER_C",
            "channel_breakdown": breakdown,
            "bmkg_cross_validation": consensus_res.get("bmkg_cross_validation"),
            "llm_verified": True
        }

        art["zone_tier"] = final_tier
        if "ground_truth_metrics" not in art or not isinstance(art["ground_truth_metrics"], dict):
            art["ground_truth_metrics"] = {}
        art["ground_truth_metrics"]["zone_tier"] = final_tier
        art["ground_truth_metrics"]["tier_reason"] = reasoning
        if "verification_audit" not in art["ground_truth_metrics"]:
            art["ground_truth_metrics"]["verification_audit"] = {}
        art["ground_truth_metrics"]["verification_audit"].update(audit_payload)
        art["verification_audit"] = art["ground_truth_metrics"]["verification_audit"]

        return final_tier, audit_payload

    async def run_gate2_background_review(self, articles: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Selective async Gate-2 background review (SPEC-LOCKED Q2+Q7).

        Only uncertain / YELLOW / conf<0.7 / ambiguous items (per
        news_extractor._needs_gate2_review) spend the mimo-v2.6-pro
        low-effort + single web-search + W/T/I/E re-check budget at
        5-concurrency with a 60s/item timeout (MD5-cached, schema v7).
        Still-uncertain items resolve to DROPPED_IRRELEVANT with a
        koroborasi-kurang tier_reason. Refined rows are upserted so the
        next cycle's DB-first reuse serves the Gate-2 verdict with 0 LLM
        calls. Never raises.
        """
        try:
            from app.nlp.news_extractor import run_gate2_async_verification, _needs_gate2_review
        except Exception as ie:
            logger.debug(f"Gate-2 background review skipped (import): {ie}")
            return {"status": "skipped", "reason": "import_unavailable", "reviewed": 0}
        targets = [a for a in (articles or []) if isinstance(a, dict) and _needs_gate2_review(a)]
        if not targets:
            return {"status": "success", "reviewed": 0, "message": "no uncertain candidates"}
        try:
            await run_gate2_async_verification(targets)
        except Exception as ge:
            logger.debug(f"Gate-2 background verification skipped: {ge}")
            return {"status": "degraded", "reviewed": len(targets), "reason": str(ge)}
        # Persist refined verdicts (DROPPED stays remembered, never re-tested).
        try:
            await upsert_articles_to_supabase([a for a in targets if isinstance(a, dict) and a.get("link")])
            for _art in targets:
                try:
                    remember_processed_article(_art)
                except Exception:
                    pass
        except Exception as ue:
            logger.debug(f"Gate-2 refined upsert skipped: {ue}")
        try:
            _dropped = sum(1 for a in targets if str(a.get("zone_tier") or "").upper() == "DROPPED_IRRELEVANT")
        except Exception:
            _dropped = 0
        return {"status": "success", "reviewed": len(targets), "dropped_uncertain": _dropped}

    async def _process_critical_disruptions(self, articles: List[Dict[str, Any]]) -> int:
        """
        Synthesizes physical disruption incidents in Supabase and triggers fleet impact evaluation.
        Only verified RED_CONFIRMED articles synthesize physical incidents; YELLOW stays advisory-only.
        """
        count = 0
        for art in articles:
            zone_tier = str(art.get("zone_tier") or art.get("ground_truth_metrics", {}).get("zone_tier") or "")
            if zone_tier == "DROPPED_IRRELEVANT":
                continue
            if art.get("latitude") is None or art.get("longitude") is None:
                continue

            art_id = str(art.get("id", ""))
            if art_id in self._processed_disruption_ids:
                continue

            # Stage 2 ConsensusGate cross-verification
            final_tier, audit_payload = self._verify_with_consensus_gate(art)

            # Strict Invariant: Only RED_CONFIRMED synthesizes a physical road/port incident
            if final_tier == "RED_CONFIRMED":
                self._processed_disruption_ids.add(art_id)
                success = await self._synthesize_incident_and_hitl(art)
                if success:
                    count += 1
        return count

    async def _synthesize_incident_and_hitl(self, art: Dict[str, Any]) -> bool:
        """
        1. Creates public.incidents record in Supabase with PostGIS geography point
        2. Evaluates active shipment corridor intersections
        3. Persists public.incident_impact_assessments
        4. Creates pending recommendation in public.route_approvals for Globot HITL drawer
        """
        try:
            from app.db.supabase_client import get_service_client
            sb = get_service_client()
        except Exception as se:
            logger.warning(f"Supabase client unavailable: {se}")
            return False

        lat = art.get("latitude")
        lon = art.get("longitude")
        if lat is None or lon is None:
            return False

        incident_uuid = str(uuid.uuid4())
        title = f"[News Alert] {art.get('title', 'Disrupsi Logistik')}"
        severity = art.get("severity", "high")
        inc_type = art.get("incident_type", "road_closure")
        corridor = art.get("corridor_segment", "Jalur Logistik Sumatera")
        province = art.get("province", "Sumatera")

        postgis_point = f"SRID=4326;POINT({lon} {lat})"
        poly_ewkt = to_ewkt_polygon(art.get("geometry_polygon"))

        gtm = art.get("ground_truth_metrics") or {}
        audit = gtm.get("verification_audit") or {}

        # 1. Insert into public.incidents
        incident_row = {
            "incident_id": incident_uuid,
            "title": title,
            "description": f"{art.get('source')} melaporkan: {art.get('summary', title)}. Koridor terdampak: {corridor}.",
            "type": inc_type,
            "severity": severity,
            "status": "validating",
            "confidence": float(art.get("confidence_score", 0.90)),
            "location": postgis_point,
            "lat": float(lat),
            "lon": float(lon),
            "evidence": {
                "source": art.get("source"),
                "source_tier": art.get("source_tier"),
                "link": art.get("link"),
                "commodities": art.get("commodities_affected"),
                "lead_time_hours": art.get("lead_time_hours"),
                "ground_truth_metrics": gtm,
                "consensus_probability": audit.get("consensus_probability", 0.85),
                "corroborating_agents": audit.get("corroborating_agents", []),
                "location_tier": gtm.get("location_tier", "TIER_A"),
                "escalation_status": audit.get("escalation_status", "TERKONFIRMASI_MULTI_SENSOR"),
            },
            "recommendations": [
                {
                    "action": "EVALUATE_DETOUR",
                    "corridor": corridor,
                    "target_commodities": art.get("commodities_affected")
                }
            ],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        if poly_ewkt:
            incident_row["affected_area"] = poly_ewkt

        try:
            sb.table("incidents").insert(incident_row).execute()
            logger.info(f"Synthesized new incident in Supabase: {title[:60]} (ID: {incident_uuid})")
        except Exception as ie:
            logger.error(f"Error inserting incident into Supabase: {ie}")
            return False

        # Link incident_id back to news_articles
        try:
            sb.table("news_articles").update({
                "is_incident_triggered": True,
                "incident_id": incident_uuid
            }).eq("id", art.get("id")).execute()
        except Exception:
            pass

        # 2. Trigger Fleet Impact Assessment
        try:
            from app.services.impact_assessment_service import ImpactAssessmentService
            from app.schemas.impact_schemas import DisruptionImpactRequest

            impact_service = ImpactAssessmentService()
            req = DisruptionImpactRequest(
                incident_id=incident_uuid,
                hazard_type=inc_type,
                severity=severity if severity in ["low", "medium", "high", "critical"] else "high",
                lat=float(lat),
                lon=float(lon),
                radius_km=float(art.get("radius_km") or 1.15),
                title=f"{corridor}: {title}"
            )

            impact_res = await impact_service.assess_disruption_impact(req)

            # Persist impact assessment to Supabase
            try:
                assessment_row = {
                    "incident_id": incident_uuid,
                    "hazard_type": inc_type,
                    "latitude": float(lat),
                    "longitude": float(lon),
                    "radius_km": float(art.get("radius_km") or 1.15),
                    "severity": severity,
                    "total_fleet_scanned": impact_res.total_fleet_scanned,
                    "impacted_vehicles_count": impact_res.impacted_vehicles_count,
                    "impacted_vehicles": [v.dict() for v in impact_res.impacted_vehicles],
                    "evaluated_at": datetime.now(timezone.utc).isoformat()
                }
                sb.table("incident_impact_assessments").insert(assessment_row).execute()
            except Exception as se_imp:
                logger.debug(f"Incident impact assessment Supabase logging skipped: {se_imp}")

            # 3. Create Pending Globot HITL Route Approval
            approval_row = {
                "id": str(uuid.uuid4()),
                "incident_id": incident_uuid,
                "route_id": f"REROUTE-{corridor[:15].upper().replace(' ', '-')}",
                "recommended_route": {
                    "corridor": corridor,
                    "incident_title": title,
                    "news_source": art.get("source"),
                    "news_link": art.get("link"),
                    "news_summary": art.get("summary"),
                    "impacted_vehicles_count": impact_res.impacted_vehicles_count,
                    "impacted_vehicles": [v.dict() for v in impact_res.impacted_vehicles[:5]],
                    "tactical_recommendation": "REROUTE_VIA_ALTERNATIVE",
                    "spoilage_risk_detected": any(v.spoilage_loss_idr > 0 for v in impact_res.impacted_vehicles)
                },
                "operator_id": "system_news_agent",
                "action": "PENDING_REVIEW",
                "tactical_action": "REROUTE",
                "sync_status": "pending_operator_review",
                "notes": f"Disrupsi terdeteksi dari {art.get('source')} di {corridor}. {impact_res.impacted_vehicles_count} armada logistik berada dalam radius bahaya.",
                "approved_at": datetime.now(timezone.utc).isoformat()
            }

            sb.table("route_approvals").insert(approval_row).execute()
            logger.info(f"Created pending Globot HITL route approval in Supabase for incident {incident_uuid}")
            return True

        except Exception as ae:
            logger.error(f"Error evaluating fleet impact for incident {incident_uuid}: {ae}")
            return True

    async def remediate_contaminated_incidents(self, force: bool = False) -> Dict[str, Any]:
        """
        Phase 76: Self-healing scan on Supabase public.incidents for false 'panjang' geocodes:
        - Detects records near (-5.4744, 105.3183) whose text does not mention Lampung/Panjang Port.
        - Re-geocodes or marks non-physical/historical summary records as resolved.
        - Sets Redis cache key `lrip:remediation:panjang_v5` to prevent repeated runs.
        """
        r = get_redis()
        cache_key = "lrip:remediation:panjang_v5"
        if not force and r:
            try:
                if r.get(cache_key):
                    return {"status": "skipped", "reason": "already_remediated"}
            except Exception:
                pass

        try:
            from app.db.supabase_client import get_service_client
            sb = get_service_client()
        except Exception as se:
            logger.warning(f"Incident remediation skipped: Supabase unavailable ({se})")
            return {"status": "failed", "reason": str(se)}

        remediated_count = 0
        details = []

        try:
            res = sb.table("incidents").select("incident_id, title, description, lat, lon, location, status, severity, type").execute()
            rows = res.data or []

            for row in rows:
                i_id = row.get("incident_id")
                title = row.get("title") or ""
                desc = row.get("description") or ""
                combined_text = f"{title} {desc}".lower()

                lat = row.get("lat")
                lon = row.get("lon")
                if lat is None or lon is None:
                    continue

                try:
                    lat_f = float(lat)
                    lon_f = float(lon)
                except (ValueError, TypeError):
                    continue

                # Check if near false Panjang node (-5.4744, 105.3183) within tolerance
                is_near_panjang = (-5.55 <= lat_f <= -5.40) and (105.25 <= lon_f <= 105.40)
                if not is_near_panjang:
                    continue

                # Legitimate Lampung/Panjang incident check
                is_legit_lampung = any(k in combined_text for k in ("lampung", "bandar lampung", "pelabuhan panjang", "bakauheni", "lamsel"))
                if is_legit_lampung:
                    continue

                from app.nlp.geocoding_service import resolve_sumatra_location_and_corridor
                from app.services.incident_geometry_service import compute_hazard_zone_geometry_and_radius

                res_geo = resolve_sumatra_location_and_corridor(f"{title} {desc}")
                new_lat = res_geo.get("latitude")
                new_lon = res_geo.get("longitude")
                loc_prec = res_geo.get("location_precision", "corridor_point")
                corridor = res_geo.get("corridor_segment", "Jalur Logistik Sumatera")
                matched_node = res_geo.get("matched_node")

                is_summary_or_broad = (
                    loc_prec in ("province_only", "kabupaten_kota")
                    and any(w in combined_text for w in ("catat", "sepanjang september", "sepanjang agustus", "sepanjang tahun", "rekapitulasi", "bencana terjadi di"))
                )

                update_payload: Dict[str, Any] = {}
                if is_summary_or_broad:
                    update_payload["status"] = "resolved"
                    if new_lat is not None and new_lon is not None:
                        update_payload["lat"] = float(new_lat)
                        update_payload["lon"] = float(new_lon)
                        update_payload["location"] = f"SRID=4326;POINT({new_lon} {new_lat})"
                    action = f"Marked resolved (historical summary) & repositioned to {matched_node}"
                elif new_lat is not None and new_lon is not None and not (-5.55 <= float(new_lat) <= -5.40 and 105.25 <= float(new_lon) <= 105.40):
                    update_payload["lat"] = float(new_lat)
                    update_payload["lon"] = float(new_lon)
                    update_payload["location"] = f"SRID=4326;POINT({new_lon} {new_lat})"

                    geo_box = compute_hazard_zone_geometry_and_radius(
                        incident_type=row.get("type", "road_closure"),
                        severity=row.get("severity", "medium"),
                        location_precision=loc_prec,
                        zone_tier="YELLOW_CLARIFY" if loc_prec == "kabupaten_kota" else "RED_CONFIRMED",
                        lat=float(new_lat),
                        lon=float(new_lon),
                        corridor_segment=corridor
                    )
                    poly_ewkt = to_ewkt_polygon(geo_box.get("geometry_polygon"))
                    if poly_ewkt:
                        update_payload["affected_area"] = poly_ewkt
                    action = f"Repositioned to {matched_node} ({new_lat}, {new_lon})"
                else:
                    update_payload["status"] = "resolved"
                    action = "Marked resolved (unresolvable false coordinate)"

                try:
                    sb.table("incidents").update(update_payload).eq("incident_id", i_id).execute()
                    remediated_count += 1
                    details.append({"incident_id": i_id, "action": action, "updates": update_payload})
                    logger.info(f"Remediated false panjang incident {i_id}: {action}")
                except Exception as ue:
                    logger.error(f"Failed to update incident {i_id}: {ue}")

            if r:
                try:
                    r.set(cache_key, "completed", ex=86400)
                except Exception:
                    pass

            return {"status": "success", "remediated_count": remediated_count, "details": details}
        except Exception as e:
            logger.error(f"Error during incident remediation: {e}")
            return {"status": "error", "error": str(e)}


# Global singleton instance
unified_news_ingestor = UnifiedNewsIngestor()
