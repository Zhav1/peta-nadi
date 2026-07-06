"""
Supabase client factory for PetaNadi.
Provides a typed client for all database operations.
"""
import logging
from typing import Optional
from supabase import create_client, Client
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_supabase_client: Optional[Client] = None


def get_client() -> Client:
    """Get or create the Supabase client (singleton)."""
    global _supabase_client
    if _supabase_client is None:
        if not settings.supabase_url or not settings.supabase_anon_key:
            raise RuntimeError(
                "Supabase credentials not configured. "
                "Set SUPABASE_URL and SUPABASE_ANON_KEY in .env"
            )
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_anon_key,
        )
        logger.info(f"Supabase client initialized: {settings.supabase_url}")
    return _supabase_client


def get_service_client() -> Client:
    """
    Get a Supabase client with service role key.
    Use for admin operations that bypass Row Level Security (RLS).
    Never expose this client to the frontend.
    """
    if not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY not configured")
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
