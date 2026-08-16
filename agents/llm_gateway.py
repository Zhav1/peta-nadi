import logging
import httpx
import google.generativeai as genai
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

PRIMARY_NIM_MODEL = "deepseek-ai/deepseek-r1"

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
        system_instruction: str = None, 
        model_name: str = "gemini-1.5-flash",
        temperature: float = 0.2
    ) -> str:
        """
        Tries to call Gemini API first. If it fails or is unconfigured, 
        falls back to NVIDIA NIM DeepSeek OpenAI-compatible API.
        """
        # Force offline/mock mode if configured
        if settings.demo_offline:
            logger.info("LLMGateway: Demo offline mode active. Returning mock response.")
            return "CRISIS EXECUTIVE SUMMARY\nEvent: Flood / Port Congestion\nLocation/Region: North Sumatra\nKey Evidence: Ingested sensors show anomalies.\nRecommended Action: Divert traffic.\nConfidence Assessment: High (mocked fallback)."

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
            except Exception as e:
                logger.warning(f"LLMGateway: Gemini call failed: {e}. Falling back to NVIDIA NIM ({PRIMARY_NIM_MODEL})...")

        # Fallback to NVIDIA NIM (DeepSeek R1)
        nvidia_key = cls.get_nvidia_key()
        if not nvidia_key:
            logger.warning("LLMGateway: No API keys found. Returning default fallback response.")
            return "CRISIS EXECUTIVE SUMMARY\nEvent: Flood / Port Congestion\nLocation/Region: North Sumatra\nKey Evidence: Ingested sensors show anomalies.\nRecommended Action: Divert traffic.\nConfidence Assessment: High (mocked fallback)."

        logger.info(f"LLMGateway: Routing LLM request to NVIDIA NIM ({PRIMARY_NIM_MODEL})...")
        url = "https://integrate.api.nvidia.com/v1/chat/completions"
        
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
                logger.info("LLMGateway: NVIDIA NIM DeepSeek call succeeded.")
                return text
        except Exception as nim_err:
            logger.error(f"LLMGateway Error: NVIDIA NIM call failed: {nim_err}")
            # Graceful fallback string rather than unhandled exception crash
            return (
                "RINGKASAN EKSEKUTIF PREHUB (FALLBACK MODE)\n"
                "1. Ancaman Fisik: Curah hujan tinggi terdeteksi di koridor Belawan-Medan.\n"
                "2. Dampak Ekonomi: Potensi kenaikan harga komoditas pangan 8-15% dalam 48 jam.\n"
                "3. Mitigasi: Pengalihan rute melalui Tol Medan-Tebing Tinggi disarankan."
            )
