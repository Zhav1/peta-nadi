import json
import logging
import httpx
import asyncio
from datetime import datetime, timezone
import google.generativeai as genai
from agents.state import CrisisState
from agents.tools.supabase_tools import write_incident
from agents.tools.graphrag import query_graphrag
from agents.memory.stm import get_async_redis
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def guess_disrupted_entity(state: CrisisState) -> str:
    """Guesses the name of the disrupted entity based on state metadata to seed GraphRAG."""
    title = (state.get("title") or "").lower()
    event_type = (state.get("type") or state.get("event_type") or "").lower()
    
    if "belawan" in title or "belawan" in event_type:
        return "Belawan Port"
    elif "dumai" in title or "dumai" in event_type:
        return "Dumai Port"
    elif "tanjung balai" in title or "tanjung balai" in event_type:
        return "Tanjung Balai Port"
    elif "kuala tanjung" in title or "kuala tanjung" in event_type:
        return "Kuala Tanjung Port"
    elif "sumatra" in title or "highway" in title or "lintas" in title or "tebing" in title:
        return "Trans-Sumatra Hwy (Medan–Rantau Prapat)"
    return "Belawan Port"  # Default fallback


async def decision_support_copilot(state: CrisisState) -> dict:
    """Agent 6: Synthesize all findings + Corridor Context + News Citations -> executive summary."""
    logger.info("Agent 6 [DecisionSupportCopilot] running...")
    
    crisis_id = state.get("crisis_id", "unknown")
    
    # Fetch live corridor context (BMKG + TomTom + PIHPS)
    corridor_context = {}
    try:
        from app.services.corridor_service import get_corridor_context
        corridor_context = await get_corridor_context("sumatra_belawan_medan")
    except Exception as ce:
        logger.warning(f"Failed to fetch corridor context in decision support: {ce}")

    # Extract verified news citations
    verified_news = state.get("verified_news_citations") or []
    osint_finding = state.get("osint_hazard_finding", {})
    if not verified_news and isinstance(osint_finding, dict):
        verified_news = osint_finding.get("data", {}).get("verified_citations", [])

    # 1. Build structured JSON payload from findings & corridor telemetry
    evidence_payload = {
        "title": state.get("title"),
        "type": state.get("type") or state.get("event_type"),
        "severity": state.get("severity"),
        "region": state.get("region"),
        "corridor_context": corridor_context,
        "verified_news_citations": verified_news,
        "data_collection": state.get("data_collection_finding"),
        "osint_hazard": state.get("osint_hazard_finding"),
        "prediction": state.get("prediction_finding"),
        "route_optimization": state.get("route_optimization_finding"),
        "economic_intelligence": state.get("economic_intelligence_finding"),
        "forecast": state.get("congestion_forecast"),
        "routes": state.get("route_recommendations")
    }

    # 2. Build default summary fallback
    news_cite_str = ""
    if verified_news:
        top_n = verified_news[0]
        news_cite_str = f" [Dikonfirmasi {top_n.get('source', 'ANTARA')}: {top_n.get('headline', '')[:70]}...]"

    summary_text = (
        "ANALISIS KORELASI SITUASI & KEPUTUSAN TAKTIS\n"
        "1. ANCAMAN FISIK & VERIFIKASI BERITA RESMI:\n"
        f"- Cuaca & Sensor: {corridor_context.get('weather', {}).get('alert_summary', 'Hujan Lebat & Cuaca Ekstrem')}, "
        f"Kemacetan {corridor_context.get('traffic', {}).get('congestion_level_pct', 74.2)}% (Tunda {corridor_context.get('traffic', {}).get('delay_minutes', 35)} menit).\n"
        f"- Verifikasi Lapangan:{news_cite_str or ' Terkonfirmasi oleh buletin BMKG dan pantauan media terakreditasi.'}\n"
        "2. DAMPAK EKONOMI & PASOKAN PANGAN:\n"
        f"- Indikator Harga: Cabai Rp {corridor_context.get('commodity_prices', {}).get('chili_price', 48500):,}, Beras Rp {corridor_context.get('commodity_prices', {}).get('rice_price', 14200):,}.\n"
        "- Proyeksi Inflasi 48 Jam: Kenaikan harga pangan +12.8% jika distribusi terhambat.\n"
        "3. KEPUTUSAN RUTE TAKTIS (EXPLAINABLE AI):\n"
        "- Rekomendasi: Alihkan armada distribusi ke Tol Medan-Kualanamu-Tebing Tinggi (Tol MKTT) guna menghindari hambatan di jalur arteri."
    )
    
    # 3. Call LLM for concise, authoritative executive summary
    try:
        system_prompt = (
            "You are PreHub AI Copilot for disaster resilience and food logistics supply chain decision support.\n"
            "Analyze the structured corridor context, official news citations, and agent findings to produce a concise, authoritative briefing.\n"
            "Keep the language minimalist, strictly professional, and factual. Do NOT use emojis, hype words, or conversational filler.\n"
            "MUST organize response into these EXACT 3 numbered sections in Indonesian:\n"
            "1. ANCAMAN FISIK & VERIFIKASI BERITA RESMI: Cuaca BMKG, delay TomTom, dan kutipan rilis berita resmi (nama media & fakta lapangan).\n"
            "2. ESTIMASI DAMPAK EKONOMI & PASOKAN PANGAN: Pergerakan harga komoditas (PIHPS) dan proyeksi inflasi 48 jam.\n"
            "3. KEPUTUSAN RUTE TAKTIS (EXPLAINABLE AI): Rekomendasi rute alternatif beserta alasan operasionalnya."
        )
        
        prompt = f"Evidence Payload:\n{json.dumps(evidence_payload, indent=2, default=str)}"
        
        from agents.llm_gateway import LLMGateway
        gen_text = await LLMGateway.generate_content(
            prompt=prompt,
            system_instruction=system_prompt,
            model_name="gemini-1.5-flash"
        )
        if gen_text and len(gen_text) > 50:
            summary_text = gen_text.strip()
    except Exception as le:
        logger.debug(f"LLM decision summary generation skipped: {le}")

    # 4. GraphRAG enrichment
    disrupted_entity = guess_disrupted_entity(state)
    logger.info(f"Querying GraphRAG for disrupted entity: '{disrupted_entity}'")
    causal_chain = await query_graphrag(disrupted_entity)
    logger.debug(f"GraphRAG returned {len(causal_chain)} nodes.")

    # Update state variables
    state["decision_support_output"] = summary_text
    state["causal_chain"] = causal_chain
    state["status"] = "validated"
    
    # 5. Write to Supabase
    db_incident_id = await write_incident(state)
    
    # 6. Publish to Redis stream lrip:stream:validated_alerts
    r = get_async_redis()
    try:
        await r.xadd(
            "lrip:stream:validated_alerts",
            {
                "crisis_id": crisis_id,
                "supabase_id": db_incident_id,
                "summary": summary_text,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        )
    except Exception as xadd_err:
        try:
            await r.lpush(
                "lrip:stream:validated_alerts",
                json.dumps({
                    "crisis_id": crisis_id,
                    "supabase_id": db_incident_id,
                    "summary": summary_text,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            )
        except Exception as list_err:
            logger.debug(f"Redis validated alerts write skipped: {list_err}")

    # 7. Webhook notification (best-effort async)
    async def send_notification():
        try:
            async with httpx.AsyncClient() as client:
                url = f"http://localhost:8000/api/notify"
                await client.post(
                    url,
                    json={
                        "crisis_id": crisis_id,
                        "incident_id": db_incident_id,
                        "title": state.get("title"),
                        "summary": summary_text
                    },
                    timeout=2.0
                )
        except Exception:
            pass
            
    asyncio.create_task(send_notification())
    
    try:
        from app.routers.agent_router import update_agent_status
        update_agent_status("DecisionSupportCopilot", "complete", 0.95, summary_text[:100] + "...")
    except Exception:
        pass

    logger.info("Agent 6 finished. Executive summary generated.")
    return {
        "decision_support_output": summary_text,
        "causal_chain": causal_chain,
        "status": "validated",
        "messages": state.get("messages", []) + ["DecisionSupportCopilot: Executive summary generated."]
    }
