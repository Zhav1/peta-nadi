import json
import logging
import hashlib
import asyncio
from typing import List, Optional
import google.generativeai as genai
from app.config import get_settings
from app.db.supabase_client import get_client
from agents.memory.stm import get_async_redis
from agents.state import LTMEpisode

logger = logging.getLogger(__name__)
settings = get_settings()


async def embed_text(text: str) -> List[float]:
    """Generates a 768-dimensional vector embedding for the given text using Gemini."""
    settings = get_settings()
    if not settings.gemini_api_key or settings.gemini_api_key == "your-gemini-api-key":
        logger.warning("Gemini API key is not configured. Skipping text embedding.")
        return []

    try:
        genai.configure(api_key=settings.gemini_api_key)
        # Run in executor to prevent blocking the async event loop
        response = await asyncio.to_thread(
            genai.embed_content,
            model="models/text-embedding-004",
            content=text,
            task_type="retrieval_query",
        )
        if isinstance(response, dict) and "embedding" in response:
            return response["embedding"]
        elif hasattr(response, "embedding"):
            return response.embedding
        logger.error(f"Invalid response format from Gemini embedding API: {response}")
        return []
    except Exception as e:
        logger.error(f"Failed to generate embedding: {e}")
        return []


async def query_ltm(query_text: str, top_k: int = 5) -> List[LTMEpisode]:
    """Queries pgvector LTM via Supabase RPC after generating query embedding."""
    # 1. Generate query hash for Redis caching
    query_hash = hashlib.sha256(query_text.encode()).hexdigest()
    
    # 2. Try loading from Redis cache
    cached = await load_ltm_cached(query_hash)
    if cached is not None:
        logger.debug(f"LTM cache hit for: '{query_text[:30]}...'")
        return cached

    # 3. Generate embedding
    embedding = await embed_text(query_text)
    if not embedding:
        logger.warning("Empty embedding returned. LTM query returning empty list.")
        return []

    # 4. Query Supabase RPC
    try:
        supabase = get_client()
        response = await asyncio.to_thread(
            lambda: supabase.rpc(
                "match_episodes",
                {
                    "query_embedding": embedding,
                    "match_threshold": 0.6,
                    "match_count": top_k,
                }
            ).execute()
        )
        
        raw_results = response.data or []
        results: List[LTMEpisode] = []
        
        for row in raw_results:
            results.append({
                "episode_id": str(row.get("episode_id", "")),
                "title": str(row.get("title", "")),
                "description": str(row.get("description", "")),
                "crisis_type": str(row.get("crisis_type", "")),
                "inflation_multiplier": float(row.get("inflation_multiplier", 1.0)),
                "recovery_days": int(row.get("recovery_days", 0)),
                "similarity_score": float(row.get("similarity", 0.0))
            })
            
        # 5. Cache result
        await cache_ltm_result(query_hash, results)
        return results

    except Exception as e:
        logger.error(f"Failed to query Supabase LTM: {e}")
        return []


async def cache_ltm_result(query_hash: str, results: List[LTMEpisode], ttl: int = 3600):
    """Caches LTM query results in Redis."""
    r = get_async_redis()
    key = f"lrip:ltm:cache:{query_hash}"
    try:
        await r.set(key, json.dumps(results), ex=ttl)
    except Exception as e:
        logger.error(f"Failed to cache LTM results: {e}")


async def load_ltm_cached(query_hash: str) -> Optional[List[LTMEpisode]]:
    """Loads cached LTM results from Redis."""
    r = get_async_redis()
    key = f"lrip:ltm:cache:{query_hash}"
    try:
        data = await r.get(key)
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error(f"Failed to load cached LTM results: {e}")
    return None
