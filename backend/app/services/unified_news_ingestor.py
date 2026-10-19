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
                    # Stale rows (schema_version != 3) must be re-extracted.
                    try:
                        _sv_hit = gtm.get("schema_version") if isinstance(gtm, dict) else None
                    except Exception:
                        _sv_hit = None
                    if _sv_hit != 3:
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

    async def _process_critical_disruptions(self, articles: List[Dict[str, Any]]) -> int:
        """
        Synthesizes physical disruption incidents in Supabase and triggers fleet impact evaluation.
        Only RED_CONFIRMED (and high-severity YELLOW is excluded) articles synthesize incidents.
        """
        count = 0
        for art in articles:
            severity = str(art.get("severity", "")).lower()
            lane_status = str(art.get("ground_truth_metrics", {}).get("lane_status", "")).upper()
            art_id = str(art.get("id", ""))
            zone_tier = str(art.get("zone_tier") or art.get("ground_truth_metrics", {}).get("zone_tier") or "")
            incident_type = str(art.get("incident_type", ""))

            if zone_tier == "DROPPED_IRRELEVANT":
                continue
            # Only RED_CONFIRMED synthesizes physical incidents; YELLOW stays map-only.
            is_disruption = (
                zone_tier == "RED_CONFIRMED"
                or (severity in ["critical", "high"]
                    or lane_status in ["BLOCKED", "RESTRICTED"]
                    or incident_type in ["flood", "landslide", "earthquake", "wildfire",
                                         "port_closure", "marine_wave", "road_closure",
                                         "volcanic_eruption", "congestion", "other_disruption"])
            )
            # Guard: never synthesize from un-geocoded rows.
            if art.get("latitude") is None or art.get("longitude") is None:
                continue

            if is_disruption and zone_tier != "DROPPED_IRRELEVANT" and art_id not in self._processed_disruption_ids:
                # Require RED for auto-incident; YELLOW only if explicitly high severity.
                if zone_tier == "YELLOW_CLARIFY" and severity not in ("high", "critical"):
                    continue
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
            "evidence": {
                "source": art.get("source"),
                "source_tier": art.get("source_tier"),
                "link": art.get("link"),
                "commodities": art.get("commodities_affected"),
                "lead_time_hours": art.get("lead_time_hours"),
                "ground_truth_metrics": art.get("ground_truth_metrics")
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
                radius_km=float(art.get("radius_km") or 6.0),
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
                    "radius_km": float(art.get("radius_km") or 6.0),
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


# Global singleton instance
unified_news_ingestor = UnifiedNewsIngestor()
