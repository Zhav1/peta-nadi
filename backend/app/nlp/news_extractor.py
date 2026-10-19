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

EXTRACTION_SCHEMA_VERSION = 5

ECONOMIC_OPINION_CEREMONIAL_EXCLUSIONS = (
    "dukung perekonomian", "pertumbuhan ekonomi", "dorong ekonomi",
    "dongkrak ekonomi", "dongkrak perekonomian", "peresmian", "diresmikan",
    "apresiasi", "optimis", "investasi", "progres pembangunan",
    "progres konstruksi", "uji laik fungsi", "diskon tarif", "mudik gratis",
    "sosialisasi", "kunjungan kerja", "rapat koordinasi", "penghargaan",
    "ekspor meningkat", "surplus", "pengusaha:", "pengamat:", "akademisi:",
)

STRICT_CRISIS_PREDICATES = (
    "banjir", "genangan", "luapan", "terendam", "longsor", "tebing runtuh",
    "material longsor", "amblas", "ambles", "ambruk", "putus", "terputus",
    "runtuh", "lumpuh", "tertutup", "ditutup", "penutupan", "terisolir",
    "macet total", "macet parah", "kemacetan panjang", "antrean panjang",
    "antrean mengular", "gelombang tinggi", "ombak besar", "cuaca ekstrem",
    "cuaca buruk", "angin kencang", "puting beliung", "badai", "erupsi",
    "abu vulkanik", "lahar dingin", "gempa", "kebakaran hutan", "karhutla",
    "kabut asap", "tumpahan", "kecelakaan", "tabrakan", "terguling", "mogok",
    "blokade", "kelangkaan bbm", "antrean bbm", "tanggap darurat bencana",
    "darurat banjir", "darurat longsor", "siaga", "waspada",
    "peringatan dini", "rawan longsor", "rawan banjir", "rusak parah",
    "berlubang parah", "gangguan operasional", "dihentikan sementara", "ditunda",
)

# Emergency-infra nouns that are post-disaster construction, NOT active crisis
# predicates. They must never count as a crisis signal on their own.
POST_CONSTRUCTION_EXCLUSION_PHRASES = (
    "tanggul darurat", "jembatan darurat", "posko darurat", "tenda darurat",
    "sekolah darurat", "pembangunan",
)

PHYSICAL_BLOCKAGE_PREDICATES = (
    "putus", "terputus", "amblas", "ambles", "ambruk", "runtuh",
    "tertutup", "ditutup", "tutup total", "lumpuh", "terisolir",
    "macet total", "tidak bisa dilalui", "tak bisa dilalui",
    "merendam jalan", "jalan terendam", "jalur terendam", "banjir merendam",
    "menimbun badan jalan", "menutup badan jalan",
)

NON_INCIDENT_DISCOURSE_MARKERS = (
    "akademisi", "unand", "universitas", "guru besar", "pakar", "pengamat",
    "peneliti", "ahli:", "solusi", "solusi banjir", "pemulihan", "hulu das",
    "daerah aliran sungai", "rehabilitasi", "normalisasi", "reboisasi",
    "penghijauan", "pencegahan", "edukasi", "sosialisasi", "simulasi bencana",
    "apel siaga", "pelatihan", "seminar", "diskusi", "kajian", "riset",
    "studi", "wacana", "usulan", "rekomendasi", "program", "anggaran",
    "bantuan sosial", "penyaluran bantuan", "santunan", "pasca banjir",
    "pasca bencana", "pascabencana", "pasca-bencana", "pascabanjir",
    "pasca-banjir", "pascagempa", "pasca-gempa", "pascalongsor",
    "rekonstruksi", "trauma healing", "dukung perekonomian",
    "pertumbuhan ekonomi", "dorong ekonomi", "dongkrak ekonomi",
    "dongkrak perekonomian", "peresmian", "diresmikan", "apresiasi",
    "optimis", "investasi", "progres pembangunan", "progres konstruksi",
    "uji laik fungsi", "diskon tarif", "mudik gratis", "kunjungan kerja",
    "rapat koordinasi", "penghargaan", "ekspor meningkat", "surplus",
    "pengusaha:", "pembangunan", "membangun", "tanggul",
    "tanggul darurat", "jembatan darurat", "jembatan bailey",
    "posko darurat", "tenda darurat", "sekolah darurat", "dapur umum",
    "perbaikan", "renovasi", "pengerukan", "peletakan batu",
    "tinjau lokasi", "meninjau", "kunjungan", "penyerahan bantuan",
    "bantuan logistik",
)

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
    has_crisis = any(w in t for w in STRICT_CRISIS_PREDICATES)
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
    if any(w in t for w in ["banjir", "genangan", "luapan", "debit air", "tenggelam", "terendam"]):
        return "flood", None, None
    if any(w in t for w in ["longsor", "tebing runtuh", "tanah longsor", "ambles", "amblas", "material longsor"]):
        return "landslide", None, None
    if any(w in t for w in ["macet total", "macet parah", "kemacetan panjang", "antrean panjang kendaraan",
                            "antrean mengular", "lumpuh total arus", "macet", "kemacetan"]):
        return "congestion", None, None
    # Logistics disruption catch-all → gated on explicit crisis predicate.
    # Bare infrastructure nouns ("tol", "pelabuhan", "truk", "distribusi",
    # "logistik", "bbm", "jalan", "pangan") NEVER trigger alone.
    if has_crisis:
        disruption_hints = [
            ("bbm", "Gangguan Pasokan BBM"),
            ("kelangkaan bbm", "Gangguan Pasokan BBM"),
            ("antrean bbm", "Gangguan Pasokan BBM"),
            ("solar langka", "Gangguan Pasokan BBM"),
            ("pupuk", "Gangguan Distribusi Pupuk"),
            ("logistik terganggu", "Disrupsi Koridor Logistik"),
            ("distribusi terganggu", "Disrupsi Koridor Logistik"),
            ("rantai pasok", "Disrupsi Koridor Logistik"),
            ("disrupsi", "Disrupsi Koridor Logistik"),
            ("gangguan operasional", "Disrupsi Koridor Logistik"),
            ("pelabuhan", "Gangguan Operasional Pelabuhan"),
            ("truk", "Gangguan Angkutan Logistik"),
            ("tol", "Gangguan Koridor Tol"),
        ]
        for hint, label in disruption_hints:
            if hint in t:
                return "other_disruption", label, None
    if has_crisis and any(w in t for w in ["cadangan pangan", "bulog", "stok beras", "operasi pasar"]):
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


