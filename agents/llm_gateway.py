import logging
import asyncio
import re
from typing import Optional
import httpx
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

PRIMARY_NIM_MODEL = "deepseek-ai/deepseek-v4.1-flash"
NVIDIA_NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

# Go serves paid models and Beam/Iceman; Zen serves the other free models.
#
# ===========================================================================
# READ ME — opencode endpoint + model ID traps (don't undo this)
# ===========================================================================
# There are TWO inference surfaces and they take DIFFERENT model IDs:
#
#   1. opencode Console  https://opencode.ai/inference/openai/v1
#      Pay-as-you-go. Requires a positive Console balance (NOT Go plan credits).
#      Keys created from a Service Account in the Console dashboard (oc_sk_*)
#      live here.
#
#   2. opencode Go       https://opencode.ai/inference/go/openai/v1   <-- THIS
#      $10/mo (or Go Plus $40/mo) subscription. Curated Go models only.
#      Subscribed workspace's API key (same oc_sk_* form) also works here.
#      Go's monthly/weekly usage limits reset; you don't need Console credits.
#      Doc: https://opencode.ai/docs/go  →  "Endpoints" table.
#
# FOOTGUNS (paid for, mostly obsolete but read them before touching this):
#
#   * UPDATED 2026-10-29 (Phase 60 free-tier ladder): the Go surface NOW
#     legitimately serves free model IDs. Live probe shows `beam-free` and
#     `iceman-contributor-free` in the Go catalog returning HTTP 200 from
#     third-party API clients with billing cost 0 and bypassing the Go weekly
#     usage limit (they are not metered against limitName=weekly). The
#     Zen catalog also exposes deepseek-v4.1-flash-free and glm-5.3-flash-free.
#     These require /zen/v1, not Go. Live probes currently return 429
#     FreeUsageLimitError; keep them ahead of Beam/Iceman as requested and
#     fall through immediately when their quota is unavailable.
#
#   * The two Go -free models are REASONING models. iceman-contributor-free
#     burned 704 reasoning tokens before producing a 199-char answer, and
#     with max_tokens=300 it returns finish_reason=length with empty
#     content. Always serve the ladder with a raised max_tokens budget
#     (settings.opencode_free_models_min_tokens, default 1500).
#
#   * Sending a Go model ID (e.g. mimo-v2.6-flash) to the Console endpoint
#     /inference/openai/v1 returns 400 "Model is unavailable."  Sending a
#     Console ID (e.g. minimax-m3) to the Go endpoint returns 400 too — the
#     catalogs are not interchangeable. Always match endpoint ↔ Go-form ID.
#     (Catalog probe 2026-10-29: the Console /models endpoint now 404s; the
#     Go catalog at /inference/go/v1/models returns 28 models.)
#
#   * The catalog endpoint is /inference/go/v1/models  (NOT
#     /inference/go/openai/v1/models, which 404s). scripts/verify_opencode_models.py
#     encodes this.
#
#   * opencode Go also requires the x-opencode-session header for prompt caching
#     and routing (per https://opencode.ai/docs/go "Where can I use it?").
#     Without it requests still succeed today but get throttled / lose caching.
#
# Keep endpoint routing in opencode_base_url() aligned with the catalogs.
# Adding a Zen-only ID to the Go endpoint produces "Model is unavailable".
# ===========================================================================
OPENCODE_BASE_URL = "https://opencode.ai/inference/go/openai/v1"
OPENCODE_ZEN_BASE_URL = "https://opencode.ai/zen/v1"
OPENCODE_ZEN_FREE_MODELS = frozenset({
    "deepseek-v4.1-flash-free",
    "glm-5.3-flash-free",
})
OPENCODE_CHAT_COMPLETIONS_PATH = "/chat/completions"


def opencode_base_url(model_id: str) -> str:
    """Match model IDs to their actual inference catalog, including direct calls."""
    return OPENCODE_ZEN_BASE_URL if model_id in OPENCODE_ZEN_FREE_MODELS else OPENCODE_BASE_URL

# Honest client identity: Cloudflare 1010-bans default python-httpx/urllib
# User-Agents, which surfaces as a misleading 403. Same header everywhere
# we call opencode (gateway + verify script must match).
OPENCODE_USER_AGENT = "PreHub-LLMGateway/1.0 (+https://github.com/Zhav1/peta-nadi)"


