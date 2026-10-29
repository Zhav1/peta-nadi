"""Regression tests for the fail-loud LLM gateway contract (Phase 55, S2; Phase 58 opencode)."""
import httpx
import pytest
from unittest.mock import AsyncMock, MagicMock

from agents import llm_gateway
from agents.llm_gateway import LLMGateway, LLMGatewayUnavailable
from app.config import Settings


@pytest.fixture(autouse=True)
def deterministic_opencode_settings(monkeypatch):
    """Keep routing and token budgets independent of local environment settings."""
    monkeypatch.setattr(llm_gateway.settings, "opencode_driver_model", "paid-test")
    monkeypatch.setattr(llm_gateway.settings, "opencode_free_models", "free-first,free-second")
    monkeypatch.setattr(llm_gateway.settings, "opencode_free_models_min_tokens", 1600)
    monkeypatch.setattr(llm_gateway.settings, "opencode_reasoning_effort", None)
    monkeypatch.setattr(llm_gateway.asyncio, "sleep", AsyncMock())


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
        mock_client.post.return_value = _http_response(status, payload)
    mock_client_cls = MagicMock()
    mock_client_cls.return_value.__aenter__.return_value = mock_client
    monkeypatch.setattr(llm_gateway.httpx, "AsyncClient", mock_client_cls)
    return mock_client


def _http_response(status, payload, *, url=None):
    return httpx.Response(
        status,
        json=payload,
        request=httpx.Request(
            "POST",
            url or f"{llm_gateway.OPENCODE_BASE_URL}{llm_gateway.OPENCODE_CHAT_COMPLETIONS_PATH}",
        ),
    )


def _mock_httpx_responses(monkeypatch, *responses):
    """Share a finite HTTP response sequence across model/client attempts."""
    client = _mock_httpx_client(monkeypatch)
    client.post.side_effect = list(responses)
    return client


def _requested_models(client):
    return [call.kwargs["json"]["model"] for call in client.post.call_args_list]


def _opencode_payload(text):
    return {"choices": [{"message": {"content": text}}]}


@pytest.mark.asyncio
@pytest.mark.parametrize("successful_fallback", [0, 1, 2, 3])
async def test_default_free_order_and_endpoint_routing(
    opencode_keyed, monkeypatch, successful_fallback,
):
    defaults = Settings(_env_file=None)
    expected_free = [
        "deepseek-v4.1-flash-free", "glm-5.3-flash-free",
        "beam-free", "iceman-contributor-free",
    ]
    assert defaults.opencode_free_model_list == expected_free
    monkeypatch.setattr(llm_gateway.settings, "opencode_free_models", defaults.opencode_free_models)
    expected_models = ["paid-test", *expected_free[:successful_fallback + 1]]
    client = _mock_httpx_responses(
        monkeypatch,
        *[
            _http_response(429, {"error": {"type": "FreeUsageLimitError"}})
            for _ in expected_models[:-1]
        ],
        _http_response(200, _opencode_payload("valid free answer")),
    )

    assert await LLMGateway.generate_content(prompt="synthetic test", max_tokens=300) == "valid free answer"
    assert _requested_models(client) == expected_models
    expected_bases = [
        llm_gateway.OPENCODE_BASE_URL,
        llm_gateway.OPENCODE_ZEN_BASE_URL,
        llm_gateway.OPENCODE_ZEN_BASE_URL,
        llm_gateway.OPENCODE_BASE_URL,
        llm_gateway.OPENCODE_BASE_URL,
    ]
    assert [call.args[0] for call in client.post.call_args_list] == [
        base + "/chat/completions" for base in expected_bases[:len(expected_models)]
    ]
    assert [call.kwargs["json"]["max_tokens"] for call in client.post.call_args_list] == [
        300, *([1600] * (len(expected_models) - 1)),
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("model", ["deepseek-v4.1-flash-free", "glm-5.3-flash-free"])
async def test_explicit_zen_free_model_routes_directly(opencode_keyed, monkeypatch, model):
    monkeypatch.setattr(
        llm_gateway.settings, "opencode_free_models", Settings(_env_file=None).opencode_free_models,
    )
    client = _mock_httpx_responses(
        monkeypatch, _http_response(200, _opencode_payload("direct free answer")),
    )
    assert await LLMGateway.generate_content(
        prompt="synthetic test", model_name=model, max_tokens=300,
    ) == "direct free answer"
    assert _requested_models(client) == [model]
    assert client.post.call_args.args[0] == llm_gateway.OPENCODE_ZEN_BASE_URL + "/chat/completions"
    assert client.post.call_args.kwargs["json"]["max_tokens"] == 1600


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
async def test_opencode_rejects_reasoning_content_when_content_empty(opencode_keyed, monkeypatch):
    """Internal reasoning is not an answer, even when every rung returns it."""
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
    client = _mock_httpx_client(monkeypatch, payload=payload)
    with pytest.raises(LLMGatewayUnavailable):
        await LLMGateway.generate_content(prompt="uji reasoning fallback")
    assert _requested_models(client) == ["paid-test", "free-first", "free-second"]


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [429, 402, 403, 404])
async def test_paid_failure_uses_first_free_model(opencode_keyed, monkeypatch, status):
    client = _mock_httpx_responses(
        monkeypatch,
        _http_response(status, {"error": "paid unavailable"}),
        _http_response(200, _opencode_payload("free answer")),
    )

    assert await LLMGateway.generate_content(prompt="ping") == "free answer"
    assert _requested_models(client) == ["paid-test", "free-first"]


