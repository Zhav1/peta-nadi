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

# pgvector contract (infra/supabase/migrations 000_init + 001): ltm_episodes
# .embedding is vector(768). gemini-embedding-001 natively emits 3072 dims, so
# embed_text truncates via output_dimensionality (Matryoshka) — verified live
# 2026-10-17 (default 3072, truncated exactly 768). Width mismatches are dropped
# to [] so a model/dims drift can never write rows pgvector would reject.
EMBEDDING_DIMS = 768


async def embed_text(text: str) -> List[float]:
    """Generates a 768-dimensional vector embedding for the given text using Gemini."""
    settings = get_settings()
    if not settings.gemini_api_key or settings.gemini_api_key == "your-gemini-api-key":
        logger.warning("Gemini API key is not configured. Skipping text embedding.")
        return []

    try:
        genai.configure(api_key=settings.gemini_api_key)
        # Model is configurable (Settings.gemini_embedding_model); only the
        # gemini-embedding family supports output_dimensionality truncation, so
        # pin it there to hold the vector(768) DB contract. Legacy
        # text-embedding-004 already emits 768 natively and rejects the param.
        embed_kwargs: dict = {
            "model": settings.gemini_embedding_model,
            "content": text,
            "task_type": "retrieval_query",
        }
        if settings.gemini_embedding_model.startswith("models/gemini-embedding"):
            embed_kwargs["output_dimensionality"] = EMBEDDING_DIMS
        # Run in executor to prevent blocking the async event loop.
        # 12s bound (Phase 59 D-06 / T-59-04): the embed call must never hang
        # the swarm unbounded — time out to [] like any other embed failure.
        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(genai.embed_content, **embed_kwargs),
                timeout=12.0,
            )
        except asyncio.TimeoutError:
            logger.warning("Gemini embedding timed out after 12s. Returning empty vector.")
            return []
        embedding: List[float] = []
        if isinstance(response, dict) and "embedding" in response:
            embedding = response["embedding"]
        elif hasattr(response, "embedding"):
            embedding = response.embedding
        else:
            logger.error(f"Invalid response format from Gemini embedding API: {response}")
            return []
        if len(embedding) != EMBEDDING_DIMS:
            logger.error(
                f"Embedding width {len(embedding)} != {EMBEDDING_DIMS} "
                f"(model={settings.gemini_embedding_model}). Dropping to protect "
                "the vector(768) column contract."
            )
            return []
        return embedding
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

    # 4. Query Supabase RPC (12s bound — mirror of the embed_text path above:
        # an unbounded to_thread would hang the swarm on a stalled connection)
    try:
        supabase = get_client()
        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    lambda: supabase.rpc(
                        "match_episodes",
                        {
                            "query_embedding": embedding,
                            "match_threshold": 0.6,
                            "match_count": top_k,
                        }
                    ).execute()
                ),
                timeout=12.0,
            )
        except asyncio.TimeoutError:
            logger.warning("Supabase match_episodes RPC timed out after 12s. Returning empty list.")
            return []
        
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
