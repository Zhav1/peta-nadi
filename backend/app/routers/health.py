from fastapi import APIRouter
from app.config import get_settings

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health")
async def health_check():
    """System health check endpoint."""
    return {
        "status": "ok",
        "version": settings.version,
        "environment": settings.environment,
        "service": "lrip-petanadi-api",
    }
