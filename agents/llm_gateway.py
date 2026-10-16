import logging
from typing import Optional
import httpx
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

PRIMARY_NIM_MODEL = "deepseek-ai/deepseek-v4.1-flash"
NVIDIA_NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

# Phase 58 (D-02/R1): single base-URL constant for opencode-go inference.
#
# ===========================================================================
# READ ME — opencode endpoint + model ID traps (don't undo this)
# ===========================================================================
# There are TWO inference surfaces and they take DIFFERENT model IDs:
#
#   1. opencode Console  https://opencode.ai/inference/openai/v1
#      Pay-as-you-go. Requires a positive Console balance (NOT Go plan credits).
#      Lists ~88 models including *-free promos. Keys created from a Service
#      Account in the Console dashboard (oc_sk_*) live here.
#
#   2. opencode Go       https://opencode.ai/inference/go/openai/v1   <-- THIS
#      $10/mo (or Go Plus $40/mo) subscription. 37 curated models only.
#      Subscribed workspace's API key (same oc_sk_* form) also works here.
#      Go's monthly usage limits reset; you don't need Console credits.
#      Doc: https://opencode.ai/docs/go  →  "Endpoints" table.
#
# FOOTGUNS (already paid for, please don't repeat):
#
#   * The "*‑free" IDs (mimo-v2.6-flash-free, nemotron-3-ultra-free, etc.) are
#     advertised in BOTH catalogs but the inference server returns
#     403 FreeTierError  "OpenCode's free tier can only be used from within
#     OpenCode"  for any non-OO client, even with a valid Service-Account key.
#     The free quota is gated to the OpenCode IDE / TUI. Don't try to use them
#     here. Use the Go plan form: mimo-v2.6-flash (not -free).
#
#   * Sending a Go model ID (e.g. mimo-v2.6-flash) to the Console endpoint
#     /inference/openai/v1 returns 400 "Model is unavailable."  Sending a
#     Console ID (e.g. minimax-m3) to the Go endpoint returns 400 too — the
#     catalogs are not interchangeable. Always match endpoint ↔ Go-form ID.
#
#   * The catalog endpoint is /inference/go/v1/models  (NOT
#     /inference/go/openai/v1/models, which 404s). scripts/verify_opencode_models.py
#     encodes this.
#
#   * opencode Go also requires the x-opencode-session header for prompt caching
#     and routing (per https://opencode.ai/docs/go "Where can I use it?").
#     Without it requests still succeed today but get throttled / lose caching.
#
# If you need to switch surfaces: change OPENCODE_BASE_URL AND the model
# defaults in backend/app/config.py together. Don't change one without the
# other — that's how we got the original 402 / 403 in the first place.
# ===========================================================================
OPENCODE_BASE_URL = "https://opencode.ai/inference/go/openai/v1"
OPENCODE_CHAT_COMPLETIONS_PATH = "/chat/completions"

# Honest client identity: Cloudflare 1010-bans default python-httpx/urllib
# User-Agents, which surfaces as a misleading 403. Same header everywhere
# we call opencode (gateway + verify script must match).
OPENCODE_USER_AGENT = "PreHub-LLMGateway/1.0 (+https://github.com/Zhav1/peta-nadi)"


class LLMGatewayUnavailable(RuntimeError):
    """Raised when no LLM provider (opencode-go or NVIDIA NIM) can produce a real completion."""


