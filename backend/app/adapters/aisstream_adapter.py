import asyncio
import json
import logging
import websockets
from typing import List, Dict, Any
from datetime import datetime, timezone

from app.adapters.base import BaseAdapter
from app.services.redis_client import STREAM_AISSTREAM, get_redis
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class AISstreamAdapter(BaseAdapter):
    source_name = "aisstream"
    stream_key = STREAM_AISSTREAM
    poll_interval_seconds = 60  # Check queue depth every 60s in memory

    # Strategic Sumatra Seaports Bounding Boxes:
    # format: [[[lat_min, lon_min], [lat_max, lon_max]]]
    PORTS = {
        "belawan": {
            "name": "Pelabuhan Belawan",
            "bbox": [[3.70, 98.60], [3.90, 98.80]],
            "center": {"lat": 3.7922, "lon": 98.6776},
        },
        "kuala_tanjung": {
            "name": "Pelabuhan Kuala Tanjung",
            "bbox": [[3.25, 99.35], [3.45, 99.55]],
            "center": {"lat": 3.3600, "lon": 99.4500},
        },
        "dumai": {
            "name": "Pelabuhan Dumai",
            "bbox": [[1.60, 101.35], [1.78, 101.55]],
            "center": {"lat": 1.6811, "lon": 101.4533},
        },
        "teluk_bayur": {
            "name": "Pelabuhan Teluk Bayur",
            "bbox": [[-1.08, 100.30], [-0.92, 100.45]],
            "center": {"lat": -0.9980, "lon": 100.3700},
        },
        "boom_baru": {
            "name": "Pelabuhan Boom Baru (Palembang)",
            "bbox": [[-3.05, 104.70], [-2.90, 104.85]],
            "center": {"lat": -2.9750, "lon": 104.7833},
        },
        "panjang": {
            "name": "Pelabuhan Panjang (Lampung)",
            "bbox": [[-5.55, 105.25], [-5.40, 105.40]],
            "center": {"lat": -5.4667, "lon": 105.3167},
        },
        "bakauheni": {
            "name": "Pelabuhan Bakauheni (Sunda Strait Ferry)",
            "bbox": [[-5.95, 105.68], [-5.80, 105.82]],
            "center": {"lat": -5.8711, "lon": 105.7533},
        },
        "malahayati": {
            "name": "Pelabuhan Malahayati (Aceh)",
            "bbox": [[5.50, 95.45], [5.68, 95.60]],
            "center": {"lat": 5.5897, "lon": 95.5186},
        },
    }

    # Combined bounding boxes for AISstream subscription
    BBOX = [info["bbox"] for info in PORTS.values()]

    def __init__(self):
        super().__init__()
        self.ws_url = "wss://stream.aisstream.io/v0/stream"
        # In-memory registry to track active vessels
        # Schema: { mmsi: { name, lat, lon, sog, last_seen } }
        self.vessels: Dict[int, Dict[str, Any]] = {}
        self._ws_connected = False

    async def fetch(self) -> Any:
        """For streaming, fetch is not called directly in a polling loop.
        Instead, the connection handles data inflow.
        """
        pass

    async def parse(self, raw_data: Any) -> List[Dict[str, Any]]:
        """Normalize streaming AIS position reports into events."""
        pass

    async def health_check(self) -> bool:
        """Check if WebSocket is connected."""
        return self._ws_connected

    async def run(self):
        """Override base run loop for streaming WebSocket ingestion."""
        logger.info(f"Starting streaming adapter for {self.source_name}")
        
        # Start a background task to process port queue depth metrics periodically
        asyncio.create_task(self._process_queue_loop())
        
        reconnect_delay = 1
        max_reconnect_delay = 60

        while True:
            try:
                if not settings.aisstream_api_key:
                    logger.warning("AISstream API key not configured. Streaming disabled.")
                    self.update_source_health("degraded")
                    await asyncio.sleep(60)
                    continue

                logger.info(f"Connecting to AISstream WebSocket: {self.ws_url}")
                async with websockets.connect(self.ws_url) as ws:
                    self._ws_connected = True
                    self.update_source_health("ok")
                    reconnect_delay = 1  # Reset backoff on successful connect

                    # Send subscription message
                    subscription = {
                        "APIKey": settings.aisstream_api_key,
                        "BoundingBoxes": self.BBOX,
                        "FilterMessageTypes": ["PositionReport"]
                    }
                    await ws.send(json.dumps(subscription))
                    logger.info("AISstream subscription sent successfully")

                    async for message in ws:
                        try:
                            data = json.loads(message)
                            await self._handle_raw_message(data)
                        except Exception as e:
                            logger.error(f"Error parsing incoming AIS message: {e}")

            except websockets.exceptions.ConnectionClosed:
                logger.warning("AISstream WebSocket connection closed")
            except Exception as e:
                logger.error(f"Error in AISstream WebSocket client: {e}")
            finally:
                self._ws_connected = False
                self.update_source_health("down")
                
            # Reconnect with exponential backoff
            logger.info(f"Reconnecting to AISstream in {reconnect_delay}s...")
            await asyncio.sleep(reconnect_delay)
            reconnect_delay = min(reconnect_delay * 2, max_reconnect_delay)

    async def _handle_raw_message(self, data: Dict[str, Any]):
        """Update internal vessel registry from dynamic position reports."""
        msg_type = data.get("MessageType")
        metadata = data.get("MetaData", {})
        mmsi = metadata.get("MMSI")
        ship_name = metadata.get("ShipName", "").strip()

        if msg_type == "PositionReport" and mmsi:
            pos_report = data.get("Message", {}).get("PositionReport", {})
            sog = pos_report.get("Sog", 0.0) # Speed over ground in knots
            lat = metadata.get("latitude")
            lon = metadata.get("longitude")
            
            # Update vessel record
            self.vessels[mmsi] = {
                "name": ship_name or f"MMSI:{mmsi}",
                "lat": lat,
                "lon": lon,
                "sog": sog,
                "last_seen": datetime.now(timezone.utc).isoformat()
            }

    async def _process_queue_loop(self):
        """Periodically analyze vessel registry and emit port queue congestion events."""
        while True:
            await self._process_queue()
            await asyncio.sleep(self.poll_interval_seconds)

    async def _process_queue(self):
        """Analyze vessel registry once and emit events if threshold exceeded."""
        r = get_redis()
        current_hour = datetime.now(timezone.utc).strftime("%Y%m%d%H")
        
        try:
            # Cleanup old vessels not seen in the last 15 minutes
            now = datetime.now(timezone.utc)
            to_delete = []
            for mmsi, info in self.vessels.items():
                last_seen = datetime.fromisoformat(info["last_seen"])
                if (now - last_seen).total_seconds() > 900:  # 15 mins
                    to_delete.append(mmsi)
            
            for mmsi in to_delete:
                del self.vessels[mmsi]

            # Group vessels by port based on bounding box
            port_vessels: Dict[str, List[Dict[str, Any]]] = {pid: [] for pid in self.PORTS.keys()}
            for v in self.vessels.values():
                v_lat, v_lon = v.get("lat"), v.get("lon")
                if v_lat is None or v_lon is None:
                    continue
                for pid, pdata in self.PORTS.items():
                    bbox = pdata["bbox"]
                    if bbox[0][0] <= v_lat <= bbox[1][0] and bbox[0][1] <= v_lon <= bbox[1][1]:
                        port_vessels[pid].append(v)
                        break

            events_to_publish = []
            for pid, vessels_at_port in port_vessels.items():
                port_meta = self.PORTS[pid]
                anchored_vessels = [v for v in vessels_at_port if v.get("sog", 1.0) < 0.5]
                anchored_count = len(anchored_vessels)
                total_count = len(vessels_at_port)

                logger.debug(f"{port_meta['name']} status: {anchored_count} anchored, {total_count} total vessels")

                # If queue depth exceeds threshold, trigger warning
                if anchored_count >= 8:
                    severity = "critical" if anchored_count >= 15 else "high"
                    dedup_key = f"aisstream:queue_depth:{pid}:{current_hour}"
                    
                    if not r.get(f"lrip:dedup:{dedup_key}"):
                        r.set(f"lrip:dedup:{dedup_key}", "1", ex=3600)  # 1 hour dedup
                        
                        events_to_publish.append({
                            "source": self.source_name,
                            "event_type": "port_queue",
                            "severity": severity,
                            "lat": str(port_meta["center"]["lat"]),
                            "lon": str(port_meta["center"]["lon"]),
                            "title": f"Port Congestion Alert: {anchored_count} vessels waiting at {port_meta['name']}",
                            "raw": json.dumps({
                                "port_id": pid,
                                "port_name": port_meta["name"],
                                "total_vessels": total_count,
                                "anchored_vessels": anchored_count,
                                "vessel_details": [{"name": v["name"], "sog": v["sog"]} for v in anchored_vessels]
                            }),
                            "ts": now.isoformat(),
                            "dedup_key": dedup_key
                        })
            if events_to_publish:
                self.publish(events_to_publish)
                    
        except Exception as e:
            logger.error(f"Error in AIS queue processing: {e}", exc_info=True)
