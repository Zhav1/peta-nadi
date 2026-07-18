import logging
import httpx
import google.generativeai as genai
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class LLMGateway:
    @staticmethod
    def get_nvidia_key() -> str:
        """Helper to get a valid NVIDIA API Key from configuration."""
        for key in [
            settings.nvidia_deepseek_v4_flash,
            settings.nvidia_deepseek_v4_pro,
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
        falls back to NVIDIA NIM OpenAI-compatible API.
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
                
                # google-generativeai call needs to run in an executor if it blocks,
                # but we can wrap it or call it synchronously inside a thread pool.
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
                logger.warning(f"LLMGateway: Gemini call failed: {e}. Falling back to NVIDIA NIM...")

        # Fallback to NVIDIA NIM
        nvidia_key = cls.get_nvidia_key()
        if not nvidia_key:
            logger.warning("LLMGateway: No API keys found. Returning default fallback response.")
            return "CRISIS EXECUTIVE SUMMARY\nEvent: Flood / Port Congestion\nLocation/Region: North Sumatra\nKey Evidence: Ingested sensors show anomalies.\nRecommended Action: Divert traffic.\nConfidence Assessment: High (mocked fallback)."

        logger.info("LLMGateway: Routing LLM request to NVIDIA NIM...")
        # Llama 3.1 70B is a reliable reasoning model on NIM
        nim_model = "meta/llama-3.1-70b-instruct"
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
            "model": nim_model,
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
                logger.info("LLMGateway: NVIDIA NIM call succeeded.")
                return text
        except Exception as nim_err:
            logger.error(f"LLMGateway Error: NVIDIA NIM call failed: {nim_err}")
            raise RuntimeError(f"LLMGateway failed: NIM fallback also failed. Error: {nim_err}")
