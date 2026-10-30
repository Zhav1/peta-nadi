import asyncio
import threading
import time
from types import SimpleNamespace

import httpx
import pytest

from app.auth.supabase_auth import default_guest_session
from app.db import supabase_client
from app.routers import commodity_router, erp_router


@pytest.mark.asyncio
async def test_erp_summary_database_work_does_not_block_event_loop(monkeypatch):
    def slow_build(**kwargs):
        time.sleep(0.25)
        return {"marker": "summary"}

    monkeypatch.setattr(erp_router, "build_erp_summary", slow_build)
    request = asyncio.create_task(
        erp_router.get_erp_summary(
            company_id=None, limit=500, user=default_guest_session()
        )
    )
    heartbeat = asyncio.create_task(asyncio.sleep(0.02))

    await heartbeat
    assert not request.done()
    assert await asyncio.wait_for(request, timeout=1) == {"marker": "summary"}


@pytest.mark.asyncio
async def test_spikes_rpc_does_not_block_event_loop(monkeypatch):
    rpc_started = threading.Event()
    records = [
        {"commodity": "cabai_merah", "region": "north_sumatra", "price_idr": price, "time": stamp}
        for price, stamp in (
            (60000.0, "2026-10-10T12:00:00Z"),
            (48000.0, "2026-10-05T12:00:00Z"),
            (50000.0, "2026-10-01T12:00:00Z"),
        )
    ]

    class Query:
        def select(self, *args, **kwargs):
            return self

        def gte(self, *args, **kwargs):
            return self

        def order(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def eq(self, *args, **kwargs):
            return self

        def execute(self):
            return SimpleNamespace(data=records)

    class RPC:
        def execute(self):
            rpc_started.set()
            time.sleep(0.25)
            return SimpleNamespace(
                data=[{
                    "commodity": "cabai_merah",
                    "region": "north_sumatra",
                    "mean_price": 52666.67,
                    "n": 3,
                }]
            )

    class Client:
        def table(self, name):
            return Query()

        def rpc(self, name, params):
            return RPC()

    monkeypatch.setattr(supabase_client, "get_client", lambda: Client())
    monkeypatch.setattr(commodity_router, "_cache_read", lambda key: None)
    monkeypatch.setattr(commodity_router, "_cache_write", lambda key, value: None)

    request = asyncio.create_task(commodity_router.get_commodity_spikes(region=None))
    assert await asyncio.wait_for(asyncio.to_thread(rpc_started.wait, 1), timeout=1)
    heartbeat = asyncio.create_task(asyncio.sleep(0.02))

    await heartbeat
    assert not request.done()
    response = await asyncio.wait_for(request, timeout=1)
    assert response["total"] == 1
    assert response["spikes"][0]["commodity"] == "cabai_merah"


@pytest.mark.asyncio
async def test_concurrent_price_cache_misses_share_one_database_query(monkeypatch):
    query_count = 0
    query_count_lock = threading.Lock()
    row = {
        "time": "2026-10-10T12:00:00Z",
        "commodity": "beras",
        "region": "north_sumatra",
        "price_idr": 15000.0,
        "source": "pihps",
        "metadata": {},
    }

    class Query:
        def select(self, *args, **kwargs):
            return self

        def order(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def eq(self, *args, **kwargs):
            return self

        def execute(self):
            nonlocal query_count
            with query_count_lock:
                query_count += 1
            time.sleep(0.08)
            return SimpleNamespace(data=[row])

    class Client:
        def table(self, name):
            return Query()

    monkeypatch.setattr(supabase_client, "get_client", lambda: Client())
    monkeypatch.setattr(commodity_router, "_cache_read", lambda key: None)
    monkeypatch.setattr(commodity_router, "_cache_write", lambda key, value: None)

    first, second = await asyncio.gather(
        commodity_router.get_commodity_prices(
            commodity="beras", region="north_sumatra", limit=30
        ),
        commodity_router.get_commodity_prices(
            commodity="beras", region="north_sumatra", limit=30
        ),
    )

    assert query_count == 1
    assert first == second
    assert first.total == 1
    assert first.items[0].price_idr == 15000.0


@pytest.mark.asyncio
async def test_commodity_database_timeouts_preserve_empty_response_contract(monkeypatch):
    class Query:
        def select(self, *args, **kwargs):
            return self

        def order(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def eq(self, *args, **kwargs):
            return self

        def gte(self, *args, **kwargs):
            return self

        def execute(self):
            raise httpx.ReadTimeout("mock PostgREST timeout")

    class Client:
        def table(self, name):
            return Query()

    monkeypatch.setattr(supabase_client, "get_client", lambda: Client())
    monkeypatch.setattr(commodity_router, "_cache_read", lambda key: None)
    monkeypatch.setattr(commodity_router, "_cache_write", lambda key, value: None)

    prices = await commodity_router.get_commodity_prices(
        commodity="beras", region="north_sumatra", limit=30
    )
    spikes = await commodity_router.get_commodity_spikes(region="north_sumatra")

    assert prices.model_dump() == {"items": [], "total": 0}
    assert spikes == {"spikes": [], "total": 0}


def test_supabase_clients_use_bounded_postgrest_timeout(monkeypatch):
    created_options = []

    def fake_create_client(url, key, options=None):
        created_options.append(options)
        return object()

    monkeypatch.setattr(supabase_client, "create_client", fake_create_client)
    monkeypatch.setattr(supabase_client.settings, "supabase_url", "https://example.invalid")
    monkeypatch.setattr(supabase_client.settings, "supabase_anon_key", "anon-test-key")
    monkeypatch.setattr(
        supabase_client.settings, "supabase_service_role_key", "service-test-key"
    )
    monkeypatch.setattr(supabase_client, "_supabase_client", None)
    monkeypatch.setattr(supabase_client, "_service_client", None)

    supabase_client.get_client()
    supabase_client.get_service_client()

    assert len(created_options) == 2
    assert all(
        options.postgrest_client_timeout
        == supabase_client.POSTGREST_CLIENT_TIMEOUT_SECONDS
        for options in created_options
    )
