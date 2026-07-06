from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "PetaNadi / LRIP API"
    version: str = "0.1.0"
    environment: str = "development"
    log_level: str = "INFO"

    # CORS
    cors_origins: str = "http://localhost:3000"

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379"
    redis_password: str = ""

    # External APIs
    tomtom_api_key: str = ""
    aisstream_api_key: str = ""
    nasa_firms_map_key: str = ""
    gemini_api_key: str = ""
    deepseek_api_key: str = ""
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""

    # Frontend (for reference)
    next_public_mapbox_token: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
