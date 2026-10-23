import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from agents.state import CrisisState
from agents.nodes.data_collection import data_collection_agent
from agents.nodes.osint_hazard import osint_hazard_agent
from agents.nodes.prediction import prediction_agent
from agents.nodes.route_optimization import route_optimization_agent
from agents.nodes.economic_intelligence import economic_intelligence_agent
from agents.nodes.decision_support import decision_support_copilot
from agents.graph import build_crisis_graph, consensus_gate_node
from agents.tools.consensus_gate import compute_consensus


class MockRedis:
    def __init__(self):
        self.get_return_value = None
        self.keys_return_value = []
        self._get_override = None
        self._keys_override = None

    async def get(self, key, *args, **kwargs):
        if self._get_override:
            return await self._get_override(key)
        if key == "lrip:pihps:latest":
            return '{"rice": {"current": 16000, "mean": 12000, "std": 1000}}'
        return self.get_return_value

    async def keys(self, pattern, *args, **kwargs):
        if self._keys_override:
            return await self._keys_override(pattern)
        return self.keys_return_value

    async def sadd(self, *args, **kwargs):
        return 1

    async def set(self, *args, **kwargs):
        return "OK"

    async def xrange(self, *args, **kwargs):
        return []


@pytest.fixture
def mock_redis():
    with patch("agents.memory.stm.Redis.from_url") as mock:
        client = MockRedis()
        mock.return_value = client
        
        # Reset singleton inside stm module to force get_async_redis to call from_url
        import agents.memory.stm
        agents.memory.stm._async_redis_client = None
        
        yield client
        # Clean up after test
        agents.memory.stm._async_redis_client = None


@pytest.fixture
def mock_supabase():
    import app.db.supabase_client
    client = MagicMock()
    app.db.supabase_client._supabase_client = client
    # Backend write paths resolve get_write_client() first (service-role when the
    # key is configured). Patch both the factory and the imported symbol so tests
    # never build a real client from .env.
    with patch("app.db.supabase_client.get_write_client", return_value=client), \
         patch("agents.tools.supabase_tools.get_write_client", return_value=client):
        yield client
    app.db.supabase_client._supabase_client = None


@pytest.mark.asyncio
async def test_data_collection_valid_event(mock_redis, mock_supabase):
    # Mock Redis is_seen to return False
    mock_redis.get_return_value = None
    # Mock source_health to return 'green'
    mock_supabase.table().select().eq().execute.return_value = MagicMock(data=[{"status": "green"}])
    
    state: CrisisState = {
        "crisis_id": "test_id",
        "type": "flood",
        "severity": "high",
        "source": "bmkg",
        "lat": 3.5,
        "lon": 98.5,
        "region": "north_sumatra",
        "status": "detecting",
        "messages": [],
        "route_recommendations": []
    }
    
    result = await data_collection_agent(state)
    assert "normalized_event" in result
    assert result["normalized_event"]["validated"] is True
    assert result["data_collection_finding"]["confidence"] == 0.9


@pytest.mark.asyncio
async def test_data_collection_duplicate_event(mock_redis, mock_supabase):
    mock_redis.get_return_value = "1"
    
    state: CrisisState = {
        "crisis_id": "test_id",
        "type": "flood",
        "severity": "high",
        "source": "bmkg",
        "lat": 3.5,
        "lon": 98.5,
        "region": "north_sumatra",
        "status": "detecting",
        "messages": [],
        "route_recommendations": []
    }
    
    result = await data_collection_agent(state)
    assert result["status"] == "duplicate"


@pytest.mark.asyncio
async def test_data_collection_malformed_event(mock_redis, mock_supabase):
    mock_redis.get_return_value = None
    mock_supabase.table().select().eq().execute.return_value = MagicMock(data=[])
    
    state: CrisisState = {
        "crisis_id": "test_id",
        "type": None,
        "severity": "invalid",
        "source": "unknown",
        "lat": None,
        "lon": None,
        "region": None,
        "status": "detecting",
        "messages": [],
        "route_recommendations": []
    }
    
    result = await data_collection_agent(state)
    assert result["normalized_event"]["validated"] is False
    # Confidence degraded due to errors and default yellow health
    assert result["data_collection_finding"]["confidence"] < 0.6


