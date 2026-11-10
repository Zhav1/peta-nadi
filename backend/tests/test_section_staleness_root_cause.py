"""Root-cause regressions for the three sections that stayed permanently stale.

Measured production state (2026-11-10 13:23 UTC, ``private.public_snapshot_sections``):

* ``corridor_context`` was ``ok`` at ``observed_at 13:20:16`` while
  ``traffic_flow_segments`` — built from the SAME TomTom record — sat at
  ``12:47:45``. Two defects produced that split:
    1. each worker reads its own Redis first, so a stale local copy shadowed the
       fresher durable raw record (the worker that won the lease was the only
       one writing its Redis);
    2. the Phase 180 SQL guard only persisted ok/healthy/stale sections, so a
       fresh-but-partial TomTom fetch (19/20 checkpoints) was never stored and
       the durable row aged out of its window.
* ``weather_summary`` was pinned at ``generated_at 12:54:11`` /
  ``valid_until 13:10:11``: the composing worker fused a 13:05:11 BMKG record
  from its own Redis while the durable BMKG record was 13:17:50. The
  ``min(fetched_at)`` / ``min(valid_until)`` rule is NOT the pin — Open-Meteo's
  6 h expiry never shortens the window — the stale read is.
* ``news`` published ``observed_at 2026-10-09`` with ``valid_until now + 10 min``
  over the OLDEST 60 rows (no ORDER BY) and the last row's stamp. The table held
  8 312 articles, the newest from the same day.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.adapters.tomtom_adapter import TomTomAdapter
from app.services import public_operational_cache as operational_cache
from app.services import public_snapshot_service as snapshots


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _weather_record(*, source: str, fetched_at: datetime, ttl_seconds: int, events=None) -> dict:
    return {
        "source": source,
        "raw": {},
        "events": list(events or []),
        "fetched_at": _iso(fetched_at),
        "observed_at": _iso(fetched_at),
        "valid_until": _iso(fetched_at + timedelta(seconds=ttl_seconds)),
        "status": "ok",
        "error": None,
    }


def _bmkg_event() -> dict:
    return {
        "event_type": "weather_warning",
        "source": "bmkg",
        "severity": "high",
        "lat": 3.58,
        "lon": 98.67,
        "title": "Peringatan Cuaca Ekstrem",
        "region": "Sumatera Utara",
        "raw": "{}",
    }


@pytest.fixture
def isolated_sections(monkeypatch):
    """Keep ``_build_sections`` off Redis/Supabase and out of the network."""
    monkeypatch.setattr(
        "app.services.observed_disaster_service.read_observed_disasters",
        lambda: {"status": "unknown", "data": None, "updated_at": None},
    )
    monkeypatch.setattr(
        "app.adapters.tomtom_adapter.get_cached_sumatra_traffic",
        lambda: {"status": "unknown", "data": None},
    )
    return monkeypatch


# ---------------------------------------------------------------------------
# 1. Two Redis caches: the fresher copy wins, whichever store holds it
# ---------------------------------------------------------------------------

def _source_payload(source: str, fetched_at: datetime) -> str:
    return json.dumps(_weather_record(source=source, fetched_at=fetched_at, ttl_seconds=300))


def test_source_record_read_prefers_the_fresher_durable_copy(monkeypatch):
    """A stale local Redis must not shadow a fresher durable raw record."""
    now = datetime.now(timezone.utc)
    local = _weather_record(source="bmkg", fetched_at=now - timedelta(minutes=16), ttl_seconds=300)
    shared = _weather_record(source="bmkg", fetched_at=now - timedelta(minutes=3), ttl_seconds=300)

    monkeypatch.setattr(operational_cache, "cache_get", lambda key: json.dumps(local))
    monkeypatch.setattr(operational_cache, "_read_durable", lambda key: shared)

    record = operational_cache.read_cached_source_observations()["bmkg"]

    assert record["fetched_at"] == shared["fetched_at"]
    assert record["valid_until"] == shared["valid_until"]


def test_source_record_read_keeps_a_newer_local_copy(monkeypatch):
    """Redis is still the fast path when it is the fresher copy."""
    now = datetime.now(timezone.utc)
    local = _weather_record(source="bmkg", fetched_at=now - timedelta(minutes=1), ttl_seconds=300)
    shared = _weather_record(source="bmkg", fetched_at=now - timedelta(minutes=30), ttl_seconds=300)

    monkeypatch.setattr(operational_cache, "cache_get", lambda key: json.dumps(local))
    monkeypatch.setattr(operational_cache, "_read_durable", lambda key: shared)

    record = operational_cache.read_cached_source_observations()["bmkg"]

    assert record["fetched_at"] == local["fetched_at"]


def test_composed_snapshot_read_prefers_the_fresher_durable_copy(monkeypatch):
    """The read path may not serve an older composed snapshot than the durable one."""
    now = datetime.now(timezone.utc)
    old = now - timedelta(minutes=33)
    fresh = now - timedelta(minutes=2)

    def snapshot(observed: datetime) -> dict:
        return {
            "version": 1,
            "updated_at": _iso(observed),
            "sections": {
                "weather_summary": {
                    "status": "ok",
                    "data": {"generated_at": _iso(observed)},
                    "observed_at": _iso(observed),
                    "valid_until": _iso(observed + timedelta(minutes=5)),
                }
            },
        }

    monkeypatch.setattr(operational_cache, "cache_get", lambda key: json.dumps(snapshot(old)))
    monkeypatch.setattr(operational_cache, "_read_durable", lambda key: snapshot(fresh))

    served = operational_cache.read_public_operational_cache()

    assert served["weather_summary"]["observed_at"] == _iso(fresh)


# ---------------------------------------------------------------------------
# 2. Weather: Open-Meteo drags observed_at, never the validity window
# ---------------------------------------------------------------------------

def test_weather_validity_comes_from_bmkg_not_the_six_hour_nwp_cadence(isolated_sections):
    """The 16-minute window was a stale read, not the min(fetched_at) rule."""
    now = datetime.now(timezone.utc)
    bmkg = _weather_record(
        source="bmkg", fetched_at=now - timedelta(minutes=1), ttl_seconds=300, events=[_bmkg_event()]
    )
    open_meteo = _weather_record(
        source="open_meteo", fetched_at=now - timedelta(minutes=26), ttl_seconds=6 * 3600
    )

    weather = operational_cache._build_sections({"bmkg": bmkg, "open_meteo": open_meteo})[
        "weather_summary"
    ]

    # observed_at is the OLDEST fetch (Open-Meteo) …
    assert _parse(weather["observed_at"]) == _parse(open_meteo["fetched_at"])
    # … but validity is the earliest expiry, which is BMKG's 300 s window, and
    # Open-Meteo's 6 h expiry never shortens it.
    assert _parse(weather["valid_until"]) == _parse(bmkg["valid_until"])
    assert _parse(weather["valid_until"]) > now
    assert weather["status"] == "ok"


# ---------------------------------------------------------------------------
# 3. Traffic: a partial fetch is degraded, but its evidence is fresh
# ---------------------------------------------------------------------------

def _flow_item(checkpoint: dict) -> dict:
    return {
        "flowSegmentData": {"currentSpeed": 30, "freeFlowSpeed": 80},
        "_checkpoint_name": checkpoint["name"],
        "_checkpoint_id": checkpoint["id"],
        "_lat": checkpoint["lat"],
        "_lon": checkpoint["lon"],
    }


def _partial_traffic_record(*, fetched_at: datetime) -> dict:
    checkpoints = TomTomAdapter.CHECKPOINTS[:-1]  # 19/20: one checkpoint failed
    return {
        "source": "tomtom",
        "raw": {
            "flow": [_flow_item(cp) for cp in checkpoints],
            "incidents": [],
            "status": "degraded",
            "degraded_reason": "1/20 flow requests failed; partial_flow_coverage:19/20",
            "expected_checkpoint_count": len(TomTomAdapter.CHECKPOINTS),
            "observed_checkpoint_count": len(checkpoints),
        },
        "events": [],
        "fetched_at": _iso(fetched_at),
        "observed_at": _iso(fetched_at),
        "valid_until": _iso(
            fetched_at + timedelta(seconds=operational_cache.SOURCE_TTL_SECONDS["tomtom"])
        ),
        "status": "partial",
        "error": "1/20 flow requests failed; partial_flow_coverage:19/20",
    }


def test_partial_tomtom_section_is_degraded_with_fresh_evidence(isolated_sections):
    now = datetime.now(timezone.utc)
    record = _partial_traffic_record(fetched_at=now)

    sections = operational_cache._build_sections({"tomtom": record})
    traffic = snapshots._entry_from_source(sections, None, "traffic_flow_segments")

    assert traffic["status"] == "degraded", "19/20 coverage is honest, not ok"
    # …and the evidence clock is the fetch, never the last fully-ok row.
    assert traffic["observed_at"] == record["observed_at"]
    assert traffic["valid_until"] == record["valid_until"]
    assert _parse(traffic["valid_until"]) > now


def test_phase181_guard_persists_degraded_sections_with_the_same_evidence_rule():
    """The SQL guard must store degraded evidence, or fresh partials never land."""
    sql = (
        Path(__file__).resolve().parents[2]
        / "infra/supabase/migrations/20261110130000_phase181_section_guard_degraded.sql"
    ).read_text(encoding="utf-8")

    assert "'ok', 'healthy', 'stale', 'degraded', 'partial'" in sql
    # The evidence rule and the fence are untouched.
    assert "coalesce(EXCLUDED.observed_at, EXCLUDED.valid_until)" in sql
    assert "coalesce(stored.observed_at, stored.valid_until)" in sql
    assert "stored.valid_until < clock_timestamp()" in sql
    assert "ON CONFLICT (section_name) DO UPDATE" in sql
    assert "v_lease.owner_id <> p_owner_id" in sql
    assert "v_lease.fence <> p_fence" in sql
    assert "v_lease.expires_at <= clock_timestamp()" in sql


# ---------------------------------------------------------------------------
# 4. News: newest rows, newest stamp, validity derived from the evidence
# ---------------------------------------------------------------------------

@pytest.fixture
def keep_all_rows(monkeypatch):
    monkeypatch.setattr(snapshots, "_filter_disruption_db_rows", lambda rows: list(rows))


def _article(published_at: datetime) -> dict:
    return {
        "id": f"NEWS-{int(published_at.timestamp())}",
        "title": "Banjir putus jalinsum Sumatera",
        "published_at": _iso(published_at),
        "created_at": _iso(published_at),
    }


def test_news_observed_at_is_the_newest_article_not_the_last_row(keep_all_rows):
    now = datetime.now(timezone.utc)
    rows = [
        _article(now - timedelta(days=30)),
        _article(now - timedelta(minutes=2)),
        _article(now - timedelta(days=3)),
    ]

    entry = snapshots._db_entry(rows, None, ttl_seconds=600, now=now)

    assert entry["observed_at"] == _iso(now - timedelta(minutes=2))
    assert entry["valid_until"] == _iso(now - timedelta(minutes=2) + timedelta(seconds=600))
    assert entry["status"] == "ok"


def test_news_is_stale_when_the_newest_article_is_past_the_window(keep_all_rows):
    now = datetime.now(timezone.utc)
    newest = now - timedelta(hours=1)

    entry = snapshots._db_entry([_article(newest)], None, ttl_seconds=600, now=now)

    # No "valid_until = now + 10 min" over month-old evidence.
    assert entry["status"] == "stale"
    assert entry["observed_at"] == _iso(newest)
    assert entry["valid_until"] == _iso(newest + timedelta(seconds=600))
    assert _parse(entry["valid_until"]) < now


def test_db_entry_without_rows_invents_no_observation(keep_all_rows):
    entry = snapshots._db_entry([], None, now=datetime.now(timezone.utc))

    assert entry["status"] == "ok"
    assert entry["data"] == []
    assert entry["observed_at"] is None
    assert entry["valid_until"] is None


def test_news_rows_are_read_newest_first(monkeypatch):
    """Without ORDER BY the builder received the OLDEST 60 rows."""
    calls: list[tuple[str, bool]] = []

    class _Query:
        def select(self, *args, **kwargs):
            return self

        def order(self, column, desc=False):
            calls.append((column, desc))
            return self

        def limit(self, count):
            self.count = count
            return self

        def execute(self):
            class _Response:
                data = [{"id": "NEWS-1"}]

            return _Response()

    class _Client:
        def table(self, name):
            assert name == "news_articles"
            return _Query()

    monkeypatch.setattr("app.db.supabase_client.get_service_client", lambda: _Client())

    rows, error = snapshots._response_rows("news_articles", 60)

    assert error is None
    assert rows == [{"id": "NEWS-1"}]
    assert calls == [("published_at", True)]


# ---------------------------------------------------------------------------
# 5. Scheduler: a 300 s job must fire on every 300 s tick
# ---------------------------------------------------------------------------

def _state(age_seconds: int) -> dict:
    now = datetime.now(timezone.utc)
    return {"last_finished_at": _iso(now - timedelta(seconds=age_seconds))}


def test_a_cadence_equals_tick_job_is_due_on_every_tick():
    """bmkg finished 266 s ago (the tick's own runtime): it is still due.

    ``age >= cadence`` skipped it, so bmkg polled every 600 s while its
    published window is 300 s — weather_summary was stale half of every cycle.
    """
    from app.services import job_scheduler

    now = datetime.now(timezone.utc)
    due, skipped = job_scheduler.select_due({"bmkg": _state(266)}, now=now)

    assert "bmkg" in due
    assert {"job": "bmkg", "reason": "not_due"} not in skipped


def test_a_just_finished_job_is_not_due_again():
    from app.services import job_scheduler

    now = datetime.now(timezone.utc)
    due, _ = job_scheduler.select_due({"news": _state(10)}, now=now)

    assert "news" not in due


def test_a_long_cadence_job_is_not_pulled_a_tick_early():
    from app.services import job_scheduler

    now = datetime.now(timezone.utc)
    # Five ticks after the last TomTom run: not due yet.
    early, _ = job_scheduler.select_due({"tomtom": _state(1495)}, now=now)
    assert "tomtom" not in early

    # Its own 1800 s tick (the run finished ~5 s into the previous tick).
    on_time, _ = job_scheduler.select_due({"tomtom": _state(1795)}, now=now)
    assert "tomtom" in on_time
