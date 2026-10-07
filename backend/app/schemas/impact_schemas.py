"""
PreHub — Disruption Impact Assessment Schemas (Pydantic v2).
Models for evaluating spatial intersections between physical hazard disruptions
and active fleet shipments, generating explainable recommendations and WhatsApp dispatch triggers.
"""
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field


class DisruptionImpactRequest(BaseModel):
    """Payload for evaluating which active shipments are affected by a disruption."""
    incident_id: Optional[str] = Field(default=None, description="Known incident identifier if assessing an existing event")
    lat: float = Field(..., description="Latitude of disruption center")
    lon: float = Field(..., description="Longitude of disruption center")
    radius_km: float = Field(default=15.0, ge=1.0, le=100.0, description="Hazard danger buffer radius in km")
    hazard_type: str = Field(default="flood", description="Type of hazard: 'flood', 'landslide', 'earthquake', 'congestion'")
    severity: Literal["low", "medium", "high", "critical"] = Field(default="critical", description="Disruption severity")
    title: Optional[str] = Field(default=None, description="Incident title or corridor description")


class ImpactedVehicleAssessment(BaseModel):
    """Detailed operational evaluation for an individual vehicle affected by the disruption."""
    vehicle_id: str = Field(..., description="Vehicle asset identifier or plate number")
    vehicle_name: str = Field(..., description="Asset display name")
    modality: str = Field(default="truck", description="Vehicle modality")
    driver_name: Optional[str] = Field(default=None, description="Driver full name")
    driver_phone: Optional[str] = Field(default=None, description="Driver WhatsApp contact number (+62...)")
    commodity: str = Field(..., description="Descriptive commodity name")
    commodity_key: str = Field(..., description="Standardized commodity key (e.g. 'cabai_merah', 'beras')")
    cargo_tonnage: float = Field(..., description="Gross cargo weight in Metric Tons")
    cargo_value_idr: float = Field(..., description="Estimated total cargo valuation in IDR")
    vehicle_golongan: str = Field(default="GOL_II", description="BPJT toll vehicle class")
    origin: str = Field(..., description="Origin terminal or city")
    destination: str = Field(..., description="Destination terminal or city")
    distance_to_hazard_km: float = Field(..., description="Proximity from current vehicle position / route to hazard center")
    estimated_delay_hours: float = Field(..., description="Expected transit delay if caught in disruption")
    sla_deadline_hours: float = Field(..., description="Contractual delivery deadline from origin in hours")
    late_arrival_risk_pct: float = Field(..., description="Calculated probability of SLA late arrival (0-100%)")
    optimal_policy: Literal["REROUTE", "HOLD", "CONTINUE"] = Field(..., description="Optimal tactical mitigation policy")
    net_savings_idr: float = Field(..., description="Monetary savings of optimal policy vs default continue (IDR)")
    spoilage_loss_idr: float = Field(..., description="Expected cargo value loss if delayed in disruption (IDR)")
    detour_cost_idr: float = Field(..., description="Incremental toll and fuel cost if rerouting (IDR)")
    compliance_status: Literal["PASSED", "WARNING", "HARD_BLOCK"] = Field(default="PASSED", description="Regulatory compliance status")
    recommendation_rationale: str = Field(..., description="Plain-language explainable recommendation text")
    whatsapp_dispatch_text: str = Field(..., description="Pre-composed official driver WhatsApp instruction text")
    detour_route: Optional[Dict[str, Any]] = Field(default=None, description="Deterministic CPU detour route geometry and stats")


class DisruptionImpactResponse(BaseModel):
    """Aggregated assessment response for the Dispatcher Alert Queue."""
    disruption: Dict[str, Any] = Field(..., description="Evaluated disruption metadata")
    total_fleet_scanned: int = Field(..., description="Total active units evaluated across Sumatra")
    impacted_vehicles_count: int = Field(..., description="Number of vehicles intersecting the hazard zone")
    critical_count: int = Field(default=0, description="Number of affected vehicles with CRITICAL SLA or spoilage risk")
    warning_count: int = Field(default=0, description="Number of affected vehicles with WARNING status")
    impacted_vehicles: List[ImpactedVehicleAssessment] = Field(default_factory=list, description="Ranked list of impacted vehicles")
    evaluated_at: str = Field(..., description="ISO-8601 timestamp of evaluation")
