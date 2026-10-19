"""
PreHub: Structured News & Early Warning Information Extractor
Uses the opencode driver model via LLMGateway to extract structured crisis intelligence:
- Incident type (expanded taxonomy), severity, temporal phase
- Economical 3-tier gatekeeper: RED_CONFIRMED | YELLOW_CLARIFY | DROPPED_IRRELEVANT
- Dynamic ImpactProfile (custom_hazard_label, affected_modalities, passability, estimated_delay_hours)
- Pan-Sumatra geocoding with bureau/dateline stripping (no blind fallback centroids)
"""
import json
import hashlib
import logging
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from app.config import get_settings
from app.nlp.ner_pipeline import extract_locations_gazetteer
from app.nlp.geocoding_service import (
    resolve_sumatra_location_and_corridor,
    strip_bureau_and_dateline_noise,
)

logger = logging.getLogger(__name__)

# In-memory LRU-style cache to prevent repeated LLM calls on identical news headlines
_EXTRACTION_CACHE: Dict[str, Dict[str, Any]] = {}
MAX_CACHE_ENTRIES = 500


def _hash_article(title: str, source: str) -> str:
    return hashlib.md5(f"{title}:{source}".encode("utf-8")).hexdigest()


# Ad / noise / irrelevant keyword gate (mirrors news_aggregator.EXCLUDED_NOISE_KEYWORDS
# so heuristic tiering works even when called standalone).
_AD_NOISE_KEYWORDS = (
    "iklan", "promo", "diskon", "voucher", "advertorial", "sponsored", "lowongan",
    "beasiswa", "pilkada", "pemilu", "kampanye", "partai", "selebriti", "wisata",
    "kuliner", "resep", "hotel", "konser", "turnamen", "liga", "korupsi", "sidang",
    "narkoba", "pencurian", "varises", "osteoporosis", "kanker", "klinik",
    "rumah sakit", "artis", "hiburan", "film", "fashion", "kecantikan", "kosmetik",
    "olahraga", "sepak bola",
)

_DEFAULT_HAZARD_LABELS = {
    "flood": "Banjir",
    "landslide": "Tanah Longsor",
    "earthquake": "Gempa Bumi",
    "wildfire": "Kebakaran Hutan / Karhutla",
    "port_closure": "Penutupan Pelabuhan",
    "marine_wave": "Gelombang Tinggi Laut",
    "road_closure": "Penutupan / Putus Jalan",
    "congestion": "Kemacetan Lalu Lintas",
    "volcanic_eruption": "Erupsi Gunung Api",
    "other_disruption": "Disrupsi Koridor Logistik",
}


