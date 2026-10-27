"""Phase 163a — dashboard snapshot service.

Hermetic: no Supabase client is created and no section touches the network.
The section plan is substituted for the isolation test; the persistence tests
use a fake Supabase client.

Pinned here:

* a failing section and a timing-out section are isolated (`degraded` /
  `timeout`) while the healthy sections stay `ok`;
* a failed section reuses its last good value when this process has one;
* store -> read round-trip keeps key, payload, computed_at, schema_version and
  source_freshness;
* a missing row -> `None`; a Supabase error -> `None` (never raises);
* a schema_version mismatch is treated as a miss;
* `build_and_store_global_snapshot` never raises and reports `snapshot_failed`.
"""

import asyncio
import time

import pytest

from app.services import dashboard_snapshot_service as svc


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

class _FakeTable:
    def __init__(self, store: dict, table: str):
        self._store = store
        self._table = table
        self._row = None
        self._filters: dict = {}
        self._limit = None

    # write
    def upsert(self, row, on_conflict=None):  # noqa: ANN001 - PostgREST signature
        assert self._table == svc.SNAPSHOT_TABLE
        assert on_conflict == "snapshot_key"
        self._row = dict(row)
        return self

    # read
    def select(self, columns):  # noqa: ANN001
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    def limit(self, count):
        self._limit = count
        return self

    def execute(self):
        if self._row is not None:
            self._store[self._row["snapshot_key"]] = self._row
            return _FakeResult([dict(self._row)])
        rows = []
        for row in self._store.values():
            if all(row.get(k) == v for k, v in self._filters.items()):
                rows.append(dict(row))
        if self._limit is not None:
            rows = rows[: self._limit]
        return _FakeResult(rows)


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeClient:
    """Minimal stand-in for the service-role Supabase client."""

    def __init__(self, store=None, fail=False):
        self.store: dict = {} if store is None else store
        self.fail = fail
        self.tables: list[str] = []

    def table(self, name):
        if self.fail:
            raise RuntimeError("supabase unreachable")
        self.tables.append(name)
        return _FakeTable(self.store, name)


@pytest.fixture(autouse=True)
def _clean_section_cache():
    svc.reset_section_cache()
    yield
    svc.reset_section_cache()


def _snapshot(**overrides):
    snapshot = {
        "snapshot_key": "global",
        "schema_version": 1,
        "computed_at": svc.utcnow().isoformat(),
        "source_freshness": {"incidents": {"status": "ok", "ms": 3}},
        "payload": {"incidents": {"status": "ok", "data": {"items": [], "total": 0}}},
    }
    snapshot.update(overrides)
    return snapshot


# ---------------------------------------------------------------------------
# 1. Builder isolation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_builder_isolates_failing_and_timing_out_sections(monkeypatch):
    async def ok():
        return {"value": "good"}

    async def boom():
        raise RuntimeError("upstream 500")

    async def slow():
        await asyncio.sleep(5)
        return {"value": "too late"}

    monkeypatch.setattr(
        svc,
        "section_plan",
        lambda corridor_id=None: {"healthy": ok, "broken": boom, "slow": slow},
    )
    monkeypatch.setattr(svc, "SECTION_TIMEOUT_SECONDS", 0.05)

    started = time.perf_counter()
    snapshot = await svc.build_global_snapshot()
    elapsed = time.perf_counter() - started

    payload = snapshot["payload"]
    freshness = snapshot["source_freshness"]

    assert payload["healthy"] == {"status": "ok", "data": {"value": "good"}}
    assert payload["broken"]["status"] == "degraded"
    assert payload["broken"]["data"] is None
    assert payload["slow"]["status"] == "timeout"
    assert freshness["broken"]["status"] == "degraded"
    assert "upstream 500" in freshness["broken"]["error"]
    assert freshness["slow"]["status"] == "timeout"
    assert freshness["healthy"]["status"] == "ok"
    assert isinstance(freshness["healthy"]["ms"], int)

    # Top-level envelope.
    assert snapshot["snapshot_key"] == "global"
    assert snapshot["schema_version"] == svc.SNAPSHOT_SCHEMA_VERSION
    assert snapshot["computed_at"]
    # The failing sections must not fail the build, and the timeout must be bounded.
    assert elapsed < 2.0


