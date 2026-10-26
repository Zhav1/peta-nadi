"""
PreHub : Operational Spoilage Hedging & Economic Cost-Benefit Solver.
Calculates closed-form monetary trade-offs across 3 tactical mitigation policies (Continue vs Reroute vs Hold),
factoring 4-tier commodity perishability decay, real BPJT toll tariffs, Pertamina fuel rates,
and PIHPS spot cargo valuations.
"""
import math
import logging
from typing import Dict, Any, List, Optional, Tuple
from app.schemas.intermodal import (
    HedgingSolveRequest,
    HedgingSolveResponse,
    PolicyBreakdown
)

logger = logging.getLogger(__name__)

# BPJT Sumatra Toll Segments & Official Tariffs by Golongan (in IDR)
BPJT_SUMATRA_TOLL_SEGMENTS: Dict[str, Dict[str, Any]] = {
    "BAKAUHENI_TERBANGGI": {
        "name": "Tol Bakauheni - Terbanggi Besar",
        "distance_km": 140.9,
        "tariffs": {
            "GOL_I": 118500,
            "GOL_II": 177500,
            "GOL_III": 177500,
            "GOL_IV": 237000,
            "GOL_V": 237000,
        }
    },
    "TERBANGGI_KAYUAGUNG": {
        "name": "Tol Terbanggi Besar - Pematang Panggang - Kayu Agung",
        "distance_km": 189.2,
        "tariffs": {
            "GOL_I": 170500,
            "GOL_II": 255500,
            "GOL_III": 255500,
            "GOL_IV": 341000,
            "GOL_V": 341000,
        }
    },
    "KAYUAGUNG_PALEMBANG": {
        "name": "Tol Kayu Agung - Palembang - Kramasan",
        "distance_km": 42.5,
        "tariffs": {
            "GOL_I": 50000,
            "GOL_II": 75000,
            "GOL_III": 75000,
            "GOL_IV": 100000,
            "GOL_V": 100000,
        }
    },
    "PEKANBARU_DUMAI": {
        "name": "Tol Pekanbaru - Dumai",
        "distance_km": 131.5,
        "tariffs": {
            "GOL_I": 118500,
            "GOL_II": 178500,
            "GOL_III": 178500,
            "GOL_IV": 238000,
            "GOL_V": 238000,
        }
    },
    "MEDAN_TEBINGTINGGI": {
        "name": "Tol Medan - Kualanamu - Tebing Tinggi",
        "distance_km": 61.7,
        "tariffs": {
            "GOL_I": 55500,
            "GOL_II": 85000,
            "GOL_III": 85000,
            "GOL_IV": 113500,
            "GOL_V": 113500,
        }
    },
    "BELMERA": {
        "name": "Tol Belawan - Medan - Tanjung Morawa",
        "distance_km": 34.0,
        "tariffs": {
            "GOL_I": 8500,
            "GOL_II": 13000,
            "GOL_III": 13000,
            "GOL_IV": 17500,
            "GOL_V": 17500,
        }
    },
    "SIGLI_BANDAACEH": {
        "name": "Tol Sigli - Banda Aceh",
        "distance_km": 74.2,
        "tariffs": {
            "GOL_I": 52500,
            "GOL_II": 80000,
            "GOL_III": 80000,
            "GOL_IV": 106000,
            "GOL_V": 106000,
        }
    }
}

# Real Pertamina Base Fuel Benchmark Prices (IDR / liter)
PERTAMINA_FUEL_BASE_RATES: Dict[str, float] = {
    "biosolar": 6800.0,
    "dexlite": 14550.0,
    "pertamina_dex": 15100.0
}

# Shared cost-model constants. Single source of truth for both the hedging solver
# and the travel/rit ledger — never duplicate these literals in routers or UI.
TRUCK_FUEL_CONSUMPTION_KM_PER_LITER = 3.5  # diesel freight truck, km per liter
DRIVER_OVERTIME_HOURLY_IDR = 50000.0       # IDR / hour driver overtime
DEPOT_HOURLY_FEE_IDR = 35000.0             # IDR / hour safe staging + depot security

