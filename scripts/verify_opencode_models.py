"""Phase 58 Task 1.3: build-time opencode model catalog verification (R1/R2).

GETs {OPENCODE_BASE_URL}/models (Bearer key if OPENCODE_API_KEY set,
unauthenticated otherwise per free-model terms), asserts the locked
reasoning/driver IDs are present verbatim, and prints a pro-override
recommendation when a non-free mimo-* ID appears.

Exit 0  — both mimo-v2.6-flash-free and deepseek-v4.1-flash confirmed.
Exit 1+ — 404 / mismatch / unreachable: fail-loud, never silently continue.
"""
import os
import re
import sys
import urllib.request
import urllib.error
import json

OPENCODE_BASE_URL = os.environ.get(
    # Must match OPENCODE_BASE_URL in agents/llm_gateway.py — Go subscription
    # models live under /inference/go/openai/v1; the Console
    # /inference/openai/v1 catalog lists IDE-only free models that 403 here.
    "OPENCODE_BASE_URL", "https://opencode.ai/inference/go/openai/v1"
)
# The /models catalog endpoint is exposed at the API-family root, not under
# /openai/v1 (which 404s). https://opencode.ai/inference/go/v1/models is the
# doc-promoted catalog URL.
OPENCODE_CATALOG_URL = os.environ.get(
    "OPENCODE_CATALOG_URL", "https://opencode.ai/inference/go/v1/models"
)
EXPECTED_REASONING = os.environ.get(
    "OPENCODE_REASONING_MODEL", "mimo-v2.6-flash"
)
EXPECTED_DRIVER = os.environ.get(
    "OPENCODE_DRIVER_MODEL", "deepseek-v4.1-flash"
)


def fetch_catalog(_base_url_unused: str) -> list:
    url = OPENCODE_CATALOG_URL
    headers = {
        "Content-Type": "application/json",
        # Cloudflare 1010-bans default urllib UA (misleading 403); must match
        # OPENCODE_USER_AGENT in agents/llm_gateway.py.
        "User-Agent": "PreHub-LLMGateway/1.0 (+https://github.com/Zhav1/peta-nadi)",
    }
    api_key = os.environ.get("OPENCODE_API_KEY", "").strip()
    if api_key and not api_key.startswith("your-"):
        headers["Authorization"] = f"Bearer {api_key}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(
            f"FAIL: GET {url} -> HTTP {e.code}. "
            "Fail-loud: catalog unreachable, cannot verify model IDs.",
            file=sys.stderr,
        )
        sys.exit(2)
    except Exception as e:
        print(
            f"FAIL: GET {url} unreachable ({type(e).__name__}: {e}). "
            "Fail-loud: cannot verify model IDs.",
            file=sys.stderr,
        )
        sys.exit(2)
    data = payload.get("data", payload if isinstance(payload, list) else [])
    if isinstance(data, dict):
        data = data.get("models", [])
    return [m.get("id", "") for m in data if isinstance(m, dict)]


def main() -> int:
    model_ids = fetch_catalog(OPENCODE_BASE_URL)
    print(f"Catalog: {len(model_ids)} models at {OPENCODE_CATALOG_URL}")

    missing = [m for m in (EXPECTED_REASONING, EXPECTED_DRIVER) if m not in model_ids]
    if missing:
        print(
            f"FAIL: expected model ID(s) absent from catalog: {missing}. "
            "Fail-loud: do not deploy with unverified IDs.",
            file=sys.stderr,
        )
        return 1

    print(f"Resolved reasoning model: {EXPECTED_REASONING} (confirmed)")
    print(f"Resolved driver model: {EXPECTED_DRIVER} (confirmed)")

    # Pro-override lookup (R2): any non-free mimo-* ID?
    mimo_ids = sorted(i for i in model_ids if i.startswith("mimo"))
    print(f"mimo IDs in catalog: {mimo_ids}")
    pro_ids = [i for i in mimo_ids if "free" not in i]
    if pro_ids:
        print(
            f"PRO-OVERRIDE available: set OPENCODE_REASONING_MODEL={pro_ids[0]} "
            "(Go subscription exposes a pro mimo ID)."
        )
    else:
        print("No pro mimo ID found — ship flash-free default (mimo-v2.6-flash-free).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
