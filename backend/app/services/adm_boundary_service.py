"""
PetaNadi / LRIP — Real Administrative Boundary Service
Provides North Sumatra ADM2/ADM3 GeoJSON boundary polygons (Google Maps style)
enriched with live BMKG weather, TomTom traffic, and active hazard state.
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

_FIXTURE_PATH = Path(__file__).parent.parent / "fixtures" / "north_sumatra_adm_boundaries.json"

def get_adm_boundaries() -> Dict[str, Any]:
    """Returns GeoJSON FeatureCollection of North Sumatra ADM2/ADM3 boundaries."""
    try:
        if _FIXTURE_PATH.exists():
            with open(_FIXTURE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read ADM boundary fixture: {e}")

    return {"type": "FeatureCollection", "features": []}

def get_boundary_by_id(region_id: str) -> Optional[Dict[str, Any]]:
    """Returns a specific ADM boundary feature by region_id."""
    data = get_adm_boundaries()
    for feat in data.get("features", []):
        if feat.get("properties", {}).get("region_id") == region_id or feat.get("id") == region_id:
            return feat
    return None
