"""
PreHub — Unified News & Early Warning Ingestion Orchestrator (Supabase + Swarm)
Periodically ingests Pan-Sumatra live feeds, geocodes physical coordinates,
persists to Supabase public.news_articles, and automatically synthesizes
physical incidents into public.incidents, public.incident_impact_assessments,
and public.route_approvals for Globot-style Human-In-The-Loop review.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

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

    def __init__(self):
        self.is_running = False
        self._processed_disruption_ids = set()

    async def run_ingestion_cycle(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Executes a complete ingestion run:
        1. Fetch dynamic RSS & search feeds from 10 Sumatra bureaus
        2. Extract structured NLP intelligence + PostGIS coordinates
        3. Upsert to Supabase public.news_articles
        4. Push to Redis stream lrip:stream:osint
        5. Synthesize high-severity events into public.incidents & public.route_approvals
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

        # 3. Upsert to Supabase
        upserted_count = await upsert_articles_to_supabase(structured_articles)

        # 4. Push to Redis Stream
        await self._publish_to_redis(structured_articles)

        # 5. Evaluate and trigger disruptions for road-blocking or critical events
        disruptions_triggered = await self._process_critical_disruptions(structured_articles)

        return {
            "status": "success",
            "total_fetched": len(raw_items),
            "structured_count": len(structured_articles),
            "upserted_supabase": upserted_count,
            "disruptions_triggered": disruptions_triggered,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

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
                    "confidence_score": str(art.get("confidence_score", 0.85)),
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                r.xadd("lrip:stream:osint", payload)
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