def _detect_incident_type(full_text: str) -> tuple[str, str | None, str | None]:
    """Returns (incident_type, custom_hazard_label_override, passability_hint)."""
    t = full_text
    # Port closure (specific first — must precede generic 'pelabuhan' checks)
    if any(w in t for w in ["penutupan pelabuhan", "pelabuhan ditutup", "dermaga ditutup",
                            "operasional pelabuhan dihentikan", "pelabuhan tutup"]):
        return "port_closure", "Penutupan Pelabuhan", None
    if any(w in t for w in ["antrean pelabuhan", "bongkar muat padat", "antre di pelabuhan",
                            "kepadatan pelabuhan", "kongesti pelabuhan"]):
        return "port_closure", "Antrean / Kongesti Pelabuhan", "RESTRICTED"
    if any(w in t for w in ["erupsi", "abu vulkanik", "gunung marapi", "sinabung",
                            "kerinci meletus", "gunung kerinci", "semeru", "letusan"]):
        return "volcanic_eruption", None, None
    if any(w in t for w in ["jembatan putus", "jembatan ambruk", "jalan putus",
                            "jalan amblas", "penutupan jalan", "blokade jalan",
                            "jalan terputus", "akses jalan tertutup"]):
        return "road_closure", None, None
    if any(w in t for w in ["kebakaran hutan", "karhutla", "kabut asap", "titik api hutan"]):
        return "wildfire", None, None
    if any(w in t for w in ["gempa", "tektonik", "guncangan gempa"]):
        return "earthquake", None, None
    if any(w in t for w in ["gelombang tinggi", "ombak besar", "cuaca buruk laut",
                            "angin kencang laut", "gelombang setinggi", "laut bergelora"]):
        return "marine_wave", None, None
    if any(w in t for w in ["banjir", "genangan", "luapan", "debit air", "tenggelam"]):
        return "flood", None, None
    if any(w in t for w in ["longsor", "tebing runtuh", "tanah longsor", "ambles", "amblas"]):
        return "landslide", None, None
    if any(w in t for w in ["macet", "kemacetan", "lumpuh total arus", "antrean panjang kendaraan"]):
        return "congestion", None, None
    # Logistics disruption catch-all → other_disruption with descriptive label
    disruption_hints = [
        ("bbm", "Gangguan Pasokan BBM"),
        ("solar langka", "Gangguan Pasokan BBM"),
        ("pupuk", "Gangguan Distribusi Pupuk"),
        ("logistik terganggu", "Disrupsi Koridor Logistik"),
        ("distribusi terganggu", "Disrupsi Koridor Logistik"),
        ("rantai pasok", "Disrupsi Koridor Logistik"),
        ("disrupsi", "Disrupsi Koridor Logistik"),
        ("pelabuhan", "Gangguan Operasional Pelabuhan"),
        ("truk", "Gangguan Angkutan Logistik"),
        ("tol", "Gangguan Koridor Tol"),
    ]
    for hint, label in disruption_hints:
        if hint in t:
            return "other_disruption", label, None
    if any(w in t for w in ["cadangan pangan", "bulog", "stok beras", "operasi pasar"]):
        return "other_disruption", "Disrupsi Koridor Logistik", None
    return "other_disruption", None, None


def _build_impact_profile(incident_type: str, severity: str,
                          passability_hint: str | None = None) -> Dict[str, Any]:
    sev = (severity or "medium").lower()
    if incident_type in ("port_closure", "marine_wave"):
        modalities = ["sea", "land"] if incident_type == "port_closure" else ["sea"]
        if passability_hint:
            pas = passability_hint
        else:
            pas = "BLOCKED" if sev in ("high", "critical") else "RESTRICTED"
        return {"affected_modalities": modalities, "passability": pas,
                "estimated_delay_hours": 18}
    if incident_type == "volcanic_eruption":
        return {"affected_modalities": ["air", "land"], "passability": "BLOCKED",
                "estimated_delay_hours": 24}
    if incident_type == "wildfire":
        return {"affected_modalities": ["land", "air"], "passability": "RESTRICTED",
                "estimated_delay_hours": 10}
    if incident_type == "earthquake":
        return {"affected_modalities": ["land"], "passability": "BLOCKED",
                "estimated_delay_hours": 18 if sev in ("high", "critical") else 8}
    if incident_type == "flood":
        return {"affected_modalities": ["land"], "passability": "BLOCKED",
                "estimated_delay_hours": 14 if sev in ("high", "critical") else 6}
    if incident_type == "landslide":
        return {"affected_modalities": ["land"], "passability": "BLOCKED",
                "estimated_delay_hours": 10 if sev in ("high", "critical") else 5}
    if incident_type == "road_closure":
        return {"affected_modalities": ["land"], "passability": "BLOCKED",
                "estimated_delay_hours": 12 if sev in ("high", "critical") else 5}
    if incident_type == "congestion":
        return {"affected_modalities": ["land"], "passability": "RESTRICTED",
                "estimated_delay_hours": 3}
    return {"affected_modalities": ["land"], "passability": "CAUTION",
            "estimated_delay_hours": 4}


