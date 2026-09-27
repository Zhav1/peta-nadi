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

            conn.execute("""
                CREATE TABLE IF NOT EXISTS custom_fleet_vehicles (
                    id TEXT PRIMARY KEY,
                    vehicle_id TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    driver_name TEXT,
                    driver_phone TEXT,
                    modality TEXT NOT NULL,
                    cargo TEXT,
                    origin TEXT,
                    destination TEXT,
                    speed_kmh REAL DEFAULT 60.0,
                    temperature_c REAL,
                    path_json TEXT,
                    status TEXT DEFAULT 'moving',
                    mmsi TEXT,
                    imo TEXT,
                    vin TEXT,
                    icao24 TEXT,
                    callsign TEXT,
                    organization_id TEXT DEFAULT 'org-prehub-pilot',
                    created_by TEXT DEFAULT 'dispatcher',
                    sync_status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_custom_vehicles_modality 
                ON custom_fleet_vehicles(modality);
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_custom_vehicles_sync 
                ON custom_fleet_vehicles(sync_status);
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS fleet_telemetry_logs (
                    id TEXT PRIMARY KEY,
                    vehicle_id TEXT NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    speed_kmh REAL DEFAULT 0.0,
                    heading_deg REAL DEFAULT 0.0,
                    altitude_m REAL DEFAULT 0.0,
                    temperature_c REAL,
                    battery_level REAL,
                    ignition INTEGER,
                    raw_payload TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_telemetry_logs_vehicle 
                ON fleet_telemetry_logs(vehicle_id);
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_telemetry_logs_created 
                ON fleet_telemetry_logs(created_at);
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
            if table_name in ("route_decision_traces", "ground_truth_outcomes", "custom_fleet_vehicles"):
                conn.execute(f"UPDATE {table_name} SET sync_status = 'synced' WHERE id = ?", (record_id,))
    finally:
        conn.close()


# ==========================================
# CUSTOM FLEET & TELEMETRY PERSISTENCE
# ==========================================

def save_custom_vehicle(data: Dict[str, Any], db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Save or update a custom onboarded vehicle in SQLite.
    """
    conn = get_db_connection(db_path)
    record_id = data.get("id") or f"VEH-{uuid.uuid4().hex[:10]}"
    vehicle_id = data.get("vehicle_id") or record_id
    created_at = data.get("created_at") or datetime.now().isoformat()
    updated_at = datetime.now().isoformat()

    path_data = data.get("path") or data.get("path_json")
    if isinstance(path_data, (list, dict)):
        path_json = json.dumps(path_data)
    elif isinstance(path_data, str):
        path_json = path_data
    else:
        path_json = None

    try:
        with conn:
            conn.execute("""
                INSERT INTO custom_fleet_vehicles (
                    id, vehicle_id, name, driver_name, driver_phone,
                    modality, cargo, origin, destination, speed_kmh,
                    temperature_c, path_json, status, mmsi, imo, vin,
                    icao24, callsign, organization_id, created_by,
                    sync_status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(vehicle_id) DO UPDATE SET
                    name = excluded.name,
                    driver_name = excluded.driver_name,
                    driver_phone = excluded.driver_phone,
                    modality = excluded.modality,
                    cargo = excluded.cargo,
                    origin = excluded.origin,
                    destination = excluded.destination,
                    speed_kmh = excluded.speed_kmh,
                    temperature_c = excluded.temperature_c,
                    path_json = excluded.path_json,
                    status = excluded.status,
                    mmsi = excluded.mmsi,
                    imo = excluded.imo,
                    vin = excluded.vin,
                    icao24 = excluded.icao24,
                    callsign = excluded.callsign,
                    updated_at = excluded.updated_at
            """, (
                record_id,
                vehicle_id,
                data.get("name") or vehicle_id,
                data.get("driver_name"),
                data.get("driver_phone"),
                data.get("modality") or "truck",
                data.get("cargo"),
                data.get("origin"),
                data.get("destination"),
                float(data.get("speed_kmh") if data.get("speed_kmh") is not None else 60.0),
                float(data["temperature_c"]) if data.get("temperature_c") is not None else None,
                path_json,
                data.get("status") or "moving",
                data.get("mmsi"),
                data.get("imo"),
                data.get("vin"),
                data.get("icao24"),
                data.get("callsign"),
                data.get("organization_id") or "org-prehub-pilot",
                data.get("created_by") or "dispatcher",
                data.get("sync_status") or "pending",
                created_at,
                updated_at
            ))

        return {
            "id": record_id,
            "vehicle_id": vehicle_id,
            "name": data.get("name") or vehicle_id,
            "driver_name": data.get("driver_name"),
            "driver_phone": data.get("driver_phone"),
            "modality": data.get("modality") or "truck",
            "cargo": data.get("cargo"),
            "origin": data.get("origin"),
            "destination": data.get("destination"),
            "speed_kmh": float(data.get("speed_kmh") if data.get("speed_kmh") is not None else 60.0),
            "temperature_c": float(data["temperature_c"]) if data.get("temperature_c") is not None else None,
            "path": json.loads(path_json) if path_json else None,
            "status": data.get("status") or "moving",
            "mmsi": data.get("mmsi"),
            "imo": data.get("imo"),
            "vin": data.get("vin"),
            "icao24": data.get("icao24"),
            "callsign": data.get("callsign"),
            "organization_id": data.get("organization_id") or "org-prehub-pilot",
            "created_by": data.get("created_by") or "dispatcher",
            "sync_status": data.get("sync_status") or "pending",
            "created_at": created_at,
            "updated_at": updated_at
        }
    finally:
        conn.close()


def save_batch_custom_vehicles(data_list: List[Dict[str, Any]], db_path: Optional[str] = None) -> int:
    """Save a batch of custom vehicles in a single transaction."""
    saved_count = 0
    for item in data_list:
        try:
            save_custom_vehicle(item, db_path=db_path)
            saved_count += 1
        except Exception as e:
            logger.error(f"Error saving batch vehicle item {item.get('vehicle_id')}: {e}")
    return saved_count


def list_custom_vehicles(
    modality: Optional[str] = None,
    db_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Retrieve all custom registered vehicles from SQLite."""
    conn = get_db_connection(db_path)
    try:
        if modality and modality != "all":
            cursor = conn.execute("""
                SELECT * FROM custom_fleet_vehicles 
                WHERE modality = ?
                ORDER BY created_at DESC
            """, (modality,))
        else:
            cursor = conn.execute("""
                SELECT * FROM custom_fleet_vehicles 
                ORDER BY created_at DESC
            """)
        
        rows = cursor.fetchall()
        results = []
        for r in rows:
            path_val = None
            if r["path_json"]:
                try:
                    path_val = json.loads(r["path_json"])
                except Exception:
                    path_val = None
            results.append({
                "id": r["id"],
                "vehicle_id": r["vehicle_id"],
                "name": r["name"],
                "driver_name": r["driver_name"],
                "driver_phone": r["driver_phone"],
                "modality": r["modality"],
                "cargo": r["cargo"],
                "origin": r["origin"],
                "destination": r["destination"],
                "speed_kmh": float(r["speed_kmh"]) if r["speed_kmh"] is not None else 60.0,
                "temperature_c": float(r["temperature_c"]) if r["temperature_c"] is not None else None,
                "path": path_val,
                "status": r["status"],
                "mmsi": r["mmsi"],
                "imo": r["imo"],
                "vin": r["vin"],
                "icao24": r["icao24"],
                "callsign": r["callsign"],
                "organization_id": r["organization_id"],
                "created_by": r["created_by"],
                "sync_status": r["sync_status"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"]
            })
        return results
    finally:
        conn.close()


def get_custom_vehicle(vehicle_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Retrieve a single custom vehicle by its vehicle_id."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.execute("""
            SELECT * FROM custom_fleet_vehicles WHERE vehicle_id = ?
        """, (vehicle_id,))
        r = cursor.fetchone()
        if not r:
            return None
        path_val = None
        if r["path_json"]:
            try:
                path_val = json.loads(r["path_json"])
            except Exception:
                path_val = None
        return {
            "id": r["id"],
            "vehicle_id": r["vehicle_id"],
            "name": r["name"],
            "driver_name": r["driver_name"],
            "driver_phone": r["driver_phone"],
            "modality": r["modality"],
            "cargo": r["cargo"],
            "origin": r["origin"],
            "destination": r["destination"],
            "speed_kmh": float(r["speed_kmh"]) if r["speed_kmh"] is not None else 60.0,
            "temperature_c": float(r["temperature_c"]) if r["temperature_c"] is not None else None,
            "path": path_val,
            "status": r["status"],
            "mmsi": r["mmsi"],
            "imo": r["imo"],
            "vin": r["vin"],
            "icao24": r["icao24"],
            "callsign": r["callsign"],
            "organization_id": r["organization_id"],
            "created_by": r["created_by"],
            "sync_status": r["sync_status"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"]
        }
    finally:
        conn.close()


def delete_custom_vehicle(vehicle_id: str, db_path: Optional[str] = None) -> bool:
    """Delete a custom registered vehicle from SQLite."""
    conn = get_db_connection(db_path)
    try:
        with conn:
            cursor = conn.execute("DELETE FROM custom_fleet_vehicles WHERE vehicle_id = ?", (vehicle_id,))
            return cursor.rowcount > 0
    finally:
        conn.close()


def log_telemetry_ping(ping: Dict[str, Any], db_path: Optional[str] = None) -> Dict[str, Any]:
    """Log a live GPS telematics ping to SQLite."""
    conn = get_db_connection(db_path)
    record_id = ping.get("id") or f"PING-{uuid.uuid4().hex[:10]}"
    created_at = ping.get("timestamp") or datetime.now().isoformat()
    raw = ping.get("raw_payload")
    raw_json = json.dumps(raw) if isinstance(raw, (dict, list)) else (raw if isinstance(raw, str) else None)

    try:
        with conn:
            conn.execute("""
                INSERT INTO fleet_telemetry_logs (
                    id, vehicle_id, latitude, longitude, speed_kmh,
                    heading_deg, altitude_m, temperature_c, battery_level,
                    ignition, raw_payload, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record_id,
                ping["vehicle_id"],
                float(ping["latitude"]),
                float(ping["longitude"]),
                float(ping.get("speed_kmh") or 0.0),
                float(ping["heading_deg"]) if ping.get("heading_deg") is not None else None,
                float(ping.get("altitude_m") or 0.0),
                float(ping["temperature_c"]) if ping.get("temperature_c") is not None else None,
                float(ping["battery_level"]) if ping.get("battery_level") is not None else None,
                1 if ping.get("ignition") else (0 if ping.get("ignition") is False else None),
                raw_json,
                created_at
            ))
        return {
            "id": record_id,
            "vehicle_id": ping["vehicle_id"],
            "latitude": float(ping["latitude"]),
            "longitude": float(ping["longitude"]),
            "speed_kmh": float(ping.get("speed_kmh") or 0.0),
            "heading_deg": ping.get("heading_deg"),
            "altitude_m": float(ping.get("altitude_m") or 0.0),
            "temperature_c": ping.get("temperature_c"),
            "battery_level": ping.get("battery_level"),
            "ignition": ping.get("ignition"),
            "created_at": created_at
        }
    finally:
        conn.close()


def list_telemetry_logs(
    vehicle_id: Optional[str] = None,
    limit: int = 50,
    db_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Retrieve telemetry pings sorted newest first."""
    conn = get_db_connection(db_path)
    try:
        if vehicle_id:
            cursor = conn.execute("""
                SELECT * FROM fleet_telemetry_logs 
                WHERE vehicle_id = ?
                ORDER BY created_at DESC 
                LIMIT ?
            """, (vehicle_id, limit))
        else:
            cursor = conn.execute("""
                SELECT * FROM fleet_telemetry_logs 
                ORDER BY created_at DESC 
                LIMIT ?
            """, (limit,))
        
        rows = cursor.fetchall()
        results = []
        for r in rows:
            results.append({
                "id": r["id"],
                "vehicle_id": r["vehicle_id"],
                "latitude": float(r["latitude"]),
                "longitude": float(r["longitude"]),
                "speed_kmh": float(r["speed_kmh"]),
                "heading_deg": float(r["heading_deg"]) if r["heading_deg"] is not None else None,
                "altitude_m": float(r["altitude_m"]),
                "temperature_c": float(r["temperature_c"]) if r["temperature_c"] is not None else None,
                "battery_level": float(r["battery_level"]) if r["battery_level"] is not None else None,
                "ignition": bool(r["ignition"]) if r["ignition"] is not None else None,
                "created_at": r["created_at"]
            })
        return results
    finally:
        conn.close()


def get_latest_telemetry_ping(vehicle_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Retrieve the most recent GPS ping for a vehicle."""
    logs = list_telemetry_logs(vehicle_id=vehicle_id, limit=1, db_path=db_path)
    return logs[0] if logs else None
