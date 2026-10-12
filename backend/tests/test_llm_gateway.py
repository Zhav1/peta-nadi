"""Regression tests for the fail-loud LLM gateway contract (Phase 55, S2)."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from agents import llm_gateway
from agents.llm_gateway import LLMGateway, LLMGatewayUnavailable


@pytest.fixture
def unavailable_providers(monkeypatch):
    """Force Gemini unconfigured and NVIDIA NIM keyless."""
    monkeypatch.setattr(llm_gateway.settings, "demo_offline", False)
    monkeypatch.setattr(llm_gateway.settings, "gemini_api_key", "")
    for key in ("nvidia_deepseek_v4_pro", "nvidia_deepseek_v4_flash", "nvidia_cuopt", "nvidia_fourcastnet"):
        monkeypatch.setattr(llm_gateway.settings, key, "")


def test_nim_primary_model_is_catalog_verified():
    """The retired 'deepseek-ai/deepseek-r1' ID must not be used (404 on the account catalog)."""
    assert llm_gateway.PRIMARY_NIM_MODEL == "deepseek-ai/deepseek-v4.1-flash"


@pytest.mark.asyncio
async def test_gateway_raises_when_no_provider_available(unavailable_providers):
    """No usable keys => explicit LLMGatewayUnavailable, never canned prose."""
    with pytest.raises(LLMGatewayUnavailable):
        await LLMGateway.generate_content(prompt="ping")


@pytest.mark.asyncio
async def test_gateway_raises_on_nim_failure(unavailable_providers, monkeypatch):
    """A failed NIM call => explicit LLMGatewayUnavailable, never a fallback briefing string."""
    monkeypatch.setattr(LLMGateway, "get_nvidia_key", staticmethod(lambda: "nvapi-test-key"))

    mock_client = AsyncMock()
    mock_client.post.side_effect = RuntimeError("connection refused")
    mock_client_cls = MagicMock()
    mock_client_cls.return_value.__aenter__.return_value = mock_client
    monkeypatch.setattr(llm_gateway.httpx, "AsyncClient", mock_client_cls)

    with pytest.raises(LLMGatewayUnavailable):
        await LLMGateway.generate_content(prompt="ping")
