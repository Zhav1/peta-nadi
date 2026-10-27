"""Phase 162 — thin web boot + the protected external tick.

Hermetic: every Supabase/Redis/adapter call is monkeypatched. `TestClient` is
created without the lifespan context so the app's boot does not start pollers;
the lifespan itself is exercised directly with recorder monkeypatches.

Contract pinned here:

* tick token: empty setting -> 404, wrong/absent token -> 401, valid -> 202;
* the 202 reports the plan and the work runs in a background task;
* a second concurrent tick is rejected (`already_running`), the lock serialises;
* the per-job DB lease prevents duplicate execution;
* a failed job records the error and is retried only after `retry_after`;
* due selection is fair (most overdue first) and never runs a locked job;
* Supabase unavailable -> tick logs and skips, nothing runs;
* thin-web boot starts zero batch pollers and defers the continuous consumers.
"""

import asyncio
import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app import main as app_main
from app.main import app
from app.routers import internal_tick
from app.services import job_scheduler

client = TestClient(app)

TOKEN = "test-internal-tick-token"
TICK_HEADERS = {"X-Internal-Token": TOKEN}


# ---------------------------------------------------------------------------
# fixtures / helpers
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _clean_tick_state():
    internal_tick.reset_tick_state()
    yield
    internal_tick.reset_tick_state()


@pytest.fixture
def tick_token(monkeypatch):
    monkeypatch.setattr(job_scheduler.get_settings(), "internal_tick_token", TOKEN)
    return TOKEN


def _recorder(calls, label):
    async def _record():
        calls.append(label)

    return _record


def _stub_lifespan_dependencies(monkeypatch, calls):
    """Neutralise Redis/Supabase/JWKS/alert-fanout so a lifespan run is hermetic."""

    class _FakeRedis:
        def ping(self):
            return True

    for fn_name in (
        "_poll_bmkg_loop",
        "_poll_tomtom_loop",
        "_poll_open_meteo_loop",
        "_poll_firms_loop",
        "_poll_news_loop",
        "_poll_pihps_loop",
        "_poll_social_osint_loop",
        "_poll_bnpb_loop",
    ):
        monkeypatch.setattr(app_main, fn_name, _recorder(calls, fn_name))

    monkeypatch.setattr(app_main, "get_redis", lambda: _FakeRedis())
    monkeypatch.setattr(app_main, "close_redis", lambda: None)
    monkeypatch.setattr(app_main.settings, "supabase_url", "")
    monkeypatch.setattr(app_main.settings, "supabase_jwks_key", "")
    monkeypatch.setattr(app_main.settings, "pollers_enabled", True)
    monkeypatch.setattr("app.db.supabase_client.init_write_health", lambda: "enabled")
    monkeypatch.setattr(
        "app.services.alert_fanout.consume_validated_alerts_stream",
        _recorder(calls, "validated_alert_fanout"),
    )


# ---------------------------------------------------------------------------
# 1. HTTP contract
# ---------------------------------------------------------------------------

def test_tick_disabled_returns_404_when_token_setting_empty(monkeypatch):
    monkeypatch.setattr(job_scheduler.get_settings(), "internal_tick_token", "")

    assert client.post("/internal/tick", headers=TICK_HEADERS).status_code == 404
    assert client.post("/internal/tick").status_code == 404
    # The disabled endpoint must not reveal the contract through a 401.
    assert client.post("/internal/tick", headers={"X-Internal-Token": ""}).status_code == 404


def test_tick_wrong_or_missing_token_returns_401(tick_token):
    assert client.post("/internal/tick", headers={"X-Internal-Token": "wrong"}).status_code == 401
    assert client.post("/internal/tick", headers={"X-Internal-Token": ""}).status_code == 401
    assert client.post("/internal/tick").status_code == 401
    # The /api/v1 alias is behind the same guard.
    assert client.post("/api/v1/internal/tick").status_code == 401


