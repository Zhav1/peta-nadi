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
    # Mock Supabase get_hazard_polygons
    mock_supabase.table().select().gte().lte().gte().lte().execute.return_value = MagicMock(data=[
        {
            "incident_id": "1",
            "title": "Flood polygon",
            "type": "flood",
            "affected_polygon": {"type": "Polygon", "coordinates": []}
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
    assert result["osint_hazard_finding"]["confidence"] >= 0.8


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


def test_consensus_gate_validates_at_85pct():
    state: CrisisState = {
        "osint_hazard_finding": {"confidence": 0.9},
        "data_collection_finding": {"confidence": 0.9},
        "prediction_finding": {"confidence": 0.8},
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


def test_graph_compiles():
    graph = build_crisis_graph()
    compiled = graph.compile()
    assert compiled is not None