@pytest.mark.asyncio
async def test_osint_hazard_with_polygon(mock_redis, mock_supabase):
    # Mock Supabase get_hazard_polygons (schema: affected_area + severity + status)
    mock_supabase.table().select().gte().lte().gte().lte().execute.return_value = MagicMock(data=[
        {
            "incident_id": "1",
            "title": "Flood polygon",
            "type": "flood",
            "severity": "high",
            "status": "validated",
            "affected_area": {"type": "Polygon", "coordinates": []}
        }
    ])
    
    state: CrisisState = {
        "normalized_event": {"event_type": "flood", "source": "bmkg"},
        "lat": 3.5,
        "lon": 98.5,
        "region": "north_sumatra"
    }
    
    result = await osint_hazard_agent(state)
    assert len(result["hazard_polygons"]) == 1
    assert result["hazard_polygons"][0]["severity"] == "high"
    assert result["osint_hazard_finding"]["confidence"] >= 0.8


@pytest.mark.asyncio
async def test_osint_hazard_filters_resolved_and_preserves_severity(mock_redis, mock_supabase):
    """Resolved incidents must not surface as active hazards; row severity is preserved."""
    mock_supabase.table().select().gte().lte().gte().lte().execute.return_value = MagicMock(data=[
        {
            "incident_id": "resolved-1",
            "title": "Old flood",
            "type": "flood",
            "severity": "critical",
            "status": "resolved",
            "affected_area": {"type": "Polygon", "coordinates": []}
        },
        {
            "incident_id": "active-1",
            "title": "Active flood",
            "type": "flood",
            "severity": "critical",
            "status": "validated",
            "affected_area": {"type": "Polygon", "coordinates": []}
        }
    ])

    state: CrisisState = {
        "normalized_event": {"event_type": "flood", "source": "bmkg"},
        "lat": 3.5,
        "lon": 98.5,
        "region": "north_sumatra"
    }

    result = await osint_hazard_agent(state)
    assert [h["incident_id"] for h in result["hazard_polygons"]] == ["active-1"]
    assert result["hazard_polygons"][0]["severity"] == "critical"


@pytest.mark.asyncio
async def test_osint_hazard_no_polygon(mock_redis, mock_supabase):
    mock_supabase.table().select().gte().lte().gte().lte().execute.return_value = MagicMock(data=[])
    
    state: CrisisState = {
        "normalized_event": {"event_type": "flood", "source": "bmkg"},
        "lat": 3.5,
        "lon": 98.5,
        "region": "north_sumatra"
    }
    
    result = await osint_hazard_agent(state)
    assert len(result["hazard_polygons"]) == 0
    assert result["osint_hazard_finding"]["confidence"] == 0.6



@pytest.mark.asyncio
async def test_prediction_with_tomtom_data(mock_redis, mock_supabase):
    # Use custom async functions to avoid AsyncMock event loop closed issues
    async def mock_keys(pattern):
        return [f"lrip:tomtom:segment:{i}" for i in range(5)]
    async def mock_get(key):
        return '{"delay_min": 15.0, "timestamp": 1234567}'
    mock_redis._keys_override = mock_keys
    mock_redis._get_override = mock_get
    mock_supabase.table().select().eq().execute.return_value = MagicMock(data=[{"incident_id": "1"}] * 10)
    # History path now filters region *evidence* in Python (incidents has no region column).
    mock_supabase.table().select().execute.return_value = MagicMock(
        data=[{"incident_id": "1", "evidence": {"region": "north_sumatra"}}] * 10
    )
    
    state: CrisisState = {
        "normalized_event": {"event_type": "congestion"},
        "region": "north_sumatra"
    }
    
    result = await prediction_agent(state)
    assert "congestion_forecast" in result
    assert "6h" in result["congestion_forecast"]
    assert result["prediction_finding"]["confidence"] >= 0.7


@pytest.mark.asyncio
async def test_route_optimization_blocked_primary(mock_supabase):
    # Seed mock road edges
    mock_supabase.table().select().execute.return_value = MagicMock(data=[
        {"from_node": "Belawan Port", "to_node": "Medan Interchange", "distance_km": 26.0, "corridor": "belawan_access"},
        {"from_node": "Medan Interchange", "to_node": "Binjai km 18", "distance_km": 22.0, "corridor": "trans_sumatra"},
        {"from_node": "Medan Interchange", "to_node": "Dumai Port", "distance_km": 400.0, "corridor": "trans_sumatra_south"}
    ])
    
    # Hazard polygon is blocking belawan_access
    state: CrisisState = {
        "type": "port_closure",
        "severity": "critical",
        "hazard_polygons": [{"incident_id": "1", "polygon": {}}],
        "region": "north_sumatra"
    }
    
    result = await route_optimization_agent(state)
    assert "route_recommendations" in result
    # It finds path because belawan_access is blocked but Dumai Port might not be reachable if all path blocked,
    # let's verify finding output is structured
    assert "route_optimization_finding" in result