@pytest.mark.asyncio
async def test_first_free_failure_uses_second_free_model(opencode_keyed, monkeypatch):
    client = _mock_httpx_responses(
        monkeypatch,
        _http_response(429, {"error": "paid exhausted"}),
        _http_response(403, {"error": "first free unavailable"}),
        _http_response(200, _opencode_payload("second free answer")),
    )

    assert await LLMGateway.generate_content(prompt="ping") == "second free answer"
    assert _requested_models(client) == ["paid-test", "free-first", "free-second"]


@pytest.mark.asyncio
async def test_exhausted_ladder_chains_last_opencode_failure(opencode_keyed, monkeypatch):
    client = _mock_httpx_responses(
        monkeypatch,
        _http_response(429, {"error": "paid exhausted"}),
        _http_response(403, {"error": "first free unavailable"}),
        _http_response(404, {"error": "last free missing"}),
    )

    with pytest.raises(LLMGatewayUnavailable) as caught:
        await LLMGateway.generate_content(prompt="ping")

    assert _requested_models(client) == ["paid-test", "free-first", "free-second"]
    last_failure = caught.value.__cause__
    assert isinstance(last_failure, LLMGatewayUnavailable)
    assert "free-second" in str(last_failure)
    assert isinstance(last_failure.__cause__, httpx.HTTPStatusError)
    assert last_failure.__cause__.response.status_code == 404
    assert "last free missing" in last_failure.__cause__.response.text


@pytest.mark.asyncio
async def test_nim_runs_only_after_all_opencode_models_fail(opencode_keyed, monkeypatch):
    monkeypatch.setattr(llm_gateway.settings, "nvidia_deepseek_v4_pro", "nvapi-test-key")
    client = _mock_httpx_responses(
        monkeypatch,
        _http_response(429, {"error": "paid exhausted"}),
        _http_response(403, {"error": "first free unavailable"}),
        _http_response(404, {"error": "second free unavailable"}),
        _http_response(200, _opencode_payload("NIM answer"), url=llm_gateway.NVIDIA_NIM_URL),
    )

    assert await LLMGateway.generate_content(
        prompt="original prompt", system_instruction="original system", temperature=0.37,
        max_tokens=321,
    ) == "NIM answer"
    assert _requested_models(client) == [
        "paid-test", "free-first", "free-second", llm_gateway.PRIMARY_NIM_MODEL,
    ]
    opencode_url = f"{llm_gateway.OPENCODE_BASE_URL}{llm_gateway.OPENCODE_CHAT_COMPLETIONS_PATH}"
    assert [call.args[0] for call in client.post.call_args_list] == [
        opencode_url, opencode_url, opencode_url, llm_gateway.NVIDIA_NIM_URL,
    ]
    for call in client.post.call_args_list:
        assert call.kwargs["json"]["messages"] == [
            {"role": "system", "content": "original system"},
            {"role": "user", "content": "original prompt"},
        ]
        assert call.kwargs["json"]["temperature"] == 0.37
    assert client.post.call_args.kwargs["headers"]["Authorization"] == "Bearer nvapi-test-key"
    assert client.post.call_args.kwargs["json"]["max_tokens"] == 321


@pytest.mark.asyncio
async def test_all_providers_exhausted_raise(opencode_keyed, monkeypatch):
    monkeypatch.setattr(llm_gateway.settings, "nvidia_deepseek_v4_pro", "nvapi-test-key")
    client = _mock_httpx_responses(
        monkeypatch,
        _http_response(429, {"error": "paid exhausted"}),
        _http_response(403, {"error": "first free unavailable"}),
        _http_response(404, {"error": "second free unavailable"}),
        _http_response(401, {"error": "NIM unauthorized"}, url=llm_gateway.NVIDIA_NIM_URL),
    )

    with pytest.raises(LLMGatewayUnavailable) as caught:
        await LLMGateway.generate_content(prompt="ping")
    assert _requested_models(client) == [
        "paid-test", "free-first", "free-second", llm_gateway.PRIMARY_NIM_MODEL,
    ]
    assert isinstance(caught.value.__cause__, httpx.HTTPStatusError)
    assert caught.value.__cause__.response.status_code == 401


@pytest.mark.asyncio
async def test_healthy_paid_model_never_falls_back(opencode_keyed, monkeypatch):
    monkeypatch.setattr(llm_gateway.settings, "nvidia_deepseek_v4_pro", "nvapi-test-key")
    client = _mock_httpx_responses(
        monkeypatch, _http_response(200, _opencode_payload("paid answer")),
    )

    assert await LLMGateway.generate_content(prompt="ping", max_tokens=123) == "paid answer"
    assert _requested_models(client) == ["paid-test"]
    assert client.post.call_args.kwargs["json"]["max_tokens"] == 123