def _fast_heuristic_extraction(art: Dict[str, Any]) -> Dict[str, Any]:
    """Fast deterministic rule-based extractor for zero-latency / offline execution."""
    title = art.get("title", "") or ""
    desc = art.get("raw_description", "") or art.get("summary", "") or ""
    raw_full = f"{title} {desc}"
    full_text = raw_full.lower()
    clean_for_geo = strip_bureau_and_dateline_noise(raw_full)
    clean_lower = clean_for_geo.lower()
    source = art.get("source", "Media Terverifikasi")
    source_tier = art.get("source_tier", "TIER_2_AUTHORITATIVE_PRESS")

    # 1. Detect Incident Type (expanded taxonomy)
    incident_type, label_override, passability_hint = _detect_incident_type(full_text)
    # Only treat as logistics-relevant if a hazard keyword fired; _detect always
    # returns other_disruption as catch-all, so verify real signal below.
    _hazard_signal = any(w in full_text for w in [
        "banjir", "genangan", "luapan", "longsor", "tebing", "ambles", "amblas",
        "gempa", "tektonik", "kebakaran hutan", "karhutla", "kabut asap",
        "penutupan pelabuhan", "pelabuhan ditutup", "dermaga ditutup",
        "operasional pelabuhan dihentikan", "antrean pelabuhan", "bongkar muat padat",
        "gelombang tinggi", "ombak besar", "cuaca buruk laut", "angin kencang laut",
        "jembatan putus", "jembatan ambruk", "jalan putus", "jalan amblas",
        "penutupan jalan", "blokade jalan", "erupsi", "abu vulkanik", "marapi",
        "sinabung", "kerinci", "semeru", "macet", "kemacetan", "pelabuhan",
        "bbm", "logistik", "distribusi", "truk", "tol ", "disrupsi",
    ])
    custom_hazard_label = label_override or _DEFAULT_HAZARD_LABELS.get(incident_type, "Disrupsi Logistik")

    # 2. Temporal Phase & Lead Time
    temporal_phase = "active_disruption"
    lead_time_hours = 0.0
    if any(w in full_text for w in ["peringatan dini", "waspada", "siaga", "potensi",
                                    "diprediksi", "prakiraan", "imbauan", "early warning",
                                    "monitoring", "peringatan cuaca"]):
        temporal_phase = "forecast_early_warning"
        lead_time_hours = 4.0
    elif any(w in full_text for w in ["surut", "dibuka kembali", "berangsur normal", "dibersihkan"]):
        temporal_phase = "clearing_recovery"
        lead_time_hours = 0.0

    # 3. Severity
    severity = "medium"
    if any(w in full_text for w in ["putus", "lumpuh total", "tenggelam", "siaga 1",
                                    "darurat", "terisolir", "120cm", "100cm", "ditutup",
                                    "ambruk", "erupsi"]):
        severity = "critical"
    elif any(w in full_text for w in ["siaga 2", "tersendat", "antrean panjang",
                                      "longsor", "gelombang tinggi", "parah", "berat"]):
        severity = "high"
    elif any(w in full_text for w in ["stok aman", "normal", "terkendali", "bantuan", "surut"]):
        severity = "low"

    # 4. Pan-Sumatra Location, Corridor & Coordinate Resolution (bureau-stripped, no blind centroid)
    loc_info = resolve_sumatra_location_and_corridor(
        raw_full, fallback_province=art.get("province", "Sumatera Utara"))
    nodes = extract_locations_gazetteer(raw_full)
    if not nodes and loc_info.get("matched_node"):
        nodes = [loc_info["matched_node"]]

    corridor_segment = loc_info.get("corridor_segment") or "unknown"
    latitude = loc_info.get("latitude")
    longitude = loc_info.get("longitude")
    region = loc_info.get("province") or art.get("province") or "Sumatera"
    is_geocoded = bool(loc_info.get("is_geocoded")) and latitude is not None and longitude is not None
    location_precision = loc_info.get("location_precision", "none")

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

    # 6. Impact profile
    impact_profile = _build_impact_profile(incident_type, severity, passability_hint)

    # 7. Zone tier & reason (economical 3-tier gatekeeper)
    is_ad_noise = any(w in full_text for w in _AD_NOISE_KEYWORDS)
    if (not is_geocoded) or (latitude is None) or is_ad_noise or (not _hazard_signal):
        zone_tier = "DROPPED_IRRELEVANT"
        tier_reason = ("Artikel tidak memiliki lokasi insiden spesifik di koridor "
                       "Sumatera atau bukan disrupsi logistik.")
    elif (location_precision == "province_only"
          or temporal_phase in ("forecast_early_warning", "early_warning", "monitoring")
          or (incident_type == "other_disruption" and severity in ("low", "medium"))):
        zone_tier = "YELLOW_CLARIFY"
        tier_reason = ("Peringatan dini / indikasi awal di wilayah provinsi; titik "
                       "koordinat spesifik atau tingkat penutupan jalur masih "
                       "memerlukan klarifikasi lapangan.")
    elif (is_geocoded and location_precision == "exact_node"
          and (incident_type in ("flood", "landslide", "earthquake", "port_closure",
                                 "marine_wave", "road_closure", "volcanic_eruption",
                                 "wildfire")
               or (incident_type == "congestion" and severity in ("high", "critical"))
               or impact_profile.get("passability") in ("BLOCKED", "RESTRICTED"))):
        zone_tier = "RED_CONFIRMED"
        tier_reason = (f"Dampak {custom_hazard_label} terkonfirmasi di "
                       f"{loc_info.get('matched_node')} ({region}) dengan status "
                       f"{impact_profile.get('passability')}; koridor logistik terdampak langsung.")
    else:
        # Default: geocoded but ambiguous → Yellow for human clarification.
        zone_tier = "YELLOW_CLARIFY"
        tier_reason = ("Lokasi terdeteksi namun tingkat keparahan atau status jalur "
                       "belum terkonfirmasi; memerlukan klarifikasi lapangan.")

    # 8. Confidence Score
    base_conf = 0.94 if source_tier == "TIER_1_OFFICIAL" else 0.86

    # 9. PostGIS WKT Point representation
    postgis_wkt = f"POINT({longitude} {latitude})" if (latitude is not None and longitude is not None) else None

    art_link = art.get("link", "") or ""
    art_id = art.get("id") or f"NEWS-{hashlib.md5(f'{title}:{art_link}'.encode()).hexdigest()[:8]}"

    return {
        "id": art_id,
        "title": title,
        "link": art_link,
        "source": source,
        "source_tier": source_tier,
        "pubDate": art.get("pubDate", "Terkini"),
        "summary": title,
        "concise_summary": title,
        "region": region,
        "province": region,
        "latitude": latitude,
        "longitude": longitude,
        "postgis_location": postgis_wkt,
        "category": ("DISASTER_LOGISTICS" if incident_type in
                     ["flood", "landslide", "earthquake", "wildfire", "port_closure",
                      "marine_wave", "road_closure", "volcanic_eruption"]
                     else "TRAFFIC_BOTTLENECK"),
        "corridor_nodes": nodes,
        "corridor_segment": corridor_segment,
        "incident_type": incident_type,
        "custom_hazard_label": custom_hazard_label,
        "impact_profile": impact_profile,
        "severity": severity,
        "temporal_phase": temporal_phase,
        "lead_time_hours": lead_time_hours,
        "commodities_affected": commodities,
        "ground_truth_metrics": {
            "lane_status": ("BLOCKED" if impact_profile.get("passability") == "BLOCKED"
                            else "RESTRICTED" if impact_profile.get("passability") == "RESTRICTED"
                            else "CLEAR"),
            "water_level_cm": 120 if "120cm" in full_text else 50 if severity == "critical" else 0,
            "zone_tier": zone_tier,
            "tier_reason": tier_reason,
            "custom_hazard_label": custom_hazard_label,
            "impact_profile": impact_profile,
            "is_geocoded": is_geocoded,
            "location_precision": location_precision,
        },
        "zone_tier": zone_tier,
        "tier_reason": tier_reason,
        "is_geocoded": is_geocoded,
        "location_precision": location_precision,
        "confidence_score": base_conf,
    }