# Fuel-spec contract (Phase 1/2): per-golongan default efficiency (km/L).
# NULL asset efficiency MUST resolve via this map. The legacy flat 3.5 km/L
# constant above remains the GOL_II default and is DEPRECATED as a universal
# fallback for other golongan.
GOLONGAN_DEFAULT_KMPL: Dict[str, float] = {
    "GOL_I": 4.0,
    "GOL_II": 3.5,
    "GOL_III": 3.0,
    "GOL_IV": 2.8,
    "GOL_V": 2.5,
}
LEGACY_FLAT_KMPL_FALLBACK_DEPRECATED = 3.5

# Default reefer genset burn (liters/hour) when a cold-chain unit is flagged
# as reefer but carries no measured reefer_fuel_lph.
REEFER_DEFAULT_LPH = 2.0

# fuel_source provenance values persisted per travel row.
VALID_FUEL_SOURCES = ("ESDM_SK", "PERTAMINA_FALLBACK", "legacy_3p5", "migrated_golongan")

# 4-Tier Perishability Model Configuration
PERISHABILITY_TIERS: Dict[str, Dict[str, Any]] = {
    "ULTRA_PERISHABLE": {
        "name": "Ultra-Perishable Fresh Produce",
        "commodities": ["cabai_merah", "cabai_rawit", "tomat", "sayur_segar", "sayuran_daun"],
        "delta": 0.025, # decay rate per hour
        "requires_reefer": False,
        "genset_cost_per_hour": 0.0,
        "default_price_per_kg": 55000.0
    },
    "COLD_CHAIN": {
        "name": "Cold-Chain Controlled Meat & Seafood",
        "commodities": ["daging_sapi", "daging_ayam", "ikan_segar", "udang", "susu_segar"],
        "delta": 0.015,
        "requires_reefer": True,
        "genset_cost_per_hour": 45000.0, # IDR 45.000 / hour for diesel genset
        "default_price_per_kg": 125000.0
    },
    "SEMI_PERISHABLE": {
        "name": "Semi-Perishable Tubers & Alliums",
        "commodities": ["bawang_merah", "bawang_putih", "kentang", "ubi_kayu", "wortel"],
        "delta": 0.008,
        "requires_reefer": False,
        "genset_cost_per_hour": 0.0,
        "default_price_per_kg": 35000.0
    },
    "DRY_BULK": {
        "name": "Non-Perishable Dry Bulk & Staples",
        "commodities": ["beras", "minyak_goreng", "gula_pasir", "tepung_terigu", "kedelai"],
        "delta": 0.0005,
        "requires_reefer": False,
        "genset_cost_per_hour": 0.0,
        "default_price_per_kg": 14000.0
    }
}


def get_effective_fuel_rate(fuel_type: str, inflation_shock_factor: float = 0.0) -> float:
    """Pertamina base rate modulated by an explicit inflation shock factor."""
    base_fuel_rate = PERTAMINA_FUEL_BASE_RATES.get((fuel_type or "biosolar").lower(), 6800.0)
    return base_fuel_rate * (1.0 + max(0.0, float(inflation_shock_factor or 0.0)))


def _parse_rate_date(at_date: Any) -> Any:
    """Normalise str/datetime/date/None into a `date` (defaults to today)."""
    from datetime import date as _date, datetime as _dt

    if at_date is None:
        return _date.today()
    if isinstance(at_date, _dt):
        return at_date.date()
    if isinstance(at_date, _date):
        return at_date
    try:
        return _dt.fromisoformat(str(at_date)[:26]).date()
    except Exception:
        try:
            return _dt.strptime(str(at_date)[:10], "%Y-%m-%d").date()
        except Exception:
            return _date.today()