def _detect_weather_warning_only(full_text_lower: str) -> bool:
    """Detects pure weather forecasts/warnings or multi-regency seasonal alerts.

    Returns True when warning markers are present without an active road/port
    blockage clause (putus/amblas/lumpuh/tutup total/dll). Such items gate to
    YELLOW_CLARIFY, never RED_CONFIRMED.
    """
    t = full_text_lower or ""
    warning_markers = (
        "catat", "peringatan dini", "berpotensi", "waspada", "prakiraan", "cuaca ekstrem",
    )
    blockage_clauses = (
        "putus", "terputus", "amblas", "ambles", "ambruk", "lumpuh", "tutup total",
        "tertutup", "ditutup", "terisolir", "tidak bisa dilalui", "tak bisa dilalui",
        "merendam jalan", "jalan terendam", "jalur terendam", "menutup badan jalan",
    )
    has_warning = any(w in t for w in warning_markers)
    if not has_warning:
        return False
    has_blockage = any(w in t for w in blockage_clauses)
    return not has_blockage


def _classify_discourse_type(full_text_lower: str, has_non_incident: bool) -> str:
    t = full_text_lower or ""
    if any(w in t for w in ("akademisi", "unand", "universitas", "guru besar", "pakar", "pengamat", "peneliti")):
        return "academic_commentary"
    if any(w in t for w in ("solusi", "pemulihan", "hulu das", "rehabilitasi", "normalisasi", "reboisasi", "rekomendasi", "usulan", "kajian", "riset", "studi", "wacana", "reboisasi", "penghijauan", "pencegahan", "pengerukan", "renovasi", "perbaikan", "pembangunan", "membangun", "tanggul")):
        # Recovery / construction / policy-solution discourse (incl. post-disaster works).
        if any(w in t for w in ("pasca banjir", "pasca bencana", "pascabencana", "pasca-bencana", "pascabanjir", "pasca-banjir", "pascagempa", "pasca-gempa", "pascalongsor", "rekonstruksi", "trauma healing", "bantuan sosial", "penyaluran bantuan", "santunan", "penyerahan bantuan", "bantuan logistik", "dapur umum", "posko darurat", "tenda darurat", "sekolah darurat", "jembatan darurat", "jembatan bailey", "tanggul darurat", "peletakan batu", "tinjau lokasi", "meninjau", "kunjungan")):
            return "retrospective_aid"
        return "solution_policy_discourse"
    if any(w in t for w in ("sosialisasi", "edukasi", "simulasi bencana", "apel siaga", "pelatihan", "seminar", "diskusi")):
        return "prevention_ceremonial"
    if any(w in t for w in ("pasca banjir", "pasca bencana", "pascabencana", "pasca-bencana", "pascabanjir", "pasca-banjir", "pascagempa", "pasca-gempa", "pascalongsor", "rekonstruksi", "trauma healing", "bantuan sosial", "penyaluran bantuan", "santunan", "penyerahan bantuan", "bantuan logistik", "dapur umum", "posko darurat", "tenda darurat", "sekolah darurat", "jembatan darurat", "pembangunan", "membangun", "tanggul", "perbaikan", "renovasi", "peletakan batu", "tinjau lokasi", "meninjau", "kunjungan")):
        return "retrospective_aid"
    if any(w in t for w in ("peresmian", "diresmikan", "apresiasi", "penghargaan", "kunjungan kerja", "rapat koordinasi", "mudik gratis", "diskon tarif")):
        return "ceremonial_economic"
    if has_non_incident:
        return "non_incident_discourse"
    return "incident_report"