@pytest.mark.asyncio
@patch("agents.nodes.economic_intelligence.query_ltm")
async def test_economic_intelligence_anomaly_detected(mock_query_ltm, mock_redis, mock_supabase):
    # Use custom async function to avoid side_effect problems
    async def mock_get(key):
        if key == "lrip:pihps:latest":
            return '{"rice": {"current": 16000, "mean": 12000, "std": 1000}}'
        return None
    mock_redis._get_override = mock_get
    
    # Mock query_ltm return value directly
    mock_query_ltm.return_value = [
        {
            "episode_id": "e1",
            "title": "past flood",
            "description": "past flood",
            "crisis_type": "flood",
            "inflation_multiplier": 1.25,
            "recovery_days": 5,
            "similarity_score": 0.85
        }
    ]
    
    state: CrisisState = {
        "normalized_event": {"event_type": "flood", "severity": "high"},
        "region": "north_sumatra"
    }
    
    result = await economic_intelligence_agent(state)
    assert result["inflation_forecast"]["inflation_multiplier"] == 1.25
    assert result["economic_intelligence_finding"]["confidence"] >= 0.7


@pytest.mark.asyncio
@patch("agents.nodes.economic_intelligence.query_ltm")
async def test_economic_intelligence_rejects_degraded_llm_text(mock_query_ltm, mock_redis, mock_supabase):
    """S2: canned fallback text must never satisfy Agent 5's narrative."""
    mock_query_ltm.return_value = []
    degraded_text = (
        "RINGKASAN EKSEKUTIF PREHUB (FALLBACK MODE)\n"
        "1. Ancaman Fisik: Curah hujan tinggi terdeteksi di koridor Belawan-Medan.\n"
        "2. Dampak Ekonomi: Potensi kenaikan harga komoditas pangan 8-15% dalam 48 jam.\n"
        "3. Mitigasi: Pengalihan rute melalui Tol Medan-Tebing Tinggi disarankan."
    )

    state: CrisisState = {
        "normalized_event": {"event_type": "flood", "severity": "high"},
        "region": "north_sumatra"
    }

    from agents.llm_gateway import LLMGateway
    with patch.object(LLMGateway, "generate_content", AsyncMock(return_value=degraded_text)):
        result = await economic_intelligence_agent(state)

    summary = result["economic_intelligence_finding"]["summary"]
    assert "RINGKASAN EKSEKUTIF PREHUB" not in summary
    assert "Model dampak ekonomi" in summary


def test_consensus_gate_validates_at_85pct():
    state: CrisisState = {
        "osint_hazard_finding": {"confidence": 0.9},
        "data_collection_finding": {"confidence": 0.9, "distance_km": 5.0},
        "prediction_finding": {"confidence": 0.8, "distance_km": 5.0},
        "route_optimization_finding": {"confidence": 0.8},
        "economic_intelligence_finding": {"confidence": 0.8}
    }
    result = compute_consensus(state)
    assert result["route"] == "validated"
    assert result["overall_confidence"] >= 0.85


def test_consensus_gate_rejects_below_85pct():
    state: CrisisState = {
        "osint_hazard_finding": {"confidence": 0.5},
        "data_collection_finding": {"confidence": 0.6},
        "prediction_finding": {"confidence": 0.5},
        "route_optimization_finding": {"confidence": 0.5},
        "economic_intelligence_finding": {"confidence": 0.4}
    }
    result = compute_consensus(state)
    assert result["route"] == "unconfirmed"
    assert result["overall_confidence"] < 0.85