def get_fuel_rate_for_trip(
    fuel_type: str,
    region: Optional[str] = None,
    at_date: Any = None,
) -> Dict[str, Any]:
    """
    Resolve the applicable fuel price for one trip (freeze-at-created_at).

    Lookup order per region candidate:
      1. Supabase `fuel_prices` row with matching fuel_type + region and the
         latest effective_date <= at_date, preferring non-fallback (ESDM_SK)
         rows over PERTAMINA_FALLBACK artifact rows when both apply
         (016 seed FP-BIOSOLAR-NASIONAL carries effective_date=CURRENT_DATE
         which otherwise shadows the SK freeze 2026-10-05).
      2. Fallback to PERTAMINA_FUEL_BASE_RATES with is_fallback=True.

    Region candidates tried in order: [region, "NASIONAL"] (deduped, upper-cased).
    Returns a dict with: rate_idr, fuel_sk_id (row id or None), sk_number,
    effective_date (ISO), region, source (ESDM_SK | PERTAMINA_FALLBACK),
    is_fallback.
    """
    from datetime import date as _date

    fuel = (fuel_type or "biosolar").lower()
    ref_date = _parse_rate_date(at_date)
    base_rate = float(PERTAMINA_FUEL_BASE_RATES.get(fuel, 6800.0))

    def _fallback() -> Dict[str, Any]:
        return {
            "rate_idr": base_rate,
            "fuel_sk_id": None,
            "sk_number": None,
            "effective_date": ref_date.isoformat(),
            "region": (region or "NASIONAL").upper(),
            "source": "PERTAMINA_FALLBACK",
            "is_fallback": True,
        }

    candidates: List[str] = []
    if region:
        candidates.append(str(region).upper())
    if "NASIONAL" not in candidates:
        candidates.append("NASIONAL")

    try:
        from app.db.supabase_client import get_client, get_write_client

        try:
            sb = get_client()
        except RuntimeError:
            sb = get_write_client()
        for cand in candidates:
            resp = (
                sb.table("fuel_prices")
                .select("*")
                .eq("fuel_type", fuel)
                .eq("region", cand)
                .lte("effective_date", ref_date.isoformat())
                .order("effective_date", desc=True)
                .limit(5)
                .execute()
            )
            rows = resp.data or []
            if rows:
                # Prefer the newest non-fallback (ESDM_SK) row: the 016
                # artifact FP-BIOSOLAR-NASIONAL (is_fallback TRUE,
                # effective_date=CURRENT_DATE) otherwise shadows the SK
                # freeze 2026-10-05 despite identical price. Old trips keep
                # working: freeze-at-created_at still keys on at_date, only
                # the tie-break changes.
                sk_rows = [x for x in rows if not x.get("is_fallback")]
                r = sk_rows[0] if sk_rows else rows[0]
                return {
                    "rate_idr": float(r.get("price_idr") or base_rate),
                    "fuel_sk_id": r.get("id"),
                    "sk_number": r.get("sk_number"),
                    "effective_date": str(r.get("effective_date") or ref_date.isoformat()),
                    "region": cand,
                    "source": "PERTAMINA_FALLBACK" if r.get("is_fallback") else "ESDM_SK",
                    "is_fallback": bool(r.get("is_fallback", True)),
                }
    except Exception as exc:
        logger.debug("fuel_prices lookup failed, using Pertamina fallback: %s", exc)
    return _fallback()


def resolve_fuel_efficiency_kmpl(
    truck_efficiency: Optional[float],
    golongan: str,
) -> tuple:
    """
    Resolve per-trip base efficiency (km/L).

    Priority: explicit asset/trip override -> GOLONGAN_DEFAULT_KMPL[golongan]
    -> legacy flat 3.5 (DEPRECATED, only for unknown golongan).
    Returns (eff_base, eff_source) where eff_source is one of
    "asset_override" | "golongan_default" | "legacy_3p5_flat".
    """
    if truck_efficiency is not None and float(truck_efficiency) > 0:
        return float(truck_efficiency), "asset_override"
    g = (golongan or "GOL_II").upper()
    if g in GOLONGAN_DEFAULT_KMPL:
        return float(GOLONGAN_DEFAULT_KMPL[g]), "golongan_default"
    return float(LEGACY_FLAT_KMPL_FALLBACK_DEPRECATED), "legacy_3p5_flat"


