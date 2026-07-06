# Phase 1 Learnings — Data Ingestion Pipeline & API Adapters

This document lists all environment constraints, issues found, and engineering decisions made during Phase 1 to prevent repeating the same mistakes in future context windows.

---

## 1. Environment & Constraints

*   **Operating System:** Windows 10/11. Ensure that PowerShell-friendly commands are used (e.g. avoid Unix `head`, quote special characters like `@` to avoid splatting interpretation).
*   **Python Version:** 3.13.7. Note that some C-compiled Python packages (like `aiohttp` in this version) fail to build without Microsoft Visual C++ Build Tools.
    *   *Mitigation:* Use `httpx` for async HTTP requests, as it is pure Python/pre-compiled and works perfectly out-of-the-box.
*   **Redis Version:** `3.0.504` (local Windows service). This is an old version of Redis with major compatibility constraints:
    *   *No Streams support:* Redis Streams (and commands like `XADD`, `XLEN`) are not supported (requires Redis >= 5.0).
    *   *No multi-value HSET:* The `HSET` command only accepts a single field-value pair. Passing a dictionary/mapping raises a "wrong number of arguments" error (requires Redis >= 4.0).

---

## 2. Issues Found & Resolved

### 2.1 Infinite loops in test suite
*   **Issue:** `test_aisstream_port_queue` was calling `await adapter._process_queue_loop()` directly. Since `_process_queue_loop()` runs an infinite `while True` loop, the test runner hung indefinitely for 12 hours.
*   **Fix:** Refactored the loop to delegate the core queue analysis logic to a single-tick `_process_queue()` method. Changed unit tests to invoke `_process_queue()`.
*   **Learning:** Never invoke an infinite worker loop directly in tests. Keep loops lean and test the inner tick function in isolation.

### 2.2 TomTom incidentDetails v5 syntax and deprecations
*   **Issue:** The TomTom v5 `incidentDetails` endpoint returned `400 Bad Request` when query parameters were sent without matching the projection schema.
*   **Fix:** The `fields` parameter requires double/outer braces (e.g. `fields={incidents{...}}`).
*   **Deprecations:** `description` and `magnitude` fields are no longer available in the v5 properties block.
*   **Mitigation:** Map severity based on the returned `delay` (in seconds) and map the `iconCategory` code to a custom description string (e.g. 7 = "Road Closed", 9 = "Flooding").
*   **NoneType Conversions:** In Python, calling `int(properties.get("delay", 0))` fails if `delay` is present but is `null` (None). Always use the `int(value or 0)` idiom.

### 2.3 Redis 3.0.504 compatibility
*   **Issue:** Redis server 3.0.504 threw "unknown command 'XADD'" and "wrong number of arguments for hset" errors.
*   **Fix:**
    1.  Replaced `r.hset(key, mapping={...})` with individual calls: `r.hset(key, field, value)`.
    2.  Added a transparent `ResponseError` catch in `publish_event`. If `XADD` fails due to "unknown command", the adapter automatically serializes the event to JSON and pushes it to a Redis List (`LPUSH`), trimming the list to a maximum of 10,000 items.
*   **Learning:** Always build defensive fallback mechanisms for local database compatibility so that offline mock development remains possible on older runtimes.