@pytest.mark.asyncio
async def test_failed_section_reuses_last_good_value(monkeypatch):
    calls = {"n": 0}

    async def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            return {"items": [1, 2, 3]}
        raise RuntimeError("transient")

    monkeypatch.setattr(svc, "section_plan", lambda corridor_id=None: {"incidents": flaky})

    first = await svc.build_global_snapshot()
    assert first["payload"]["incidents"]["status"] == "ok"

    second = await svc.build_global_snapshot()
    section = second["payload"]["incidents"]
    assert section["status"] == "degraded"
    assert section["data"] == {"items": [1, 2, 3]}
    assert section["cached"] is True


@pytest.mark.asyncio
async def test_sync_section_runs_in_thread_and_stays_jsonable(monkeypatch):
    from datetime import datetime, timezone

    def sync_section():
        return {"at": datetime(2026, 10, 27, tzinfo=timezone.utc)}

    monkeypatch.setattr(svc, "section_plan", lambda corridor_id=None: {"sync": sync_section})

    snapshot = await svc.build_global_snapshot()
    assert snapshot["payload"]["sync"]["status"] == "ok"
    assert isinstance(snapshot["payload"]["sync"]["data"]["at"], str)


# ---------------------------------------------------------------------------
# 2. Persistence
# ---------------------------------------------------------------------------

def test_store_read_round_trip_with_fake_client(monkeypatch):
    client = _FakeClient()
    monkeypatch.setattr(svc, "_client", lambda: client)

    snapshot = _snapshot()
    stored = svc.store_global_snapshot(snapshot)

    assert client.tables == [svc.SNAPSHOT_TABLE]
    assert stored["snapshot_key"] == "global"
    assert stored["payload"] == snapshot["payload"]
    assert stored["computed_at"] == snapshot["computed_at"]
    assert stored["schema_version"] == 1
    assert stored["source_freshness"] == snapshot["source_freshness"]

    read = svc.read_global_snapshot()
    assert read is not None
    assert read["snapshot_key"] == "global"
    assert read["schema_version"] == 1
    assert read["payload"] == snapshot["payload"]
    assert read["source_freshness"] == snapshot["source_freshness"]
    assert svc.snapshot_age_seconds(read) is not None


def test_read_returns_none_when_row_missing(monkeypatch):
    monkeypatch.setattr(svc, "_client", lambda: _FakeClient())
    assert svc.read_global_snapshot() is None


def test_read_returns_none_when_supabase_fails(monkeypatch):
    monkeypatch.setattr(svc, "_client", lambda: _FakeClient(fail=True))
    assert svc.read_global_snapshot() is None


def test_read_treats_schema_version_mismatch_as_a_miss(monkeypatch):
    store = {}
    client = _FakeClient(store=store)
    monkeypatch.setattr(svc, "_client", lambda: client)

    store["global"] = {
        "snapshot_key": "global",
        "payload": {"incidents": {"status": "ok", "data": None}},
        "computed_at": svc.utcnow().isoformat(),
        "schema_version": svc.SNAPSHOT_SCHEMA_VERSION + 1,
        "source_freshness": {},
    }
    assert svc.read_global_snapshot() is None


def test_snapshot_age_seconds_is_none_without_timestamp():
    assert svc.snapshot_age_seconds(None) is None
    assert svc.snapshot_age_seconds({}) is None
    assert svc.snapshot_age_seconds({"computed_at": "not-a-date"}) is None


# ---------------------------------------------------------------------------
# 3. Tick entry point
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_build_and_store_reports_ok(monkeypatch):
    client = _FakeClient()
    monkeypatch.setattr(svc, "_client", lambda: client)

    async def plan_factory():
        return {"ok": True}

    monkeypatch.setattr(svc, "section_plan", lambda corridor_id=None: {"incidents": plan_factory})

    status = await svc.build_and_store_global_snapshot()

    assert status["status"] == "ok"
    assert status["sections"] == 1
    assert status["computed_at"]
    assert "global" in client.store


@pytest.mark.asyncio
async def test_build_and_store_never_raises(monkeypatch):
    async def boom(**kwargs):
        raise RuntimeError("compose failed")

    monkeypatch.setattr(svc, "build_global_snapshot", boom)

    status = await svc.build_and_store_global_snapshot()

    assert status["status"] == "error"
    assert "compose failed" in status["error"]


@pytest.mark.asyncio
async def test_build_and_store_reports_store_failure(monkeypatch):
    monkeypatch.setattr(svc, "_client", lambda: _FakeClient(fail=True))

    async def plan_factory():
        return {"ok": True}

    monkeypatch.setattr(svc, "section_plan", lambda corridor_id=None: {"incidents": plan_factory})

    status = await svc.build_and_store_global_snapshot()
    assert status["status"] == "error"
    assert "supabase unreachable" in status["error"]
