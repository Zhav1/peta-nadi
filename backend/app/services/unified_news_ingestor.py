"""
PreHub — Unified News & Early Warning Ingestion Orchestrator (Supabase + Swarm)
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
    upsert_articles_to_supabase
)
from app.nlp.news_extractor import extract_structured_news
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

        # 2. Extract structured intelligence concurrently for top 30 items
        tasks = [extract_structured_news(a) for a in raw_items[:30]]
        structured_results = await asyncio.gather(*tasks, return_exceptions=True)
        structured_articles = [a for a in structured_results if isinstance(a, dict)]

        # 3. Verify original source links (dead / alive / unknown provenance)
        await self._attach_link_liveness(structured_articles)

        # 4. Upsert to Supabase
        upserted_count = await upsert_articles_to_supabase(structured_articles)

        # 5. Push to Redis Stream
        await self._publish_to_redis(structured_articles)

        # 6. Evaluate and trigger disruptions for road-blocking or critical events
        disruptions_triggered = await self._process_critical_disruptions(structured_articles)

        return {
            "status": "success",
            "total_fetched": len(raw_items),
            "structured_count": len(structured_articles),
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

        Dead means the server answered with status >= 400, redirected to the site root,
        or redirected to another host. Timeouts and transport errors stay `unknown`:
        the source is never declared expired without a response that proves it.
        """
        cached = self._link_liveness_cache.get(url)
        if cached and (time.monotonic() - cached[1]) < self.LINK_LIVENESS_TTL_SECONDS:
            return cached[0]

        verdict = self.LINK_UNKNOWN
        try:
            response = await client.get(url)
            final_url = str(response.url)
            if response.status_code >= 400:
                verdict = self.LINK_DEAD
            elif urlparse(final_url).path in ("", "/"):
                verdict = self.LINK_DEAD
            elif not self._same_host(url, final_url):
                verdict = self.LINK_DEAD
            else:
                verdict = self.LINK_ALIVE
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
                link = article.get("link")
                if not link:
                    article["link_alive"] = self.LINK_UNKNOWN
                    return
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
        """
        count = 0
        for art in articles:
            severity = str(art.get("severity", "")).lower()
            lane_status = str(art.get("ground_truth_metrics", {}).get("lane_status", "")).upper()
            art_id = str(art.get("id", ""))

            # Filter for consequential physical disruptions
            is_disruption = (
                severity in ["critical", "high"] or 
                lane_status in ["BLOCKED", "RESTRICTED"] or
                art.get("incident_type") in ["flood", "landslide", "marine_wave", "port_congestion"]
            )

            if is_disruption and art_id not in self._processed_disruption_ids:
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
                radius_km=25.0,
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
                    "radius_km": 25.0,
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
