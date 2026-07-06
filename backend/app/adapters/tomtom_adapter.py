import httpx
import logging
from typing import List, Dict, Any
from datetime import datetime, timezone
import json

from app.adapters.base import BaseAdapter
from app.services.redis_client import STREAM_TOMTOM, get_redis
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class TomTomAdapter(BaseAdapter):
    source_name = "tomtom"
    stream_key = STREAM_TOMTOM
    poll_interval_seconds = 300  # Poll every 5 minutes

    # Checkpoints on Trans-Sumatra Highway
    CHECKPOINTS = [
        {"name": "Belawan Toll Gate", "lat": 3.8012, "lon": 98.6890},
        {"name": "Tanjung Mulia Interchange", "lat": 3.7558, "lon": 98.6742},
        {"name": "Binjai Km 18", "lat": 3.6789, "lon": 98.5123},
        {"name": "Pematangsiantar Km 128", "lat": 2.9595, "lon": 99.0687},
    ]

    # Bounding Box for traffic incidents (Medan-Belawan region)
    # format: minLon,minLat,maxLon,maxLat
    BBOX = "98.5,3.5,99.2,3.9"

    async def health_check(self) -> bool:
        """Check if TomTom API is responsive by querying a single checkpoint."""
        if not settings.tomtom_api_key:
            logger.warning("TomTom API key not configured")
            return False
        
        try:
            checkpoint = self.CHECKPOINTS[0]
            url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
            params = {
                "key": settings.tomtom_api_key,
                "point": f"{checkpoint['lat']},{checkpoint['lon']}"
            }
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url, params=params)
                return res.status_code == 200
        except Exception as e:
            logger.warning(f"TomTom health check failed: {e}")
            return False

    async def fetch(self) -> Dict[str, Any]:
        """Fetch both segment flow data and regional incidents from TomTom."""
        data = {"flow": [], "incidents": []}
        
        if not settings.tomtom_api_key:
            return data

        async with httpx.AsyncClient(timeout=10.0) as client:
            # 1. Fetch flow segment data for all checkpoints
            for cp in self.CHECKPOINTS:
                try:
                    url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
                    params = {
                        "key": settings.tomtom_api_key,
                        "point": f"{cp['lat']},{cp['lon']}"
                    }
                    res = await client.get(url, params=params)
                    if res.status_code == 200:
                        flow_json = res.json()
                        flow_json["_checkpoint_name"] = cp["name"]
                        flow_json["_lat"] = cp["lat"]
                        flow_json["_lon"] = cp["lon"]
                        data["flow"].append(flow_json)
                except Exception as e:
                    logger.error(f"Failed to fetch TomTom flow for {cp['name']}: {e}")

            # 2. Fetch traffic incidents in bounding box
            try:
                url = f"https://api.tomtom.com/traffic/services/5/incidentDetails"
                params = {
                    "key": settings.tomtom_api_key,
                    "bbox": self.BBOX,
                    "fields": "{incidents{type,properties{id,iconCategory,delay,startTime,endTime},geometry{type,coordinates}}}"
                }
                res = await client.get(url, params=params)
                if res.status_code == 200:
                    data["incidents"] = res.json().get("incidents", [])
            except Exception as e:
                logger.error(f"Failed to fetch TomTom incidents: {e}")

        return data

    async def parse(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Parse raw flow and incident data into normalized events."""
        events = []
        r = get_redis()
        now_str = datetime.now(timezone.utc).isoformat()
        current_hour = datetime.now(timezone.utc).strftime("%Y%m%d%H")

        # 1. Parse flow segment data
        for flow_data in raw_data.get("flow", []):
            try:
                segment = flow_data.get("flowSegmentData", {})
                cp_name = flow_data["_checkpoint_name"]
                lat = flow_data["_lat"]
                lon = flow_data["_lon"]

                free_flow = segment.get("freeFlowSpeed", 0)
                current = segment.get("currentSpeed", 0)
                road_closed = segment.get("roadClosure", False)

                if free_flow > 0:
                    congestion_score = 1.0 - (current / free_flow)
                else:
                    congestion_score = 0.0

                # Determine if alert is needed (congestion, closure, or very low speed)
                if congestion_score > 0.5 or road_closed or (current < 20 and free_flow > 40):
                    # Severity mapping
                    if road_closed or congestion_score >= 0.9:
                        severity = "critical"
                        title = f"ROAD CLOSED / BLOCKAGE: {cp_name}" if road_closed else f"Standstill Traffic: {cp_name} ({current} km/h)"
                    elif congestion_score >= 0.7:
                        severity = "high"
                        title = f"Severe Traffic Congestion: {cp_name} ({current} km/h)"
                    elif congestion_score >= 0.5:
                        severity = "medium"
                        title = f"Moderate Traffic Congestion: {cp_name} ({current} km/h)"
                    else:
                        severity = "low"
                        title = f"Minor Traffic Delay: {cp_name} ({current} km/h)"

                    dedup_key = f"tomtom:flow:{cp_name.replace(' ', '_').lower()}:{current_hour}"
                    
                    if not r.get(f"lrip:dedup:{dedup_key}"):
                        r.set(f"lrip:dedup:{dedup_key}", "1", ex=3600)  # 1 hour dedup
                        events.append({
                            "source": self.source_name,
                            "event_type": "road_closure" if road_closed else "congestion",
                            "severity": severity,
                            "lat": str(lat),
                            "lon": str(lon),
                            "title": title,
                            "raw": json.dumps(segment),
                            "ts": now_str,
                            "dedup_key": dedup_key
                        })
            except Exception as e:
                logger.error(f"Error parsing TomTom flow segment: {e}")

        # Category to description mapping
        category_map = {
            1: "Accident",
            2: "Fog",
            3: "Dangerous Conditions",
            4: "Rain",
            5: "Ice",
            6: "Congestion/Queue",
            7: "Road Closed",
            8: "Wind",
            9: "Flooding",
            10: "Broken down vehicle"
        }

        # 2. Parse incidents
        for incident in raw_data.get("incidents", []):
            try:
                properties = incident.get("properties", {})
                incident_id = properties.get("id")
                category = int(properties.get("iconCategory") or 0)
                delay = int(properties.get("delay") or 0)
                
                desc = category_map.get(category, "Traffic Incident")
                
                # Extract coordinate from geometry (LineString or Point)
                geometry = incident.get("geometry", {})
                coords = geometry.get("coordinates", [])
                if not coords:
                    continue
                
                # Get the first coordinate point
                if geometry.get("type") == "LineString":
                    lon_val, lat_val = coords[0]
                else:  # Point
                    lon_val, lat_val = coords

                # Category mapping: 7 = Closed, 9 = Flooding
                event_type = "congestion"
                if category == 7:
                    event_type = "road_closure"
                elif category == 9:
                    event_type = "flood"

                # Delay-based severity mapping
                if category == 7 or delay >= 1800:
                    severity = "critical"
                elif delay >= 600:
                    severity = "high"
                elif delay >= 300:
                    severity = "medium"
                else:
                    severity = "low"

                # Filter out low-severity incidents to avoid noise
                if severity in ["high", "critical"] or event_type in ["road_closure", "flood"]:
                    dedup_key = f"tomtom:incident:{incident_id}"
                    
                    if not r.get(f"lrip:dedup:{dedup_key}"):
                        r.set(f"lrip:dedup:{dedup_key}", "1", ex=14400)  # 4 hours dedup
                        events.append({
                            "source": self.source_name,
                            "event_type": event_type,
                            "severity": severity,
                            "lat": str(lat_val),
                            "lon": str(lon_val),
                            "title": f"TomTom Incident: {desc} (Delay: {delay}s)",
                            "raw": json.dumps(incident),
                            "ts": now_str,
                            "dedup_key": dedup_key
                        })
            except Exception as e:
                logger.error(f"Error parsing TomTom incident: {e}")

        return events
