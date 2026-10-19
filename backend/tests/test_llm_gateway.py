"""Regression tests for the fail-loud LLM gateway contract (Phase 55, S2; Phase 58 opencode)."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from agents import llm_gateway
from agents.llm_gateway import LLMGateway, LLMGatewayUnavailable


@pytest.fixture
def unavailable_providers(monkeypatch):
    """Force all chat providers unconfigured: opencode + NVIDIA NIM keyless (embedding key irrelevant to chat)."""
    monkeypatch.setattr(llm_gateway.settings, "demo_offline", False)
    monkeypatch.setattr(llm_gateway.settings, "opencode_api_key", "")
    monkeypatch.setattr(llm_gateway.settings, "gemini_api_key", "")
    for key in ("nvidia_deepseek_v4_pro", "nvidia_deepseek_v4_flash"):
        monkeypatch.setattr(llm_gateway.settings, key, "")


@pytest.fixture
def opencode_keyed(monkeypatch):
    """Route generate_content into the opencode branch with all other providers off."""
    monkeypatch.setattr(llm_gateway.settings, "demo_offline", False)
    monkeypatch.setattr(llm_gateway.settings, "opencode_api_key", "oc-test-key")
    monkeypatch.setattr(llm_gateway.settings, "gemini_api_key", "")
    for key in ("nvidia_deepseek_v4_pro", "nvidia_deepseek_v4_flash"):
        monkeypatch.setattr(llm_gateway.settings, key, "")


def _mock_httpx_client(monkeypatch, *, status=200, payload=None, exc=None):
    """Install a fake httpx.AsyncClient returning one canned HTTP response."""
    mock_client = AsyncMock()
    if exc is not None:
        mock_client.post.side_effect = exc
    else:
        mock_resp = MagicMock()
        mock_resp.json.return_value = payload
        if status >= 400:
            import httpx as _httpx
            mock_resp.raise_for_status.side_effect = _httpx.HTTPStatusError(
                f"HTTP {status}", request=MagicMock(), response=MagicMock()
            )
        else:
            mock_resp.raise_for_status.return_value = None
        mock_client.post.return_value = mock_resp
    mock_client_cls = MagicMock()
    mock_client_cls.return_value.__aenter__.return_value = mock_client
    monkeypatch.setattr(llm_gateway.httpx, "AsyncClient", mock_client_cls)
    return mock_client


def _opencode_payload(text):
    return {"choices": [{"message": {"content": text}}]}


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


@pytest.mark.asyncio
async def test_opencode_branch_returns_stripped_text(opencode_keyed, monkeypatch):
    """opencode 200 with choices[0].message.content => stripped text returned."""
    _mock_httpx_client(monkeypatch, payload=_opencode_payload("  banjir Belawan siaga  "))
    text = await LLMGateway.generate_content(prompt="klasifikasikan severitas")
    assert text == "banjir Belawan siaga"


@pytest.mark.asyncio
async def test_opencode_branch_raises_on_401(opencode_keyed, monkeypatch):
    """opencode 401 => LLMGatewayUnavailable, never canned prose."""
    _mock_httpx_client(monkeypatch, status=401, payload={"error": "unauthorized"})
    with pytest.raises(LLMGatewayUnavailable):
        await LLMGateway.generate_content(prompt="ping")


@pytest.mark.asyncio
async def test_opencode_branch_raises_on_404(opencode_keyed, monkeypatch):
    """opencode 404 (wrong endpoint form) => LLMGatewayUnavailable."""
    _mock_httpx_client(monkeypatch, status=404, payload={"error": "not found"})
    with pytest.raises(LLMGatewayUnavailable):
        await LLMGateway.generate_content(prompt="ping")


@pytest.mark.asyncio
async def test_opencode_branch_raises_on_empty_completion(opencode_keyed, monkeypatch):
    """opencode 200 with empty content => LLMGatewayUnavailable."""
    _mock_httpx_client(monkeypatch, payload=_opencode_payload("   "))
    with pytest.raises(LLMGatewayUnavailable):
        await LLMGateway.generate_content(prompt="ping")


@pytest.mark.asyncio
async def test_chat_never_touches_embedding_key(monkeypatch):
    """Chat must be opencode-only even when the embedding key is set.

    Phase 59 embeddings-only lock: GEMINI_API_KEY serves ltm.py embeddings
    only. With both keys configured, generate_content must serve from the
    opencode branch, resolve the caller's opencode model ID verbatim, and
    never send the embedding key anywhere (headers carry only the opencode
    Bearer token). The gateway module must not even import the Gemini SDK.
    """
    assert not hasattr(llm_gateway, "genai"), "gateway must not import the Gemini chat SDK"
    monkeypatch.setattr(llm_gateway.settings, "demo_offline", False)
    monkeypatch.setattr(llm_gateway.settings, "opencode_api_key", "oc-test-key")
    monkeypatch.setattr(llm_gateway.settings, "gemini_api_key", "AQ-test-embedding-key")

    mock_client = _mock_httpx_client(
        monkeypatch, payload=_opencode_payload("  ringkasan taktis  ")
    )
    text = await LLMGateway.generate_content(prompt="uji", model_name="mimo-v2.6-pro")
    assert text == "ringkasan taktis"
    sent_payload = mock_client.post.call_args[1]["json"]
    assert sent_payload["model"] == "mimo-v2.6-pro"
    sent_headers = mock_client.post.call_args[1]["headers"]
    assert "AQ-test-embedding-key" not in str(sent_headers)
    assert sent_payload.keys() <= {"model", "messages", "temperature", "max_tokens", "reasoning_effort"}


@pytest.mark.asyncio
async def test_opencode_retries_on_connect_timeout_and_succeeds(opencode_keyed, monkeypatch):
    """A transient ConnectTimeout on attempt 1 should retry and succeed on attempt 2."""
    import httpx
    mock_client = AsyncMock()
    success_resp = MagicMock()
    success_resp.status_code = 200
    success_resp.json.return_value = _opencode_payload("hasil setelah retry")
    success_resp.raise_for_status.return_value = None

    # First call fails with ConnectTimeout, second call succeeds
    mock_client.post.side_effect = [
        httpx.ConnectTimeout("connection timed out"),
        success_resp,
    ]
    mock_client_cls = MagicMock()
    mock_client_cls.return_value.__aenter__.return_value = mock_client
    monkeypatch.setattr(llm_gateway.httpx, "AsyncClient", mock_client_cls)

    # Speed up tests by skipping actual sleep delay
    monkeypatch.setattr(llm_gateway.asyncio, "sleep", AsyncMock())

    text = await LLMGateway.generate_content(prompt="uji retry")
    assert text == "hasil setelah retry"
    assert mock_client.post.call_count == 2


@pytest.mark.asyncio
async def test_opencode_recovers_reasoning_content_when_content_empty(opencode_keyed, monkeypatch):
    """When content is empty string, reasoning_content should be extracted as fallback."""
    payload = {
        "choices": [
            {
                "message": {
                    "content": "",
                    "reasoning_content": "analisis taktis dari reasoning"
                }
            }
        ]
    }
    _mock_httpx_client(monkeypatch, payload=payload)
    text = await LLMGateway.generate_content(prompt="uji reasoning fallback")
    assert text == "analisis taktis dari reasoning"


def test_economic_degraded_markers_rejected():
    """The marker tuple used to reject fallback prose must cover known canned headers."""
    markers = ("FALLBACK", "CRISIS EXECUTIVE SUMMARY", "RINGKASAN EKSEKUTIF PREHUB", "MOCKED")
    canned = "CRISIS EXECUTIVE SUMMARY\nEvent: Flood (mocked fallback)"
    assert any(m in canned.upper() for m in markers)
    genuine = "Proyeksi inflasi pangan +8% dalam 48 jam di koridor Belawan."
    assert not any(m in genuine.upper() for m in markers)
