"""
PreHub — Structured News & Early Warning Information Extractor
Uses Gemini 1.5 Flash via LLMGateway to extract structured crisis intelligence:
- Incident type, severity, temporal phase (forecast_early_warning, active_disruption, clearing_recovery)
- Estimated lead-time in hours
- Corridor nodes and specific arterial road segments (e.g. Jalinsum KM 78)
- Affected food commodities (Beras, Cabai, Minyak Goreng, Bawang)
- Physical ground-truth metrics (water_level_cm, lane_status)
"""
import json
import hashlib
import logging
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from app.config import get_settings
from app.nlp.ner_pipeline import extract_locations_gazetteer
from app.nlp.geocoding_service import resolve_sumatra_location_and_corridor

logger = logging.getLogger(__name__)

# In-memory LRU-style cache to prevent repeated LLM calls on identical news headlines
_EXTRACTION_CACHE: Dict[str, Dict[str, Any]] = {}
MAX_CACHE_ENTRIES = 500


def _hash_article(title: str, source: str) -> str:
    return hashlib.md5(f"{title}:{source}".encode("utf-8")).hexdigest()


def _fast_heuristic_extraction(art: Dict[str, Any]) -> Dict[str, Any]:
    """Fast deterministic rule-based extractor for zero-latency / offline execution."""
    title = art.get("title", "")
    desc = art.get("raw_description", "")
    full_text = f"{title} {desc}".lower()
    source = art.get("source", "Media Terverifikasi")
    source_tier = art.get("source_tier", "TIER_2_AUTHORITATIVE_PRESS")
    
    # 1. Detect Incident Type
    incident_type = "logistics_news"
    if any(w in full_text for w in ["banjir", "genangan", "tenggelam", "debit air"]):
        incident_type = "flood"
    elif any(w in full_text for w in ["longsor", "tebing", "ambles", "amblas"]):
        incident_type = "landslide"
    elif any(w in full_text for w in ["gelombang", "ombak", "badai", "siklon", "cuaca ekstrem"]):
        incident_type = "marine_wave"
    elif any(w in full_text for w in ["pelabuhan", "antrean", "antri", "macet", "lumpuh", "truk cpo"]):
        incident_type = "port_congestion"
    elif any(w in full_text for w in ["cadangan pangan", "bulog", "stok beras", "operasi pasar"]):
        incident_type = "supply_buffer"

    # 2. Temporal Phase & Lead Time
    temporal_phase = "active_disruption"
    lead_time_hours = 0.0
    if any(w in full_text for w in ["peringatan dini", "waspada", "siaga", "potensi", "diprediksi", "prakiraan", "imbauan"]):
        temporal_phase = "forecast_early_warning"
        lead_time_hours = 4.0
    elif any(w in full_text for w in ["surut", "dibuka kembali", "berangsur normal", "dibersihkan"]):
        temporal_phase = "clearing_recovery"
        lead_time_hours = 0.0

    # 3. Severity
    severity = "medium"
    if any(w in full_text for w in ["putus", "lumpuh total", "tenggelam", "siaga 1", "darurat", "terisolir", "120cm", "100cm"]):
        severity = "critical"
    elif any(w in full_text for w in ["siaga 2", "tersendat", "antrean panjang", "longsor", "gelombang tinggi"]):
        severity = "high"
    elif any(w in full_text for w in ["stok aman", "normal", "terkendali", "bantuan", "surut"]):
        severity = "low"

    # 4. Pan-Sumatra Location, Corridor & Coordinate Resolution
    loc_info = resolve_sumatra_location_and_corridor(full_text, fallback_province=art.get("province", "Sumatera"))
    nodes = extract_locations_gazetteer(full_text)
    if not nodes:
        nodes = [loc_info["matched_node"]]
    
    corridor_segment = loc_info["corridor_segment"]
    latitude = loc_info["latitude"]
    longitude = loc_info["longitude"]
    region = loc_info["province"]

    # 5. Commodities Affected
    commodities = []
    if any(w in full_text for w in ["beras", "gabah"]):
        commodities.append("Beras BULOG")
    if any(w in full_text for w in ["cabai", "cabe"]):
        commodities.append("Cabai Merah")
    if any(w in full_text for w in ["minyak", "cpo", "sawit"]):
        commodities.append("Minyak Goreng")
    if any(w in full_text for w in ["bawang"]):
        commodities.append("Bawang Merah")
    if any(w in full_text for w in ["telur"]):
        commodities.append("Telur Ayam")
    if any(w in full_text for w in ["gula"]):
        commodities.append("Gula Pasir")
    if not commodities:
        commodities = ["Komoditas Pangan Pokok"]

    # 6. Confidence Score
    base_conf = 0.94 if source_tier == "TIER_1_OFFICIAL" else 0.86

    # 7. PostGIS WKT Point representation
    postgis_wkt = f"POINT({longitude} {latitude})" if (latitude and longitude) else None

    art_link = art.get("link", "")
    art_id = f"NEWS-{hashlib.md5(f'{title}:{art_link}'.encode()).hexdigest()[:8]}"

    return {
        "id": art_id,
        "title": title,
        "link": art_link,
        "source": source,
        "source_tier": source_tier,
        "pubDate": art.get("pubDate", "Terkini"),
        "summary": title,
        "region": region,
        "province": region,
        "latitude": latitude,
        "longitude": longitude,
        "postgis_location": postgis_wkt,
        "category": "DISASTER_LOGISTICS" if incident_type in ["flood", "landslide", "marine_wave"] else "TRAFFIC_BOTTLENECK",
        "corridor_nodes": nodes,
        "corridor_segment": corridor_segment,
        "incident_type": incident_type,
        "severity": severity,
        "temporal_phase": temporal_phase,
        "lead_time_hours": lead_time_hours,
        "commodities_affected": commodities,
        "ground_truth_metrics": {
            "lane_status": "BLOCKED" if severity == "critical" else "RESTRICTED" if severity == "high" else "CLEAR",
            "water_level_cm": 120 if "120cm" in full_text else 50 if severity == "critical" else 0
        },
        "confidence_score": base_conf
    }


