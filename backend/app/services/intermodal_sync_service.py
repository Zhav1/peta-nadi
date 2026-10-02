"""
PreHub — Pan-Sumatra Intermodal Sea-Land Terminal & Choke-Point Synchronization Service.
Tracks 18+ strategic Sumatra transport hubs (7 maritime/ferry terminals and 11 mountain/toll bottlenecks),
calculating real-time dwelling times, queue volumes, and dynamic delay multipliers (M_intermodal).
"""
import math
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# Master Dictionary of 18 Authoritative Pan-Sumatra Transport Choke-Points
SUMATRA_CHOKE_POINTS: List[Dict[str, Any]] = [
    # 7 Maritime & Ferry Gateways
    {
        "id": "PORT_BELAWAN",
        "name": "Pelabuhan Belawan",
        "type": "SEAPORT",
        "coords": [98.6776, 3.7922],
        "province": "Sumatera Utara",
        "status": "CONGESTED",
        "dwelling_time_hours": 4.5,
        "queue_count": 14,
        "hazard_type": "VESSEL_ANCHORAGE_WAIT",
        "capacity": 40
    },
    {
        "id": "PORT_BAKAUHENI",
        "name": "Pelabuhan Penyeberangan Bakauheni",
        "type": "FERRY_TERMINAL",
        "coords": [105.7533, -5.8711],
        "province": "Lampung",
        "status": "RESTRICTED",
        "dwelling_time_hours": 5.2,
        "queue_count": 22,
        "hazard_type": "TIDAL_SURGE_FERRY_DELAY",
        "capacity": 60
    },
    {
        "id": "PORT_DUMAI",
        "name": "Pelabuhan Dumai",
        "type": "SEAPORT",
        "coords": [101.4533, 1.6811],
        "province": "Riau",
        "status": "NORMAL",
        "dwelling_time_hours": 2.0,
        "queue_count": 6,
        "hazard_type": "STRAIT_MALACCA_HAZE",
        "capacity": 35
    },
    {
        "id": "PORT_TELUK_BAYUR",
        "name": "Pelabuhan Teluk Bayur",
        "type": "SEAPORT",
        "coords": [100.3700, -0.9980],
        "province": "Sumatera Barat",
        "status": "NORMAL",
        "dwelling_time_hours": 1.5,
        "queue_count": 4,
        "hazard_type": "INDIAN_OCEAN_SWELL",
        "capacity": 30
    },
    {
        "id": "PORT_PANJANG",
        "name": "Pelabuhan Panjang",
        "type": "SEAPORT",
        "coords": [105.3167, -5.4667],
        "province": "Lampung",
        "status": "NORMAL",
        "dwelling_time_hours": 1.8,
        "queue_count": 5,
        "hazard_type": "BERTH_MAINTENANCE",
        "capacity": 30
    },
    {
        "id": "PORT_SIBOLGA",
        "name": "Pelabuhan Sibolga",
        "type": "SEAPORT",
        "coords": [98.7800, 1.7400],
        "province": "Sumatera Utara",
        "status": "NORMAL",
        "dwelling_time_hours": 2.2,
        "queue_count": 3,
        "hazard_type": "NIAS_ISLAND_WEATHER",
        "capacity": 20
    },
    {
        "id": "PORT_KUALA_TANJUNG",
        "name": "Pelabuhan Kuala Tanjung",
        "type": "SEAPORT",
        "coords": [99.4450, 3.3650],
        "province": "Sumatera Utara",
        "status": "NORMAL",
        "dwelling_time_hours": 1.2,
        "queue_count": 2,
        "hazard_type": "TIDE_DEPENDENT",
        "capacity": 25
    },

    # 11 Critical Mountain Passes & Road Conjunctions
    {
        "id": "PASS_SITINJAU_LAUIK",
        "name": "Tanjakan Sitinjau Lauik",
        "type": "MOUNTAIN_PASS",
        "coords": [100.5186, -0.9458],
        "province": "Sumatera Barat",
        "status": "CONGESTED",
        "dwelling_time_hours": 3.0,
        "queue_count": 18,
        "hazard_type": "LANDSLIDE_STEEP_GRADE",
        "capacity": 25
    },
    {
        "id": "PASS_KELOK_9",
        "name": "Kelok 9 Payakumbuh",
        "type": "MOUNTAIN_PASS",
        "coords": [100.6978, -0.1419],
        "province": "Sumatera Barat",
        "status": "NORMAL",
        "dwelling_time_hours": 0.8,
        "queue_count": 8,
        "hazard_type": "VALLEY_BOTTLENECK",
        "capacity": 35
    },
    {
        "id": "PASS_MALALAK",
        "name": "Jalur Lingkar Malalak",
        "type": "MOUNTAIN_PASS",
        "coords": [100.2789, -0.3242],
        "province": "Sumatera Barat",
        "status": "RESTRICTED",
        "dwelling_time_hours": 4.0,
        "queue_count": 12,
        "hazard_type": "FLASH_FLOOD_LANDSLIDE",
        "capacity": 20
    },
    {
        "id": "PASS_TARUTUNG_SIBOLGA",
        "name": "Batu Lubang Tarutung - Sibolga",
        "type": "MOUNTAIN_PASS",
        "coords": [98.8800, 1.8800],
        "province": "Sumatera Utara",
        "status": "RESTRICTED",
        "dwelling_time_hours": 3.5,
        "queue_count": 10,
        "hazard_type": "ROCKFALL_HAIRPIN",
        "capacity": 15
    },
    {
        "id": "JUNCTION_TEBING_TINGGI",
        "name": "Interchange Tebing Tinggi",
        "type": "TOLL_HIGHWAY_JUNCTION",
        "coords": [99.1625, 3.3285],
        "province": "Sumatera Utara",
        "status": "CONGESTED",
        "dwelling_time_hours": 1.5,
        "queue_count": 25,
        "hazard_type": "CONVERGENCE_CONGESTION",
        "capacity": 50
    },
    {
        "id": "JUNCTION_DURI_KANDIS",
        "name": "Simpang Duri - Kandis",
        "type": "FREIGHT_CORRIDOR",
        "coords": [101.2500, 1.0500],
        "province": "Riau",
        "status": "NORMAL",
        "dwelling_time_hours": 1.0,
        "queue_count": 15,
        "hazard_type": "HEAVY_TANKER_CONGESTION",
        "capacity": 45
    },
    {
        "id": "JUNCTION_BETUNG_PALEMBANG",
        "name": "Bottleneck Betung - Palembang",
        "type": "HIGHWAY_BOTTLENECK",
        "coords": [104.5100, -2.8500],
        "province": "Sumatera Selatan",
        "status": "CONGESTED",
        "dwelling_time_hours": 2.5,
        "queue_count": 30,
        "hazard_type": "SINGLE_LANE_CHOKE",
        "capacity": 30
    },
    {
        "id": "JUNCTION_TERBANGGI_BESAR",
        "name": "Interchange Terbanggi Besar",
        "type": "TOLL_HIGHWAY_JUNCTION",
        "coords": [105.1800, -4.8500],
        "province": "Lampung",
        "status": "NORMAL",
        "dwelling_time_hours": 0.5,
        "queue_count": 10,
        "hazard_type": "CORRIDOR_FORK",
        "capacity": 60
    },
    {
        "id": "JUNCTION_MUARA_TEMBESI",
        "name": "Simpang Muara Tembesi",
        "type": "FREIGHT_CORRIDOR",
        "coords": [103.1200, -1.7800],
        "province": "Jambi",
        "status": "CONGESTED",
        "dwelling_time_hours": 3.0,
        "queue_count": 35,
        "hazard_type": "COAL_FREIGHT_GRIDLOCK",
        "capacity": 25
    },
    {
        "id": "PASS_CURUP_KEPAHIANG",
        "name": "Lintas Curup - Kepahiang",
        "type": "MOUNTAIN_PASS",
        "coords": [102.5500, -3.5500],
        "province": "Bengkulu",
        "status": "NORMAL",
        "dwelling_time_hours": 1.0,
        "queue_count": 5,
        "hazard_type": "FOG_LANDSLIDE",
        "capacity": 20
    },
    {
        "id": "PASS_SEULAWAH",
        "name": "Lintas Gunung Seulawah",
        "type": "MOUNTAIN_PASS",
        "coords": [95.6600, 5.4200],
        "province": "Aceh",
        "status": "NORMAL",
        "dwelling_time_hours": 1.2,
        "queue_count": 7,
        "hazard_type": "MOUNTAIN_HAIRPIN",
        "capacity": 25
    }
]