def payload_adjusted_kmpl(
    eff_base: float,
    cargo_tonnage: float,
    gross_weight_ton: float,
) -> tuple:
    """
    Payload penalty model (documented formula):

        load_factor = clamp(cargo_tonnage / gross_weight_ton, 0, 1)
        eff_adj     = eff_base * (1 - 0.15 * load_factor)

    A fully-loaded truck (load_factor = 1) burns ~15% more fuel per km than
    empty; the factor is clamped so overload never inverts the efficiency.
    Returns (eff_adj, load_factor).
    """
    try:
        gross = float(gross_weight_ton or 0.0)
        cargo = float(cargo_tonnage or 0.0)
        lf = (cargo / gross) if gross > 0 else 0.0
    except (TypeError, ValueError):
        lf = 0.0
    lf = max(0.0, min(1.0, lf))
    return float(eff_base) * (1.0 - 0.15 * lf), lf


def get_spoilage_loss(cargo_value_idr: float, delta_per_hour: float, delay_hours: float) -> float:
    """Exponential spoilage decay: CargoValue * (1 - e^(-delta * t))."""
    delay = max(0.0, float(delay_hours or 0.0))
    return float(cargo_value_idr) * (1.0 - math.exp(-float(delta_per_hour) * delay))


class SpoilageHedgingService:
    """Calculates operational economic exposure and optimal policy recommendation."""

    @staticmethod
    def classify_commodity(commodity_name: str) -> Tuple[str, Dict[str, Any]]:
        """Maps commodity name to its perishability tier configuration."""
        name_clean = commodity_name.lower().replace(" ", "_").replace("-", "_")
        for tier_key, tier_data in PERISHABILITY_TIERS.items():
            if any(c in name_clean for c in tier_data["commodities"]):
                return tier_key, tier_data
        
        # Fallback heuristic
        if "ikan" in name_clean or "daging" in name_clean or "ayam" in name_clean or "frozen" in name_clean:
            return "COLD_CHAIN", PERISHABILITY_TIERS["COLD_CHAIN"]
        elif "cabai" in name_clean or "tomat" in name_clean or "sayur" in name_clean:
            return "ULTRA_PERISHABLE", PERISHABILITY_TIERS["ULTRA_PERISHABLE"]
        elif "bawang" in name_clean or "kentang" in name_clean:
            return "SEMI_PERISHABLE", PERISHABILITY_TIERS["SEMI_PERISHABLE"]
        else:
            return "DRY_BULK", PERISHABILITY_TIERS["DRY_BULK"]

    @staticmethod
    def get_bpjt_toll_cost(segments: Optional[List[str]], golongan: str) -> float:
        """Sums official toll tariffs across specified BPJT Sumatra segments for vehicle class."""
        if not segments:
            return 0.0

        total_toll = 0.0
        for seg_id in segments:
            seg = BPJT_SUMATRA_TOLL_SEGMENTS.get(seg_id.upper())
            if seg:
                tariffs = seg["tariffs"]
                tariff = tariffs.get(golongan.upper(), tariffs.get("GOL_II", 85000))
                total_toll += float(tariff)
        return total_toll

    def solve_hedging_matrix(
        self, 
        req: HedgingSolveRequest, 
        inflation_shock_factor: float = 0.05,
        fuel_efficiency_kmpl: Optional[float] = None,
        reefer_lph: Optional[float] = None,
        cargo_tonnage: Optional[float] = None,
        gross_weight_ton: Optional[float] = None,
        is_reefer: Optional[bool] = None,
        fuel_rate_override: Optional[float] = None,
    ) -> HedgingSolveResponse:
        """
        Solves the monetary cost matrix for:
        1. CONTINUE: High risk of disruption, severe spoilage exposure, fixed downtime penalty.
        2. REROUTE: Active mitigation via detour, fuel consumption, BPJT tolls, driver overtime.
        3. HOLD: Staging at safe logistics hub, depot fees, reefer diesel genset cost.

        Fuel-spec contract (Phase 2): detour fuel uses an explicit per-trip
        efficiency - fuel_efficiency_kmpl (asset override) resolved against
        GOLONGAN_DEFAULT_KMPL[req.vehicle_golongan], with the payload penalty
        eff_adj = eff * (1 - 0.15 * load_factor) applied when cargo/gross
        weights are supplied. The legacy global 3.5 km/L inversion is only a
        last resort for unknown golongan. When reefer_lph is supplied for a
        reefer cold-chain move, detour/hold reefer burn is priced from fuel
        volume (lph * hours * fuel rate); otherwise the legacy Rp/hour genset
        tariff is kept for backward compatibility.
        """
        tier_key, tier_info = self.classify_commodity(req.commodity)
        delta = tier_info["delta"]
        price_per_kg = tier_info["default_price_per_kg"]

        # 1. Base Cargo Valuation (IDR)
        cargo_weight_kg = req.cargo_tonnage * 1000.0
        cargo_value_idr = cargo_weight_kg * price_per_kg

        # 2. Fuel Rate Modulated by Inflation Shock (frozen override wins)
        if fuel_rate_override is not None and float(fuel_rate_override) > 0:
            effective_fuel_rate = float(fuel_rate_override)
        else:
            effective_fuel_rate = get_effective_fuel_rate(req.fuel_type, inflation_shock_factor)

        # 2b. Per-trip efficiency (no more global 3.5 inversion)
        _eff_base, _eff_source = resolve_fuel_efficiency_kmpl(
            fuel_efficiency_kmpl, req.vehicle_golongan
        )
        _cargo_for_lf = cargo_tonnage if cargo_tonnage is not None else req.cargo_tonnage
        _gross_for_lf = gross_weight_ton if gross_weight_ton is not None else 0.0
        if _gross_for_lf and float(_gross_for_lf) > 0:
            fuel_consumption_km_per_liter, _load_factor = payload_adjusted_kmpl(
                _eff_base, _cargo_for_lf, _gross_for_lf
            )
        else:
            fuel_consumption_km_per_liter, _load_factor = float(_eff_base), 0.0

        # 2c. Reefer burn mode: fuel-volume pricing when a measured lph is
        # supplied for a reefer cold-chain move, else legacy Rp/hour tariff.
        _reefer_is_reefer_move = bool(is_reefer) if is_reefer is not None else True
        _use_reefer_lph = (
            tier_info.get("requires_reefer")
            and _reefer_is_reefer_move
            and reefer_lph is not None
            and float(reefer_lph) > 0
        )
        _reefer_lph_val = float(reefer_lph) if _use_reefer_lph else 0.0

        # 3. Spoilage Value Loss Calculation (Exponential Decay)
        # ValueLoss(t) = CargoValue * (1 - e^(-delta * t))
        delay_hours = max(0.0, req.disruption_delay_hours)
        spoilage_loss_idr = get_spoilage_loss(cargo_value_idr, delta, delay_hours)

        # ----------------------------------------------------
        # Policy 1: CONTINUE (Risk Exposure)
        # Cost = P(Disruption) * SpoilageLoss + FixedDowntimeFee + ReeferGenset (if cold-chain)
        # ----------------------------------------------------
        p_risk = max(0.0, min(1.0, req.p_disruption))
        continue_spoilage_expected = p_risk * spoilage_loss_idr
        continue_downtime = p_risk * req.downtime_fixed_fee_idr
        if tier_info.get("requires_reefer"):
            if _use_reefer_lph:
                continue_reefer_cost = delay_hours * _reefer_lph_val * effective_fuel_rate
            else:
                continue_reefer_cost = delay_hours * tier_info["genset_cost_per_hour"]
        else:
            continue_reefer_cost = 0.0
        cost_continue = continue_spoilage_expected + continue_downtime + continue_reefer_cost

        continue_reefer_expl = f" dan biaya genset pendingin Rp {int(continue_reefer_cost):,}" if continue_reefer_cost > 0 else ""
        continue_breakdown = PolicyBreakdown(
            policy="CONTINUE",
            cost_idr=round(cost_continue, 0),
            breakdown={
                "expected_spoilage_loss": round(continue_spoilage_expected, 0),
                "downtime_penalty": round(continue_downtime, 0),
                "reefer_genset_fuel": round(continue_reefer_cost, 0),
                "risk_probability": p_risk
            },
            explanation=(
                f"Melanjutkan rute berisiko tinggi ({int(p_risk*100)}% probabilitas terjebak). "
                f"Potensi kerugian pembusukan komoditas {req.commodity} mencapai "
                f"Rp {int(continue_spoilage_expected):,}{continue_reefer_expl} akibat waktu tunggu {delay_hours:.1f} jam."
            ),
            risk_level="CRITICAL" if p_risk >= 0.7 else "HIGH"
        )

        # ----------------------------------------------------
        # Policy 2: REROUTE (Active Detour Mitigation)
        # Cost = DetourFuel + BPJTToll + DriverOvertime + ReeferGenset (if cold-chain)
        # ----------------------------------------------------
        detour_fuel_liters = req.detour_distance_km / fuel_consumption_km_per_liter
        reroute_fuel_cost = detour_fuel_liters * effective_fuel_rate
        reroute_toll_cost = self.get_bpjt_toll_cost(req.toll_segments, req.vehicle_golongan)
        driver_overtime_hourly_wage = DRIVER_OVERTIME_HOURLY_IDR
        reroute_labor_cost = req.detour_time_hours * driver_overtime_hourly_wage
        if tier_info.get("requires_reefer"):
            if _use_reefer_lph:
                reroute_reefer_cost = req.detour_time_hours * _reefer_lph_val * effective_fuel_rate
            else:
                reroute_reefer_cost = req.detour_time_hours * tier_info["genset_cost_per_hour"]
        else:
            reroute_reefer_cost = 0.0

        cost_reroute = reroute_fuel_cost + reroute_toll_cost + reroute_labor_cost + reroute_reefer_cost

        reroute_reefer_expl = f", biaya genset pendingin Rp {int(reroute_reefer_cost):,}" if reroute_reefer_cost > 0 else ""
        reroute_breakdown = PolicyBreakdown(
            policy="REROUTE",
            cost_idr=round(cost_reroute, 0),
            breakdown={
                "extra_fuel_cost": round(reroute_fuel_cost, 0),
                "bpjt_toll_tariff": round(reroute_toll_cost, 0),
                "driver_overtime": round(reroute_labor_cost, 0),
                "reefer_genset_fuel": round(reroute_reefer_cost, 0),
                "detour_km": req.detour_distance_km,
                "fuel_kmpl_used": round(fuel_consumption_km_per_liter, 3),
                "fuel_rate_idr": round(effective_fuel_rate, 0),
            },
            explanation=(
                f"Pengalihan rute alternatif sejauh +{req.detour_distance_km:.1f} km (+{req.detour_time_hours:.1f} jam). "
                f"Menghindari zona bencana secara tuntas dengan biaya bahan bakar Rp {int(reroute_fuel_cost):,}"
                f"{reroute_reefer_expl} dan tarif tol BPJT ({req.vehicle_golongan}) Rp {int(reroute_toll_cost):,}."
            ),
            risk_level="LOW"
        )

        # ----------------------------------------------------
        # Policy 3: HOLD (Safe Staging at Logistics Hub)
        # Cost = StagingWaitHours * (DepotFee + ReeferDiesel)
        # ----------------------------------------------------
        hold_hours = max(1.0, req.hold_wait_hours)
        depot_hourly_fee = DEPOT_HOURLY_FEE_IDR
        hold_depot_cost = hold_hours * depot_hourly_fee
        if tier_info.get("requires_reefer") and _use_reefer_lph:
            hold_reefer_cost = hold_hours * _reefer_lph_val * effective_fuel_rate
        else:
            hold_reefer_cost = hold_hours * tier_info["genset_cost_per_hour"]
        
        # In hold, small spoilage decay still occurs if non-reefer produce
        hold_spoilage_decay = 0.0
        if not tier_info["requires_reefer"]:
            hold_spoilage_decay = get_spoilage_loss(cargo_value_idr, delta, hold_hours * 0.5)

        cost_hold = hold_depot_cost + hold_reefer_cost + hold_spoilage_decay

        hold_reefer_expl = f"Biaya genset cold-chain Rp {int(hold_reefer_cost):,} dan " if hold_reefer_cost > 0 else ""
        hold_decay_expl = f" (potensi susut Rp {int(hold_spoilage_decay):,})" if hold_spoilage_decay > 0 else ""
        hold_breakdown = PolicyBreakdown(
            policy="HOLD",
            cost_idr=round(cost_hold, 0),
            breakdown={
                "depot_parking_fee": round(hold_depot_cost, 0),
                "reefer_genset_fuel": round(hold_reefer_cost, 0),
                "staging_decay_loss": round(hold_spoilage_decay, 0),
                "wait_hours": hold_hours
            },
            explanation=(
                f"Penahanan sementara armada di depo/hub logistik terdekat selama {hold_hours:.1f} jam. "
                f"{hold_reefer_expl}retribusi depo Rp {int(hold_depot_cost):,}{hold_decay_expl}."
            ),
            risk_level="MEDIUM"
        )

        # ----------------------------------------------------
        # Optimal Recommendation Selection
        # ----------------------------------------------------
        costs = {
            "CONTINUE": cost_continue,
            "REROUTE": cost_reroute,
            "HOLD": cost_hold
        }
        optimal_policy = min(costs, key=costs.get)
        net_savings_idr = max(0.0, cost_continue - costs[optimal_policy])

        reason_templates = {
            "REROUTE": (
                f"Rekomendasi Kebijakan: REROUTE (Pengalihan Rute). "
                f"Hemat biaya Rp {int(net_savings_idr):,} dibanding menerobos bahaya. "
                f"Menjaga keutuhan muatan komoditas {tier_info['name']} dari pembusukan total."
            ),
            "HOLD": (
                f"Rekomendasi Kebijakan: HOLD (Penahanan Sementara di Hub). "
                f"Hemat biaya Rp {int(net_savings_idr):,} dibanding rute memutar yang terlalu jauh. "
                f"Kondisi muatan terlindungi oleh fasilitas depo / genset pendingin."
            ),
            "CONTINUE": (
                f"Rekomendasi Kebijakan: CONTINUE (Lanjutkan Perjalanan). "
                f"Komoditas berjenis {tier_info['name']} memiliki daya tahan tinggi; "
                f"biaya pengalihan rute atau penahanan melebihi toleransi risiko gangguan saat ini."
            )
        }

        return HedgingSolveResponse(
            vehicle_id=req.vehicle_id,
            commodity=req.commodity,
            perishability_tier=tier_info["name"],
            decay_rate_per_hour=delta,
            cargo_value_idr=round(cargo_value_idr, 0),
            spoilage_loss_idr=round(spoilage_loss_idr, 0),
            continue_policy=continue_breakdown,
            reroute_policy=reroute_breakdown,
            hold_policy=hold_breakdown,
            optimal_policy=optimal_policy,
            net_savings_idr=round(net_savings_idr, 0),
            recommendation_reason=reason_templates[optimal_policy]
        )


# Global singleton instance
spoilage_hedging_service = SpoilageHedgingService()
