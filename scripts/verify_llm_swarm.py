"""Phase 59 Task 1 (tracer): end-to-end opencode live smoke, local first.

Implements RESEARCH verify-matrix rows 0, 1, 3, and 7 as one runnable
local pass (per 59-PLAN D-01):

  row 0 — catalog: reuses scripts/verify_opencode_models.py verbatim
           (both locked IDs present in the Go catalog).
  row 1 — mimo reasoning completion via LLMGateway.generate_content
           with the reasoning model from Settings.
  row 3 — deepseek driver completion with the driver model.
  row 7 — POSTs the simulation chat prompt to the local backend and
           asserts a non-degraded driver signature.

Payload discipline (D-03 / keep-default verdict): the gateway sends only
model / messages / temperature / max_tokens — no effort knob of any kind.
This script passes no effort parameter anywhere.

Secret-safe rule (T-59-01): key handling is masked-only throughout.
Prints `set:yes/no len:N prefix:CLASS` only. NEVER prints key values.

Local-first: this tracer probes localhost plus the Go catalog. Render
parity belongs to plan 59-03. With --local-only (or when no backend
listens on localhost:8000) row 7 is skipped and recorded DEFERRED.

Exit 0 — every executed row passes.
Exit 1+ — fail-loud, never silently continue.
"""

import argparse
import asyncio
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
VERIFY_CATALOG = os.path.join(REPO_ROOT, "scripts", "verify_opencode_models.py")
LOCAL_CHAT_URL = "http://localhost:8000/api/v1/agent/chat"

EXPECTED_REASONING = os.environ.get("OPENCODE_REASONING_MODEL", "mimo-v2.6-pro")
EXPECTED_DRIVER = os.environ.get("OPENCODE_DRIVER_MODEL", "deepseek-v4.1-flash")

ROW1_PROMPT = "Uji: ringkas kesiapsiagaan banjir Belawan dalam 1 kalimat."
ROW3_PROMPT = "Classify severity in exactly one word (low, medium, high, or critical): 'banjir setinggi lutut di Belawan'"
ROW7_MESSAGE = "biaya hedging reroute?"


def prefix_class(value: str) -> str:
    if not value:
        return "empty"
    if value.startswith("AQ."):
        return "AQ"
    if value.startswith("AIza"):
        return "AIza"
    if value.startswith("your-"):
        return "your"
    if value.startswith("oc_"):
        return "oc"
    return "other"


def masked_status(name: str) -> str:
    value = os.environ.get(name, "")
    state = "yes" if value.strip() else "no"
    return f"{name} set:{state} len:{len(value)} prefix:{prefix_class(value)}"


def row0_catalog() -> None:
    """Row 0: catalog confirms both locked IDs (reuses catalog logic)."""
    print(f"[row 0] key: {masked_status('OPENCODE_API_KEY')}")
    proc = subprocess.run(
        [sys.executable, VERIFY_CATALOG],
        capture_output=True,
        text=True,
        timeout=60,
    )
    print(proc.stdout.strip())
    if proc.stderr.strip():
        print(proc.stderr.strip(), file=sys.stderr)
    if proc.returncode != 0:
        raise RuntimeError(f"row 0 FAIL: catalog check exited {proc.returncode}")
    print("[row 0] PASS: catalog confirms mimo-v2.6-pro + deepseek-v4.1-flash")


def _run_gateway_completion(model_id: str, prompt: str, label: str) -> str:
    sys.path.insert(0, BACKEND_DIR)
    sys.path.insert(0, REPO_ROOT)
    from agents.llm_gateway import LLMGateway
    from app.config import get_settings

    settings = get_settings()
    resolved = model_id or settings.opencode_driver_model
    print(f"[{label}] model: {resolved}")
    text = asyncio.run(
        LLMGateway.generate_content(prompt=prompt, model_name=resolved)
    )
    if not text or not text.strip():
        raise RuntimeError(f"{label} FAIL: empty completion")
    return text.strip()


def row1_mimo() -> None:
    """Row 1: mimo reasoning completion is non-empty."""
    text = _run_gateway_completion(EXPECTED_REASONING, ROW1_PROMPT, "row 1")
    print(f"[row 1] PASS: mimo completion non-empty ({len(text)} chars): {text[:200]}")


def row3_deepseek() -> None:
    """Row 3: deepseek driver completion is non-empty."""
    text = _run_gateway_completion(EXPECTED_DRIVER, ROW3_PROMPT, "row 3")
    print(f"[row 3] PASS: deepseek completion non-empty ({len(text)} chars): {text[:200]}")


def backend_reachable() -> bool:
    try:
        with urllib.request.urlopen(
            urllib.request.Request("http://localhost:8000/health"),
            timeout=8,
        ) as resp:
            return resp.status < 500
    except Exception:
        return False


def row7_chat() -> None:
    """Row 7: simulation chat reply carries a non-degraded driver signature."""
    body = json.dumps({"message": ROW7_MESSAGE, "agency": "BULOG"}).encode("utf-8")
    req = urllib.request.Request(
        LOCAL_CHAT_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"row 7 FAIL: chat POST -> HTTP {e.code}")
    degraded = payload.get("degraded", None)
    sig = payload.get("thought_signature", "") or ""
    reply = payload.get("reply", "") or ""
    if degraded is not False:
        raise RuntimeError(f"row 7 FAIL: degraded={degraded} (expected false)")
    if not sig.startswith("SIG-OPENCODE-DRIVER-"):
        raise RuntimeError(f"row 7 FAIL: thought_signature missing driver prefix: {sig[:60]}")
    if not reply.strip():
        raise RuntimeError("row 7 FAIL: empty reply")
    print(f"[row 7] PASS: degraded:false sig:{sig[:40]}... reply:{len(reply)} chars")


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase 59 live swarm smoke (local first)")
    parser.add_argument(
        "--local-only",
        action="store_true",
        help="gateway + catalog legs only; row 7 chat leg deferred to plan 59-03",
    )
    args = parser.parse_args()

    print("=== Phase 59 tracer: opencode live smoke (local first) ===")
    print(f"key: {masked_status('OPENCODE_API_KEY')}")
    try:
        row0_catalog()
        row1_mimo()
        row3_deepseek()
        if args.local_only or not backend_reachable():
            print("[row 7] DEFERRED: no local backend on :8000 — chat leg moves to plan 59-03")
        else:
            row7_chat()
    except Exception as e:
        print(f"TRACER FAIL: {e}", file=sys.stderr)
        return 1
    print("=== TRACER PASS ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
