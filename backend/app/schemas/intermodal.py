"""
PreHub — Intermodal Terminal, Spoilage Hedging & Compliance Schemas.
Pydantic v2 schemas for Pan-Sumatra transport choke-points, operational
spoilage hedging calculations, and digital compliance inspection.
"""
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field


ChokePointType = Literal[
    "SEAPORT",
    "FERRY_TERMINAL",
    "MOUNTAIN_PASS",
    "TOLL_HIGHWAY_JUNCTION",
    "FREIGHT_CORRIDOR",
    "HIGHWAY_BOTTLENECK"
]

ChokePointStatus = Literal["NORMAL", "CONGESTED", "RESTRICTED", "BLOCKED"]


class ChokePointItem(BaseModel):
    """Schema for an individual Pan-Sumatra transport choke-point or terminal."""
    id: str = Field(..., description="Unique choke-point identifier (e.g. PORT_BELAWAN, PASS_SITINJAU_LAUIK)")
    name: str = Field(..., description="Canonical gateway name")
    type: ChokePointType = Field(..., description="Infrastructural classification")
    coords: List[float] = Field(..., description="Geographic [longitude, latitude] coordinates")
    province: str = Field(..., description="Indonesian province jurisdiction")
    status: ChokePointStatus = Field(default="NORMAL", description="Real-time operational status")
    dwelling_time_hours: float = Field(default=1.0, description="Estimated dwelling / clearance time in hours")
    queue_count: int = Field(default=0, description="Number of waiting vessels, trucks, or heavy vehicles")
    intermodal_delay_multiplier: float = Field(default=1.0, description="Delay multiplier M_intermodal (1.0 - 3.5)")
    hazard_type: Optional[str] = Field(default=None, description="Dominant hazard or choke-point condition")
    capacity: Optional[int] = Field(default=None, description="Nominal gate / road throughput capacity")
    updated_at: str = Field(..., description="ISO-8601 timestamp of last status evaluation")


class ChokePointsListResponse(BaseModel):
    """Response schema for listing all Pan-Sumatra choke-points."""
    items: List[ChokePointItem]
    total: int
    congested_count: int
    restricted_count: int


class HedgingSolveRequest(BaseModel):
    """Request payload for operational spoilage hedging cost matrix solver."""
    vehicle_id: str = Field(..., description="Vehicle or shipment identifier")
    commodity: str = Field(..., description="Commodity type (e.g. cabai_merah, daging_sapi, bawang_merah, beras)")
    cargo_tonnage: float = Field(default=10.0, ge=0.1, le=100.0, description="Total cargo payload weight in Metric Tons")
    origin: str = Field(..., description="Origin hub or corridor start")
    destination: str = Field(..., description="Destination hub or corridor end")
    vehicle_golongan: Literal["GOL_I", "GOL_II", "GOL_III", "GOL_IV", "GOL_V"] = Field(
        default="GOL_II", 
        description="Indonesian toll vehicle classification (Golongan I - V)"
    )
    fuel_type: Literal["biosolar", "dexlite", "pertamina_dex"] = Field(
        default="biosolar", 
        description="Fuel type used by vehicle"
    )
    p_disruption: float = Field(default=0.85, ge=0.0, le=1.0, description="Probability of corridor disruption / impassability")
    disruption_delay_hours: float = Field(default=12.0, ge=0.0, description="Expected delay if caught in disruption (hours)")
    detour_distance_km: float = Field(default=85.0, ge=0.0, description="Additional distance required for detour route (km)")
    detour_time_hours: float = Field(default=2.5, ge=0.0, description="Additional driving hours for detour route")
    toll_segments: Optional[List[str]] = Field(
        default=None, 
        description="List of BPJT toll segment IDs traversed by detour (e.g. ['MEDAN_TEBINGTINGGI'])"
    )
    hold_wait_hours: float = Field(default=6.0, ge=0.0, description="Staging duration if selecting HOLD policy (hours)")
    downtime_fixed_fee_idr: float = Field(default=500000.0, description="Fixed contractual downtime fee per delayed trip (IDR)")