@pytest.mark.asyncio
@pytest.mark.parametrize("requested_tokens", [123, 2400])
@pytest.mark.parametrize("selection", ["explicit-free", "configured-free", "paid"])
async def test_ladder_deduplicates_and_applies_free_token_floor(
    opencode_keyed, monkeypatch, requested_tokens, selection,
):
    monkeypatch.setattr(
        llm_gateway.settings, "opencode_free_models",
        " free-first, free-second,free-first,free-second, ",
    )
    kwargs = {}
    if selection == "explicit-free":
        kwargs["model_name"] = "free-second"
        expected = ["free-second", "free-first"]
    elif selection == "configured-free":
        monkeypatch.setattr(llm_gateway.settings, "opencode_driver_model", "free-second")
        expected = ["free-second", "free-first"]
    else:
        expected = ["paid-test", "free-first", "free-second"]
    client = _mock_httpx_client(monkeypatch, status=403, payload={"error": "unavailable"})

    with pytest.raises(LLMGatewayUnavailable):
        await LLMGateway.generate_content(prompt="ping", max_tokens=requested_tokens, **kwargs)
    assert _requested_models(client) == expected
    assert [call.kwargs["json"]["max_tokens"] for call in client.post.call_args_list] == [
        max(requested_tokens, 1600) if model.startswith("free-") else requested_tokens
        for model in expected
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("requested_tokens", [123, 2400])
@pytest.mark.parametrize("explicit", [True, False], ids=["explicit-free", "configured-free"])
async def test_selected_free_model_receives_minimum_budget(
    opencode_keyed, monkeypatch, requested_tokens, explicit,
):
    client = _mock_httpx_responses(
        monkeypatch, _http_response(200, _opencode_payload("free answer")),
    )
    kwargs = {"model_name": "free-first"} if explicit else {}
    if not explicit:
        monkeypatch.setattr(llm_gateway.settings, "opencode_driver_model", "free-first")

    assert await LLMGateway.generate_content(
        prompt="ping", max_tokens=requested_tokens, **kwargs,
    ) == "free answer"
    assert _requested_models(client) == ["free-first"]
    assert client.post.call_args.kwargs["json"]["max_tokens"] == max(requested_tokens, 1600)


@pytest.mark.asyncio
async def test_opencode_ladder_preserves_request_inputs(opencode_keyed, monkeypatch):
    client = _mock_httpx_responses(
        monkeypatch,
        _http_response(429, {"error": "paid exhausted"}),
        _http_response(403, {"error": "first free unavailable"}),
        _http_response(200, _opencode_payload("answer")),
    )

    assert await LLMGateway.generate_content(
        prompt="  exact user prompt\n", system_instruction="  exact system\n",
        model_name="custom-paid", temperature=0.61, max_tokens=456, reasoning_effort="low",
    ) == "answer"
    assert _requested_models(client) == ["custom-paid", "free-first", "free-second"]
    for call, budget in zip(client.post.call_args_list, [456, 1600, 1600]):
        assert call.kwargs["json"] == {
            "model": call.kwargs["json"]["model"],
            "messages": [
                {"role": "system", "content": "  exact system\n"},
                {"role": "user", "content": "  exact user prompt\n"},
            ],
            "temperature": 0.61,
            "max_tokens": budget,
            "reasoning_effort": "low",
        }
        assert call.kwargs["headers"]["Authorization"] == "Bearer oc-test-key"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "message,finish_reason",
    [
        ({"content": "<think>private analysis</think>  "}, "stop"),
        ({"content": "<think>unfinished private analysis"}, "stop"),
        ({"content": "partial but nonempty answer"}, "length"),
        ({"content": "", "reasoning_content": "private analysis"}, "stop"),
        ({"content": None, "reasoning_content": "private analysis"}, "stop"),
    ],
    ids=["thinking-only", "unclosed-thinking", "truncated", "reasoning-only", "null-content"],
)
async def test_unusable_opencode_completion_falls_back(
    opencode_keyed, monkeypatch, message, finish_reason,
):
    client = _mock_httpx_responses(
        monkeypatch,
        _http_response(200, {"choices": [{"message": message, "finish_reason": finish_reason}]}),
        _http_response(200, _opencode_payload("complete free answer")),
    )

    assert await LLMGateway.generate_content(prompt="ping") == "complete free answer"
    assert _requested_models(client) == ["paid-test", "free-first"]


def test_economic_degraded_markers_rejected():
    """The marker tuple used to reject fallback prose must cover known canned headers."""
    markers = ("FALLBACK", "CRISIS EXECUTIVE SUMMARY", "RINGKASAN EKSEKUTIF PREHUB", "MOCKED")
    canned = "CRISIS EXECUTIVE SUMMARY\nEvent: Flood (mocked fallback)"
    assert any(m in canned.upper() for m in markers)
    genuine = "Proyeksi inflasi pangan +8% dalam 48 jam di koridor Belawan."
    assert not any(m in genuine.upper() for m in markers)
