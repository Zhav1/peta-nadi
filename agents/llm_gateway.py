import logging
from typing import Optional
import httpx
import google.generativeai as genai
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

PRIMARY_NIM_MODEL = "deepseek-ai/deepseek-v4.1-flash"
NVIDIA_NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

# Phase 58 (D-02/R1): single base-URL constant for opencode-go inference.
# Alternate documented form https://opencode.ai/inference/openai/v1/chat/completions
# is NOT used — one constant only so a wrong form 404s fail-loud.
OPENCODE_BASE_URL = "https://opencode.ai/inference/v1"
OPENCODE_CHAT_COMPLETIONS_PATH = "/chat/completions"


class LLMGatewayUnavailable(RuntimeError):
    """Raised when no LLM provider (Gemini or NVIDIA NIM) can produce a real completion."""


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
        Gemini, then NVIDIA NIM DeepSeek. Raises LLMGatewayUnavailable when no
        provider succeeds; never returns canned prose.
        Per-branch defaults (not one global default): opencode branch defaults to
        settings.opencode_driver_model, Gemini branch to settings.gemini_model,
        NIM branch to PRIMARY_NIM_MODEL. Callers override explicitly via model_name.
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
                "Content-Type": "application/json"
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

        model_name = model_name or settings.gemini_model

        gemini_available = (
            settings.gemini_api_key 
            and settings.gemini_api_key != "your-gemini-api-key"
            and settings.gemini_api_key.strip() != ""
        )

        if gemini_available:
            try:
                logger.info(f"LLMGateway: Attempting Gemini call ({model_name})...")
                genai.configure(api_key=settings.gemini_api_key)
                
                import asyncio
                
                model = genai.GenerativeModel(
                    model_name=model_name,
                    system_instruction=system_instruction
                )
                
                # Run synchronous generation in executor
                response = await asyncio.to_thread(
                    model.generate_content, 
                    prompt,
                    generation_config={"temperature": temperature}
                )
                text = response.text.strip()
                if text:
                    logger.info("LLMGateway: Gemini call succeeded.")
                    return text
                logger.warning("LLMGateway: Gemini returned an empty response. Falling back to NVIDIA NIM.")
            except Exception as e:
                logger.warning(f"LLMGateway: Gemini call failed: {e}. Falling back to NVIDIA NIM ({PRIMARY_NIM_MODEL})...")

        # Fallback to NVIDIA NIM (DeepSeek V4.1 Flash)
        nvidia_key = cls.get_nvidia_key()
        if not nvidia_key:
            logger.error("LLMGateway: No usable API keys found (Gemini unconfigured/failed and NVIDIA NIM key missing).")
            raise LLMGatewayUnavailable(
                "No usable LLM API keys configured: Gemini is unconfigured or failed and no NVIDIA NIM key is available."
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
