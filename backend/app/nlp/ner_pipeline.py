import json
import logging
import re
from typing import List
import google.generativeai as genai
from app.config import get_settings

logger = logging.getLogger(__name__)

# List of known locations in the North Sumatra logistics corridor
LOCATION_GAZETTEER = [
    "belawan", "medan", "binjai", "pematangsiantar", "simalungun",
    "toba", "danau toba", "trans sumatra", "sibolga", "dumai",
    "tanjung mulia", "tanjung balai", "rantau prapat", "kisaran",
    "lubuk pakam", "stabat", "langkat", "karo", "dairi", "tebing tinggi",
    "jalan lintas sumatera", "tol belawan", "pelabuhan belawan",
]

def extract_locations_gazetteer(text: str) -> List[str]:
    """Extract location names from text using a regex gazetteer (fast path)."""
    found = []
    text_lower = text.lower()
    for loc in LOCATION_GAZETTEER:
        # Match word boundaries to prevent substring collisions (e.g., 'toba' matching 'tobasa')
        pattern = r'\b' + re.escape(loc) + r'\b'
        if re.search(pattern, text_lower):
            # Capitalize properly based on matching index
            found.append(loc.title())
    return found

async def extract_locations_llm(text: str) -> List[str]:
    """Extract location names from text using Gemini Flash (fallback path)."""
    settings = get_settings()
    if not settings.gemini_api_key:
        logger.warning("Gemini API key is not configured. Skipping LLM location extraction.")
        return []

    try:
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        prompt = (
            "Extract all Indonesian location names (roads, ports, cities, regencies, landmarks) from the text below. "
            "Return the output ONLY as a valid JSON array of strings (e.g., [\"Medan\", \"Belawan\"]). "
            "Do not include any introductory or concluding text. Do not wrap in markdown code blocks. "
            "If no locations are found, return an empty array [].\n\n"
            f"Text: {text}"
        )
        
        # Run in executor to prevent blocking the async loop if the client call is synchronous
        response = await asyncio.to_thread(model.generate_content, prompt)
        
        # Clean backticks and JSON markdown packaging
        resp_text = response.text.strip()
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
        logger.error(f"Error during Gemini LLM location extraction: {e}")
        return []

async def extract_locations(text: str) -> List[str]:
    """
    Extract locations from text.
    Uses fast regex gazetteer first, falling back to Gemini Flash LLM.
    """
    if not text or not text.strip():
        return []

    # 1. Fast Path: Gazetteer
    locations = extract_locations_gazetteer(text)
    
    # 2. Fallback Path: Gemini Flash
    if not locations:
        logger.debug(f"Gazetteer empty for text: '{text[:50]}...'. Falling back to Gemini Flash.")
        locations = await extract_locations_llm(text)
        
    return locations

# Import asyncio here to avoid circular dependencies
import asyncio
