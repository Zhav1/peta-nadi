import logging
import os
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import uuid

from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/demo", tags=["Demo"])

# In-memory store for demo runs
DEMO_STORE: Dict[str, Dict[str, Any]] = {}


def _find_data_file(*subpaths: str) -> Optional[Path]:
    """Resolves data files across local, container, and repository directory structures."""
    candidates = [
        Path("data", *subpaths),
        Path("..", "data", *subpaths),
        Path(__file__).resolve().parents[2] / "data" / Path(*subpaths),
        Path(__file__).resolve().parents[3] / "data" / Path(*subpaths),
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def _derive_causal_chain(full_state: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Derives or formats causal chain nodes with explicit simulation label."""
    existing = full_state.get("causal_chain")
    if existing and isinstance(existing, list) and len(existing) > 0:
        return [
            {
                **item,
                "label": "Rantai Sebab-Akibat (Simulasi)"
            }
            for item in existing
        ]

    title = full_state.get("title") or "Disrupsi Koridor Pelabuhan Belawan"
    inflation = full_state.get("inflation_forecast") or {}
    commodity = inflation.get("commodity") or "Minyak Goreng"
    region = full_state.get("region") or "Sumatera Utara"

    return [
        {
            "node": title,
            "relation": "restricts_supply_of",
            "label": "Rantai Sebab-Akibat (Simulasi)"
        },
        {
            "node": f"{str(commodity).replace('_', ' ').title()}",
            "relation": "spikes_price_in",
            "label": "Rantai Sebab-Akibat (Simulasi)"
        },
        {
            "node": f"Pasar Konsumen {region}",
            "relation": "impacts",
            "label": "Rantai Sebab-Akibat (Simulasi)"
        }
    ]

class StartDemoPayload(BaseModel):
    mock_agents: Optional[bool] = None
    offline: Optional[bool] = None
    scenario: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None

@router.post("/start")
async def start_demo(payload: StartDemoPayload, background_tasks: BackgroundTasks):
    """
    Starts a demo run. Initializes state, generates or loads the incident,
    and returns initial demo state.
    """
    settings = get_settings()
    mock_agents = payload.mock_agents if payload.mock_agents is not None else settings.demo_mock_agents
    offline = payload.offline if payload.offline is not None else settings.demo_offline
    scenario_file = payload.scenario or "belawan_scenario.json"

    # 1. Determine/generate crisis_id
    crisis_id = f"belawan-demo-{uuid.uuid4().hex[:6]}"
    
    # 2. Get scenario data (for logs/context)
    scenario_path = _find_data_file("synthetic", scenario_file)
    events = []
    if scenario_path:
        try:
            with open(scenario_path, "r", encoding="utf-8") as f:
                scenario_data = json.load(f)
                events = scenario_data.get("events", [])
        except Exception as e:
            logger.warning(f"Failed to load scenario {scenario_file} from {scenario_path}: {e}")

    # 3. Load or run agents to get the final CrisisState
    crisis_state = {}
    if mock_agents:
        fixture_path = _find_data_file("fixtures", "mock_crisis_state.json")
        if fixture_path:
            try:
                with open(fixture_path, "r", encoding="utf-8") as f:
                    crisis_state = json.load(f)
                # Override ID and timestamp
                crisis_state["crisis_id"] = crisis_id
                crisis_state["created_at"] = datetime.now(timezone.utc).isoformat()
                crisis_state["updated_at"] = datetime.now(timezone.utc).isoformat()
            except Exception as e:
                logger.warning(f"Failed to load mock fixture from {fixture_path}: {e}, using clean fallback state")
                crisis_state = {}

        # If mock_crisis_state.json is still not found on disk, populate clean fallback
        if not crisis_state:
            crisis_state = {
                "crisis_id": crisis_id,
                "status": "ACTIVE",
                "corridor": "Sumatra Logistics Corridor",
                "events": events,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
    else:
        # Run real agents using the scenario events (run_crisis_event)
        # We aggregate events into a single payload or process the representative event
        from app.workers.agent_worker import run_crisis_event
        representative_event = {
            "type": "port_closure",
            "source": "simulation",
            "severity": "critical",
            "lat": 3.7922,
            "lon": 98.6776,
            "region": "North Sumatra",
            "title": "Belawan Port Blockage & Trans-Sumatra Flooding",
            "is_simulated": True,
            "crisis_id": crisis_id,
            "affected_polygon": [
                [98.65, 3.82],
                [98.71, 3.82],
                [98.71, 3.76],
                [98.65, 3.76],
                [98.65, 3.82]
            ]
        }
        try:
            # Run the actual LangGraph swarm
            real_state = await run_crisis_event(representative_event)
            crisis_state = dict(real_state)
            crisis_state["crisis_id"] = crisis_id
        except Exception as e:
            logger.error(f"Failed to run agent swarm for demo: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to run agent swarm: {str(e)}")

    # 4. If not offline, write to Supabase (in background)
    if not offline:
        async def save_to_db(state):
            degraded_sources: List[str] = []
            try:
                # Delegate schema mapping/whitelisting to the shared writer; never
                # insert dict(state) — agent-only keys are not incidents columns.
                from agents.tools.supabase_tools import write_incident
                incident_id = await write_incident(
                    state, degraded_sources=degraded_sources
                )
                if incident_id:
                    logger.info(f"Demo crisis {crisis_id} saved to Supabase as {incident_id}")
                else:
                    # Never crash the demo: the run stays replayable from DEMO_STORE.
                    logger.warning(
                        "Demo crisis %s was not persisted to Supabase; "
                        "degraded_sources=%s (in-memory replay preserved)",
                        crisis_id,
                        degraded_sources or ["unknown"],
                    )
            except Exception as db_err:
                logger.error(f"Failed to save demo crisis {crisis_id} to Supabase: {db_err}")

        background_tasks.add_task(save_to_db, crisis_state)

    # 5. Save to in-memory store
    DEMO_STORE[crisis_id] = {
        "crisis_id": crisis_id,
        "stage": 0,
        "mock_agents": mock_agents,
        "offline": offline,
        "crisis_state": crisis_state,
        "events": events
    }

    logger.info(f"Demo started: {crisis_id} (mock_agents={mock_agents}, offline={offline})")
    return {
        "crisis_id": crisis_id,
        "stage": 0,
        "total_stages": 5,
        "crisis_state": crisis_state,
        "full_crisis_state": crisis_state
    }

@router.get("/status/{crisis_id}")
async def get_demo_status(crisis_id: str):
    """
    Returns current stage details and dynamically filters the crisis state
    so that only elements unlocked by the current stage are returned.
    """
    if crisis_id not in DEMO_STORE:
        raise HTTPException(status_code=404, detail="Demo run not found")
    
    run = DEMO_STORE[crisis_id]
    stage = run["stage"]
    full_state = run["crisis_state"]
    
    # Base filtered state
    filtered = {
        "crisis_id": full_state["crisis_id"],
        "title": full_state["title"],
        "type": full_state["type"],
        "is_simulated": full_state["is_simulated"],
        "lat": full_state["lat"],
        "lon": full_state["lon"],
        "region": full_state["region"],
        "created_at": full_state["created_at"],
        "updated_at": full_state["updated_at"],
        "messages": list(full_state.get("messages", [])),
        "status": "detecting",
        "validated": False,
        "overall_confidence": 0.0,
        "route_recommendations": [],
    }
    
    stage_names = [
        "Injecting Events",
        "Agent Swarm Running",
        "Consensus Gate",
        "Validated Alert",
        "Notification Sent"
    ]
    
    agent_statuses = {
        "DataCollectionAgent": "pending",
        "OSINTHazardAgent": "pending",
        "PredictionAgent": "pending",
        "RouteOptimizationAgent": "pending",
        "EconomicIntelligenceAgent": "pending",
        "DecisionSupportAgent": "pending"
    }
    
    confidence = 0.0
    
    if stage >= 0:
        # Stage 0: Injecting Events
        # Shows source badges (on frontend), database stubs are initialized
        pass
        
    if stage >= 1:
        # Stage 1: Agent Swarm Running
        filtered["status"] = "validating"
        for agent in agent_statuses:
            agent_statuses[agent] = "done"
            
        filtered["data_collection_finding"] = full_state.get("data_collection_finding")
        filtered["osint_hazard_finding"] = full_state.get("osint_hazard_finding")
        filtered["prediction_finding"] = full_state.get("prediction_finding")
        filtered["route_optimization_finding"] = full_state.get("route_optimization_finding")
        filtered["economic_intelligence_finding"] = full_state.get("economic_intelligence_finding")
        
    if stage >= 2:
        # Stage 2: Consensus Gate
        filtered["status"] = "validating"
        for agent in agent_statuses:
            agent_statuses[agent] = "done"
        confidence = full_state.get("overall_confidence", 0.91)
        filtered["overall_confidence"] = confidence
        filtered["consensus_breakdown"] = full_state.get("consensus_breakdown", {
            "weather": 0.95,
            "traffic": 0.90,
            "osint": 0.88,
            "economics": 0.89
        })
        
    if stage >= 3:
        # Stage 3: Validated Alert
        filtered["status"] = "validated"
        filtered["validated"] = True
        filtered["decision_support_output"] = full_state.get("decision_support_output")
        filtered["route_recommendations"] = full_state.get("route_recommendations", [])
        filtered["inflation_forecast"] = full_state.get("inflation_forecast")
        filtered["causal_chain"] = _derive_causal_chain(full_state)
        filtered["hazard_polygons"] = full_state.get("hazard_polygons")
        filtered["affected_polygon"] = full_state.get("affected_polygon")
        for agent in agent_statuses:
            agent_statuses[agent] = "done"
        confidence = full_state.get("overall_confidence", 0.91)
        filtered["overall_confidence"] = confidence
        
    if stage >= 4:
        # Stage 4: Notification Sent
        filtered["status"] = "validated"
        filtered["validated"] = True
        filtered["decision_support_output"] = full_state.get("decision_support_output")
        filtered["route_recommendations"] = full_state.get("route_recommendations", [])
        filtered["inflation_forecast"] = full_state.get("inflation_forecast")
        filtered["causal_chain"] = _derive_causal_chain(full_state)
        filtered["hazard_polygons"] = full_state.get("hazard_polygons")
        filtered["affected_polygon"] = full_state.get("affected_polygon")
        for agent in agent_statuses:
            agent_statuses[agent] = "done"
        confidence = full_state.get("overall_confidence", 0.91)
        filtered["overall_confidence"] = confidence
        
    return {
        "crisis_id": crisis_id,
        "stage": stage,
        "stage_name": stage_names[min(stage, 4)],
        "agent_statuses": agent_statuses,
        "confidence": confidence,
        "validated": filtered["validated"],
        "summary": filtered.get("decision_support_output", ""),
        "crisis_state": filtered,
        "full_crisis_state": full_state
    }

@router.post("/advance/{crisis_id}")
async def advance_demo(crisis_id: str):
    """Advances the stage of the demo run."""
    if crisis_id not in DEMO_STORE:
        raise HTTPException(status_code=404, detail="Demo run not found")
    
    run = DEMO_STORE[crisis_id]
    if run["stage"] < 4:
        run["stage"] += 1
        
        # Trigger WhatsApp notification on final stage if live and not offline
        if run["stage"] == 4 and not run["offline"]:
            try:
                from app.services.notification_service import send_crisis_alert
                # Run notification alert in background
                import asyncio
                asyncio.create_task(send_crisis_alert(run["crisis_state"]))
            except Exception as err:
                logger.warning(f"Could not send WhatsApp alert during live demo advance: {err}")
                
    return {
        "stage": run["stage"],
        "stage_name": [
            "Injecting Events",
            "Agent Swarm Running",
            "Consensus Gate",
            "Validated Alert",
            "Notification Sent"
        ][run["stage"]],
        "crisis_state": run["crisis_state"],
        "full_crisis_state": run["crisis_state"]
    }

@router.get("/replay/{crisis_id}")
async def get_demo_replay(crisis_id: str):
    """Returns the full DemoRun snapshot for saving/replaying."""
    if crisis_id not in DEMO_STORE:
        raise HTTPException(status_code=404, detail="Demo run not found")
    
    return DEMO_STORE[crisis_id]
