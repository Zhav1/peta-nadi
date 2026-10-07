"""
PreHub — Disruption Impact Assessment Service.
Evaluates spatial corridor intersections between physical hazard disruptions (BMKG, OSINT, Simulation)
and active fleet shipments. Deterministically triggers Spoilage Hedging, Regulatory Compliance,
and CPU Detour Pathfinding to generate explainable dispatcher recommendations and WhatsApp dispatch triggers.
"""
import math
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

from app.schemas.impact_schemas import (
    DisruptionImpactRequest,
    ImpactedVehicleAssessment,
    DisruptionImpactResponse
)
from app.schemas.intermodal import HedgingSolveRequest
from app.services.telemetry_service import telemetry_service
from app.services.spoilage_hedging_service import spoilage_hedging_service
from app.services.compliance_service import compliance_service
from app.adapters.cpu_routing_adapter import get_cpu_router
from app.db import local_storage

logger = logging.getLogger(__name__)


def haversine_distance_km(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
    """Haversine distance in km between two [lon, lat] coordinates."""
    lon1, lat1 = coord1
    lon2, lat2 = coord2
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def min_distance_to_segment_km(point: Tuple[float, float], a: Tuple[float, float], b: Tuple[float, float]) -> float:
    """Calculates perpendicular or vertex distance from point [lon, lat] to segment a->b."""
    px, py = point
    ax, ay = a
    bx, by = b

    dx = bx - ax
    dy = by - ay
    if dx == 0 and dy == 0:
        return haversine_distance_km(point, a)

    # Project point onto line segment
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    proj_point = (ax + t * dx, ay + t * dy)
    return haversine_distance_km(point, proj_point)


def min_distance_to_path_km(hazard_point: Tuple[float, float], path: List[List[float]]) -> float:
    """Calculates minimum distance from hazard point [lon, lat] to a multi-point polyline."""
    if not path or len(path) == 0:
        return 9999.0
    if len(path) == 1:
        return haversine_distance_km(hazard_point, (path[0][0], path[0][1]))

    min_dist = 9999.0
    for i in range(len(path) - 1):
        seg_dist = min_distance_to_segment_km(
            hazard_point,
            (path[i][0], path[i][1]),
            (path[i+1][0], path[i+1][1])
        )
        if seg_dist < min_dist:
            min_dist = seg_dist
    return min_dist


class ImpactAssessmentService:
    """Core service for event-driven fleet disruption impact evaluation."""

    def __init__(self):
        self.router = get_cpu_router()

    async def assess_disruption_impact(self, req: DisruptionImpactRequest) -> DisruptionImpactResponse:
        """
        Scans all active fleet vehicles against the disruption location,
        identifies affected shipments, and executes deterministic business logic.
        """
        hazard_center = (req.lon, req.lat)
        danger_threshold_km = req.radius_km + 2.0  # 2 km safety buffer

        # Gather active fleet vehicles (both simulation cache and custom onboarded)
        all_vehicles = await telemetry_service.get_all_vehicles()
        total_scanned = len(all_vehicles)

        impacted_items: List[ImpactedVehicleAssessment] = []
        critical_count = 0
        warning_count = 0

        for veh in all_vehicles:
            # Check proximity of current position or forward trajectory
            path = veh.get("path", []) if isinstance(veh, dict) else (getattr(veh, "path", None) or [])
            dist_km = min_distance_to_path_km(hazard_center, path)

            if dist_km <= danger_threshold_km:
                # Vehicle is impacted by this hazard!
                assessment = self._evaluate_single_vehicle(veh, req, dist_km)
                impacted_items.append(assessment)
                if assessment.optimal_policy == "REROUTE" or assessment.late_arrival_risk_pct >= 70.0:
                    critical_count += 1
                else:
                    warning_count += 1

        # Sort impacted vehicles: highest late-arrival risk and spoilage loss first
        impacted_items.sort(
            key=lambda x: (x.late_arrival_risk_pct, x.spoilage_loss_idr),
            reverse=True
        )

        response_payload = DisruptionImpactResponse(
            disruption={
                "incident_id": req.incident_id or f"INC-{req.hazard_type.upper()}-{int(req.lat*100)}",
                "title": req.title or f"Disrupsi {req.hazard_type.title()} Koridor",
                "hazard_type": req.hazard_type,
                "severity": req.severity,
                "latitude": req.lat,
                "longitude": req.lon,
                "radius_km": req.radius_km
            },
            total_fleet_scanned=total_scanned,
            impacted_vehicles_count=len(impacted_items),
            critical_count=critical_count,
            warning_count=warning_count,
            impacted_vehicles=impacted_items,
            evaluated_at=datetime.now().isoformat()
        )

        # Mirror assessment in local SQLite and attempt Supabase cloud persist
        local_payload = {
            "incident_id": response_payload.disruption["incident_id"],
            "hazard_type": req.hazard_type,
            "latitude": req.lat,
            "longitude": req.lon,
            "radius_km": req.radius_km,
            "severity": req.severity,
            "total_fleet_scanned": total_scanned,
            "impacted_vehicles_count": len(impacted_items),
            "impacted_vehicles": [item.model_dump() for item in impacted_items],
            "evaluated_at": response_payload.evaluated_at
        }

        try:
            local_storage.save_impact_assessment(local_payload)
        except Exception as e:
            logger.warning(f"Could not persist impact assessment locally: {e}")

        try:
            from app.db.supabase_client import get_client
            sb = get_client()
            sb.table("incident_impact_assessments").insert(local_payload).execute()
        except Exception as se:
            logger.debug(f"Supabase impact assessment sync note (offline or missing creds): {se}")

        return response_payload

    def _evaluate_single_vehicle(
        self,
        veh: Any,
        disruption: DisruptionImpactRequest,
        distance_km: float
    ) -> ImpactedVehicleAssessment:
        """Runs the deterministic business logic pipeline for a single impacted vehicle."""
        if isinstance(veh, dict):
            v_dict = veh
        elif hasattr(veh, "model_dump"):
            v_dict = veh.model_dump()
        else:
            v_dict = getattr(veh, "__dict__", {})

        # Shipment attributes with fallback heuristics
        commodity = v_dict.get("cargo") or "Komoditas Logistik Pangan"
        commodity_key = v_dict.get("commodity_key") or self._infer_commodity_key(commodity)
        cargo_tonnage = float(v_dict.get("cargo_tonnage") or 10.0)
        vehicle_golongan = v_dict.get("vehicle_golongan") or "GOL_II"
        gross_weight = float(v_dict.get("gross_weight_ton") or (cargo_tonnage + 4.0))
        sla_hours = float(v_dict.get("sla_deadline_hours") or 8.0)
        origin = v_dict.get("origin") or "Pelabuhan Belawan"
        destination = v_dict.get("destination") or "Pekanbaru Hub"
        driver_phone = v_dict.get("driver_phone") or "6281234567891"
        driver_name = v_dict.get("driver_name") or "Pengemudi Armada"

        # Delay estimation based on hazard type and severity
        delay_hours = self._estimate_hazard_delay_hours(disruption.hazard_type, disruption.severity)

        # Baseline cargo value
        cargo_value_idr = float(v_dict.get("cargo_value_idr") or self._estimate_cargo_value(commodity_key, cargo_tonnage))

        # Solve Spoilage Hedging
        hedging_req = HedgingSolveRequest(
            vehicle_id=v_dict.get("vehicle_id", "UNKNOWN"),
            commodity=commodity_key,
            cargo_tonnage=cargo_tonnage,
            origin=origin,
            destination=destination,
            vehicle_golongan=vehicle_golongan,
            fuel_type="biosolar",
            p_disruption=0.88,
            disruption_delay_hours=delay_hours,
            detour_distance_km=85.0,
            detour_time_hours=2.5,
            toll_segments=["MEDAN_TEBINGTINGGI"],
            hold_wait_hours=6.0
        )
        hedging_res = spoilage_hedging_service.solve_hedging_matrix(hedging_req)

        # Calculate SLA Late-Arrival Probability
        baseline_travel_time = 4.0
        buffer_remaining = sla_hours - (baseline_travel_time + delay_hours)
        if buffer_remaining < 0:
            late_risk_pct = min(96.0, 70.0 + abs(buffer_remaining) * 5.0)
        else:
            late_risk_pct = max(10.0, 45.0 - buffer_remaining * 8.0)

        # Compliance Check (MST Axle Load & BKHIT)
        compliance_status = "PASSED"
        if gross_weight > 8.0 and any(m in destination.lower() or m in origin.lower() for m in ["solok", "malalak", "sitinjau"]):
            compliance_status = "WARNING"
        if v_dict.get("has_bkhit_cert") is False and ("jawa" in destination.lower() or "bakauheni" in destination.lower()):
            compliance_status = "HARD_BLOCK"

        # CPU Detour Pathfinding
        hazard_zones = [{"center": [disruption.lon, disruption.lat], "radiusKm": disruption.radius_km}]
        route_detour = None
        try:
            orig_id = self._normalize_hub_id(origin)
            dest_id = self._normalize_hub_id(destination)
            cpu_res = self.router.solve_shortest_path(
                origin_id=orig_id,
                dest_id=dest_id,
                hazard_zones=hazard_zones,
                k_alternatives=1
            )
            if cpu_res.get("status") == "success" and len(cpu_res.get("routes", [])) > 0:
                route_detour = cpu_res["routes"][0]
        except Exception as e:
            logger.debug(f"Detour route solve fallback: {e}")

        # Explainable Rationale
        rationale = (
            f"Ancaman {disruption.hazard_type.upper()} terdeteksi {distance_km:.1f} km dari rute {v_dict.get('vehicle_id')}. "
            f"Keterlambatan koridor +{delay_hours:.1f} jam memicu risiko keterlambatan SLA {late_risk_pct:.0f}%. "
            f"Rekomendasi taktis: {hedging_res.optimal_policy}. Biaya pengalihan Rp {hedging_res.reroute_policy.cost_idr:,.0f} "
            f"menyelamatkan potensi kerugian pembusukan Rp {hedging_res.spoilage_loss_idr:,.0f} dengan penghematan bersih Rp {hedging_res.net_savings_idr:,.0f}."
        )

        # Official WhatsApp Dispatch Text
        detour_name = route_detour.get("route_name", "Jalur Bebas Hambatan MKTT") if route_detour else "Jalur Alternatif Tol"
        whatsapp_text = (
            f"PREHUB DISPATCH: Kendaraan {v_dict.get('vehicle_id')} muatan {commodity} "
            f"dialihkan via {detour_name} karena bahaya {disruption.hazard_type} di depan. "
            f"Tindakan Disetujui: {hedging_res.optimal_policy}. Harap segera konfirmasi penerimaan instruksi."
        )

        return ImpactedVehicleAssessment(
            vehicle_id=v_dict.get("vehicle_id", "UNKNOWN"),
            vehicle_name=v_dict.get("name") or v_dict.get("vehicle_id", "Truk"),
            modality=v_dict.get("modality", "truck"),
            driver_name=driver_name,
            driver_phone=driver_phone,
            commodity=commodity,
            commodity_key=commodity_key,
            cargo_tonnage=cargo_tonnage,
            cargo_value_idr=cargo_value_idr,
            vehicle_golongan=vehicle_golongan,
            origin=origin,
            destination=destination,
            distance_to_hazard_km=round(distance_km, 1),
            estimated_delay_hours=round(delay_hours, 1),
            sla_deadline_hours=sla_hours,
            late_arrival_risk_pct=round(late_risk_pct, 1),
            optimal_policy=hedging_res.optimal_policy,
            net_savings_idr=round(hedging_res.net_savings_idr, 2),
            spoilage_loss_idr=round(hedging_res.spoilage_loss_idr, 2),
            detour_cost_idr=round(hedging_res.reroute_policy.cost_idr, 2),
            compliance_status=compliance_status,
            recommendation_rationale=rationale,
            whatsapp_dispatch_text=whatsapp_text,
            detour_route=route_detour
        )

    def _estimate_hazard_delay_hours(self, hazard_type: str, severity: str) -> float:
        base = {
            "flood": 14.0,
            "landslide": 10.0,
            "earthquake": 18.0,
            "congestion": 3.0,
            "wildfire": 6.0
        }.get(hazard_type.lower(), 8.0)

        multiplier = {
            "critical": 1.2,
            "high": 1.0,
            "medium": 0.7,
            "low": 0.4
        }.get(severity.lower(), 1.0)

        return base * multiplier

    def _infer_commodity_key(self, cargo_text: str) -> str:
        c = cargo_text.lower()
        if "cabai" in c or "chili" in c:
            return "cabai_merah"
        elif "daging" in c or "beef" in c:
            return "daging_sapi"
        elif "bawang" in c:
            return "bawang_merah"
        elif "beras" in c or "rice" in c:
            return "beras"
        elif "sawit" in c or "cpo" in c or "minyak" in c:
            return "minyak_goreng"
        elif "sayur" in c or "kol" in c or "kentang" in c:
            return "sayur_segar"
        return "beras"

    def _estimate_cargo_value(self, commodity_key: str, tonnage: float) -> float:
        rate_per_kg = {
            "cabai_merah": 55000.0,
            "daging_sapi": 135000.0,
            "bawang_merah": 35000.0,
            "beras": 15000.0,
            "minyak_goreng": 16000.0,
            "sayur_segar": 12000.0
        }.get(commodity_key, 20000.0)
        return tonnage * 1000.0 * rate_per_kg

    def _normalize_hub_id(self, hub_name: str) -> str:
        h = hub_name.lower()
        if "belawan" in h:
            return "belawan_port"
        elif "tebing" in h:
            return "tebing_tinggi"
        elif "pekanbaru" in h:
            return "pekanbaru_hub"
        elif "medan" in h:
            return "medan_hub"
        elif "dumai" in h:
            return "dumai_port"
        elif "padang" in h:
            return "padang_hub"
        elif "bakauheni" in h:
            return "bakauheni_port"
        elif "palembang" in h:
            return "palembang_hub"
        return "medan_hub"


impact_assessment_service = ImpactAssessmentService()
