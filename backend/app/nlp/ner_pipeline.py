import asyncio
import json
import logging
import re
from typing import List
from app.config import get_settings

logger = logging.getLogger(__name__)

from app.nlp.gazetteer_data import PAN_SUMATRA_GAZETTEER

LOCATION_GAZETTEER = list(PAN_SUMATRA_GAZETTEER.keys())

def extract_locations_gazetteer(text: str) -> List[str]:
    """Extract location names from text using a regex gazetteer (fast path)."""
    if not text or not text.strip():
        return []
    try:
        from app.nlp.geocoding_service import strip_bureau_and_dateline_noise
        text = strip_bureau_and_dateline_noise(text)
    except Exception:
        pass
    found = []
    text_lower = text.lower()
    for loc in LOCATION_GAZETTEER:
        # Match word boundaries to prevent substring collisions
        pattern = r'\b' + re.escape(loc) + r'\b'
        if re.search(pattern, text_lower):
            found.append(loc.title())
    return found

async def extract_locations_llm(text: str) -> List[str]:
    """Extract location names from text using the opencode driver model (fallback path)."""
    settings = get_settings()
    # Local import matches news_extractor/agent_router and avoids import cycles.
    from agents.llm_gateway import LLMGateway

    prompt = (
        "Extract all Indonesian location names (roads, ports, cities, regencies, landmarks) from the text below. "
        "Return the output ONLY as a valid JSON array of strings (e.g., [\"Medan\", \"Belawan\"]). "
        "Do not include any introductory or concluding text. Do not wrap in markdown code blocks. "
        "If no locations are found, return an empty array [].\n\n"
        f"Text: {text}"
    )

    try:
        # Bounded at 12s (fixes the D-06 unbounded to_thread): the gateway
        # raises fail-loud on any provider error, which maps to [] below.
        raw = await asyncio.wait_for(
            LLMGateway.generate_content(
                prompt=prompt,
                model_name=settings.opencode_driver_model,
            ),
            timeout=12.0,
        )

        # Clean backticks and JSON markdown packaging
        resp_text = raw.strip()
        if resp_text.startswith("```"):
            lines = resp_text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            resp_text = "\n".join(lines).strip()
            # If it still has 'json' at the start of first line, strip it
            if resp_text.lower().startswith("json"):
                resp_text = resp_text[4:].strip()

        locations = json.loads(resp_text)
        if isinstance(locations, list):
            # Filter and sanitize
            return [str(loc).strip() for loc in locations if str(loc).strip()]
        return []
    except Exception as e:
        logger.error(f"Error during opencode driver LLM location extraction: {e}")
        return []

async def extract_locations(text: str) -> List[str]:
    """
    Extract locations from text.
    Uses fast regex gazetteer first, falling back to the opencode driver LLM.
    """
    if not text or not text.strip():
        return []

    # 1. Fast Path: Gazetteer
    locations = extract_locations_gazetteer(text)
    
    # 2. Fallback Path: opencode driver LLM (12s bound, [] on failure)
    if not locations:
        logger.debug(f"Gazetteer empty for text: '{text[:50]}...'. Falling back to opencode driver LLM.")
        locations = await extract_locations_llm(text)
        
    return locations