def test_tick_valid_token_returns_202_with_plan(monkeypatch, tick_token):
    plan = job_scheduler.TickPlan(
        due=["bmkg", "firms"],
        skipped=[{"job": "news", "reason": "not_due"}],
    )

    async def fake_plan():
        return plan

    async def fake_run(plan=None, run_id=None):
        return {"run_id": run_id}

    monkeypatch.setattr(job_scheduler, "plan_tick", fake_plan)
    monkeypatch.setattr(job_scheduler, "run_tick", fake_run)

    res = client.post("/internal/tick", headers=TICK_HEADERS)
    assert res.status_code == 202
    body = res.json()
    assert body["accepted"] is True
    assert body["due"] == ["bmkg", "firms"]
    assert body["skipped"] == [{"job": "news", "reason": "not_due"}]
    assert body["run_id"]


def test_tick_alias_is_registered_under_api_v1(monkeypatch, tick_token):
    async def fake_plan():
        return job_scheduler.TickPlan(due=[])

    async def fake_run(plan=None, run_id=None):
        return {}

    monkeypatch.setattr(job_scheduler, "plan_tick", fake_plan)
    monkeypatch.setattr(job_scheduler, "run_tick", fake_run)

    res = client.post("/api/v1/internal/tick", headers=TICK_HEADERS)
    assert res.status_code == 202
    assert res.json()["accepted"] is True


def test_health_stays_trivial_and_never_runs_jobs(monkeypatch, tick_token):
    called = []

    async def fake_run(plan=None, run_id=None):
        called.append(run_id)
        return {}

    monkeypatch.setattr(job_scheduler, "run_tick", fake_run)

    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert called == []


# ---------------------------------------------------------------------------
# 2. Overlap and execution
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_second_concurrent_tick_is_rejected_and_lock_released(monkeypatch, tick_token):
    started = asyncio.Event()
    gate = asyncio.Event()
    calls = []

    async def fake_plan():
        return job_scheduler.TickPlan(due=["bmkg"])

    async def fake_run(plan=None, run_id=None):
        calls.append(run_id)
        started.set()
        await gate.wait()
        return {"run_id": run_id}

    monkeypatch.setattr(job_scheduler, "plan_tick", fake_plan)
    monkeypatch.setattr(job_scheduler, "run_tick", fake_run)

    first = await internal_tick.internal_tick(x_internal_token=TOKEN)
    assert first["accepted"] is True
    await asyncio.wait_for(started.wait(), timeout=2)

    second = await internal_tick.internal_tick(x_internal_token=TOKEN)
    assert second.status_code == 202
    payload = json.loads(second.body)
    assert payload["accepted"] is False
    assert payload["reason"] == "already_running"
    assert payload["due"] == []

    gate.set()
    await internal_tick.wait_for_pending_ticks()

    assert calls == [first["run_id"]]
    assert internal_tick._tick_lock.locked() is False


@pytest.mark.asyncio
async def test_background_tick_runs_the_due_jobs(monkeypatch, tick_token):
    executed = []

    async def fake_plan():
        return job_scheduler.TickPlan(due=["bmkg"])

    async def fake_run(plan=None, run_id=None):
        executed.append((plan.due, run_id))
        return {}

    monkeypatch.setattr(job_scheduler, "plan_tick", fake_plan)
    monkeypatch.setattr(job_scheduler, "run_tick", fake_run)

    body = await internal_tick.internal_tick(x_internal_token=TOKEN)
    await internal_tick.wait_for_pending_ticks()

    assert executed == [(["bmkg"], body["run_id"])]


@pytest.mark.asyncio
async def test_plan_failure_returns_accepted_without_background_work(monkeypatch, tick_token):
    async def slow_fail():
        raise job_scheduler.SchedulerStateUnavailable("supabase down")

    async def fake_run(plan=None, run_id=None):  # pragma: no cover - must not run
        raise AssertionError("background work must not start when planning failed")

    monkeypatch.setattr(job_scheduler, "plan_tick", slow_fail)
    monkeypatch.setattr(job_scheduler, "run_tick", fake_run)

    body = await internal_tick.internal_tick(x_internal_token=TOKEN)
    assert body["accepted"] is True
    assert body["due"] == []
    assert body["reason"] == "plan_failed"
    assert {entry["reason"] for entry in body["skipped"]} == {"state_unavailable"}
    assert internal_tick._tick_lock.locked() is False


