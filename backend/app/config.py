from typing import Optional
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    app_name: str = "PreHub API"
    version: str = "0.1.0"
    environment: str = "development"
    log_level: str = "INFO"

    # CORS
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000,https://pre-hub.vercel.app,https://peta-nadi.onrender.com"

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = "prehub-dev-jwt-secret-key-32-chars-minimum-length-2026"
    supabase_jwks_key: str = ""

    # M8 / Phase 161 — evaluator persona policy.
    # Anonymous callers may only mint GUEST tokens for demo_sandbox. A caller is
    # an "authenticated evaluator" when their verified company_id is demo_sandbox
    # OR their email is in this comma-separated allowlist.
    m8_evaluator_emails: str = "evaluator@kompetisi-lrip.id"
    # Tenants an evaluator may mint tokens for / switch personas into.
    m8_evaluator_companies: str = "demo_sandbox"

    # Redis
    redis_url: str = "redis://localhost:6379"
    redis_password: str = ""

    # External APIs
    tomtom_api_key: str = ""
    tomtom_api_key_2: str = ""
    tomtom_poll_seconds: int = 1800
    tomtom_incidents_enabled: bool = False
    tomtom_incidents_every_n: int = 6
    aisstream_api_key: str = ""
    nasa_firms_map_key: str = ""
    gemini_api_key: str = ""
    # LTM embeddings (Phase 59 batch C): live ListModels probe 2026-10-17 shows
    # only gemini-embedding-001 / gemini-embedding-2-preview / gemini-embedding-2
    # support embedContent on this key — models/text-embedding-004 404s. Default
    # is gemini-embedding-001 truncated to 768 dims (native 3072) to preserve the
    # vector(768) column contract. Changing model OR dims requires a migration +
    # full re-embed (one-way distribution shift) — see infra/supabase/migrations.
    gemini_embedding_model: str = "models/gemini-embedding-001"
    # Mistral — PRIMARY chat provider (OpenAI-compatible https://api.mistral.ai/v1).
    # The Mistral catalog serves the 1017 snapshot of DeepSeek V4.1 Flash.
    mistral_api_key: str = ""
    mistral_model: str = "deepseek-v4-1-flash-1017"
    # opencode — FALLBACK chat provider.
    opencode_api_key: str = ""
    # Go endpoint model IDs (not interchangeable with the Console catalog).
    # See agents/llm_gateway.py for endpoint details.
    opencode_reasoning_model: str = "mimo-v2.6-pro"
    opencode_driver_model: str = "deepseek-v4.1-flash"
    opencode_reasoning_effort: Optional[str] = None
    # Ordered fallbacks after the requested Go model, before NVIDIA NIM.
    # DeepSeek/GLM Free use Zen (currently quota-limited); Beam/Iceman use Go
    # and returned final answers with usage.cost=0. Availability may change;
    # rerun scripts/verify_opencode_fallbacks.py to verify with the active key.
    # Set OPENCODE_FREE_MODELS="" to disable this ladder.
    opencode_free_models: str = (
        "deepseek-v4.1-flash-free,glm-5.3-flash-free,"
        "beam-free,iceman-contributor-free"
    )
    # Minimum max_tokens for ladder models (reasoning models eat the budget).
    opencode_free_models_min_tokens: int = 1500
    deepseek_api_key: str = ""
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_recipient_number: str = ""
    app_url: str = "http://localhost:3000"

    # Scraping & OSINT
    lightpanda_url: str = ""
    twitter_bearer_token: str = ""

    # Frontend (for reference)
    next_public_mapbox_token: str = ""

    # Demo
    demo_mock_agents: bool = False
    demo_offline: bool = False

    # Background ingestion pollers live in the API lifespan (BMKG, TomTom, news,
    # PIHPS, social, ...). They are single-process by design: run uvicorn with
    # `--workers 1`. On extra replicas set POLLERS_ENABLED=false so those
    # processes only serve HTTP instead of duplicating every poller.
    pollers_enabled: bool = True

    # M8 / Phase 162 — thin web + external tick.
    # Production runs the web process thin (`INPROCESS_BATCH_POLLERS=false`) and
    # drives batch ingestion from `POST /internal/tick` (cron-job.org, every
    # 5 minutes), so boot and user requests never compete with 8 ingestion loops
    # on ~0.1 CPU. Local/dev keeps the in-process loops by default.
    inprocess_batch_pollers: bool = True
    # Shared secret for `POST /internal/tick` (`X-Internal-Token`). Empty disables
    # the endpoint with 404; production sets it as a Render secret (sync:false).
    internal_tick_token: str = ""
    # Per-tick admission: at most this many jobs and this many seconds of work.
    # Remaining due jobs are deferred to the next tick (never dropped).
    tick_max_jobs: int = 3
    tick_budget_seconds: int = 180
    # These are application-side daily reservation caps, not upstream quota claims.
    #
    # Sizing rule: 2-3x the SCHEDULED need (attempts/day = 86400 / cadence from
    # job_scheduler.py), so a retry, a deploy restart or a duplicate tick is an
    # anomaly instead of a day-long outage. The previous values were sized
    # EXACTLY to the cadence with zero slack, which is why
    # private.provider_budget_counters showed bmkg_cap pinned at 288/288 on
    # 2026-11-07/08/09 and tomtom at 48/48 every day: once the cap was hit the
    # source was denied until UTC midnight and the section went stale.
    #
    # Measured max daily usage before the fix: bmkg 254, bmkg_cap 288,
    # tomtom 48 (capped), firms 7, news 155, petabencana 36, bnpb 24, pihps 1.
    # Caps are deliberately NOT sized to a hypothetical worst case: a cap large
    # enough to never bind is not a cap, and 21k BMKG calls/day would get the
    # application rate-limited by a public agency.
    #   bmkg        2 measured units/attempt x 288 scheduled = 576; the adapter
    #               has 3 reserve call sites (feed + 2 hub paths) so worst case
    #               is 864 -> 1200
    #   bmkg_cap    288 measured / 288 scheduled -> 900 (headroom for CAP detail
    #               fetches; the per-attempt fan-out is unmeasured — instrument
    #               it before raising this further)
    #   open_meteo  58 grid locations x 4 (21600s) = 232 -> 500
    #   firms       <=5/attempt x 8 (10800s) = 40 -> 80
    #   tomtom      20 flow checkpoints x 24 (3600s) = 480 -> 1000
    #   petabencana >=1/attempt x 96 (900s) = 96 -> 250
    #   bnpb        >=1/attempt x 24 (3600s) = 24 -> 96
    #   news        1/attempt x 288 (300s) = 288 -> 700
    #   pihps       1/attempt x 1 (86400s) -> 4 (manual reruns)
    #   social      1/attempt x 24 (3600s) = 24 -> 72
    provider_budget_daily_limits: str = (
        "bmkg=1200,bmkg_cap=900,open_meteo=500,firms=80,tomtom=1000,"
        "petabencana=250,bnpb=96,news=700,pihps=4,social=72"
    )
    # Public API reads only the persisted shared projection; no guest fallback fetch.
    pilot_shadow_mode: bool = True
    shared_snapshot_reads_only: bool = True
    # Continuous consumers (AIS WebSocket, validated-alert fan-out) are deferred
    # this long after boot so `/health`, the first login and JWKS pre-warm get
    # the CPU first. 60–90s is the M8 contract; 75 keeps margin under the
    # 90s cron timeout while still starting inside the first keep-alive window.
    continuous_task_delay_seconds: float = 75.0

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def opencode_free_model_list(self) -> list[str]:
        return [m.strip() for m in self.opencode_free_models.split(",") if m.strip()]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
