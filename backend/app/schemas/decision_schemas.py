"""
Pydantic v2 schemas for closed-loop operator decision traces and ground-truth outcomes.
"""
from enum import Enum
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, model_validator


class DecisionAction(str, Enum):
    ACCEPT = "ACCEPT"
    REJECT = "REJECT"
    OVERRIDE = "OVERRIDE"


class TacticalManeuver(str, Enum):
    REROUTE = "REROUTE"
    HOLD = "HOLD"
    CONTINUE = "CONTINUE"


class DecisionTraceCreate(BaseModel):
    incident_id: Optional[str] = Field(None, description="Target crisis or incident identifier")
    crisis_id: Optional[str] = Field(None, description="Alias for incident_id")
    route_id: str = Field("0", description="Selected or overridden route index/ID")
    action: DecisionAction = Field(DecisionAction.ACCEPT, description="Operator decision action")
    tactical_action: TacticalManeuver = Field(TacticalManeuver.REROUTE, description="Tactical execution directive")
    operator_id: Optional[str] = Field(None, description="Identity of operator/commander")
    approved_by: Optional[str] = Field(None, description="Alias for operator_id")
    recommended_route: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Route geometry and metadata")
    custom_constraints: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Overrides e.g. speed_limit_kmh, avoid_nodes")
    notes: Optional[str] = Field(None, description="Operator justification notes (mandatory on REJECT/OVERRIDE)")
    route_name: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None

    @model_validator(mode="after")
    def validate_mandatory_notes(self) -> "DecisionTraceCreate":
        # Resolve aliases
        if not self.incident_id and self.crisis_id:
            self.incident_id = self.crisis_id
        if not self.operator_id and self.approved_by:
            self.operator_id = self.approved_by
        if not self.operator_id:
            self.operator_id = "anonymous"

        # Mandatory notes on REJECT or OVERRIDE
        if self.action in (DecisionAction.REJECT, DecisionAction.OVERRIDE):
            if not self.notes or not self.notes.strip():
                raise ValueError(f"Mandatory explanation notes required when action is '{self.action.value}'.")
        return self


class DecisionTraceResponse(BaseModel):
    id: str
    incident_id: str
    route_id: str
    action: DecisionAction
    tactical_action: TacticalManeuver
    operator_id: str
    recommended_route: Optional[Dict[str, Any]] = None
    custom_constraints: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    sync_status: str = "synced"
    created_at: datetime
    approved_at: Optional[datetime] = None


class DecisionTraceListResponse(BaseModel):
    items: List[DecisionTraceResponse]
    total: int


# Outcome Schemas

class OutcomeHorizon(str, Enum):
    T_12H = "T+12h"
    T_24H = "T+24h"


class VerificationSource(str, Enum):
    FIELD_REPORT = "FIELD_REPORT"
    ANTARA_NEWS = "ANTARA_NEWS"
    BMKG_ALL_CLEAR = "BMKG_ALL_CLEAR"
    POLDA_TRAFFIC_POLICE = "POLDA_TRAFFIC_POLICE"


class OutcomeCreate(BaseModel):
    incident_id: str = Field(..., description="Referenced incident identifier")
    horizon: OutcomeHorizon = Field(OutcomeHorizon.T_12H, description="Verification time horizon")
    actual_clearance_time: Optional[datetime] = Field(None, description="Observed timestamp when route reopened")
    observed_delay_hours: float = Field(..., ge=0.0, description="Observed fleet travel delay in hours")
    actual_price_spike_pct: float = Field(..., description="Observed commodity price shift in percentage")
    verified_by: str = Field("operator-1", description="Observer or organization confirming ground truth")
    verification_source: VerificationSource = Field(VerificationSource.FIELD_REPORT, description="Information channel")
    notes: Optional[str] = Field(None, description="Field observation details")


class OutcomeResponse(BaseModel):
    id: str
    incident_id: str
    horizon: OutcomeHorizon
    actual_clearance_time: Optional[datetime] = None
    observed_delay_hours: float
    actual_price_spike_pct: float
    verified_by: str
    verification_source: VerificationSource
    notes: Optional[str] = None
    sync_status: str = "synced"
    created_at: datetime


class OutcomeListResponse(BaseModel):
    items: List[OutcomeResponse]
    total: int
