"""
PreHub Authentication & RBAC Module
"""
from app.auth.supabase_auth import (
    UserSession,
    get_current_user,
    get_optional_user,
    require_roles,
    create_guest_token,
    decode_and_verify_token,
    ROLE_PERMISSIONS,
    DEFAULT_ROLE_ORGS,
)

__all__ = [
    "UserSession",
    "get_current_user",
    "get_optional_user",
    "require_roles",
    "create_guest_token",
    "decode_and_verify_token",
    "ROLE_PERMISSIONS",
    "DEFAULT_ROLE_ORGS",
]
