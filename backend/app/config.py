from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "PreHub API"
    version: str = "0.1.0"
    environment: str = "development"
    log_level: str = "INFO"

    # CORS
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000"

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = "prehub-dev-jwt-secret-key-32-chars-minimum-length-2026"
    supabase_jwks_key: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379"
    redis_password: str = ""

    # External APIs
    tomtom_api_key: str = ""
    aisstream_api_key: str = ""
    nasa_firms_map_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    opencode_api_key: str = ""
    # opencode Go subscription model IDs (https://opencode.ai/docs/go). The
    # `mimo-v2.6-flash-free` *-free variant is IDE-only and 403s on third-party
    # /chat/completions calls; mimo-v2.6-pro is the Go plan reasoning model
    # ($0.435/$0.87 per 1M, $15/mo allowance — step-up from flash, still cheap).
    # See the long comment block in
    # agents/llm_gateway.py before changing any of these — endpoint ↔ ID must
    # match (Console vs Go have separate catalogs).
    opencode_reasoning_model: str = "mimo-v2.6-pro"
    opencode_driver_model: str = "deepseek-v4.1-flash"
    deepseek_api_key: str = ""
    nvidia_deepseek_v4_pro: str = ""
    nvidia_deepseek_v4_flash: str = ""
    nvidia_fourcastnet: str = ""
    nvidia_cuopt: str = ""
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_recipient_number: str = ""
    app_url: str = "http://localhost:3000"

    # Frontend (for reference)
    next_public_mapbox_token: str = ""

    # Demo
    demo_mock_agents: bool = False
    demo_offline: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