class PolicyBreakdown(BaseModel):
    """Detailed monetary cost breakdown for an individual mitigation policy."""
    policy: Literal["CONTINUE", "REROUTE", "HOLD"]
    cost_idr: float = Field(..., description="Total calculated monetary exposure in IDR")
    breakdown: Dict[str, float] = Field(..., description="Component cost items (fuel, toll, spoilage, labor, etc.)")
    explanation: str = Field(..., description="Indonesian technical justification and risk rationale")
    risk_level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = Field(..., description="Operational risk indicator")


class HedgingSolveResponse(BaseModel):
    """Response schema containing evaluated mitigation policies and optimal recommendation."""
    vehicle_id: str
    commodity: str
    perishability_tier: str = Field(..., description="4-Tier Perishability classification")
    decay_rate_per_hour: float = Field(..., description="Exponential spoilage coefficient delta")
    cargo_value_idr: float = Field(..., description="Total baseline cargo monetary valuation in IDR")
    spoilage_loss_idr: float = Field(..., description="Expected cargo value loss if delayed in disruption")
    continue_policy: PolicyBreakdown
    reroute_policy: PolicyBreakdown
    hold_policy: PolicyBreakdown
    optimal_policy: Literal["CONTINUE", "REROUTE", "HOLD"] = Field(..., description="Policy minimizing monetary loss")
    net_savings_idr: float = Field(..., description="Monetary savings compared to default CONTINUE policy (IDR)")
    recommendation_reason: str = Field(..., description="Operator actionable recommendation text")


class ComplianceVerifyRequest(BaseModel):
    """Request payload for digital manifest, quarantine, and axle-load verification."""
    vehicle_id: str = Field(..., description="Vehicle license plate or asset ID")
    origin: str = Field(..., description="Origin hub or facility")
    destination: str = Field(..., description="Destination hub or facility")
    traversed_roads: List[str] = Field(default_factory=list, description="Road segment IDs or names in route")
    vehicle_gross_weight_ton: float = Field(..., ge=0.5, le=100.0, description="Gross vehicle weight + cargo in Metric Tons")
    commodity: str = Field(..., description="Manifested commodity name")
    driver_name: Optional[str] = Field(default=None, description="Driver full name")
    driver_phone: Optional[str] = Field(default=None, description="Driver WhatsApp / phone contact")
    license_plate: Optional[str] = Field(default=None, description="Physical license plate number")
    has_bkhit_cert: bool = Field(default=False, description="Whether agricultural quarantine certificate is present")
    bkhit_cert_id: Optional[str] = Field(default=None, description="Official BKHIT certificate reference ID")
    manifest_hash: Optional[str] = Field(default=None, description="Digital SHA-256 hash of electronic Surat Jalan")


ComplianceCheckStatus = Literal["PASSED", "WARNING", "HARD_BLOCK"]


class ComplianceCheckDetail(BaseModel):
    """Individual compliance rule verification outcome."""
    category: Literal["QUARANTINE_BKHIT", "AXLE_LOAD_MST", "SURAT_JALAN_MANIFEST"]
    status: ComplianceCheckStatus
    title: str = Field(..., description="Check item header")
    detail: str = Field(..., description="Inspection outcome description")
    remedy_action: Optional[str] = Field(default=None, description="Action required if not passed")


class ComplianceVerifyResponse(BaseModel):
    """Comprehensive compliance verification outcome and clearance status."""
    vehicle_id: str
    overall_status: ComplianceCheckStatus = Field(..., description="Worst-case status among all checks")
    can_dispatch: bool = Field(..., description="True if no HARD_BLOCK rules are triggered")
    requires_override: bool = Field(..., description="True if WARNING rules require dispatcher acknowledgment")
    checks: List[ComplianceCheckDetail]
    timestamp: str
