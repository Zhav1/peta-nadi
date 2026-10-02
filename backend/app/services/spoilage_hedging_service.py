"""
PreHub — Operational Spoilage Hedging & Economic Cost-Benefit Solver.
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
        inflation_shock_factor: float = 0.05
    ) -> HedgingSolveResponse:
        """
        Solves the monetary cost matrix for:
        1. CONTINUE: High risk of disruption, severe spoilage exposure, fixed downtime penalty.
        2. REROUTE: Active mitigation via detour, fuel consumption, BPJT tolls, driver overtime.
        3. HOLD: Staging at safe logistics hub, depot fees, reefer diesel genset cost.
        """
        tier_key, tier_info = self.classify_commodity(req.commodity)
        delta = tier_info["delta"]
        price_per_kg = tier_info["default_price_per_kg"]

        # 1. Base Cargo Valuation (IDR)
        cargo_weight_kg = req.cargo_tonnage * 1000.0
        cargo_value_idr = cargo_weight_kg * price_per_kg

        # 2. Fuel Rate Modulated by Inflation Shock
        base_fuel_rate = PERTAMINA_FUEL_BASE_RATES.get(req.fuel_type.lower(), 6800.0)
        effective_fuel_rate = base_fuel_rate * (1.0 + max(0.0, inflation_shock_factor))
        fuel_consumption_km_per_liter = 3.5 # Standard diesel freight truck consumption

        # 3. Spoilage Value Loss Calculation (Exponential Decay)
        # ValueLoss(t) = CargoValue * (1 - e^(-delta * t))
        delay_hours = max(0.0, req.disruption_delay_hours)
        spoilage_loss_idr = cargo_value_idr * (1.0 - math.exp(-delta * delay_hours))

        # ----------------------------------------------------
        # Policy 1: CONTINUE (Risk Exposure)
        # Cost = P(Disruption) * SpoilageLoss + FixedDowntimeFee
        # ----------------------------------------------------
        p_risk = max(0.0, min(1.0, req.p_disruption))
        continue_spoilage_expected = p_risk * spoilage_loss_idr
        continue_downtime = p_risk * req.downtime_fixed_fee_idr
        cost_continue = continue_spoilage_expected + continue_downtime

        continue_breakdown = PolicyBreakdown(
            policy="CONTINUE",
            cost_idr=round(cost_continue, 0),
            breakdown={
                "expected_spoilage_loss": round(continue_spoilage_expected, 0),
                "downtime_penalty": round(continue_downtime, 0),
                "risk_probability": p_risk
            },
            explanation=(
                f"Melanjutkan rute berisiko tinggi ({int(p_risk*100)}% probabilitas terjebak). "
                f"Potensi kerugian pembusukan komoditas {req.commodity} mencapai "
                f"Rp {int(continue_spoilage_expected):,} akibat waktu tunggu {delay_hours:.1f} jam."
            ),
            risk_level="CRITICAL" if p_risk >= 0.7 else "HIGH"
        )

        # ----------------------------------------------------
        # Policy 2: REROUTE (Active Detour Mitigation)
        # Cost = DetourFuel + BPJTToll + DriverOvertime
        # ----------------------------------------------------
        detour_fuel_liters = req.detour_distance_km / fuel_consumption_km_per_liter
        reroute_fuel_cost = detour_fuel_liters * effective_fuel_rate
        reroute_toll_cost = self.get_bpjt_toll_cost(req.toll_segments, req.vehicle_golongan)
        driver_overtime_hourly_wage = 50000.0 # IDR 50.000 / jam lembur sopir
        reroute_labor_cost = req.detour_time_hours * driver_overtime_hourly_wage

        cost_reroute = reroute_fuel_cost + reroute_toll_cost + reroute_labor_cost

        reroute_breakdown = PolicyBreakdown(
            policy="REROUTE",
            cost_idr=round(cost_reroute, 0),
            breakdown={
                "extra_fuel_cost": round(reroute_fuel_cost, 0),
                "bpjt_toll_tariff": round(reroute_toll_cost, 0),
                "driver_overtime": round(reroute_labor_cost, 0),
                "detour_km": req.detour_distance_km
            },
            explanation=(
                f"Pengalihan rute alternatif sejauh +{req.detour_distance_km:.1f} km (+{req.detour_time_hours:.1f} jam). "
                f"Menghindari zona bencana secara tuntas dengan biaya bahan bakar Rp {int(reroute_fuel_cost):,} "
                f"dan tarif tol BPJT ({req.vehicle_golongan}) Rp {int(reroute_toll_cost):,}."
            ),
            risk_level="LOW"
        )

        # ----------------------------------------------------
        # Policy 3: HOLD (Safe Staging at Logistics Hub)
        # Cost = StagingWaitHours * (DepotFee + ReeferDiesel)
        # ----------------------------------------------------
        hold_hours = max(1.0, req.hold_wait_hours)
        depot_hourly_fee = 35000.0 # IDR 35.000 / jam parkir aman & keamanan depo
        hold_depot_cost = hold_hours * depot_hourly_fee
        hold_reefer_cost = hold_hours * tier_info["genset_cost_per_hour"]
        
        # In hold, small spoilage decay still occurs if non-reefer produce
        hold_spoilage_decay = 0.0
        if not tier_info["requires_reefer"]:
            hold_spoilage_decay = cargo_value_idr * (1.0 - math.exp(-delta * (hold_hours * 0.5)))

        cost_hold = hold_depot_cost + hold_reefer_cost + hold_spoilage_decay

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
                f"Biaya genset cold-chain Rp {int(hold_reefer_cost):,} dan retribusi depo Rp {int(hold_depot_cost):,}."
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
