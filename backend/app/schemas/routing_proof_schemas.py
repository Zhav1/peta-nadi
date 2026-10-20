"""
PreHub : Routing Proof Schemas for Route Detail Modal (Phase 77).

Provides structured evidence backing every route recommendation so the
5-section Route Detail Modal renders real data with zero mocked numbers:

(1) Dasar Risiko      <- safety_tag, safety_status, is_compromised,
                         impact_profile.passability, hazard type/radius
(2) Dampak+Uncertainty <- tradeoff time_delta, congestion levels,
                         hedging net_savings / spoilage_loss
(3) Manfaat-vs-Konsekuensi is rendered from tradeoff_analysis pros/cons
    (already on the route); this module covers the proof triple the
    modal needs beyond pros/cons.
(4) Keterbatasan Data <- compliance status, hedging nullability,
                         news link_alive, corridor is_fallback flag
"""
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class RiskEvidenceItem(BaseModel):
    """Single auditable evidence row backing a proof section."""

    source: str = Field(..., description="Evidence origin: 'hazard' | 'tomtom' | 'weather' | 'news' | 'hedging' | 'compliance' | 'router'")
    label: str = Field(..., description="Human-readable evidence label (ID/EN)")
    value: Optional[Any] = Field(default=None, description="Observed value (str/float/bool/None)")
    confidence: float = Field(default=0.8, ge=0.0, le=1.0, description="Confidence 0.0-1.0")
    detail: Optional[str] = Field(default=None, description="Optional qualifier, e.g. unit or threshold used")


class DasarRisiko(BaseModel):
    """Section 1: why this route is considered safe or compromised."""

    safety_tag: str = Field(..., description="Short safety tag, e.g. AMAN / WASPADA / BERISIKO")
    safety_status: Literal["CLEAR", "SAFE_DETOUR", "COMPROMISED", "HOLD_DELAY"] = Field(
        ..., description="Canonical safety status consumed by the modal"
    )
    is_compromised: bool = Field(..., description="True when risk_score crosses the compromise threshold")
    passability: Literal["BLOCKED", "RESTRICTED", "CAUTION", "CLEAR"] = Field(
        default="CAUTION", description="Corridor passability from impact_profile or hazard proximity"
    )
    hazard_type: Optional[str] = Field(default=None, description="Dominant hazard type affecting this route")
    hazard_radius_km: Optional[float] = Field(default=None, description="Hazard buffer radius in km, if any")
    evidence: List[RiskEvidenceItem] = Field(default_factory=list)


class DampakUncertainty(BaseModel):
    """Section 2: quantified impact plus explicit uncertainty."""

    time_delta_minutes: Optional[float] = Field(default=None, description="ETA delta vs primary route in minutes")
    congestion_levels: List[str] = Field(default_factory=list, description="Observed TomTom congestion levels along route")
    net_savings_idr: Optional[float] = Field(default=None, description="Hedging net savings in IDR (None = data tidak tersedia)")
    spoilage_loss_idr: Optional[float] = Field(default=None, description="Expected spoilage loss in IDR (None = data tidak tersedia)")
    eta_confidence: float = Field(default=0.75, ge=0.0, le=1.0)
    evidence: List[RiskEvidenceItem] = Field(default_factory=list)


class KeterbatasanData(BaseModel):
    """Section 4: honest data limitations so the modal never fabricates numbers."""

    is_fallback: bool = Field(..., description="True when speeds/proof came from seed fallback, not live telemetry")
    compliance_status: Optional[str] = Field(default=None, description="BKHIT/MST compliance status, if evaluated")
    hedging_available: bool = Field(default=True, description="False when hedging solve was absent -> render honest empty state")
    news_links_alive: int = Field(default=0, description="Count of news attributions with link_alive == 'alive'")
    news_links_total: int = Field(default=0, description="Total news attributions considered")
    missing_fields: List[str] = Field(default_factory=list, description="Field names that had no data (render 'Data tidak tersedia')")
    warnings: List[str] = Field(default_factory=list)
    evidence: List[RiskEvidenceItem] = Field(default_factory=list)


class RouteProof(BaseModel):
    """Full proof triple attached to every emitted route as route['proof']."""

    dasar_risiko: DasarRisiko
    dampak_uncertainty: DampakUncertainty
    keterbatasan_data: KeterbatasanData