def strip_thinking_tags(text: str) -> str:
    """Strips <think>...</think> and unclosed <think>... tags from LLM responses (DeepSeek-R1 CoT)."""
    if not text or not isinstance(text, str):
        return ""
    # Strip closed think tags
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Strip unclosed think tag at the beginning if generated
    cleaned = re.sub(r'^<think>.*', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
    return cleaned.strip()


class LLMGatewayUnavailable(RuntimeError):
    """Raised when no LLM provider (opencode-go or NVIDIA NIM) can produce a real completion."""


class LLMGateway:
    @staticmethod
    def get_nvidia_key() -> str:
        """Helper to get a valid NVIDIA API Key from configuration, prioritizing DeepSeek Pro."""
        for key in [
            settings.nvidia_deepseek_v4_pro,
            settings.nvidia_deepseek_v4_flash
        ]:
            if key and not key.startswith("your-") and key != "":
                return key
        return ""

    @classmethod
    async def _opencode_attempt(
        cls,
        model_id: str,
        headers: dict,
        messages: list,
        temperature: float,
        max_tokens: int,
        reasoning_effort: Optional[str],
        max_retries: int = 2,
    ) -> str:
        """One opencode model attempt: HTTP with the Phase 58 retry semantics.

        Retries network/timeout errors and transient 502/503/504 with
        exponential backoff; every other failure (401/403/404/429, empty
        content, malformed response) fails the model instantly. Raises
        LLMGatewayUnavailable on any final failure — never canned prose.
        """
        url = f"{opencode_base_url(model_id)}{OPENCODE_CHAT_COMPLETIONS_PATH}"
        payload = {
            "model": model_id,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if reasoning_effort:
            payload["reasoning_effort"] = reasoning_effort

        for attempt in range(max_retries + 1):
            try:
                logger.info(f"LLMGateway: Attempting opencode call ({model_id}), attempt {attempt + 1}/{max_retries + 1}...")
                async with httpx.AsyncClient() as client:
                    response = await client.post(url, headers=headers, json=payload, timeout=30.0)
                    response.raise_for_status()
                    res_data = response.json()
                    choice = res_data["choices"][0]
                    if choice.get("finish_reason") == "length":
                        raise ValueError("opencode completion exhausted its token budget")
                    # Reasoning is not a final answer; downstream callers may
                    # require strict JSON or a single severity classification.
                    text = strip_thinking_tags(choice["message"].get("content") or "")
                    if not text:
                        raise ValueError("opencode returned an empty final completion")
                    logger.info("LLMGateway: opencode call succeeded (%s).", model_id)
                    return text
            except (httpx.TimeoutException, httpx.NetworkError) as net_err:
                if attempt < max_retries:
                    backoff = 1.0 * (2 ** attempt)
                    logger.warning(
                        f"LLMGateway: opencode network/timeout error ({type(net_err).__name__}: {net_err}). "
                        f"Retrying in {backoff:.1f}s (attempt {attempt + 1}/{max_retries + 1})..."
                    )
                    await asyncio.sleep(backoff)
                    continue
                logger.error(f"LLMGateway: opencode call failed after {max_retries + 1} attempts ({model_id}): {net_err}", exc_info=True)
                raise LLMGatewayUnavailable(f"opencode call failed ({model_id}): {net_err}") from net_err
            except httpx.HTTPStatusError as http_err:
                if http_err.response.status_code in (502, 503, 504) and attempt < max_retries:
                    backoff = 1.0 * (2 ** attempt)
                    logger.warning(
                        f"LLMGateway: opencode HTTP {http_err.response.status_code} error. "
                        f"Retrying in {backoff:.1f}s (attempt {attempt + 1}/{max_retries + 1})..."
                    )
                    await asyncio.sleep(backoff)
                    continue
                logger.error(f"LLMGateway: opencode call failed ({model_id}): {http_err}", exc_info=True)
                raise LLMGatewayUnavailable(f"opencode call failed ({model_id}): {http_err}") from http_err
            except Exception as oc_err:
                logger.error(f"LLMGateway: opencode call failed ({model_id}): {oc_err}", exc_info=True)
                raise LLMGatewayUnavailable(f"opencode call failed ({model_id}): {oc_err}") from oc_err

    @classmethod
    async def generate_content(
        cls, 
        prompt: str, 
        system_instruction: Optional[str] = None, 
        model_name: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
        reasoning_effort: Optional[str] = None
    ) -> str:
        """
        opencode-first, fail-loud, with a free-model ladder (Phase 60).

        Ladder: the caller's model (or the configured Go driver) first, then
        the configured free ladder (DeepSeek Free → GLM Free → Beam →
        Iceman), then NVIDIA NIM DeepSeek as the last network fallback.
        Zen-only free models use their own endpoint. Each model failure —
        including GoUsageLimitError and FreeUsageLimitError — drops to the
        next rung without retrying quota errors.
        Free-ladder models are reasoning models, so their max_tokens budget
        is raised to settings.opencode_free_models_min_tokens.

        Raises LLMGatewayUnavailable when every rung fails; never returns
        canned prose. Gemini serves embeddings only (agents/memory/ltm.py)
        and is never consulted for chat.
        """
        # Force offline/mock mode if configured (production must run DEMO_OFFLINE=false)
        if settings.demo_offline:
            logger.warning("LLMGateway: Demo offline mode active (DEMO_OFFLINE=true; production must be false). Returning mock response.")
            return "CRISIS EXECUTIVE SUMMARY\nEvent: Flood / Port Congestion\nLocation/Region: North Sumatra\nKey Evidence: Ingested sensors show anomalies.\nRecommended Action: Divert traffic.\nConfidence Assessment: High (mocked fallback)."

        max_retries = 2

        # --- Phase 58 branch 1: opencode-go (first priority) ---
        opencode_available = (
            settings.opencode_api_key
            and not settings.opencode_api_key.startswith("your-")
            and settings.opencode_api_key.strip() != ""
        )
        last_model_error: Optional[LLMGatewayUnavailable] = None
        if opencode_available:
            driver = model_name or settings.opencode_driver_model
            free_models = settings.opencode_free_model_list
            ladder = list(dict.fromkeys([driver, *free_models]))
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
            eff = reasoning_effort if reasoning_effort is not None else getattr(settings, "opencode_reasoning_effort", None)

            for opencode_model in ladder:
                # Free ladder rungs are reasoning models: give them a token
                # budget that survives internal reasoning (iceman spent 704
                # reasoning tokens before its answer).
                if opencode_model in free_models:
                    eff_tokens = max(max_tokens, settings.opencode_free_models_min_tokens)
                else:
                    eff_tokens = max_tokens
                try:
                    return await cls._opencode_attempt(
                        model_id=opencode_model,
                        headers=headers,
                        messages=messages,
                        temperature=temperature,
                        max_tokens=eff_tokens,
                        reasoning_effort=eff,
                        max_retries=max_retries,
                    )
                except LLMGatewayUnavailable as ladder_err:
                    last_model_error = ladder_err
                    logger.warning(
                        f"LLMGateway: rung failed ({opencode_model}); dropping to next rung ({ladder_err})"
                    )
                    continue

        # --- Phase 59: Gemini chat removed (embeddings-only lock). GEMINI_API_KEY
        # serves agents/memory/ltm.py embed_content only and is never read here.
        # Fallback to NVIDIA NIM (DeepSeek V4.1 Flash)
        nvidia_key = cls.get_nvidia_key()
        if not nvidia_key:
            logger.error("LLMGateway: No usable API keys or ladder rungs found (all opencode rungs failed and NVIDIA NIM key missing).")
            raise LLMGatewayUnavailable(
                "No LLM provider succeeded: OpenCode models failed or its key is missing, "
                "and no NVIDIA NIM key is available."
            ) from last_model_error

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
            "max_tokens": max_tokens
        }
        
        for attempt in range(max_retries + 1):
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(url, headers=headers, json=payload, timeout=30.0)
                    response.raise_for_status()
                    res_data = response.json()
                    message = res_data["choices"][0]["message"]
                    text = (message.get("content") or "").strip()
                    if not text and message.get("reasoning_content"):
                        text = message["reasoning_content"].strip()
                    if not text:
                        raise ValueError("NVIDIA NIM returned an empty completion")
                    logger.info("LLMGateway: NVIDIA NIM DeepSeek call succeeded.")
                    return strip_thinking_tags(text)
            except (httpx.TimeoutException, httpx.NetworkError) as net_err:
                if attempt < max_retries:
                    backoff = 1.0 * (2 ** attempt)
                    logger.warning(
                        f"LLMGateway: NVIDIA NIM network/timeout error ({type(net_err).__name__}: {net_err}). "
                        f"Retrying in {backoff:.1f}s (attempt {attempt + 1}/{max_retries + 1})..."
                    )
                    await asyncio.sleep(backoff)
                    continue
                logger.error(f"LLMGateway: NVIDIA NIM call failed after {max_retries + 1} attempts ({PRIMARY_NIM_MODEL}): {net_err}", exc_info=True)
                raise LLMGatewayUnavailable(f"NVIDIA NIM call failed ({PRIMARY_NIM_MODEL}): {net_err}") from net_err
            except httpx.HTTPStatusError as http_err:
                if http_err.response.status_code in (502, 503, 504) and attempt < max_retries:
                    backoff = 1.0 * (2 ** attempt)
                    logger.warning(
                        f"LLMGateway: NVIDIA NIM HTTP {http_err.response.status_code} error. "
                        f"Retrying in {backoff:.1f}s (attempt {attempt + 1}/{max_retries + 1})..."
                    )
                    await asyncio.sleep(backoff)
                    continue
                logger.error(f"LLMGateway: NVIDIA NIM call failed ({PRIMARY_NIM_MODEL}): {http_err}", exc_info=True)
                raise LLMGatewayUnavailable(f"NVIDIA NIM call failed ({PRIMARY_NIM_MODEL}): {http_err}") from http_err
            except Exception as nim_err:
                logger.error(f"LLMGateway: NVIDIA NIM call failed ({PRIMARY_NIM_MODEL}): {nim_err}", exc_info=True)
                raise LLMGatewayUnavailable(f"NVIDIA NIM call failed ({PRIMARY_NIM_MODEL}): {nim_err}") from nim_err
