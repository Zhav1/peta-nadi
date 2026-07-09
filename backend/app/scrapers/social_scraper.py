import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any

import httpx
from app.scrapers.base_scraper import BaseScraper
from app.services.redis_client import STREAM_SOCIAL
from app.config import get_settings
from app.nlp.ner_pipeline import extract_locations
from app.nlp.geocoding_service import geocode

logger = logging.getLogger(__name__)

# Sample mock social media posts for fallback/demo purposes
MOCK_SOCIAL_POSTS = [
    {
        "id": "mock_tw_001",
        "platform": "twitter",
        "text": "Banjir parah di daerah Tanjung Mulia! Air naik sampai sepinggang, jalan tol Belawan macet total ga bisa jalan.",
        "author": "sumut_report",
        "created_at": None  # Will be dynamically populated
    },
    {
        "id": "mock_tw_002",
        "platform": "twitter",
        "text": "Antrian truk di Pelabuhan Belawan mengular panjang hari ini. Driver bilang gara-gara sistem gate error.",
        "author": "sopir_lintas",
        "created_at": None
    },
    {
        "id": "mock_tk_001",
        "platform": "tiktok",
        "text": "Info longsor terbaru di jalan lintas Sumatera dekat Pematangsiantar. Jalan tertutup batu besar, harus memutar lewat jalur alternatif.",
        "author": "kabar_sumut",
        "created_at": None
    }
]

class SocialScraper(BaseScraper):
    source_name = "social"
    stream_key = STREAM_SOCIAL
    normal_interval_seconds = 3600  # 1 hour
    crisis_interval_seconds = 900   # 15 minutes

    def __init__(self):
        super().__init__()

    async def fetch(self) -> List[Dict[str, Any]]:
        """Fetch posts from Twitter API or fall back to mock posts if API token is missing."""
        settings = get_settings()
        posts = []

        if settings.twitter_bearer_token:
            logger.info("Fetching real-time posts from Twitter/X API...")
            headers = {"Authorization": f"Bearer {settings.twitter_bearer_token}"}
            # Search recent tweets in Bahasa Indonesia mentioning disaster keywords in Sumatra
            query = "(banjir OR longsor OR macet OR belawan OR sumatera) lang:id"
            url = "https://api.twitter.com/2/tweets/search/recent"
            params = {
                "query": query,
                "max_results": 10,
                "tweet.fields": "created_at,author_id"
            }
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(url, headers=headers, params=params, timeout=10)
                    if resp.status_code == 200:
                        data = resp.json().get("data", [])
                        for item in data:
                            posts.append({
                                "id": item["id"],
                                "platform": "twitter",
                                "text": item["text"],
                                "author": item.get("author_id", "unknown"),
                                "created_at": item.get("created_at")
                            })
                        logger.info(f"Successfully fetched {len(posts)} tweets from Twitter/X API")
                    else:
                        logger.warning(f"Twitter API returned status {resp.status_code}. Falling back to mock data.")
            except Exception as e:
                logger.error(f"Error calling Twitter API: {e}. Falling back.")
        
        # Fall back to mock posts if real fetch failed or was skipped
        if not posts:
            logger.info("Using mock/simulated social media posts for OSINT feeds")
            now_iso = datetime.now(timezone.utc).isoformat()
            for p in MOCK_SOCIAL_POSTS:
                p_copy = p.copy()
                p_copy["created_at"] = now_iso
                posts.append(p_copy)

        return posts

    async def parse(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract locations, geocode them, determine severity, and normalize events."""
        events = []
        
        for post in raw_data:
            text = post["text"]
            
            # 1. Apply NER pipeline to find location mentions
            locations = await extract_locations(text)
            if not locations:
                # If no location matches, skip or assign to regional centroid (Medan)
                # To maintain high precision, we only construct alerts for identifiable locations
                continue

            # 2. Geocode the first resolved location
            lat, lon = "3.5952", "98.6722"  # default Medan centroid
            resolved_loc = locations[0]
            coords = await geocode(resolved_loc)
            if coords:
                lat, lon = str(coords[0]), str(coords[1])
            else:
                # Skip geocoding failure to ensure visual map accuracy
                continue

            # 3. Determine severity based on keyword weight
            text_lower = text.lower()
            severity = "low"
            
            critical_keywords = ["lumpuh total", "jalan putus", "macet total", "darurat", "tsunami"]
            high_keywords = ["banjir", "longsor", "kebakaran", "gempa", "blokade"]
            medium_keywords = ["macet", "antrian", "naik", "langka", "lambat"]

            if any(k in text_lower for k in critical_keywords):
                severity = "critical"
            elif any(k in text_lower for k in high_keywords):
                severity = "high"
            elif any(k in text_lower for k in medium_keywords):
                severity = "medium"

            # 4. Generate dedup key using MD5 of platform + post text
            content_hash = hashlib.md5(f"{post['platform']}:{text}".encode('utf-8')).hexdigest()
            dedup_key = f"social:{post['platform']}:{content_hash[:16]}"
            
            title = f"[{post['platform'].upper()}] {resolved_loc}: {severity.upper()} disruption reported"
            
            events.append({
                "source": self.source_name,
                "event_type": "osint_report",
                "severity": severity,
                "lat": lat,
                "lon": lon,
                "title": title,
                "raw": json.dumps({
                    "platform": post["platform"],
                    "raw_text": text,
                    "author": post["author"],
                    "extracted_location": resolved_loc,
                    "created_at": post["created_at"]
                }),
                "ts": datetime.now(timezone.utc).isoformat(),
                "dedup_key": dedup_key
            })

        return events

    async def health_check(self) -> bool:
        """Social scraper health is always OK (uses mock fallback if API fails)."""
        return True