def haversine_distance_km(coord1: List[float], coord2: List[float]) -> float:
    """Calculates spherical surface distance in km between [lon1, lat1] and [lon2, lat2]."""
    lon1, lat1 = coord1
    lon2, lat2 = coord2
    R = 6371.0 # Earth's radius in km

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


class IntermodalSyncService:
    """Singleton service managing Pan-Sumatra transport choke-points and intermodal delay multipliers."""

    _chokepoints: Dict[str, Dict[str, Any]] = {}

    def __init__(self):
        if not self._chokepoints:
            self._load_chokepoints()

    def _load_chokepoints(self):
        """Initializes and calculates multipliers for all choke-points."""
        now_iso = datetime.now(timezone.utc).isoformat()
        for cp in SUMATRA_CHOKE_POINTS:
            item = dict(cp)
            item["intermodal_delay_multiplier"] = self._compute_delay_multiplier(
                item["queue_count"], item["status"]
            )
            item["updated_at"] = now_iso
            self._chokepoints[item["id"]] = item

    @staticmethod
    def _compute_delay_multiplier(queue_count: int, status: str) -> float:
        """
        Calculates dynamic delay multiplier M_intermodal = 1.0 + 0.15 * queue * severity_weight,
        clamped strictly to [1.0, 3.5].
        """
        severity_weights = {
            "NORMAL": 0.1,
            "CONGESTED": 0.5,
            "RESTRICTED": 1.0,
            "BLOCKED": 2.0
        }
        weight = severity_weights.get(status, 0.5)
        raw_multiplier = 1.0 + (0.15 * (queue_count / 10.0) * weight)
        clamped = max(1.0, min(3.5, round(raw_multiplier, 2)))
        return clamped

    def get_all_chokepoints(self) -> List[Dict[str, Any]]:
        """Returns all 18+ registered Pan-Sumatra transport choke-points with live metrics."""
        return list(self._chokepoints.values())

    def get_chokepoint_by_id(self, chokepoint_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves an individual choke-point by unique identifier."""
        return self._chokepoints.get(chokepoint_id)

    def calculate_route_intermodal_delay(self, route_waypoints: List[List[float]], proximity_threshold_km: float = 25.0) -> float:
        """
        Determines the worst-case intermodal delay multiplier (M_intermodal) for any
        choke-point within proximity of the given polyline route waypoints.
        """
        if not route_waypoints or len(route_waypoints) == 0:
            return 1.0

        max_multiplier = 1.0
        for cp in self._chokepoints.values():
            cp_coords = cp["coords"]
            for pt in route_waypoints:
                dist = haversine_distance_km(pt, cp_coords)
                if dist <= proximity_threshold_km:
                    multiplier = cp.get("intermodal_delay_multiplier", 1.0)
                    if multiplier > max_multiplier:
                        max_multiplier = multiplier
                    break

        return max_multiplier

    def update_chokepoint_status(self, chokepoint_id: str, queue_count: int, status: str) -> Optional[Dict[str, Any]]:
        """Updates real-time queue count and status for a specific choke-point."""
        if chokepoint_id not in self._chokepoints:
            return None

        cp = self._chokepoints[chokepoint_id]
        cp["queue_count"] = queue_count
        cp["status"] = status
        cp["intermodal_delay_multiplier"] = self._compute_delay_multiplier(queue_count, status)
        cp["updated_at"] = datetime.now(timezone.utc).isoformat()
        return cp


# Global singleton instance
intermodal_sync_service = IntermodalSyncService()
