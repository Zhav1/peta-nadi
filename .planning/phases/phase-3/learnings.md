# Phase 3 Learnings: LangGraph Agent Swarm Core Reasoning

This document captures the technical challenges, debugging flows, environment constraints, and critical fixes encountered during the implementation and testing of the stateful multi-agent swarm pipeline. It serves to preserve context and prevent repeating similar integration mistakes in subsequent phases.

---

## 1. Environment & Path Resolution Constraints
* **Context:** The project uses a monorepo-style structure where python execution occurs from the workspace root (`D:\College\Pidi.id`), but the backend source code is located in the `backend/` subdirectory.
* **Issue:** Running unit tests or python scripts from the root directory produced `ModuleNotFoundError: No module named 'app'` because Python’s module search path (`sys.path`) defaults to the directory of the executed file or the active working directory, excluding `backend/`.
* **Constraint & Remedy:** 
  - To execute tests or run check scripts from the root, the `PYTHONPATH` environment variable must explicitly contain both the `backend/` folder and the root.
  - **Command:** `$env:PYTHONPATH="backend;."; backend\.venv\Scripts\python.exe -m pytest backend/tests/test_agents.py`
  - Always execute python tooling in this environment layout to prevent path failures.

---

## 2. Singleton and Import-Reference Mismatches in Patching
* **Context:** The agents import various singleton database clients and helper functions (e.g. `get_client` from `app.db.supabase_client` or `get_async_redis` from `agents.memory.stm`) at the top of their modules:
  ```python
  from app.db.supabase_client import get_client
  from agents.memory.stm import get_async_redis
  ```
* **Issue:** Using standard `mock.patch` targets like `patch("app.db.supabase_client.get_client")` in unit tests did not intercept database calls made inside helper modules (e.g., `agents.tools.supabase_tools.py`) because those modules had already bound their internal references to the original, unmocked functions during imports (before the test case patched the source module).
* **Fix & Best Practice:**
  - Instead of patching functions that might be bound to local copies, **directly mock the module's underlying singleton instance variable**.
  - For Supabase, overwrite the global state directly inside the test fixture:
    ```python
    import app.db.supabase_client
    app.db.supabase_client._supabase_client = client_mock
    ```
  - For Redis, patch the underlying class instantiation method (`Redis.from_url`) and clean up the cached singleton instance state inside the fixture:
    ```python
    with patch("agents.memory.stm.Redis.from_url") as mock:
        mock.return_value = mock_client
        import agents.memory.stm
        agents.memory.stm._async_redis_client = None
        yield mock_client
    ```
  - Bypassing function-level patches in favor of instance-level singleton resets eliminates reference-copying errors.

---

## 3. AsyncMock Event Loop Closed Issues (Python 3.13)
* **Context:** Unit tests mocked Redis async methods (`get`, `keys`, `sadd`, etc.) using `unittest.mock.AsyncMock`.
* **Issue:** Under `pytest-asyncio` with strict mode enabled, running sequential tests led to `RuntimeError: Event loop is closed`. This occurs because `AsyncMock` internally interacts with the active event loop to record calls and manage callbacks, and `pytest-asyncio` tears down and recreates the event loop between test runs, leaving the mock objects with stale, closed loop bindings.
* **Fix & Best Practice:**
  - Avoid using `AsyncMock` for external infrastructure simulation (like Redis).
  - Implement a clean, native Python dummy client (`MockRedis`) using standard `async def` methods:
    ```python
    class MockRedis:
        async def get(self, key, *args, **kwargs):
            return self.get_return_value
        async def keys(self, pattern, *args, **kwargs):
            return self.keys_return_value
        # Standard synchronous-behaving async methods
    ```
  - Since this class does not rely on Python mock’s internal loop bindings, it is 100% immune to `Event loop is closed` errors.

---

## 4. Logical Threshold and Data Constraints in Tests
* **Context:** The `PredictionAgent` (Agent 3) calculates its congestion forecast and increases its confidence score when multiple traffic data points are present.
* **Issue:** `test_prediction_with_tomtom_data` failed because the mock Redis return value returned only one TomTom segment key. In the agent's implementation, at least 5 keys are required to run a linear extrapolation and boost the finding's confidence above the test's `0.7` assertion threshold.
* **Fix:** Ensure mock setups align with target logic thresholds (i.e. return 5 keys in the mocked keys list).

---

## 5. Type and Key Consistency
* **Context:** TypedDict structures (like `LTMEpisode`) define the data schema passed between nodes.
* **Issue:** `economic_intelligence_agent` attempted to access `ltm_episodes[0]['title']`, but `title` was not defined in the `LTMEpisode` TypedDict (only `description`, `crisis_type`, `inflation_multiplier`, etc.), leading to a `KeyError: 'title'`.
* **Fix:** Always ensure that any key utilized by reasoning nodes or LLM narratives is explicitly declared in its corresponding TypedDict state definition in `agents/state.py` and populated in data retrieval layers (`agents/memory/ltm.py`).