@pytest.mark.asyncio
async def test_decision_support_output_format(mock_redis, mock_supabase):
    # Mock Supabase insert
    mock_supabase.table().insert().execute.return_value = MagicMock(data=[{"incident_id": "i-123"}])
    # Mock GraphRAG query
    mock_supabase.table().select().ilike().execute.return_value = MagicMock(data=[{"entity_id": "ent-1"}])
    mock_supabase.table().select().execute.side_effect = [
        MagicMock(data=[{"entity_id": "ent-1", "name": "Belawan Port", "entity_type": "port"}]),
        MagicMock(data=[])
    ]
    
    state: CrisisState = {
        "crisis_id": "c-123",
        "title": "Belawan Port closure",
        "type": "port_closure",
        "severity": "high",
        "region": "north_sumatra",
        "data_collection_finding": {"summary": "test"},
        "osint_hazard_finding": {"summary": "test"},
        "prediction_finding": {"summary": "test"},
        "route_optimization_finding": {"summary": "test"},
        "economic_intelligence_finding": {"summary": "test"},
        "congestion_forecast": {},
        "route_recommendations": []
    }
    
    result = await decision_support_copilot(state)
    assert result["status"] == "validated"
    assert "decision_support_output" in result


def test_demo_start_delegates_persistence_to_write_incident(mock_supabase):
    """Demo persistence must delegate to write_incident, never insert dict(state)."""
    from fastapi.testclient import TestClient
    from app.main import app

    with patch(
        "agents.tools.supabase_tools.write_incident",
        new=AsyncMock(return_value="inc-demo-1"),
    ) as mock_write_incident:
        response = TestClient(app).post(
            "/api/demo/start",
            json={"mock_agents": True, "offline": False},
        )

    assert response.status_code == 200
    body = response.json()
    assert mock_write_incident.await_count == 1
    saved_state = mock_write_incident.await_args.args[0]
    assert saved_state["crisis_id"] == body["crisis_id"]
    # The raw writer path must not be reached with an unwhitelisted row.
    mock_supabase.table.assert_not_called()


def test_graph_compiles():
    graph = build_crisis_graph()
    compiled = graph.compile()
    assert compiled is not None


@pytest.mark.asyncio
async def test_four_stage_pipeline_execution(mock_redis, mock_supabase):
    """Verifies that the compiled LangGraph executes in 4 stages and passes state correctly."""
    # Mock data collection health and incident history
    mock_supabase.table().select().eq().execute.return_value = MagicMock(data=[{"status": "green"}] * 6)
    mock_redis.get_return_value = None

    # Mock official ANTARA news in Redis stream to corroborate hazard
    mock_redis.xrange = AsyncMock(return_value=[
        (
            "12345-0",
            {
                "title": "Banjir Luapan Rendam Jalinsum dan Pelabuhan Belawan",
                "summary": "Banjir merendam jalan nasional Medan-Belawan di Sumut dan memutus akses truk logistik.",
                "source": "ANTARA Sumut",
                "source_tier": "TIER_1_OFFICIAL",
                "lane_status": "BLOCKED",
                "corridor_segment": "Jalinsum KM 42",
                "commodities_affected": "cabai,beras",
                "temporal_phase": "active_disruption"
            }
        )
    ])
    
    # Mock TomTom traffic delay and Open-Meteo prediction in Redis
    mock_redis.keys_return_value = [f"lrip:tomtom:segment:cp{i}" for i in range(5)]
    async def custom_get(key, *args, **kwargs):
        if "tomtom:segment" in key:
            return '{"delay_min": 55.0, "currentTravelTime": 3300, "lat": 3.78, "lon": 98.68, "timestamp": 1720000000}'
        if key == "lrip:cache:open_meteo":
            return '[{"raw_payload": {"predictions": {"precipitation_mm_24h": 45.0, "flood_risk_pct": 75.0}}}]'
        if key == "lrip:pihps:latest":
            return '{"rice": {"current": 16000, "mean": 12000, "std": 1000}}'
        return None
    mock_redis._get_override = custom_get



    
    # Mock Supabase insert for decision support
    mock_supabase.table().insert().execute.return_value = MagicMock(data=[{"incident_id": "inc-48"}])
    # Mock GraphRAG query
    mock_supabase.table().select().ilike().execute.return_value = MagicMock(data=[])
    mock_supabase.table().select().execute.return_value = MagicMock(data=[])

    graph = build_crisis_graph()
    compiled = graph.compile()

    initial_event = {
        "crisis_id": "test-e2e-4stage",
        "title": "Banjir Bandang Jalinsum & Belawan",
        "type": "flood",
        "source": "bmkg",
        "severity": "critical",
        "lat": 3.78,
        "lon": 98.68,
        "region": "Sumatera Utara",
        "status": "detecting",
        "messages": [],
        "route_recommendations": []
    }

    # Prediction history: the gate no longer treats a missing distance/history as
    # zero-distance corroboration, so seed >=5 real precedents in the bbox window.
    mock_supabase.table().select().gte().lte().gte().lte().execute.return_value = MagicMock(
        data=[
            {"incident_id": f"hist-{i}", "type": "flood", "evidence": {"region": "Sumatera Utara"}}
            for i in range(6)
        ]
    )

    final_state = await compiled.ainvoke(initial_event)
    
    # Assert Stage 1 completed
    assert "data_collection_finding" in final_state
    # Assert Stage 2 completed & consensus passed
    assert final_state.get("validated") is True
    # Assert Stage 3 completed
    assert "economic_intelligence_finding" in final_state
    # Assert Stage 4 completed
    assert "route_optimization_finding" in final_state
    assert "decision_support_output" in final_state
    assert "hedging_breakdown" in final_state
    assert "compliance_status" in final_state
    assert "Spoilage Hedging" in final_state["decision_support_output"]
    assert "Kepatuhan Regulasi" in final_state["decision_support_output"]


