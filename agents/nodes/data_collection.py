import hashlib
import json
import logging
from datetime import datetime, timezone
from agents.state import CrisisState, NormalizedEvent, AgentFinding
from agents.memory.stm import is_seen, mark_seen
from agents.tools.supabase_tools import get_source_health

logger = logging.getLogger(__name__)


def generate_event_hash(event: dict) -> str:
    """Generates a stable hash of the event payload for deduplication."""
    # Focus on event type, location, and severity
    payload_str = f"{event.get('type') or event.get('event_type')}:{event.get('lat')}:{event.get('lon')}:{event.get('region')}"
    return hashlib.sha256(payload_str.encode()).hexdigest()[:16]


async def data_collection_agent(state: CrisisState) -> dict:
    """Agent 1: Validates, deduplicates, and normalizes raw Redis/incoming events."""
    logger.info("Agent 1 [DataCollectionAgent] running...")
    
    event_type = state.get("type") or state.get("event_type") or "unknown"
    severity = state.get("severity") or "medium"
    source = state.get("source") or "unknown"
    lat = state.get("lat")
    lon = state.get("lon")
    region = state.get("region")
    
    validation_errors = []
    
    # 1. Validate fields
    if event_type == "unknown":
        validation_errors.append("Missing event type")
    if lat is None and lon is None and not region:
        validation_errors.append("Missing location (lat/lon or region)")
    if source == "unknown":
        validation_errors.append("Missing source")
        
    # Normalize severity
    valid_severities = ['low', 'medium', 'high', 'critical']
    severity = severity.lower()
    if severity not in valid_severities:
        severity = 'medium'
        validation_errors.append(f"Normalized invalid severity to 'medium'")
        
    # 2. Deduplication check
    event_hash = generate_event_hash(state)
    logger.debug(f"Computed event hash: {event_hash}")
    
    if await is_seen(event_hash):
        logger.info(f"Duplicate event detected for hash: {event_hash}. Terminating path.")
        return {
            "status": "duplicate",
            "messages": state.get("messages", []) + ["DataCollectionAgent: Duplicate event suppressed."]
        }
        
    await mark_seen(event_hash)
    
    # 3. Lookup source health
    health_status = await get_source_health(source)
    confidence_map = {
        "green": 0.9,
        "yellow": 0.6,
        "red": 0.3
    }
    confidence = confidence_map.get(health_status, 0.7)
    
    # Adjust confidence if validation errors present
    if validation_errors:
        confidence = max(0.1, confidence - 0.2)
        
    # 4. Build finding and normalized event
    normalized_event: NormalizedEvent = {
        "source": source,
        "event_type": event_type,
        "severity": severity,
        "raw_payload": dict(state),
        "validated": len(validation_errors) == 0,
        "validation_errors": validation_errors
    }
    
    finding: AgentFinding = {
        "agent": "DataCollectionAgent",
        "confidence": confidence,
        "summary": f"Validated and normalized incoming {event_type} event from {source}. Severity: {severity}. Errors: {len(validation_errors)}",
        "data": {"validation_errors": validation_errors, "source_health": health_status},
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    logger.info(f"Agent 1 finished. Confidence: {confidence}")
    return {
        "normalized_event": normalized_event,
        "data_collection_finding": finding,
        "status": "validating",
        "messages": state.get("messages", []) + ["DataCollectionAgent: Event normalized and validated."]
    }
