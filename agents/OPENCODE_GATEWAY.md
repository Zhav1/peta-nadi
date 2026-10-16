# opencode LLM Gateway — Endpoint & Model ID Cheat Sheet

> Single source of truth for wiring `OPENCODE_*` env vars. Last updated 2026-10-16 after the **Console-vs-Go endpoint mix-up** in Phase 58 caused `402 Insufficient account funds` and `403 FreeTierError` failures. Read this before changing `OPENCODE_BASE_URL` or any model default in `backend/app/config.py`.

---

## Two inference surfaces, one API key, very different behavior

| Surface | Base URL | Auth | What you need | Catalog |
| --- | --- | --- | --- | --- |
| **opencode Console** (pay-as-you-go) | `https://opencode.ai/inference/openai/v1` | `Bearer <service-account key>` | **Positive Console balance** (credit card on file, add credits) | ~88 models, includes `*-free` promos |
| **opencode Go** (subscription) | `https://opencode.ai/inference/go/openai/v1` | `Bearer <service-account key OR Go subscription key>` | **Active Go / Go Plus subscription** ($10 / $40 mo). Console balance *not* required. | 37 curated Go models — no `*-free` |

Both accept the same `oc_sk_*` Service Account key. The deciding factor is **which URL you call**, not which key you hold.

We use **Go** in this repo. `OPENCODE_BASE_URL = https://opencode.ai/inference/go/openai/v1`.

---

## The three traps we already paid for

### 1. The `*-free` model IDs are IDE-only

The Console catalog lists `mimo-v2.6-flash-free`, `nemotron-3-ultra-free`, `big-pickle`, `cat-jam-free`, etc. as if they were free API models. They are not. The inference server returns:

```
HTTP/1.1 403 Forbidden
{"type":"error","error":{"type":"FreeTierError",
 "message":"OpenCode's free tier can only be used from within OpenCode. Download it at https://opencode.ai and keep building."}}
```

This 403 is **client-attribution based**, not header-spoofable. Even a paying account with a valid `oc_sk_*` key gets it. The free quota is reserved for the OpenCode IDE / TUI. Don't try to use `mimo-v2.6-flash-free` here — use the Go plan form `mimo-v2.6-flash`.

References: opencode issues #49433, #49587, #49678; CLIProxyAPI #6018; 9router #4840.

### 2. Endpoint ↔ model ID must match

Catalogs are **not** interchangeable:

| Model ID form | Console `/inference/openai/v1` | Go `/inference/go/openai/v1` |
| --- | --- | --- |
| `mimo-v2.6-flash-free` | 200 (but 403 if not IDE — see trap 1) | 400 `Model is unavailable` |
| `mimo-v2.6-flash` | 400 `Model is unavailable` | 200 ✅ |
| `deepseek-v4.1-flash` | 200 (billed per token, needs Console balance) | 200 ✅ (billed against Go plan) |
| `minimax-m3` | 200 (pay-as-you-go) | 400 `Model is unavailable` |

If you see `400 Upstream request failed: Model is unavailable.`, you mixed surfaces. The fix is to either change the URL or the model ID — never both at once.

### 3. The catalog endpoint is at a different path

`GET /inference/go/v1/models`  — works, returns 37 Go models.
`GET /inference/go/openai/v1/models` — 404. The catalog is exposed at the API-family root, not under `/openai/v1`. `scripts/verify_opencode_models.py` already encodes this (separate `OPENCODE_CATALOG_URL` constant).

### 4. `x-opencode-session` header

Per the official docs "Where can I use it?" section, the Go surface expects a stable session ID in `x-opencode-session` for prompt caching and routing. Without it requests still succeed today but get throttled / lose cache hits. The gateway already sends `x-opencode-session: prehub-backend`. Change it to something unique per conversation if you add per-conversation caching.

---

## Required env (Render dashboard, `sync: false`)

```bash
OPENCODE_API_KEY=oc_sk_...                  # Service Account key, works on both surfaces
OPENCODE_REASONING_MODEL=mimo-v2.6-pro       # Go plan reasoning ($0.435/$0.87 per 1M). NOT mimo-v2.6-flash-free (IDE-only)
OPENCODE_DRIVER_MODEL=deepseek-v4.1-flash    # works on both, but Go bills against plan
```

Do **not** set `OPENCODE_BASE_URL` in env unless you want to override the constant in `agents/llm_gateway.py`. The script-side override (`OPENCODE_CATALOG_URL` in `scripts/verify_opencode_models.py`) is the catalog path, not the chat completions path.

---

## Quick diagnostic tree

| Symptom | Cause | Fix |
| --- | --- | --- |
| `402 Insufficient account funds` on a Go-plan model | Console surface + zero balance | Switch URL to `/inference/go/...` (current fix) OR add Console credits |
| `403 FreeTierError: OpenCode's free tier can only be used from within OpenCode` | Using a `*-free` model ID outside the IDE | Use the Go plan form (`mimo-v2.6-flash` not `-free`) |
| `400 Upstream request failed: Model is unavailable.` | Endpoint ↔ model ID mismatch | Match Go URL with Go IDs, Console URL with Console IDs |
| `404` on the chat completions endpoint | Old `inference/v1/chat/completions` URL or wrong path | Use `inference/go/openai/v1/chat/completions` |
| Catalog script prints `FAIL: expected model ID(s) absent from catalog` | Stale default or wrong catalog URL | `OPENCODE_BASE_URL=https://opencode.ai/inference/go/openai/v1` and `OPENCODE_CATALOG_URL=https://opencode.ai/inference/go/v1/models` |

---

## Verification commands

```bash
# 1. Confirm key loads and is not a placeholder
PYTHONPATH=backend python -c "from app.config import get_settings; s=get_settings(); k=s.opencode_api_key; print('len=',len(k),'prefix=',k[:7])"

# 2. Live catalog (37 Go models with valid key)
python scripts/verify_opencode_models.py

# 3. End-to-end reasoning call (should return Indonesian prose)
PYTHONPATH=. python -c "import asyncio; from agents.llm_gateway import LLMGateway; \
  print(asyncio.run(LLMGateway.generate_content(prompt='klasifikasikan: banjir Belawan dalam 1 kalimat', temperature=0.2))[:200])"

# 4. Gateway tests (must stay green)
python -m pytest backend/tests/test_llm_gateway.py -v
```

If any of (2)(3)(4) fail, **re-read this file** before changing code — the three traps above account for 100% of past failures.