@pytest.mark.asyncio
async def test_route_optimization_hedging_and_bkhit_block(mock_supabase):
    """Verifies that route_optimization_agent calculates hedging valuations and detects BKHIT quarantine block."""
    mock_supabase.table().select().execute.return_value = MagicMock(data=[
        {"from_node": "Belawan Port", "to_node": "Medan Interchange", "distance_km": 26.0, "corridor": "belawan_access"},
        {"from_node": "Medan Interchange", "to_node": "Merak Port", "distance_km": 1500.0, "corridor": "trans_sumatra_java"}
    ])

    state: CrisisState = {
        "type": "flood",
        "severity": "critical",
        "hazard_polygons": [],
        "region": "sumatra",
        "has_bkhit_cert": False, # Missing certificate for inter-island (Java/Merak)
        "cargo_tonnage": 12.0,
        "vehicle_gross_weight_ton": 20.0,
        "news_affected_commodities": ["cabai_merah"]
    }

    result = await route_optimization_agent(state)
    assert "route_recommendations" in result
    routes = result["route_recommendations"]
    assert len(routes) > 0
    top_route = routes[0]
    
    # Verify Hedging
    assert "hedging" in top_route
    hedging = top_route["hedging"]
    assert hedging["optimal_policy"] in ["CONTINUE", "REROUTE", "HOLD"]
    assert hedging["cargo_value_idr"] > 0
    assert hedging["continue_cost_idr"] > 0
    assert hedging["reroute_cost_idr"] > 0

    # Verify Compliance Hard Block for inter-island route lacking BKHIT
    assert "compliance" in top_route
    comp = top_route["compliance"]
    assert comp["status"] == "HARD_BLOCK"
    assert comp["is_compliant"] is False
    assert comp["requires_override"] is False


def test_normalize_region_aliases():
    """All province spellings collapse to canonical slugs (P2 region contract)."""
    from agents.nodes.data_collection import normalize_region

    for raw in ("north_sumatra", "North Sumatra", "Sumatera Utara", "Sumut", "Provinsi Sumatera Utara"):
        assert normalize_region(raw) == "north_sumatra"
    assert normalize_region("Sumatera Selatan") == "south_sumatra"
    assert normalize_region("Kepulauan Riau") == "kepulauan_riau"
    assert normalize_region("Lampung") == "lampung"


@pytest.mark.asyncio
async def test_data_collection_preserves_social_source_and_raw_text(mock_redis, mock_supabase):
    """Simulation provenance never overwrites caller attribution; raw text is unwrapped."""
    import json as _json

    mock_redis.get_return_value = None
    mock_supabase.table().select().eq().execute.return_value = MagicMock(data=[{"status": "green"}])

    result = await data_collection_agent({
        "type": "flood",
        "severity": "high",
        "source": "citizen_report",
        "is_simulated": True,
        "region": "North Sumatra",
        "lat": 3.79,
        "lon": 98.67,
        "raw": _json.dumps({"raw_text": "Banjir parah Pelabuhan Belawan"}),
        "title": "Laporan warga",
        "messages": [],
    })

    norm = result["normalized_event"]
    assert norm["source"] == "citizen_report"
    assert norm["raw_payload"]["text"] == "Banjir parah Pelabuhan Belawan"
    assert result["region"] == "north_sumatra"


