"""
Local SQLite persistence adapter for PreHub.
Provides ACID-compliant local fallback storage for operator decision traces
and ground-truth field outcomes when Supabase is offline or during standalone testing.
"""
import os
import json
import sqlite3
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

# Default SQLite database path: backend/data/prehub_local.db
DEFAULT_DB_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DEFAULT_DB_PATH = DEFAULT_DB_DIR / "prehub_local.db"


def get_db_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Get an active SQLite connection with row factory enabled."""
    target_path = Path(db_path) if db_path else DEFAULT_DB_PATH
    target_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(target_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Initialize local SQLite database tables if they do not already exist."""
    conn = get_db_connection(db_path)
    try:
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS route_decision_traces (
                    id TEXT PRIMARY KEY,
                    incident_id TEXT NOT NULL,
                    route_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    tactical_action TEXT NOT NULL,
                    operator_id TEXT NOT NULL,
                    recommended_route TEXT,
                    custom_constraints TEXT,
                    notes TEXT,
                    sync_status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_decisions_incident 
                ON route_decision_traces(incident_id);
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_decisions_sync 
                ON route_decision_traces(sync_status);
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS ground_truth_outcomes (
                    id TEXT PRIMARY KEY,
                    incident_id TEXT NOT NULL,
                    horizon TEXT NOT NULL,
                    actual_clearance_time TIMESTAMP,
                    observed_delay_hours REAL NOT NULL,
                    actual_price_spike_pct REAL NOT NULL,
                    verified_by TEXT NOT NULL,
                    verification_source TEXT NOT NULL,
                    notes TEXT,
                    sync_status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_outcomes_incident 
                ON ground_truth_outcomes(incident_id);
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_outcomes_horizon 
                ON ground_truth_outcomes(horizon);
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_outcomes_sync 
                ON ground_truth_outcomes(sync_status);
            """)
        logger.debug(f"Local SQLite database initialized at {db_path or DEFAULT_DB_PATH}")
    finally:
        conn.close()


# Auto-initialize on module load
init_db()


def save_decision_trace(data: Dict[str, Any], db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Save an operator decision trace to SQLite.
    """
    conn = get_db_connection(db_path)
    record_id = data.get("id") or f"DEC-{uuid.uuid4().hex[:10]}"
    created_at = data.get("created_at") or datetime.now().isoformat()
    
    rec_route = data.get("recommended_route")
    if isinstance(rec_route, (dict, list)):
        rec_route = json.dumps(rec_route)
        
    constraints = data.get("custom_constraints")
    if isinstance(constraints, (dict, list)):
        constraints = json.dumps(constraints)

    try:
        with conn:
            conn.execute("""
                INSERT INTO route_decision_traces (
                    id, incident_id, route_id, action, tactical_action,
                    operator_id, recommended_route, custom_constraints,
                    notes, sync_status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record_id,
                data.get("incident_id") or "INC-DEFAULT",
                data.get("route_id") or "0",
                data.get("action") or "ACCEPT",
                data.get("tactical_action") or "REROUTE",
                data.get("operator_id") or "anonymous",
                rec_route,
                constraints,
                data.get("notes") or "",
                data.get("sync_status") or "pending",
                created_at
            ))
        return {
            "id": record_id,
            "incident_id": data.get("incident_id") or "INC-DEFAULT",
            "route_id": data.get("route_id") or "0",
            "action": data.get("action") or "ACCEPT",
            "tactical_action": data.get("tactical_action") or "REROUTE",
            "operator_id": data.get("operator_id") or "anonymous",
            "recommended_route": data.get("recommended_route"),
            "custom_constraints": data.get("custom_constraints"),
            "notes": data.get("notes") or "",
            "sync_status": data.get("sync_status") or "pending",
            "created_at": created_at
        }
    finally:
        conn.close()


def list_decision_traces(
    incident_id: Optional[str] = None,
    limit: int = 50,
    db_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Retrieve decision traces sorted newest first."""
    conn = get_db_connection(db_path)
    try:
        if incident_id:
            cursor = conn.execute("""
                SELECT * FROM route_decision_traces 
                WHERE incident_id = ?
                ORDER BY created_at DESC 
                LIMIT ?
            """, (incident_id, limit))
        else:
            cursor = conn.execute("""
                SELECT * FROM route_decision_traces 
                ORDER BY created_at DESC 
                LIMIT ?
            """, (limit,))
        
        rows = cursor.fetchall()
        results = []
        for r in rows:
            rec_route = r["recommended_route"]
            if rec_route and isinstance(rec_route, str):
                try:
                    rec_route = json.loads(rec_route)
                except Exception:
                    pass
            constraints = r["custom_constraints"]
            if constraints and isinstance(constraints, str):
                try:
                    constraints = json.loads(constraints)
                except Exception:
                    pass
            results.append({
                "id": r["id"],
                "incident_id": r["incident_id"],
                "route_id": r["route_id"],
                "action": r["action"],
                "tactical_action": r["tactical_action"],
                "operator_id": r["operator_id"],
                "recommended_route": rec_route,
                "custom_constraints": constraints,
                "notes": r["notes"],
                "sync_status": r["sync_status"],
                "created_at": r["created_at"]
            })
        return results
    finally:
        conn.close()


def save_outcome(data: Dict[str, Any], db_path: Optional[str] = None) -> Dict[str, Any]:
    """Save a ground-truth field outcome record to SQLite."""
    conn = get_db_connection(db_path)
    record_id = data.get("id") or f"OUT-{uuid.uuid4().hex[:10]}"
    created_at = data.get("created_at") or datetime.now().isoformat()
    clearance_time = data.get("actual_clearance_time")
    if isinstance(clearance_time, datetime):
        clearance_time = clearance_time.isoformat()

    try:
        with conn:
            conn.execute("""
                INSERT INTO ground_truth_outcomes (
                    id, incident_id, horizon, actual_clearance_time,
                    observed_delay_hours, actual_price_spike_pct,
                    verified_by, verification_source, notes, sync_status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record_id,
                data.get("incident_id") or "INC-DEFAULT",
                data.get("horizon") or "T+12h",
                clearance_time,
                float(data.get("observed_delay_hours") or 0.0),
                float(data.get("actual_price_spike_pct") or 0.0),
                data.get("verified_by") or "anonymous",
                data.get("verification_source") or "FIELD_REPORT",
                data.get("notes") or "",
                data.get("sync_status") or "pending",
                created_at
            ))
        return {
            "id": record_id,
            "incident_id": data.get("incident_id") or "INC-DEFAULT",
            "horizon": data.get("horizon") or "T+12h",
            "actual_clearance_time": clearance_time,
            "observed_delay_hours": float(data.get("observed_delay_hours") or 0.0),
            "actual_price_spike_pct": float(data.get("actual_price_spike_pct") or 0.0),
            "verified_by": data.get("verified_by") or "anonymous",
            "verification_source": data.get("verification_source") or "FIELD_REPORT",
            "notes": data.get("notes") or "",
            "sync_status": data.get("sync_status") or "pending",
            "created_at": created_at
        }
    finally:
        conn.close()


def list_outcomes(
    incident_id: Optional[str] = None,
    horizon: Optional[str] = None,
    limit: int = 50,
    db_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Retrieve ground-truth outcomes sorted newest first."""
    conn = get_db_connection(db_path)
    try:
        query = "SELECT * FROM ground_truth_outcomes"
        params: List[Any] = []
        conditions = []
        if incident_id:
            conditions.append("incident_id = ?")
            params.append(incident_id)
        if horizon:
            conditions.append("horizon = ?")
            params.append(horizon)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        cursor = conn.execute(query, tuple(params))
        rows = cursor.fetchall()
        results = []
        for r in rows:
            results.append({
                "id": r["id"],
                "incident_id": r["incident_id"],
                "horizon": r["horizon"],
                "actual_clearance_time": r["actual_clearance_time"],
                "observed_delay_hours": float(r["observed_delay_hours"]),
                "actual_price_spike_pct": float(r["actual_price_spike_pct"]),
                "verified_by": r["verified_by"],
                "verification_source": r["verification_source"],
                "notes": r["notes"],
                "sync_status": r["sync_status"],
                "created_at": r["created_at"]
            })
        return results
    finally:
        conn.close()


def get_pending_sync_count(db_path: Optional[str] = None) -> int:
    """Return count of records waiting for cloud sync."""
    conn = get_db_connection(db_path)
    try:
        c1 = conn.execute("SELECT COUNT(*) FROM route_decision_traces WHERE sync_status = 'pending'").fetchone()[0]
        c2 = conn.execute("SELECT COUNT(*) FROM ground_truth_outcomes WHERE sync_status = 'pending'").fetchone()[0]
        return int(c1 + c2)
    finally:
        conn.close()


def mark_as_synced(table_name: str, record_id: str, db_path: Optional[str] = None) -> None:
    """Mark a locally persisted record as synced with remote Supabase."""
    conn = get_db_connection(db_path)
    try:
        with conn:
            if table_name in ("route_decision_traces", "ground_truth_outcomes"):
                conn.execute(f"UPDATE {table_name} SET sync_status = 'synced' WHERE id = ?", (record_id,))
    finally:
        conn.close()
