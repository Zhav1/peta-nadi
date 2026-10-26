"""
PreHub : Truck Asset Master & Travel (Rit) Ledger Schemas.

Separates the *asset* (truck: nopol/vehicle_id, VIN, golongan, driver, company)
from the *transactional trip* (rit: origin/destination, cargo, SLA, baseline vs
actual time/fuel/cost, disruption, status, and the realised savings split).

Money is never accepted from the client as a "savings percent". Every rupiah in
the ledger is derived server-side from BPJT toll tariffs, Pertamina fuel rates,
and the 4-tier spoilage decay model in `spoilage_hedging_service`.
"""
from enum import Enum
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, field_validator, model_validator


TollGolongan = Literal["GOL_I", "GOL_II", "GOL_III", "GOL_IV", "GOL_V"]
FuelType = Literal["biosolar", "dexlite", "pertamina_dex"]

# Fuel-spec contract (Phase 1, DB + contract only — ledger math untouched):
# default fuel efficiency per BPJT golongan (km per liter).
# NULL asset efficiency MUST resolve via this map. The legacy flat 3.5 km/L
# constant (TRUCK_FUEL_CONSUMPTION_KM_PER_LITER) remains the GOL_II default and
# is DEPRECATED as a universal fallback for other golongan.
GOLONGAN_DEFAULT_KMPL: dict[str, float] = {
    "GOL_I": 4.0,
    "GOL_II": 3.5,
    "GOL_III": 3.0,
    "GOL_IV": 2.8,
    "GOL_V": 2.5,
}
LEGACY_FLAT_KMPL_FALLBACK_DEPRECATED = 3.5


class TravelStatus(str, Enum):
    PLANNED = "planned"
    MOVING = "moving"
    REROUTED = "rerouted"
    DELIVERED = "delivered"
    FAILED = "failed"


# ==========================================
# 1. MASTER TRUCK ASSET (Step 1 of onboarding)
# ==========================================

