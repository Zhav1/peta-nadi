"""Live, synthetic-only checks for the OpenCode free fallback chain.

Run from the repo root with the backend Python environment. Reads local .env
files without printing secrets. Sends two small prompts per configured free
model, then calls the real gateway for both paid roles (these last two calls
may consume Go allowance if the paid models are available again).
"""

import asyncio
import json
import logging
from pathlib import Path
import sys
import time

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT)]

from app.config import Settings
from agents import llm_gateway


CASES = {
    "severity": (
        "Classify this synthetic report: banjir setinggi lutut di Belawan, "
        "air masuk ke gudang cabai. Return ONLY one lowercase word: "
        "low, medium, high, or critical."
    ),
    "json": (
        'Synthetic test: banjir di Belawan. Return ONLY a JSON object with '
        'hazard="flood", location="Belawan", and summary containing one short '
        'Indonesian sentence about the banjir. No markdown fences.'
    ),
}


def validate(case: str, text: str) -> None:
    if case == "severity":
        if text not in {"low", "medium", "high", "critical"}:
            raise ValueError("not a single severity classification")
    else:
        data = json.loads(text)
        if (
            not isinstance(data, dict)
            or data.get("hazard") != "flood"
            or data.get("location") != "Belawan"
            or "banjir" not in str(data.get("summary", "")).lower()
        ):
            raise ValueError("JSON did not preserve the synthetic event fields")


async def probe_free(settings: Settings, model: str) -> bool:
    """Probe this exact model, not another fallback masking its failure."""
    headers = {
        "Authorization": f"Bearer {settings.opencode_api_key}",
        "User-Agent": llm_gateway.OPENCODE_USER_AGENT,
        "x-opencode-session": "prehub-backend",
    }
    passed = True
    async with httpx.AsyncClient(timeout=30.0) as client:
        for case, prompt in CASES.items():
            started = time.monotonic()
            try:
                response = await client.post(
                    llm_gateway.opencode_base_url(model) + llm_gateway.OPENCODE_CHAT_COMPLETIONS_PATH,
                    headers=headers,
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2,
                        "max_tokens": max(1500, settings.opencode_free_models_min_tokens),
                    },
                )
                response.raise_for_status()
                data = response.json()
                choice = data["choices"][0]
                if choice.get("finish_reason") == "length":
                    raise ValueError("token budget exhausted before a complete answer")
                text = llm_gateway.strip_thinking_tags(choice["message"].get("content") or "")
                validate(case, text)
                cost = data.get("usage", {}).get("cost")
                if cost != 0:
                    raise ValueError("response did not report zero cost")
                print(f"PASS {model}/{case}: HTTP 200, cost=0, {time.monotonic() - started:.1f}s")
            except Exception as exc:
                # Do not dump response bodies, internal reasoning, or headers.
                print(f"FAIL {model}/{case}: {type(exc).__name__}: {exc}")
                passed = False
    return passed


async def probe_gateway(role: str, model: str) -> bool:
    started = time.monotonic()
    try:
        text = await llm_gateway.LLMGateway.generate_content(
            prompt=CASES["json"], model_name=model, max_tokens=300,
        )
        validate("json", text)
        print(f"PASS gateway/{role} ({model}): valid final JSON, {time.monotonic() - started:.1f}s")
        return True
    except Exception as exc:
        print(f"FAIL gateway/{role} ({model}): {type(exc).__name__}: {exc}")
        return False


async def main() -> int:
    settings = Settings(_env_file=(ROOT / ".env", ROOT / "backend" / ".env"))
    if not settings.opencode_api_key or settings.opencode_api_key.startswith("your-"):
        print("FAIL: configure OPENCODE_API_KEY before running live checks")
        return 1
    if settings.demo_offline:
        print("FAIL: DEMO_OFFLINE must be false for real gateway verification")
        return 1
    models = list(dict.fromkeys(settings.opencode_free_model_list))
    if len(models) < 2:
        print("FAIL: configure at least two OPENCODE_FREE_MODELS for this check")
        return 1
    llm_gateway.settings = settings
    results = await asyncio.gather(*(probe_free(settings, model) for model in models))
    results.extend(await asyncio.gather(
        probe_gateway("driver", settings.opencode_driver_model),
        probe_gateway("reasoning", settings.opencode_reasoning_model),
    ))
    return 0 if all(results) else 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    try:
        sys.exit(asyncio.run(asyncio.wait_for(main(), timeout=180)))
    except TimeoutError:
        print("FAIL: live verification exceeded 180 seconds")
        sys.exit(1)
