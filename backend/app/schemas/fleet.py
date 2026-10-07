"""
PreHub — Multi-Modal Fleet Telemetry Schemas (Pydantic v2)
Models for Maritime AIS, Aviation ADS-B, and Truck IoT Cold-Chain Transponders.
"""
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator


class VehicleModality(str, Enum):
    TRUCK = "truck"
    MARITIME = "maritime"
    AIR = "air"


class VehicleStatus(str, Enum):
    MOVING = "moving"
    ANCHORED = "anchored"
    REROUTING = "rerouting"


class SignalStatus(str, Enum):
    LIVE_STREAM = "LIVE_STREAM"
    CACHE_FALLBACK = "CACHE_FALLBACK"
    SIMULATION_CACHE = "SIMULATION_CACHE"


class ColdChainStatus(str, Enum):
    NORMAL = "NORMAL"
    WARNING_EXCURSION = "WARNING_EXCURSION"


class RouteGeometry(BaseModel):
    type: str = "LineString"
    coordinates: List[List[float]] = Field(
        ...,
        description="GeoJSON LineString coordinate array [[lon, lat], ...]"
    )

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, v: List[List[float]]) -> List[List[float]]:
        for point in v:
            if len(point) != 2:
                raise ValueError(f"Coordinate point must be [lon, lat], got {point}")
            lon, lat = point
            if not (-180.0 <= lon <= 180.0):
                raise ValueError(f"Longitude {lon} out of range [-180, 180]")
            if not (-90.0 <= lat <= 90.0):
                raise ValueError(f"Latitude {lat} out of range [-90, 90]")
        return v


class FleetVehicleTelemetry(BaseModel):
    # --- Common Telemetry Fields ---
    vehicle_id: str = Field(..., description="Unique vehicle/vessel/flight asset ID")
    name: str = Field(..., description="Human-readable asset callsign or display name")
    modality: VehicleModality = Field(..., description="Modality: truck, maritime, air")
    path: List[List[float]] = Field(..., description="Trajectory coordinate sequence [[lon, lat], ...]")
    route_geometry: Optional[RouteGeometry] = Field(None, description="Full route GeoJSON geometry")
    speed_kmh: float = Field(..., ge=0.0, description="Speed in km/h")
    status: VehicleStatus = Field(..., description="Operating status: moving, anchored, rerouting")
    progress: float = Field(0.0, ge=0.0, le=1.0, description="Normalized route progress 0.0 to 1.0")
    cargo: Optional[str] = Field(None, description="Manifest commodity / tonnage description")
    origin: Optional[str] = Field(None, description="Origin port / terminal / city")
    destination: Optional[str] = Field(None, description="Destination port / terminal / city")
    heading_deg: Optional[float] = Field(None, ge=0.0, le=360.0, description="True heading bearing in degrees")

    # --- Maritime AIS Transponder Fields ---
    mmsi: Optional[str] = Field(None, description="Maritime Mobile Service Identity (9-digit string)")
    imo: Optional[str] = Field(None, description="International Maritime Organization number")
    sog_knots: Optional[float] = Field(None, ge=0.0, description="Speed Over Ground in knots")
    cog_deg: Optional[float] = Field(None, ge=0.0, le=360.0, description="Course Over Ground in degrees")
    draught_m: Optional[float] = Field(None, ge=0.0, description="Vessel draught in meters")
    nav_status: Optional[str] = Field(None, description="AIS navigational status (Under way using engine, At anchor, etc.)")

    # --- Aviation ADS-B Transponder Fields ---
    icao24: Optional[str] = Field(None, description="ICAO 24-bit aircraft transponder address hex")
    callsign: Optional[str] = Field(None, description="Aviation flight callsign")
    altitude_ft: Optional[float] = Field(None, description="Altitude in feet")
    ground_speed_kts: Optional[float] = Field(None, ge=0.0, description="Ground speed in knots")

    # --- Truck & IoT Cold-Chain Fields ---
    vin: Optional[str] = Field(None, description="Vehicle Identification Number / Transponder ID")
    temperature_c: Optional[float] = Field(None, description="Cargo compartment reefer temperature in Celsius")
    cold_chain_status: Optional[ColdChainStatus] = Field(None, description="Reefer safety evaluation: NORMAL (<=4.0C) or WARNING_EXCURSION (>4.0C)")

    # --- Shipment Profile & Business Constraints ---
    commodity_key: Optional[str] = Field(None, description="Standardized commodity key (e.g. 'cabai_merah', 'beras', 'daging_sapi')")
    cargo_tonnage: Optional[float] = Field(None, ge=0.0, description="Gross cargo weight in Metric Tons")
    cargo_value_idr: Optional[float] = Field(None, ge=0.0, description="Estimated total cargo valuation in IDR")
    vehicle_golongan: Optional[str] = Field("GOL_II", description="BPJT toll vehicle class (GOL_I - GOL_V)")
    gross_weight_ton: Optional[float] = Field(None, ge=0.0, description="Total gross vehicle weight in Metric Tons (for MST checks)")
    sla_deadline_hours: Optional[float] = Field(None, ge=0.0, description="SLA delivery deadline duration in hours from departure")
    deadline_buffer_hours: Optional[float] = Field(None, description="Buffer hours remaining before SLA penalty")
    has_bkhit_cert: bool = Field(False, description="Whether agricultural quarantine certificate is active")
    driver_name: Optional[str] = Field(None, description="Driver full name")
    driver_phone: Optional[str] = Field(None, description="Driver WhatsApp contact number (+62...)")

    # --- Signal & Telemetry Metadata ---
    signal_status: SignalStatus = Field(SignalStatus.SIMULATION_CACHE, description="Telemetry stream status")
    telemetry_source: str = Field("PREHUB_RADAR", description="Source sensor or radar feed ID")
    last_ping_seconds_ago: float = Field(1.2, ge=0.0, description="Freshness of last transponder ping")

    @field_validator("path")
    @classmethod
    def validate_path(cls, v: List[List[float]]) -> List[List[float]]:
        for point in v:
            if len(point) != 2:
                raise ValueError(f"Path point must be [lon, lat], got {point}")
            lon, lat = point
            if not (-180.0 <= lon <= 180.0):
                raise ValueError(f"Longitude {lon} out of range [-180, 180]")
            if not (-90.0 <= lat <= 90.0):
                raise ValueError(f"Latitude {lat} out of range [-90, 90]")
        return v


class FleetTelemetryListResponse(BaseModel):
    status: str = "success"
    total_vehicles: int
    modality_counts: Dict[str, int]
    updated_at: str
    vehicles: List[FleetVehicleTelemetry]