class TruckAssetCreate(BaseModel):
    """Master truck asset. Registered once, reused by every travel/rit."""
    truck_id: str = Field(..., min_length=2, description="Nomor polisi / vehicle_id unik (mis. BK-8821-XA)")
    name: str = Field(..., min_length=2, description="Nama unit armada (mis. Truk Cold-Chain Sayur Berastagi #4)")
    modality: Literal["truck"] = Field(default="truck", description="Asset modality (truk)")
    vin: Optional[str] = Field(default=None, description="Vehicle Identification Number")
    vehicle_golongan: TollGolongan = Field(default="GOL_II", description="Kelas kendaraan BPJT (GOL_I - GOL_V)")
    driver_name: Optional[str] = Field(default=None, description="Nama pengemudi utama")
    driver_phone: Optional[str] = Field(default=None, description="Kontak WhatsApp pengemudi (+62...)")
    company_id: Optional[str] = Field(default=None, description="Tenant perusahaan pemilik aset")
    company_name: Optional[str] = Field(default=None, description="Nama perusahaan pemilik aset")
    gross_weight_ton: float = Field(default=12.0, ge=0.0, description="Berat kotor kendaraan (ton) untuk audit MST")
    fuel_type: FuelType = Field(default="biosolar", description="Jenis BBM Pertamina")
    fuel_efficiency_kmpl: Optional[float] = Field(
        default=None, gt=0.0,
        description="Efisiensi BBM aset (km/L). NULL = default golongan (GOL_I 4.0, GOL_II 3.5, GOL_III 3.0, GOL_IV 2.8, GOL_V 2.5)",
    )
    is_reefer: bool = Field(default=False, description="True bila unit membawa genset reefer cold-chain")
    reefer_fuel_lph: Optional[float] = Field(
        default=None, ge=0.0,
        description="Konsumsi genset reefer (liter/jam). NULL = non-reefer / belum diketahui",
    )
    notes: Optional[str] = Field(default=None, description="Catatan dispatcher")

    @field_validator("truck_id")
    @classmethod
    def normalize_truck_id(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("vehicle_golongan")
    @classmethod
    def normalize_golongan(cls, v: str) -> str:
        return v.upper()


class TruckAssetResponse(BaseModel):
    id: str
    truck_id: str
    name: str
    modality: str = "truck"
    vin: Optional[str] = None
    vehicle_golongan: str = "GOL_II"
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    gross_weight_ton: float = 12.0
    fuel_type: str = "biosolar"
    fuel_efficiency_kmpl: Optional[float] = None
    is_reefer: bool = False
    reefer_fuel_lph: Optional[float] = None
    notes: Optional[str] = None
    source: Literal["master", "legacy_custom_fleet"] = "master"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ==========================================
# 2. TRANSACTIONAL TRAVEL / RIT (Step 2)
# ==========================================

class TravelCreate(BaseModel):
    """
    Create one travel/rit. `truck_id` must reference a master truck asset
    (legacy custom_fleet_vehicles rows are still accepted for backward compat).
    """
    truck_id: str = Field(..., description="Referensi aset truk (truck_assets.truck_id atau legacy vehicle_id)")
    origin_name: str = Field(..., min_length=2, description="Nama asal (hasil pilih gazetteer)")
    origin_ref: Optional[str] = Field(default=None, description="ID/node gazetteer asal")
    origin_coords: List[float] = Field(..., description="Koordinat asal [lon, lat] dari gazetteer")
    destination_name: str = Field(..., min_length=2, description="Nama tujuan (hasil pilih gazetteer)")
    destination_ref: Optional[str] = Field(default=None, description="ID/node gazetteer tujuan")
    dest_coords: List[float] = Field(..., description="Koordinat tujuan [lon, lat] dari gazetteer")

    commodity_key: str = Field(..., min_length=2, description="Kunci komoditas (mis. cabai_merah, beras)")
    cargo_tonnage: float = Field(..., gt=0.0, le=100.0, description="Berat muatan (ton)")
    cargo_value_idr: Optional[float] = Field(default=None, ge=0.0, description="Nilai muatan (IDR). Kosong = valuasi tier PIHPS")
    sla_deadline_hours: float = Field(..., gt=0.0, description="Batas SLA pengiriman (jam)")

    vehicle_golongan: Optional[TollGolongan] = Field(default=None, description="Override golongan; default dari aset truk")
    fuel_type: Optional[FuelType] = Field(default=None, description="Override BBM; default dari aset truk")
    fuel_efficiency_kmpl: Optional[float] = Field(
        default=None, gt=0.0,
        description="Fuel-spec contract override (km/L). Phase 1: diterima untuk forward-compat; "
                    "resolusi ledger belum berubah (tetap default golongan / aset)",
    )
    is_reefer: Optional[bool] = Field(
        default=None,
        description="Fuel-spec contract override. Phase 1: diterima untuk forward-compat; ledger belum berubah",
    )
    reefer_fuel_lph: Optional[float] = Field(
        default=None, ge=0.0,
        description="Fuel-spec contract override (liter/jam). Phase 1: diterima untuk forward-compat; ledger belum berubah",
    )

    baseline_distance_km: Optional[float] = Field(default=None, gt=0.0, description="Jarak baseline (km). Kosong = haversine gazetteer")
    baseline_time_hours: float = Field(..., gt=0.0, description="Waktu tempuh baseline pada koridor terbuka (jam)")
    baseline_fuel_liters: Optional[float] = Field(
        default=None, ge=0.0,
        description="BBM baseline (L). Kosong = jarak / efisiensi golongan. "
                    "DEPRECATED: fallback datar 3,5 km/L hanya valid untuk GOL_II — "
                    "gunakan default golongan (GOL_I 4.0, GOL_II 3.5, GOL_III 3.0, GOL_IV 2.8, GOL_V 2.5)",
    )
    baseline_toll_segments: List[str] = Field(default_factory=list, description="Segmen tol BPJT pada rute baseline")
    blocked_delay_hours: float = Field(default=0.0, ge=0.0, description="Perkiraan delay jika tetap menerobos gangguan (jam)")

    actual_time_hours: Optional[float] = Field(default=None, gt=0.0, description="Waktu tempuh aktual (jam)")
    actual_fuel_liters: Optional[float] = Field(default=None, ge=0.0, description="BBM aktual (L)")
    actual_toll_segments: Optional[List[str]] = Field(default=None, description="Segmen tol BPJT yang benar-benar dilalui")

    rerouted: bool = Field(default=False, description="Apakah rit dieksekusi dengan pengalihan rute")
    disruption_id: Optional[str] = Field(default=None, description="ID insiden/disrupsi yang memicu mitigasi")
    status: TravelStatus = Field(default=TravelStatus.PLANNED, description="Status rit")
    notes: Optional[str] = Field(default=None, description="Catatan operasional")
    inflation_shock_factor: float = Field(default=0.0, ge=0.0, le=1.0, description="Faktor guncangan inflasi BBM (0.0 = harga dasar Pertamina)")

    @field_validator("truck_id")
    @classmethod
    def normalize_truck_id(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("origin_coords", "dest_coords")
    @classmethod
    def validate_coords(cls, v: List[float]) -> List[float]:
        if len(v) != 2:
            raise ValueError("Koordinat harus berupa pasangan [lon, lat]")
        lon, lat = float(v[0]), float(v[1])
        if not (-180.0 <= lon <= 180.0):
            raise ValueError(f"Longitude {lon} di luar rentang [-180, 180]")
        if not (-90.0 <= lat <= 90.0):
            raise ValueError(f"Latitude {lat} di luar rentang [-90, 90]")
        return [lon, lat]

    @model_validator(mode="after")
    def coords_must_differ(self):
        if self.origin_coords == self.dest_coords:
            raise ValueError("Koordinat asal dan tujuan tidak boleh identik")
        return self


class TravelUpdate(BaseModel):
    """Partial update for a travel/rit. Only realised outcomes need to be sent."""
    status: Optional[TravelStatus] = None
    actual_time_hours: Optional[float] = Field(default=None, gt=0.0)
    actual_fuel_liters: Optional[float] = Field(default=None, ge=0.0)
    actual_toll_segments: Optional[List[str]] = None
    baseline_fuel_liters: Optional[float] = Field(default=None, ge=0.0)
    baseline_toll_segments: Optional[List[str]] = None
    blocked_delay_hours: Optional[float] = Field(default=None, ge=0.0)
    rerouted: Optional[bool] = None
    disruption_id: Optional[str] = None
    cargo_value_idr: Optional[float] = Field(default=None, ge=0.0)
    inflation_shock_factor: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    notes: Optional[str] = None
    delivered_at: Optional[str] = None


class TravelResponse(BaseModel):
    id: str
    truck_id: str
    truck_name: Optional[str] = None
    company_id: Optional[str] = None
    driver_name: Optional[str] = None

    origin_name: str
    origin_ref: Optional[str] = None
    origin_coords: List[float]
    destination_name: str
    destination_ref: Optional[str] = None
    dest_coords: List[float]

    commodity_key: str
    cargo_tonnage: float
    cargo_value_idr: float
    cargo_value_source: str
    vehicle_golongan: str
    fuel_type: str
    sla_deadline_hours: float

    baseline_distance_km: float
    distance_source: str
    baseline_time_hours: float
    blocked_delay_hours: float
    baseline_fuel_liters: float
    baseline_toll_segments: List[str]
    actual_toll_segments: List[str]

    baseline_fuel_cost_idr: float
    baseline_toll_cost_idr: float
    baseline_spoilage_idr: float
    baseline_labor_idr: float
    baseline_cost_idr: float

    actual_time_hours: float
    actual_fuel_liters: float
    actual_recorded: bool = False
    actual_fuel_cost_idr: float
    actual_toll_cost_idr: float
    actual_spoilage_idr: float
    actual_labor_idr: float
    actual_cost_idr: float

    saved_time_hours: float
    saved_fuel_liters: float
    saved_cost_idr: float
    saved_fuel_cost_idr: float
    saved_toll_idr: float
    saved_spoilage_idr: float
    saved_labor_idr: float
    efficiency_pct: float

    rerouted: bool
    disruption_id: Optional[str] = None
    status: str
    hedging: Optional[dict] = None
    hedging_policy: Optional[str] = None
    hedging_net_savings_idr: Optional[float] = None
    hedging_solved_at: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    delivered_at: Optional[str] = None


class TravelListResponse(BaseModel):
    status: str = "success"
    total: int
    items: List[TravelResponse]


# ==========================================
# 3. SPOILAGE HEDGING PERSISTENCE PER RIT
# ==========================================

class TravelHedgingRequest(BaseModel):
    """Solve and persist the Continue/Reroute/Hold cost matrix for one rit."""
    p_disruption: float = Field(default=0.85, ge=0.0, le=1.0)
    detour_distance_km: Optional[float] = Field(default=None, ge=0.0, description="Kosong = selisih jarak aktual vs baseline")
    detour_time_hours: Optional[float] = Field(default=None, ge=0.0, description="Kosong = selisih waktu aktual vs baseline")
    hold_wait_hours: float = Field(default=6.0, ge=0.0)
    toll_segments: Optional[List[str]] = Field(default=None, description="Kosong = segmen tol rit")
    downtime_fixed_fee_idr: float = Field(default=500000.0, ge=0.0)
    inflation_shock_factor: float = Field(default=0.0, ge=0.0, le=1.0)


# ==========================================
# 4. ERP SAVINGS SUMMARY
# ==========================================

class ERPSavingsBreakdown(BaseModel):
    """Rupiah savings split — every component is computed from a real cost model."""
    fuel_idr: float = 0.0
    toll_idr: float = 0.0
    spoilage_idr: float = 0.0
    labor_idr: float = 0.0


class ERPTotals(BaseModel):
    total_trips: int = 0
    active_trips: int = 0
    delivered_trips: int = 0
    failed_trips: int = 0
    reroute_success_count: int = 0
    reroute_failed_count: int = 0
    reroute_success_rate_pct: float = 0.0
    sla_compliance_pct: float = 0.0
    time_saved_hours: float = 0.0
    fuel_saved_liters: float = 0.0
    cost_saved_idr: float = 0.0
    baseline_cost_idr: float = 0.0
    actual_cost_idr: float = 0.0
    cost_efficiency_pct: float = 0.0
    avg_cost_saved_per_trip_idr: float = 0.0
    savings_breakdown: ERPSavingsBreakdown = Field(default_factory=ERPSavingsBreakdown)


class ERPCompanySummary(BaseModel):
    company_id: str
    total_trips: int
    delivered_trips: int
    failed_trips: int
    reroute_success_count: int
    reroute_success_rate_pct: float
    time_saved_hours: float
    fuel_saved_liters: float
    cost_saved_idr: float
    cost_efficiency_pct: float


class ERPTripRow(BaseModel):
    id: str
    truck_id: str
    truck_name: Optional[str] = None
    origin_name: str
    destination_name: str
    commodity_key: str
    cargo_tonnage: float
    status: str
    rerouted: bool
    disruption_id: Optional[str] = None
    saved_time_hours: float
    saved_fuel_liters: float
    saved_cost_idr: float
    savings_breakdown: ERPSavingsBreakdown
    efficiency_pct: float
    hedging_policy: Optional[str] = None
    created_at: Optional[str] = None


class ERPSummaryResponse(BaseModel):
    status: str = "success"
    generated_at: str
    company_id: Optional[str] = None
    scope: Literal["DISPATCHER_DETAIL", "REGULATOR_AGGREGATE"] = "DISPATCHER_DETAIL"
    storage: str = "local_sqlite"
    totals: ERPTotals
    per_company: List[ERPCompanySummary] = Field(default_factory=list)
    trips: List[ERPTripRow] = Field(default_factory=list)
    business_notes: List[str] = Field(default_factory=list)