def run_agent_verification_gate(
    article: Dict[str, Any] | None = None,
    full_text_lower: str = "",
    has_crisis_predicate: bool = False,
    has_physical_blockage: bool = False,
    has_non_incident_discourse: bool = False,
    is_geocoded: bool = False,
    latitude: Any = None,
    location_precision: str = "none",
    temporal_phase: str = "active_disruption",
    severity: str = "medium",
    incident_type: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Strict 4-check deterministic agent verification gate.

    Check 1 (freshness_passed): parse_and_validate_article_freshness <= 48h.
    Check 2 (discourse_passed): not (has_non_incident and not has_physical) AND has_crisis.
    Check 3 (spatial_passed): is_geocoded and latitude is not None.
    Check 4 (impact_corroborated): ALL must hold for RED_CONFIRMED.
    """
    # Allow calling as run_agent_verification_gate(article_dict) with everything inside.
    if article is None:
        article = {}
    if not isinstance(article, dict):
        article = {}
    # Merge kwargs-based article fields when full_text not explicitly passed.
    if not full_text_lower:
        _t = f"{article.get('title','')} {article.get('raw_description','') or article.get('summary','')}".lower()
        full_text_lower = _t
    else:
        full_text_lower = (full_text_lower or "").lower()
    if "has_crisis_predicate" not in kwargs and not has_crisis_predicate:
        has_crisis_predicate = any(w in full_text_lower for w in STRICT_CRISIS_PREDICATES)
    if "has_physical_blockage" not in kwargs and not has_physical_blockage:
        has_physical_blockage = any(w in full_text_lower for w in PHYSICAL_BLOCKAGE_PREDICATES)
    if "has_non_incident_discourse" not in kwargs and not has_non_incident_discourse:
        has_non_incident_discourse = any(w in full_text_lower for w in NON_INCIDENT_DISCOURSE_MARKERS)
    if not is_geocoded:
        is_geocoded = bool(article.get("is_geocoded")) if article else False
    if latitude is None:
        latitude = article.get("latitude") if article else None
    if not location_precision or location_precision == "none":
        location_precision = article.get("location_precision") or location_precision or "none"
    if not temporal_phase or temporal_phase == "active_disruption":
        temporal_phase = article.get("temporal_phase") or temporal_phase or "active_disruption"
    if not severity:
        severity = article.get("severity") or "medium"
    if not incident_type:
        incident_type = (article.get("incident_type") if article else "") or kwargs.get("incident_type", "") or ""

    # ---- Check 1: freshness ----
    freshness_passed = True
    age_hours: float | None = None
    try:
        from app.services.news_aggregator import parse_and_validate_article_freshness as _fresh
        pub_raw = (
            article.get("original_pub_date")
            or article.get("html_published_at")
            or article.get("pubDate")
            or article.get("published_at")
            if article else None
        )
        link = (article.get("link") or article.get("url")) if article else ""
        html_meta = article.get("html_published_at") if article else None
        fres = _fresh(pub_raw, link, html_meta_date=html_meta, max_age_hours=48)
        freshness_passed = bool(fres.get("is_fresh"))
        try:
            age_hours = float(fres.get("age_hours")) if fres.get("age_hours") is not None else None
        except Exception:
            age_hours = None
    except Exception:
        # If aggregator unavailable (circular import edge), default to pass
        # unless URL carries an obvious archival year.
        try:
            import re as _re
            from datetime import datetime as _dt, timezone as _tz
            _m = _re.search(r'/(20\d{2})/(\d{1,2})/(\d{1,2})(?:/|$|-|_)', str((article.get("link") or "") if article else ""))
            if _m:
                freshness_passed = False
        except Exception:
            pass

    # ---- Check 2: discourse ----
    discourse_passed = (not (has_non_incident_discourse and not has_physical_blockage)) and bool(has_crisis_predicate)

    # ---- Check 3: spatial ----
    spatial_passed = bool(is_geocoded) and (latitude is not None)

    # ---- Check 4: impact corroborated ----
    # Never allow generic other_disruption without a physical blockage to
    # corroborate impact (kills economic/opinion false-REDs).
    is_weather_warning_only = _detect_weather_warning_only(full_text_lower)
    _is_generic_other = str(incident_type or "").lower() == "other_disruption"
    is_vague_region = location_precision in ("kabupaten_kota", "province_only", "none")
    impact_corroborated = bool(
        freshness_passed
        and discourse_passed
        and spatial_passed
        and (location_precision in ("corridor_point", "exact_node"))
        and (temporal_phase == "active_disruption")
        and (bool(has_physical_blockage) or str(severity).lower() in ("high", "critical"))
        and (not is_weather_warning_only)
        and (not is_vague_region)
        and not (_is_generic_other and not has_physical_blockage)
    )

    discourse_type = _classify_discourse_type(full_text_lower, has_non_incident_discourse)
    if impact_corroborated:
        verdict_summary = "RED_CONFIRMED: active physical blockage corroborated."
    elif not freshness_passed:
        verdict_summary = "DROPPED: stale article beyond 48h freshness window."
    elif not discourse_passed:
        verdict_summary = "DROPPED: academic/policy/solution discourse without active blockage."
    elif is_weather_warning_only:
        verdict_summary = "YELLOW: weather warning only, needs field clarification."
    elif not spatial_passed:
        verdict_summary = "DROPPED: no geocoded incident location."
    elif is_vague_region:
        verdict_summary = "YELLOW: regency/province-wide mention capped at advisory zone."
    else:
        verdict_summary = "YELLOW: needs field clarification."

    return {
        "freshness_passed": freshness_passed,
        "discourse_passed": discourse_passed,
        "spatial_passed": spatial_passed,
        "impact_corroborated": impact_corroborated,
        "discourse_type": discourse_type,
        "age_hours": age_hours,
        "is_weather_warning_only": is_weather_warning_only,
        "has_crisis_predicate": bool(has_crisis_predicate),
        "has_physical_blockage": bool(has_physical_blockage),
        "has_non_incident_discourse": bool(has_non_incident_discourse),
        "agent_verdict_summary": verdict_summary,
    }


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
    # Strict two-factor crisis gate: bare infrastructure nouns ("tol",
    # "pelabuhan", "truk", "distribusi", "logistik", "bbm", "jalan", "pangan")
    # NEVER count as a hazard signal alone — an explicit crisis/disruption
    # action predicate must be present.
    has_crisis_predicate = any(w in full_text for w in STRICT_CRISIS_PREDICATES)
    has_exclusion = any(w in full_text for w in ECONOMIC_OPINION_CEREMONIAL_EXCLUSIONS)
    has_physical_blockage = any(w in full_text for w in PHYSICAL_BLOCKAGE_PREDICATES)
    # Only treat as logistics-relevant if a strict crisis predicate fired.
    _hazard_signal = has_crisis_predicate
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

    # 3. Severity (bare "darurat" removed: only specific active-crisis phrases count)
    severity = "medium"
    if any(w in full_text for w in ["putus", "lumpuh total", "tenggelam", "siaga 1",
                                    "tanggap darurat bencana", "darurat banjir", "darurat longsor",
                                    "terisolir", "120cm", "100cm", "ditutup",
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

    # 7. Zone tier & reason (economical 3-tier gatekeeper + 4-check agent verification)
    is_ad_noise = any(w in full_text for w in _AD_NOISE_KEYWORDS)
    has_non_incident_discourse = any(w in full_text for w in NON_INCIDENT_DISCOURSE_MARKERS)
    # Strict two-factor crisis predicate gate (Issue 3): economic/opinion/
    # ceremonial pieces and bare-infra mentions without a crisis predicate
    # are immediately irrelevant.
    fails_crisis_gate = (not has_crisis_predicate) or (has_exclusion and not has_physical_blockage)
    # Agent verification gate (freshness / discourse / spatial / impact).
    try:
        _probe_article = dict(art or {})
        _probe_article.update({
            "is_geocoded": is_geocoded,
            "latitude": latitude,
            "location_precision": location_precision,
            "temporal_phase": temporal_phase,
            "severity": severity,
            "incident_type": incident_type,
        })
        verification_audit = run_agent_verification_gate(
            _probe_article,
            full_text_lower=full_text,
            has_crisis_predicate=has_crisis_predicate,
            has_physical_blockage=has_physical_blockage,
            has_non_incident_discourse=has_non_incident_discourse,
            is_geocoded=is_geocoded,
            latitude=latitude,
            location_precision=location_precision,
            temporal_phase=temporal_phase,
            severity=severity,
            incident_type=incident_type,
        )
    except Exception:
        verification_audit = {
            "freshness_passed": True,
            "discourse_passed": (not (has_non_incident_discourse and not has_physical_blockage)) and bool(has_crisis_predicate),
            "spatial_passed": bool(is_geocoded) and latitude is not None,
            "impact_corroborated": False,
            "discourse_type": "incident_report",
            "age_hours": None,
            "is_weather_warning_only": False,
            "has_crisis_predicate": bool(has_crisis_predicate),
            "has_physical_blockage": bool(has_physical_blockage),
            "has_non_incident_discourse": bool(has_non_incident_discourse),
            "agent_verdict_summary": "YELLOW: needs field clarification.",
        }
    freshness_passed = bool(verification_audit.get("freshness_passed", True))
    discourse_passed = bool(verification_audit.get("discourse_passed", True))
    is_weather_warning_only = bool(verification_audit.get("is_weather_warning_only", False))
    impact_corroborated = bool(verification_audit.get("impact_corroborated", False))
    discourse_type = verification_audit.get("discourse_type", "incident_report")

    if (not freshness_passed) or (not discourse_passed):
        zone_tier = "DROPPED_IRRELEVANT"
        if not freshness_passed:
            tier_reason = "Berita arsip/lama melebihi batas 48 jam; tidak relevan untuk koridor aktif."
        else:
            tier_reason = ("Artikel opini/akademik/kebijakan/solusi tanpa blokade fisik aktif; "
                           "bukan disrupsi logistik.")
    elif fails_crisis_gate or (not is_geocoded) or (latitude is None) or is_ad_noise or (not _hazard_signal):
        zone_tier = "DROPPED_IRRELEVANT"
        tier_reason = ("Artikel tidak memiliki lokasi insiden spesifik di koridor "
                       "Sumatera atau bukan disrupsi logistik.")
    elif is_weather_warning_only:
        zone_tier = "YELLOW_CLARIFY"
        tier_reason = ("Peringatan cuaca / imbauan kewaspadaan tanpa penutupan jalur aktif; "
                       "memerlukan klarifikasi lapangan.")
    elif (location_precision in ("province_only", "kabupaten_kota") and not has_physical_blockage):
        zone_tier = "YELLOW_CLARIFY"
        tier_reason = ("Penyebutan setingkat Kabupaten/Kota/Provinsi tanpa titik koridor/ruas jalan spesifik; "
                       "dibatasi pada Zona Kuning (advisory) dan memerlukan klarifikasi lapangan.")
    elif (temporal_phase in ("forecast_early_warning", "early_warning", "monitoring")
          or (incident_type == "other_disruption" and severity in ("low", "medium"))):
        zone_tier = "YELLOW_CLARIFY"
        tier_reason = ("Peringatan dini / indikasi awal di wilayah koridor; titik "
                       "koordinat spesifik atau tingkat penutupan jalur masih "
                       "memerlukan klarifikasi lapangan.")
    elif impact_corroborated:
        zone_tier = "RED_CONFIRMED"
        tier_reason = (f"Dampak {custom_hazard_label} terkonfirmasi di "
                       f"{loc_info.get('matched_node')} ({region}) dengan status "
                       f"{impact_profile.get('passability')}; koridor logistik terdampak langsung.")
    elif (is_geocoded and location_precision in ("corridor_point", "exact_node")
          and (incident_type in ("flood", "landslide", "earthquake", "port_closure",
                                 "marine_wave", "road_closure", "volcanic_eruption",
                                 "wildfire")
               or (incident_type == "congestion" and severity in ("high", "critical"))
               or (incident_type == "other_disruption" and has_physical_blockage)
               or (impact_profile.get("passability") in ("BLOCKED", "RESTRICTED") and incident_type != "other_disruption")
               or (impact_profile.get("passability") in ("BLOCKED", "RESTRICTED") and has_physical_blockage))):
        # Geocoded exact-node with hazard signal but missing one corroboration
        # facet (e.g. no explicit physical predicate) -> still RED only if the
        # verification gate did not fail freshness/discourse and it is not a
        # weather-warning-only item.
        if freshness_passed and discourse_passed and not is_weather_warning_only:
            zone_tier = "RED_CONFIRMED"
            tier_reason = (f"Dampak {custom_hazard_label} terkonfirmasi di "
                           f"{loc_info.get('matched_node')} ({region}) dengan status "
                           f"{impact_profile.get('passability')}; koridor logistik terdampak langsung.")
        else:
            zone_tier = "YELLOW_CLARIFY"
            tier_reason = ("Lokasi terdeteksi namun tingkat keparahan atau status jalur "
                           "belum terkonfirmasi; memerlukan klarifikasi lapangan.")
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
    affected_locations = loc_info.get("affected_locations") or []
    if nodes and affected_locations:
        # Ensure corridor_nodes covers all multi-regency matches.
        for _al in affected_locations:
            _nm = _al.get("name")
            if _nm and _nm not in nodes:
                nodes.append(_nm)

    # 10. Agent-decided hazard-specific radius + anisotropic polygon geometry.
    radius_km: float | None = None
    geometry_polygon: list | None = None
    try:
        if latitude is not None and longitude is not None:
            from app.services.incident_geometry_service import compute_hazard_zone_geometry_and_radius as _geo_fn
            _geo = _geo_fn(incident_type, severity, location_precision, zone_tier, float(latitude), float(longitude), corridor_segment or "")
            radius_km = float(_geo.get("radius_km", 6.0))
            geometry_polygon = _geo.get("geometry_polygon")
            # Attach radius/geometry onto each affected_location as well.
            for _al in (affected_locations or []):
                try:
                    _alat = _al.get("latitude", latitude)
                    _alon = _al.get("longitude", longitude)
                    _g2 = _geo_fn(incident_type, severity, _al.get("location_precision", location_precision), zone_tier, float(_alat), float(_alon), _al.get("corridor_segment", corridor_segment or ""))
                    _al["radius_km"] = float(_g2.get("radius_km", radius_km or 6.0))
                    _al["geometry_polygon"] = _g2.get("geometry_polygon")
                except Exception:
                    if radius_km is not None:
                        _al.setdefault("radius_km", radius_km)
                    if geometry_polygon is not None:
                        _al.setdefault("geometry_polygon", geometry_polygon)
    except Exception:
        pass

    escalation_required = bool(
        severity in ("high", "critical")
        or zone_tier == "RED_CONFIRMED"
        or impact_profile.get("passability") in ("BLOCKED", "RESTRICTED")
        or location_precision in ("kabupaten_kota", "province_only", "none")
    )
    location_tier = (
        "TIER_A" if location_precision in ("corridor_point", "exact_node")
        else "TIER_B" if location_precision == "kecamatan_kelurahan"
        else "TIER_C"
    )

    return {
        "id": art_id,
        "title": title,
        "link": art_link,
        "source": source,
        "source_tier": source_tier,
        "pubDate": art.get("pubDate", "Terkini"),
        "original_pub_date": art.get("original_pub_date") or art.get("pubDate") or art.get("published_at"),
        "html_published_at": art.get("html_published_at"),
        "published_at": art.get("published_at") or art.get("html_published_at") or art.get("pubDate"),
        "summary": title,
        "concise_summary": title,
        "raw_description": f"{title} {desc}".strip(),
        "body_scraped": art.get("body_scraped", False),
        "article_body_chars": art.get("article_body_chars") or len(f"{title} {desc}".strip()),
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
        "affected_locations": affected_locations,
        "radius_km": radius_km,
        "geometry_polygon": geometry_polygon,
        "verification_audit": verification_audit,
        "escalation_required": escalation_required,
        "location_tier": location_tier,
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
            "location_tier": location_tier,
            "escalation_required": escalation_required,
            "affected_locations": affected_locations,
            "schema_version": EXTRACTION_SCHEMA_VERSION,
            "radius_km": radius_km,
            "geometry_polygon": geometry_polygon,
            "verification_audit": verification_audit,
            "discourse_type": discourse_type,
            "age_hours": verification_audit.get("age_hours"),
            "original_pub_date": art.get("original_pub_date") or art.get("pubDate"),
            "published_at_iso": art.get("published_at") or art.get("html_published_at"),
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
        # Workhorse LLM hard DROP: inactive disaster (post-construction / recovery /
        # opinion / ceremony / economic) is never mappable.
        _is_active = item.get("is_active_disaster")
        if _is_active is False:
            structured["zone_tier"] = "DROPPED_IRRELEVANT"
            structured["tier_reason"] = (item.get("tier_reason")
                                         or "LLM membaca isi berita: bukan bencana aktif (konstruksi pascabencana/pemulihan/opini).")
            try:
                _va = dict(structured.get("verification_audit") or {})
                _va["llm_verified"] = True
                _va["content_chars_analyzed"] = len(structured.get("raw_description") or "")
                if item.get("discourse_type"):
                    _va["discourse_type"] = item["discourse_type"]
                    _va["discourse_type_llm"] = item["discourse_type"]
                structured["verification_audit"] = _va
                gtm0 = dict(structured.get("ground_truth_metrics") or {})
                gtm0.update({"zone_tier": structured.get("zone_tier"),
                             "tier_reason": structured.get("tier_reason"),
                             "verification_audit": _va,
                             "schema_version": EXTRACTION_SCHEMA_VERSION})
                structured["ground_truth_metrics"] = gtm0
            except Exception:
                pass
            return structured
        if item.get("incident_type"):
            structured["incident_type"] = item["incident_type"]
        if item.get("severity"):
            structured["severity"] = item["severity"]
        if item.get("custom_hazard_label"):
            structured["custom_hazard_label"] = item["custom_hazard_label"]
        if item.get("concise_summary"):
            structured["summary"] = item["concise_summary"]
            structured["concise_summary"] = item["concise_summary"]
        if item.get("discourse_type"):
            try:
                _va0 = dict(structured.get("verification_audit") or {})
                _va0["discourse_type_llm"] = item["discourse_type"]
                structured["verification_audit"] = _va0
            except Exception:
                pass
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
        if item.get("recommended_radius_km") is not None:
            try:
                structured["radius_km"] = float(item["recommended_radius_km"])
            except Exception:
                pass
        # Tiering — LLM is authoritative unless it contradicts geocoding reality
        # or the deterministic verification gate (freshness / discourse).
        llm_tier = (item.get("zone_tier") or "").upper()
        llm_loc = item.get("verified_sumatra_location")
        llm_locs = item.get("verified_sumatra_locations")
        # Deterministic gate is never overridden by the LLM.
        try:
            _audit = structured.get("verification_audit") or {}
            _fresh_ok = _audit.get("freshness_passed", True)
            _disc_ok = _audit.get("discourse_passed", True)
        except Exception:
            _fresh_ok, _disc_ok = True, True
        if _fresh_ok is False or _disc_ok is False:
            structured["zone_tier"] = "DROPPED_IRRELEVANT"
            if _fresh_ok is False:
                structured["tier_reason"] = "Berita arsip/lama melebihi batas 48 jam; ditahan oleh verifikasi deterministik."
            else:
                structured["tier_reason"] = "Artikel opini/akademik/kebijakan/solusi tanpa blokade fisik aktif; ditahan oleh verifikasi deterministik."
        elif llm_loc is None or llm_tier == "DROPPED_IRRELEVANT":
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
                elif llm_tier == "RED_CONFIRMED" and structured.get("location_precision") in ("kabupaten_kota", "province_only") and not structured.get("has_physical_blockage"):
                    # Tier-C hard invariant cap: broad city/regency mention is capped at YELLOW_CLARIFY
                    structured["zone_tier"] = "YELLOW_CLARIFY"
                    structured["tier_reason"] = ("Penyebutan setingkat Kabupaten/Kota/Provinsi tanpa titik koridor/ruas jalan spesifik; "
                                                 "dibatasi pada Zona Kuning (advisory) dan memerlukan klarifikasi lapangan.")
                else:
                    structured["zone_tier"] = llm_tier
                    if item.get("tier_reason"):
                        structured["tier_reason"] = item["tier_reason"]
        # Multi-location fan-out: every Kabupaten/pass found by the Workhorse LLM
        # in the body paragraphs gets geocoded with hazard-specific geometry.
        try:
            if isinstance(llm_locs, list) and any(isinstance(x, str) and x.strip() for x in llm_locs):
                from app.nlp.geocoding_service import resolve_all_sumatra_locations as _resolve_all
                _loc_text = ", ".join([str(x).strip() for x in llm_locs if isinstance(x, str) and str(x).strip()])
                _fallback = structured.get("province") or structured.get("region") or "Sumatera Utara"
                _all = _resolve_all(_loc_text, fallback_province=_fallback)
                if _all:
                    structured["affected_locations"] = _all
                    # Promote primary to top hit.
                    _top = _all[0]
                    structured["latitude"] = _top.get("latitude", structured.get("latitude"))
                    structured["longitude"] = _top.get("longitude", structured.get("longitude"))
                    structured["province"] = _top.get("province", structured.get("province"))
                    structured["region"] = _top.get("province", structured.get("region", structured.get("province")))
                    structured["corridor_segment"] = _top.get("corridor_segment", structured.get("corridor_segment"))
                    structured["corridor_nodes"] = [_e.get("name") for _e in _all if _e.get("name")]
                    structured["is_geocoded"] = True
                    structured["location_precision"] = _top.get("location_precision", "exact_node")
        except Exception:
            pass
        # Mark LLM verification + content length analyzed.
        try:
            _va2 = dict(structured.get("verification_audit") or {})
            _va2["llm_verified"] = True
            _va2["content_chars_analyzed"] = len(structured.get("raw_description") or "")
            structured["verification_audit"] = _va2
        except Exception:
            pass
        # Sync ground_truth_metrics mirror
        # Recompute hazard geometry if LLM changed incident_type/severity.
        try:
            _lat = structured.get("latitude")
            _lon = structured.get("longitude")
            if _lat is not None and _lon is not None:
                from app.services.incident_geometry_service import compute_hazard_zone_geometry_and_radius as _geo_llm
                _g = _geo_llm(
                    structured.get("incident_type", "other_disruption"),
                    structured.get("severity", "medium"),
                    structured.get("location_precision", "none"),
                    structured.get("zone_tier", "YELLOW_CLARIFY"),
                    float(_lat), float(_lon),
                    structured.get("corridor_segment", ""),
                )
                structured["radius_km"] = float(_g.get("radius_km", 6.0))
                structured["geometry_polygon"] = _g.get("geometry_polygon")
        except Exception:
            pass
        gtm = dict(structured.get("ground_truth_metrics") or {})
        gtm.update({
            "zone_tier": structured.get("zone_tier"),
            "tier_reason": structured.get("tier_reason"),
            "custom_hazard_label": structured.get("custom_hazard_label"),
            "impact_profile": structured.get("impact_profile"),
            "is_geocoded": structured.get("is_geocoded"),
            "location_precision": structured.get("location_precision"),
            "affected_locations": structured.get("affected_locations") or [],
            "schema_version": EXTRACTION_SCHEMA_VERSION,
            "radius_km": structured.get("radius_km"),
            "geometry_polygon": structured.get("geometry_polygon"),
            "verification_audit": structured.get("verification_audit"),
        })
        structured["ground_truth_metrics"] = gtm
    except Exception as e:
        logger.debug(f"Batch LLM merge skipped: {e}")
    return structured


async def extract_structured_news_batch(articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Economical batched LLM gatekeeper: enrich short bodies with full article HTML,
    heuristic baselines for all articles, then compact LLM calls in chunks of up
    to 5 candidates via LLMGateway.generate_content returning a JSON array with
    per-article tiering. Falls back to heuristics when the LLM is unavailable.
    Never raises.
    """
    if not articles:
        return []
    # Pre-enrich: scrape full article body for any HTTP-linked row that has not
    # been scraped and whose description is still a short RSS teaser (<450 chars).
    try:
        _needs_enrich = any(
            isinstance(a, dict)
            and not a.get("body_scraped")
            and len((a.get("raw_description") or a.get("summary") or "")) < 450
            and str(a.get("link") or a.get("url") or "").startswith("http")
            for a in articles
        )
        if _needs_enrich:
            from app.services.news_aggregator import enrich_article_description_if_needed as _enrich
            articles = list(await asyncio.gather(*[_enrich(dict(a)) if isinstance(a, dict) else a for a in articles]))
    except Exception:
        pass
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

    # Only send non-dropped candidates to the LLM, in chunks of up to 5.
    candidates = [b for b in baselines if b.get("zone_tier") != "DROPPED_IRRELEVANT"]
    if not candidates:
        return baselines
    try:
        settings = get_settings()
        opencode_key = getattr(settings, "opencode_api_key", "")
        if not opencode_key or opencode_key.startswith("your-"):
            return baselines
        from agents.llm_gateway import LLMGateway
        by_id = {str(b.get("id")): b for b in baselines}
        for _ci in range(0, len(candidates), 5):
            _chunk = candidates[_ci:_ci + 5]
            lines = []
            for b in _chunk:
                _desc = (b.get("raw_description") or b.get("concise_summary") or b.get("summary") or "")
                lines.append(
                    f"- id: {b.get('id')} | judul: {(b.get('title') or '')[:160]} | "
                    f"ISI BERITA: {_desc[:1600]} | "
                    f"heuristik: {b.get('incident_type')}/{b.get('severity')}/{b.get('zone_tier')}"
                )
            prompt = (
                "Baca ISI BERITA setiap artikel Sumatera berikut secara penuh sebelum memutuskan. "
                "Kembalikan HANYA array JSON valid (tanpa markdown) berisi satu objek per artikel:\n"
                "{\n"
                '  "id": "string (sama persis)",\n'
                '  "is_active_disaster": true | false,\n'
                '  "zone_tier": "RED_CONFIRMED | YELLOW_CLARIFY | DROPPED_IRRELEVANT",\n'
                '  "tier_reason": "1-2 kalimat Bahasa Indonesia menjelaskan keputusan berdasarkan ISI BERITA",\n'
                '  "verified_sumatra_locations": ["nama lokasi spesifik (pass, jalan, pelabuhan, Kecamatan, Kabupaten/Kota) yang disebut di ISI BERITA sebagai terdampak, atau []"],\n'
                '  "verified_sumatra_location": "lokasi utama string atau null",\n'
                '  "incident_type": "flood | landslide | earthquake | wildfire | port_closure | marine_wave | road_closure | congestion | volcanic_eruption | other_disruption",\n'
                '  "custom_hazard_label": "label singkat Bahasa Indonesia",\n'
                '  "severity": "low | medium | high | critical",\n'
                '  "affected_modalities": ["land" dan/atau "sea" dan/atau "air"],\n'
                '  "passability": "BLOCKED | RESTRICTED | CAUTION",\n'
                '  "estimated_delay_hours": 0,\n'
                '  "recommended_radius_km": 6.0,\n'
                '  "discourse_type": "incident_report | academic_commentary | solution_policy_discourse | prevention_ceremonial | retrospective_aid | ceremonial_economic",\n'
                '  "concise_summary": "1 kalimat ringkasan operasional Bahasa Indonesia"\n'
                "}\n"
                "Aturan: is_active_disaster=true HANYA jika ISI BERITA menggambarkan bencana fisik aktif "
                "atau disrupsi transport/logistik yang sedang terjadi; false jika konstruksi/pemulihan pascabencana "
                '(mis. Pembangunan tanggul darurat pascabencana), perbaikan, solusi akademik/pakar, seremonial, atau ekonomi. '
                "is_active_disaster=false ATAU verified_sumatra_location=null ATAU iklan/tidak-relevan/di luar Sumatera "
                "=> zone_tier DROPPED_IRRELEVANT. Hanya lokasi node spesifik (kota/pelabuhan/jalan) "
                "yang boleh RED_CONFIRMED; sebutan provinsi saja => YELLOW_CLARIFY. "
                "Tandai opini/akademisi (Akademisi/Pakar/Solusi Banjir/Pemulihan DAS), usulan kebijakan, "
                "seminar/diskusi/sosialisasi, bantuan/pasca-bencana/pembangunan/tanggul/perbaikan/renovasi, "
                "dan berita arsip >48 jam sebagai DROPPED_IRRELEVANT.\n\n"
                + "\n".join(lines)
            )
            try:
                gen_text = await asyncio.wait_for(
                    LLMGateway.generate_content(prompt=prompt, model_name=settings.opencode_driver_model, max_tokens=1600),
                    timeout=35.0,
                )
            except Exception as _ce:
                logger.warning(f"Batched LLM chunk unavailable ({type(_ce).__name__}: {_ce}); keeping heuristics.")
                continue
            if not gen_text:
                continue
            try:
                parsed = json.loads(_clean_llm_json(gen_text))
            except Exception:
                continue
            items = parsed if isinstance(parsed, list) else parsed.get("items", []) if isinstance(parsed, dict) else []
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