@pytest.mark.asyncio
async def test_osint_social_raw_unpack_and_spatial_boost(mock_redis, mock_supabase):
    """A nearby social report is unpacked (tier/published_at) and boosts +0.10."""
    import json as _json
    from datetime import datetime, timezone
    from agents.nodes import osint_hazard as oh
    from agents.llm_gateway import LLMGateway

    mock_supabase.table().select().gte().lte().gte().lte().execute.return_value = MagicMock(data=[])
    payload = {
        "source": "social",
        "event_type": "osint_report",
        "lat": "3.80",
        "lon": "98.70",
        "title": "[TWITTER] Belawan: flood reported",
        "raw": _json.dumps({
            "raw_text": "Banjir parah Pelabuhan Belawan, jalan putus",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }),
    }

    async def _xrange(key, *args, **kwargs):
        return [("1-0", payload)] if key == "lrip:events:social" else []

    mock_redis.xrange = _xrange
    with patch.object(oh, "get_hazard_polygons", AsyncMock(return_value=[])), \
         patch.object(oh, "extract_locations", AsyncMock(return_value=[])), \
         patch.object(LLMGateway, "generate_content", AsyncMock(return_value="high")):
        result = await oh.osint_hazard_agent({
            "normalized_event": {
                "event_type": "flood", "source": "social", "severity": "medium",
                "raw_payload": {"text": "Banjir parah Pelabuhan Belawan"},
            },
            "lat": 3.79,
            "lon": 98.67,
            "region": "North Sumatra",
        })

    data = result["osint_hazard_finding"]["data"]
    assert result["osint_hazard_finding"]["confidence"] == 0.75
    assert data["spatially_relevant"] is True
    assert data["inferred_severity"] == "high"
    assert result["verified_news_citations"][0]["tier"] == "TIER_3_CITIZEN_OSINT"
    assert result["verified_news_citations"][0]["published_at"]


@pytest.mark.asyncio
async def test_osint_spatial_gate_rejects_distant_lampung(mock_redis, mock_supabase):
    """Distant Lampung chatter must never corroborate a Belawan incident."""
    import json as _json
    from datetime import datetime, timezone
    from agents.nodes import osint_hazard as oh
    from agents.llm_gateway import LLMGateway

    mock_supabase.table().select().gte().lte().gte().lte().execute.return_value = MagicMock(data=[])
    payload = {
        "source": "social",
        "event_type": "osint_report",
        "lat": "-5.45",
        "lon": "105.26",
        "title": "Banjir Lampung",
        "raw": _json.dumps({
            "raw_text": "Banjir parah Bandar Lampung, jalan putus",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }),
    }

    async def _xrange(key, *args, **kwargs):
        return [("1-0", payload)] if key == "lrip:events:social" else []

    mock_redis.xrange = _xrange
    with patch.object(oh, "get_hazard_polygons", AsyncMock(return_value=[])), \
         patch.object(oh, "extract_locations", AsyncMock(return_value=[])), \
         patch.object(LLMGateway, "generate_content", AsyncMock(return_value="critical")):
        result = await oh.osint_hazard_agent({
            "normalized_event": {"event_type": "flood", "source": "social", "severity": "medium"},
            "lat": 3.79,
            "lon": 98.67,
            "region": "North Sumatra",
        })

    data = result["osint_hazard_finding"]["data"]
    assert result["osint_hazard_finding"]["confidence"] == 0.60
    assert data["spatially_relevant"] is False
    assert data["social_corroborations"] == 0
    assert data["spatial_gate"]["rejected"][0]["spatially_relevant"] is False
    assert result["verified_news_citations"] == []


@pytest.mark.asyncio
async def test_social_poller_disabled_without_token():
    """No bearer token -> explicit disabled_no_token health, clean exit."""
    import app.main as main

    fake_redis = MagicMock()
    with patch.object(main.settings, "twitter_bearer_token", ""), \
         patch.object(main, "get_redis", return_value=fake_redis):
        await main._poll_social_osint_loop()

    fake_redis.hset.assert_any_call(
        "lrip:health:social_scraper", "status", "disabled_no_token"
    )