class LLMGateway:
    @staticmethod
    def get_nvidia_key() -> str:
        """Helper to get a valid NVIDIA API Key from configuration, prioritizing DeepSeek Pro."""
        for key in [
            settings.nvidia_deepseek_v4_pro,
            settings.nvidia_deepseek_v4_flash,
            settings.nvidia_cuopt,
            settings.nvidia_fourcastnet
        ]:
            if key and not key.startswith("your-") and key != "":
                return key
        return ""

    @classmethod
    async def generate_content(
        cls, 
        prompt: str, 
        system_instruction: Optional[str] = None, 
        model_name: Optional[str] = None,
        temperature: float = 0.2
    ) -> str:
        """
        Tries opencode-go first (D-03 opencode-first, fail-loud). Falls back to
        NVIDIA NIM DeepSeek only when the opencode branch is unreachable
        (missing key). Raises LLMGatewayUnavailable when no provider
        succeeds; never returns canned prose.
        Gemini serves embeddings only (agents/memory/ltm.py) and is never
        consulted for chat — GEMINI_API_KEY must not scope to completions.
        Per-branch defaults (not one global default): opencode branch defaults
        to settings.opencode_driver_model, NIM branch to PRIMARY_NIM_MODEL.
        Callers override explicitly via model_name for the opencode branch
        only.
        """
        # Force offline/mock mode if configured (production must run DEMO_OFFLINE=false)
        if settings.demo_offline:
            logger.warning("LLMGateway: Demo offline mode active (DEMO_OFFLINE=true; production must be false). Returning mock response.")
            return "CRISIS EXECUTIVE SUMMARY\nEvent: Flood / Port Congestion\nLocation/Region: North Sumatra\nKey Evidence: Ingested sensors show anomalies.\nRecommended Action: Divert traffic.\nConfidence Assessment: High (mocked fallback)."

        # --- Phase 58 branch 1: opencode-go (first priority) ---
        opencode_available = (
            settings.opencode_api_key
            and not settings.opencode_api_key.startswith("your-")
            and settings.opencode_api_key.strip() != ""
        )
        if opencode_available:
            opencode_model = model_name or settings.opencode_driver_model
            url = f"{OPENCODE_BASE_URL}{OPENCODE_CHAT_COMPLETIONS_PATH}"
            headers = {
                "Authorization": f"Bearer {settings.opencode_api_key}",
                "Content-Type": "application/json",
                "User-Agent": OPENCODE_USER_AGENT,
                # Required by opencode Go for prompt caching + routing
                # (https://opencode.ai/docs/go "Where can I use it?"). Third-party
                # clients without a stable session id get throttled or rejected.
                "x-opencode-session": "prehub-backend",
            }
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            payload = {
                "model": opencode_model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": 1024
            }
            try:
                logger.info(f"LLMGateway: Attempting opencode call ({opencode_model})...")
                async with httpx.AsyncClient() as client:
                    response = await client.post(url, headers=headers, json=payload, timeout=30.0)
                    response.raise_for_status()
                    res_data = response.json()
                    text = res_data["choices"][0]["message"]["content"].strip()
                    if not text:
                        raise ValueError("opencode returned an empty completion")
                    logger.info("LLMGateway: opencode call succeeded.")
                    return text
            except Exception as oc_err:
                logger.error(f"LLMGateway: opencode call failed ({opencode_model}): {oc_err}", exc_info=True)
                raise LLMGatewayUnavailable(f"opencode call failed ({opencode_model}): {oc_err}") from oc_err

        # --- Phase 59: Gemini chat removed (embeddings-only lock). GEMINI_API_KEY
        # serves agents/memory/ltm.py embed_content only and is never read here.
        # Fallback to NVIDIA NIM (DeepSeek V4.1 Flash)
        nvidia_key = cls.get_nvidia_key()
        if not nvidia_key:
            logger.error("LLMGateway: No usable API keys found (opencode call unreachable and NVIDIA NIM key missing).")
            raise LLMGatewayUnavailable(
                "No usable LLM API keys configured: opencode is unconfigured or failed and no NVIDIA NIM key is available."
            )

        logger.info(f"LLMGateway: Routing LLM request to NVIDIA NIM ({PRIMARY_NIM_MODEL})...")
        url = NVIDIA_NIM_URL
        
        headers = {
            "Authorization": f"Bearer {nvidia_key}",
            "Content-Type": "application/json"
        }
        
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})
        
        payload = {
            "model": PRIMARY_NIM_MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 1024
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, json=payload, timeout=30.0)
                response.raise_for_status()
                res_data = response.json()
                text = res_data["choices"][0]["message"]["content"].strip()
                if not text:
                    raise ValueError("NVIDIA NIM returned an empty completion")
                logger.info("LLMGateway: NVIDIA NIM DeepSeek call succeeded.")
                return text
        except Exception as nim_err:
            logger.error(f"LLMGateway: NVIDIA NIM call failed ({PRIMARY_NIM_MODEL}): {nim_err}", exc_info=True)
            raise LLMGatewayUnavailable(f"NVIDIA NIM call failed ({PRIMARY_NIM_MODEL}): {nim_err}") from nim_err