def _clean_llm_json(text: str) -> str:
    t = (text or "").strip()
    if t.startswith("```"):
        lines = t.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    if t.lower().startswith("json"):
        t = t[4:].strip()
    return t


def _apply_batch_llm_item(structured: Dict[str, Any], item: Dict[str, Any]) -> Dict[str, Any]:
    """Merges one batched-LLM result item into the heuristic baseline."""
    try:
        if item.get("incident_type"):
            structured["incident_type"] = item["incident_type"]
        if item.get("severity"):
            structured["severity"] = item["severity"]
        if item.get("custom_hazard_label"):
            structured["custom_hazard_label"] = item["custom_hazard_label"]
        if item.get("concise_summary"):
            structured["summary"] = item["concise_summary"]
            structured["concise_summary"] = item["concise_summary"]
        # Impact profile merge
        ip = dict(structured.get("impact_profile") or {})
        if item.get("affected_modalities"):
            ip["affected_modalities"] = item["affected_modalities"]
        if item.get("passability"):
            ip["passability"] = item["passability"]
        if item.get("estimated_delay_hours") is not None:
            try:
                ip["estimated_delay_hours"] = float(item["estimated_delay_hours"])
            except Exception:
                pass
        structured["impact_profile"] = ip
        # Tiering — LLM is authoritative unless it contradicts geocoding reality.
        llm_tier = (item.get("zone_tier") or "").upper()
        llm_loc = item.get("verified_sumatra_location")
        if llm_loc is None or llm_tier == "DROPPED_IRRELEVANT":
            structured["zone_tier"] = "DROPPED_IRRELEVANT"
            structured["tier_reason"] = (item.get("tier_reason")
                                         or "LLM tidak menemukan lokasi Sumatera terverifikasi.")
        else:
            if llm_tier in ("RED_CONFIRMED", "YELLOW_CLARIFY", "DROPPED_IRRELEVANT"):
                # Never upgrade an un-geocoded heuristic to RED.
                if llm_tier == "RED_CONFIRMED" and not structured.get("is_geocoded"):
                    structured["zone_tier"] = "DROPPED_IRRELEVANT"
                    structured["tier_reason"] = ("Artikel tidak memiliki lokasi insiden "
                                                 "spesifik di koridor Sumatera atau bukan "
                                                 "disrupsi logistik.")
                else:
                    structured["zone_tier"] = llm_tier
                    if item.get("tier_reason"):
                        structured["tier_reason"] = item["tier_reason"]
        # Sync ground_truth_metrics mirror
        gtm = dict(structured.get("ground_truth_metrics") or {})
        gtm.update({
            "zone_tier": structured.get("zone_tier"),
            "tier_reason": structured.get("tier_reason"),
            "custom_hazard_label": structured.get("custom_hazard_label"),
            "impact_profile": structured.get("impact_profile"),
            "is_geocoded": structured.get("is_geocoded"),
            "location_precision": structured.get("location_precision"),
        })
        structured["ground_truth_metrics"] = gtm
    except Exception as e:
        logger.debug(f"Batch LLM merge skipped: {e}")
    return structured