async def extract_structured_news(art: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extracts structured crisis intelligence from raw news item.
    Uses cached result if present, otherwise attempts Gemini Flash with heuristic fallback.
    """
    title = art.get("title", "")
    source = art.get("source", "Media")
    cache_key = _hash_article(title, source)
    
    if cache_key in _EXTRACTION_CACHE:
        return _EXTRACTION_CACHE[cache_key]

    # Baseline heuristic
    structured = _fast_heuristic_extraction(art)
    
    settings = get_settings()
    if settings.gemini_api_key:
        try:
            from agents.llm_gateway import LLMGateway
            prompt = (
                "Extract structured disaster & food supply chain intelligence from this Indonesian news report. "
                "Return ONLY a clean JSON object (no markdown, no backticks, no commentary) with this exact schema:\n"
                "{\n"
                '  "incident_type": "flood | landslide | marine_wave | port_congestion | supply_buffer | road_closure",\n'
                '  "severity": "low | medium | high | critical",\n'
                '  "temporal_phase": "forecast_early_warning | active_disruption | clearing_recovery",\n'
                '  "lead_time_hours": 0.0,\n'
                '  "corridor_nodes": ["City/Port names"],\n'
                '  "corridor_segment": "Road name or KM marker",\n'
                '  "commodities_affected": ["Beras BULOG", "Cabai Merah", "Minyak Goreng", etc],\n'
                '  "concise_summary": "1 sentence operational factual summary in Indonesian",\n'
                '  "ground_truth_metrics": {"lane_status": "BLOCKED | RESTRICTED | CLEAR", "water_level_cm": 0}\n'
                "}\n\n"
                f"Title: {title}\n"
                f"Source: {source} ({art.get('source_tier', 'TIER_2')})\n"
                f"Content: {art.get('raw_description', '')}"
            )
            
            # Execute with short timeout to protect latency
            gen_text = await asyncio.wait_for(
                LLMGateway.generate_content(prompt=prompt, model_name="gemini-3.5-flash-lite"),
                timeout=4.0
            )
            if gen_text:
                clean_text = gen_text.strip()
                if clean_text.startswith("```"):
                    lines = clean_text.split("\n")
                    clean_text = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
                if clean_text.lower().startswith("json"):
                    clean_text = clean_text[4:].strip()
                
                parsed = json.loads(clean_text)
                if isinstance(parsed, dict):
                    structured["incident_type"] = parsed.get("incident_type", structured["incident_type"])
                    structured["severity"] = parsed.get("severity", structured["severity"])
                    structured["temporal_phase"] = parsed.get("temporal_phase", structured["temporal_phase"])
                    structured["lead_time_hours"] = float(parsed.get("lead_time_hours", structured["lead_time_hours"]))
                    if parsed.get("corridor_nodes"):
                        structured["corridor_nodes"] = parsed["corridor_nodes"]
                    if parsed.get("corridor_segment"):
                        structured["corridor_segment"] = parsed["corridor_segment"]
                    if parsed.get("commodities_affected"):
                        structured["commodities_affected"] = parsed["commodities_affected"]
                    if parsed.get("concise_summary"):
                        structured["summary"] = parsed["concise_summary"]
                    if parsed.get("ground_truth_metrics"):
                        structured["ground_truth_metrics"].update(parsed["ground_truth_metrics"])
        except Exception as e:
            logger.debug(f"LLM extraction skipped for '{title[:30]}': {e}")

    # Store in memory cache
    if len(_EXTRACTION_CACHE) > MAX_CACHE_ENTRIES:
        _EXTRACTION_CACHE.clear()
    _EXTRACTION_CACHE[cache_key] = structured
    
    return structured
