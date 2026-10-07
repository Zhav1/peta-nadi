"""
PreHub — Self-Serve Fleet Onboarding & Live GPS Ingestion Schemas.
Pydantic v2 schemas for single vehicle registration, bulk CSV/Excel manifest parsing,
and standard TMS GPS telematics webhook payloads.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class SingleVehicleRegisterRequest(BaseModel):
    """Schema for registering an individual vehicle and cargo manifest."""
    vehicle_id: str = Field(..., description="Unique license plate or asset identifier (e.g. BK-8821-XA)")
    name: str = Field(..., description="Descriptive asset name (e.g. Truk Cold-Chain Sayur Berastagi #4)")
    modality: str = Field(default="truck", description="Modality type: 'truck', 'maritime', or 'air'")
    driver_name: Optional[str] = Field(default=None, description="Driver or operator full name")
    driver_phone: Optional[str] = Field(default=None, description="Driver WhatsApp / phone contact (+62...)")
    cargo: Optional[str] = Field(default=None, description="Cargo description (e.g. 12 Ton Cabai & Sayur Segar)")
    origin: Optional[str] = Field(default=None, description="Origin hub or city name")
    destination: Optional[str] = Field(default=None, description="Destination hub or city name")
    speed_kmh: float = Field(default=60.0, description="Nominal travel speed in km/h")
    temperature_c: Optional[float] = Field(default=None, description="Reefer cold-chain temperature in Celsius")
    path: Optional[List[List[float]]] = Field(default=None, description="Array of [lng, lat] coordinate waypoints")
    status: str = Field(default="moving", description="Operational status: 'moving', 'idle', 'delayed', etc.")
    commodity_key: Optional[str] = Field(default=None, description="Standardized commodity key (e.g. 'cabai_merah', 'beras')")
    cargo_tonnage: Optional[float] = Field(default=10.0, ge=0.0, description="Gross cargo weight in Metric Tons")
    cargo_value_idr: Optional[float] = Field(default=None, ge=0.0, description="Estimated cargo valuation in IDR")
    vehicle_golongan: Optional[str] = Field(default="GOL_II", description="Toll vehicle classification (GOL_I - GOL_V)")
    gross_weight_ton: Optional[float] = Field(default=12.0, ge=0.0, description="Gross vehicle weight in Metric Tons")
    sla_deadline_hours: Optional[float] = Field(default=8.0, ge=0.0, description="Delivery SLA deadline duration in hours")
    has_bkhit_cert: bool = Field(default=False, description="Whether agricultural quarantine certificate is active")
    mmsi: Optional[str] = Field(default=None, description="Maritime MMSI identifier if applicable")
    imo: Optional[str] = Field(default=None, description="Maritime IMO identifier if applicable")
    vin: Optional[str] = Field(default=None, description="Vehicle Identification Number (VIN) if applicable")
    icao24: Optional[str] = Field(default=None, description="Aviation ICAO 24-bit transponder address if applicable")
    callsign: Optional[str] = Field(default=None, description="Aviation callsign if applicable")


class BulkManifestUploadRequest(BaseModel):
    """Schema for uploading a batch of vehicles and delivery manifests."""
    vehicles: Optional[List[SingleVehicleRegisterRequest]] = Field(default=None, description="List of vehicle records")
    csv_text: Optional[str] = Field(default=None, description="Raw CSV string content")
    manifest_name: Optional[str] = Field(default=None, description="Batch manifest title or shipment code")
    notes: Optional[str] = Field(default=None, description="Optional dispatcher notes")


class TMSVehicleTelemetryPing(BaseModel):
    """
    Schema for live GPS telematics pings from external TMS providers
    (Traccar, EasyGo, McEasy, or custom IoT transponders).
    """
    vehicle_id: str = Field(..., description="Target vehicle identifier")
    latitude: float = Field(..., description="GPS Latitude in decimal degrees")
    longitude: float = Field(..., description="GPS Longitude in decimal degrees")
    speed_kmh: Optional[float] = Field(default=0.0, description="Instantaneous ground speed in km/h")
    heading_deg: Optional[float] = Field(default=None, description="True course / heading in degrees (0-360)")
    altitude_m: Optional[float] = Field(default=0.0, description="GPS Altitude in meters above sea level")
    temperature_c: Optional[float] = Field(default=None, description="Live cold-chain cargo temperature in Celsius")
    timestamp: Optional[str] = Field(default=None, description="ISO-8601 timestamp of GPS fix")
    battery_level: Optional[float] = Field(default=None, description="Transponder battery level (0-100%)")
    ignition: Optional[bool] = Field(default=None, description="Engine ignition status (true/false)")
    raw_payload: Optional[Dict[str, Any]] = Field(default=None, description="Raw vendor telematics payload")


class FleetIngestResponse(BaseModel):
    """Standardized response schema for fleet ingestion operations."""
    status: str = "success"
    message: str
    registered_count: int
    vehicles: List[Dict[str, Any]]


class ManifestTemplateResponse(BaseModel):
    """Response schema providing standard manifest template format and supported hubs."""
    headers: List[str]
    sample_csv: str
    supported_hubs: List[Dict[str, Any]]