async def extract_structured_news_batch(articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Economical batched LLM gatekeeper: heuristic baselines for all articles, then
    ONE compact LLM call per ~10 unseen candidates via LLMGateway.generate_content
    returning a JSON array with per-article tiering. Falls back to heuristics when
    the LLM is unavailable. Never raises.
    """
    if not articles:
        return []
    baselines: List[Dict[str, Any]] = []
    for a in articles:
        try:
            b = _fast_heuristic_extraction(a)
        except Exception as e:
            logger.debug(f"Heuristic extraction failed: {e}")
            continue
        baselines.append(b)
        # Warm the single-item cache too
        try:
            ck = _hash_article(b.get("title", ""), b.get("source", ""))
            if len(_EXTRACTION_CACHE) > MAX_CACHE_ENTRIES:
                _EXTRACTION_CACHE.clear()
            _EXTRACTION_CACHE[ck] = b
        except Exception:
            pass

    # Only send non-dropped candidates to the LLM (economy: max 10 per prompt).
    candidates = [b for b in baselines if b.get("zone_tier") != "DROPPED_IRRELEVANT"][:10]
    if not candidates:
        return baselines
    try:
        settings = get_settings()
        opencode_key = getattr(settings, "opencode_api_key", "")
        if not opencode_key or opencode_key.startswith("your-"):
            return baselines
        from agents.llm_gateway import LLMGateway
        lines = []
        for b in candidates:
            lines.append(
                f"- id: {b.get('id')} | title: {(b.get('title') or '')[:160]} | "
                f"desc: {(b.get('concise_summary') or b.get('summary') or '')[:200]} | "
                f"heuristik: {b.get('incident_type')}/{b.get('severity')}/{b.get('zone_tier')}"
            )
        prompt = (
            "Klasifikasikan artikel bencana/logistik Sumatera berikut. Kembalikan HANYA "
            "array JSON valid (tanpa markdown) berisi satu objek per artikel:\n"
            "{\n"
            '  "id": "string (sama persis)",\n'
            '  "zone_tier": "RED_CONFIRMED | YELLOW_CLARIFY | DROPPED_IRRELEVANT",\n'
            '  "tier_reason": "1 kalimat Bahasa Indonesia",\n'
            '  "incident_type": "flood | landslide | earthquake | wildfire | port_closure | marine_wave | road_closure | congestion | volcanic_eruption | other_disruption",\n'
            '  "custom_hazard_label": "label singkat Bahasa Indonesia",\n'
            '  "verified_sumatra_location": "kota/pelabuhan/jalan dari ISI berita saja, JANGAN dari nama biro (mis. Antara Bengkulu), atau null jika tidak ada",\n'
            '  "severity": "low | medium | high | critical",\n'
            '  "affected_modalities": ["land" dan/atau "sea" dan/atau "air"],\n'
            '  "passability": "BLOCKED | RESTRICTED | CAUTION",\n'
            '  "estimated_delay_hours": 0,\n'
            '  "concise_summary": "1 kalimat ringkasan operasional Bahasa Indonesia"\n'
            "}\n"
            "Aturan: verified_sumatra_location=null ATAU iklan/tidak-relevan/di luar Sumatera "
            "=> zone_tier DROPPED_IRRELEVANT. Hanya lokasi node spesifik (kota/pelabuhan/jalan) "
            "yang boleh RED_CONFIRMED; sebutan provinsi saja => YELLOW_CLARIFY.\n\n"
            + "\n".join(lines)
        )
        gen_text = await asyncio.wait_for(
            LLMGateway.generate_content(prompt=prompt, model_name=settings.opencode_driver_model),
            timeout=35.0,
        )
        if not gen_text:
            return baselines
        parsed = json.loads(_clean_llm_json(gen_text))
        items = parsed if isinstance(parsed, list) else parsed.get("items", []) if isinstance(parsed, dict) else []
        by_id = {str(b.get("id")): b for b in baselines}
        for it in items:
            if not isinstance(it, dict) or not it.get("id"):
                continue
            target = by_id.get(str(it["id"]))
            if target is not None:
                _apply_batch_llm_item(target, it)
    except Exception as e:
        logger.warning(f"Batched LLM extraction unavailable ({type(e).__name__}: {e}); using heuristics.")
    return baselines


async def extract_structured_news(art: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extracts structured crisis intelligence from raw news item.
    Uses cached result if present, otherwise attempts opencode driver with heuristic fallback.
    """
    title = art.get("title", "") or ""
    source = art.get("source", "Media")
    cache_key = _hash_article(title, source)

    if cache_key in _EXTRACTION_CACHE:
        return _EXTRACTION_CACHE[cache_key]

    # Baseline heuristic (already includes expanded taxonomy + tiering)
    structured = _fast_heuristic_extraction(art)

    settings = get_settings()
    opencode_key = getattr(settings, "opencode_api_key", "")
    if opencode_key and not opencode_key.startswith("your-"):
        try:
            from agents.llm_gateway import LLMGateway
            prompt = (
                "Extract structured disaster & food supply chain intelligence from this Indonesian news report. "
                "Return ONLY a clean JSON object (no markdown, no backticks, no commentary) with this exact schema:\n"
                "{\n"
                '  "incident_type": "flood | landslide | earthquake | wildfire | port_closure | marine_wave | road_closure | congestion | volcanic_eruption | other_disruption",\n'
                '  "severity": "low | medium | high | critical",\n'
                '  "temporal_phase": "forecast_early_warning | active_disruption | clearing_recovery",\n'
                '  "lead_time_hours": 0.0,\n'
                '  "corridor_nodes": ["City/Port names"],\n'
                '  "corridor_segment": "Road name or KM marker",\n'
                '  "commodities_affected": ["Beras BULOG", "Cabai Merah", "Minyak Goreng", etc],\n'
                '  "concise_summary": "1 sentence operational factual summary in Indonesian",\n'
                '  "zone_tier": "RED_CONFIRMED | YELLOW_CLARIFY | DROPPED_IRRELEVANT",\n'
                '  "tier_reason": "1 sentence in Indonesian",\n'
                '  "custom_hazard_label": "short Indonesian label",\n'
                '  "verified_sumatra_location": "city/port/road from body only, never bureau name, or null",\n'
                '  "affected_modalities": ["land | sea | air"],\n'
                '  "passability": "BLOCKED | RESTRICTED | CAUTION",\n'
                '  "estimated_delay_hours": 0,\n'
                '  "ground_truth_metrics": {"lane_status": "BLOCKED | RESTRICTED | CLEAR", "water_level_cm": 0}\n'
                "}\n\n"
                f"Title: {title}\n"
                f"Source: {source} ({art.get('source_tier', 'TIER_2')})\n"
                f"Content: {art.get('raw_description', '')}"
            )

            gen_text = await asyncio.wait_for(
                LLMGateway.generate_content(prompt=prompt, model_name=settings.opencode_driver_model),
                timeout=35.0
            )
            if gen_text:
                parsed = json.loads(_clean_llm_json(gen_text))
                if isinstance(parsed, dict):
                    _apply_batch_llm_item(structured, {"id": structured.get("id"), **parsed})
                    if parsed.get("temporal_phase"):
                        structured["temporal_phase"] = parsed["temporal_phase"]
                    if parsed.get("lead_time_hours") is not None:
                        try:
                            structured["lead_time_hours"] = float(parsed["lead_time_hours"])
                        except Exception:
                            pass
                    if parsed.get("corridor_nodes"):
                        structured["corridor_nodes"] = parsed["corridor_nodes"]
                    if parsed.get("corridor_segment"):
                        structured["corridor_segment"] = parsed["corridor_segment"]
                    if parsed.get("commodities_affected"):
                        structured["commodities_affected"] = parsed["commodities_affected"]
                    if parsed.get("ground_truth_metrics"):
                        structured["ground_truth_metrics"].update(parsed["ground_truth_metrics"])
        except Exception as e:
            logger.warning(
                f"LLM structured extraction unavailable for '{title[:30]}' ({type(e).__name__}: {e}); using heuristic baseline."
            )

    # Store in memory cache
    if len(_EXTRACTION_CACHE) > MAX_CACHE_ENTRIES:
        _EXTRACTION_CACHE.clear()
    _EXTRACTION_CACHE[cache_key] = structured

    return structured