@pytest.mark.asyncio
async def test_job_lease_prevents_duplicate_execution(monkeypatch):
    calls = []

    async def fake_cycle():
        calls.append(1)

    monkeypatch.setattr(job_scheduler, "get_job_callable", lambda name: fake_cycle)
    leases = iter([True, False])  # second tick loses the per-job lease
    monkeypatch.setattr(job_scheduler, "acquire", lambda job, ttl: next(leases))
    released = []
    monkeypatch.setattr(
        job_scheduler,
        "release",
        lambda job, status, error=None, retry_after_seconds=120: released.append((job, status)),
    )

    first = await job_scheduler.run_tick(plan=job_scheduler.TickPlan(due=["bmkg"]), run_id="a")
    second = await job_scheduler.run_tick(plan=job_scheduler.TickPlan(due=["bmkg"]), run_id="b")

    assert len(calls) == 1
    assert first["executed"] == [
        {"job": "bmkg", "status": "ok", "duration_ms": first["executed"][0]["duration_ms"], "error": None}
    ]
    assert second["executed"] == []
    assert {"job": "bmkg", "reason": "locked"} in second["skipped"]
    assert released == [("bmkg", "ok")]


@pytest.mark.asyncio
async def test_failed_job_records_error_and_retries_after_backoff(monkeypatch):
    async def boom():
        raise RuntimeError("bmkg upstream down")

    monkeypatch.setattr(job_scheduler, "get_job_callable", lambda name: boom)
    monkeypatch.setattr(job_scheduler, "acquire", lambda job, ttl: True)
    released = []

    def fake_release(job, status, error=None, retry_after_seconds=120):
        released.append(
            {"job": job, "status": status, "error": error, "retry": retry_after_seconds}
        )

    monkeypatch.setattr(job_scheduler, "release", fake_release)

    result = await job_scheduler.run_tick(plan=job_scheduler.TickPlan(due=["bmkg"]), run_id="fail")

    assert result["executed"][0]["status"] == "error"
    assert "bmkg upstream down" in released[0]["error"]
    assert released[0]["retry"] == job_scheduler.DEFAULT_RETRY_BACKOFF_SECONDS

    now = job_scheduler.utcnow()
    waiting = {
        "bmkg": {
            "job_name": "bmkg",
            "last_finished_at": None,
            "retry_after": (now + timedelta(seconds=60)).isoformat(),
        }
    }
    due, skipped = job_scheduler.select_due(waiting, now=now)
    assert "bmkg" not in due
    assert {"job": "bmkg", "reason": "retry_after"} in skipped

    elapsed = {
        "bmkg": {
            "job_name": "bmkg",
            "last_finished_at": None,
            "retry_after": (now - timedelta(seconds=1)).isoformat(),
        }
    }
    due_after, _ = job_scheduler.select_due(elapsed, now=now)
    assert "bmkg" in due_after


@pytest.mark.asyncio
async def test_tick_respects_job_cap_and_defers_the_rest(monkeypatch):
    monkeypatch.setattr(job_scheduler.get_settings(), "tick_max_jobs", 1)
    calls = []

    async def fake_cycle():
        calls.append(1)

    monkeypatch.setattr(job_scheduler, "get_job_callable", lambda name: fake_cycle)
    monkeypatch.setattr(job_scheduler, "acquire", lambda job, ttl: True)
    monkeypatch.setattr(job_scheduler, "release", lambda *args, **kwargs: None)

    result = await job_scheduler.run_tick(
        plan=job_scheduler.TickPlan(due=["bmkg", "firms"]), run_id="cap"
    )

    assert len(calls) == 1
    assert result["deferred"] == ["firms"]
    assert [entry["job"] for entry in result["executed"]] == ["bmkg"]


# ---------------------------------------------------------------------------
# 3. Due selection / state
# ---------------------------------------------------------------------------

def test_select_due_prefers_most_overdue_and_skips_locked_or_fresh():
    now = job_scheduler.utcnow()
    states = {
        "bmkg": {"last_finished_at": (now - timedelta(seconds=301)).isoformat()},
        "news": {"last_finished_at": (now - timedelta(seconds=10)).isoformat()},
        "firms": {"last_finished_at": (now - timedelta(seconds=21601)).isoformat()},
        "tomtom": {"locked_until": (now + timedelta(seconds=60)).isoformat()},
    }

    due, skipped = job_scheduler.select_due(states, now=now)

    # 21601 / 10800 > 301 / 300 => the 3h job outranks the 5-min one.
    assert due.index("firms") < due.index("bmkg")
    assert "news" not in due
    assert {"job": "news", "reason": "not_due"} in skipped
    assert {"job": "tomtom", "reason": "locked"} in skipped
    # Never-run jobs are always due (catch-up after a deploy / missed ticks).
    assert "pihps" in due
    assert set(due) | {entry["job"] for entry in skipped} == set(job_scheduler.JOB_SPECS)


@pytest.mark.asyncio
async def test_state_unavailable_skips_the_tick_without_raising(monkeypatch):
    def unavailable():
        raise job_scheduler.SchedulerStateUnavailable("supabase unreachable")

    monkeypatch.setattr(job_scheduler, "load_states", unavailable)

    plan = await job_scheduler.plan_tick()
    assert plan.due == []
    assert plan.reason == "state_unavailable"
    assert {entry["reason"] for entry in plan.skipped} == {"state_unavailable"}

    executed = []

    async def fake_cycle():
        executed.append(1)

    monkeypatch.setattr(job_scheduler, "get_job_callable", lambda name: fake_cycle)
    result = await job_scheduler.run_tick(plan=plan, run_id="degraded")

    assert executed == []
    assert result["executed"] == []


def test_registry_cadences_match_the_m8_contract():
    assert {name: spec.cadence_seconds for name, spec in job_scheduler.JOB_SPECS.items()} == {
        "news": 300,
        "bmkg": 300,
        "tomtom": 1800,
        "open_meteo": 21600,
        "firms": 10800,
        "pihps": 86400,
        "social": 3600,
        "bnpb": 3600,
    }


# ---------------------------------------------------------------------------
# 4. Thin-web boot
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_thin_web_boot_starts_no_batch_pollers_and_defers_continuous(monkeypatch):
    started = []
    _stub_lifespan_dependencies(monkeypatch, started)
    monkeypatch.setattr(app_main.settings, "inprocess_batch_pollers", False)
    monkeypatch.setattr(app_main.settings, "continuous_task_delay_seconds", 75.0)

    scheduled = []
    real_schedule = app_main._schedule_continuous

    def spy_schedule(name, runner, delay):
        scheduled.append((name, delay))
        return real_schedule(name, runner, delay)

    monkeypatch.setattr(app_main, "_schedule_continuous", spy_schedule)

    async with app_main.lifespan(app):
        await asyncio.sleep(0.05)
        # No batch poller ran, and the continuous consumers are still waiting out
        # the boot window (nothing from the recorders was called).
        assert started == []
        assert [name for name, _ in scheduled] == ["aisstream", "validated_alert_fanout"]
        assert all(delay == 75.0 for _, delay in scheduled)


@pytest.mark.asyncio
async def test_default_boot_still_starts_batch_pollers(monkeypatch):
    started = []
    _stub_lifespan_dependencies(monkeypatch, started)
    monkeypatch.setattr(app_main.settings, "inprocess_batch_pollers", True)

    async with app_main.lifespan(app):
        await asyncio.sleep(0.05)
        assert {
            "_poll_bmkg_loop",
            "_poll_tomtom_loop",
            "_poll_open_meteo_loop",
            "_poll_firms_loop",
            "_poll_news_loop",
            "_poll_pihps_loop",
            "_poll_social_osint_loop",
            "_poll_bnpb_loop",
        } <= set(started)


@pytest.mark.asyncio
async def test_continuous_consumer_starts_after_the_delay(monkeypatch):
    calls = []

    async def runner():
        calls.append("ran")

    task = app_main._schedule_continuous("unit-test", runner, 0.01)
    try:
        await asyncio.sleep(0.05)
        assert calls == ["ran"]
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
