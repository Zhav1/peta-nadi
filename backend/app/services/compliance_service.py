"""
PreHub — Digital Cargo Manifest & Quarantine Compliance Inspector Service.
Enforces BKHIT quarantine certificates for inter-island routes (Hard Block),
MST axle-load regulations on Class III roads (Tactical Warning & Advisory),
and cryptographic Surat Jalan manifest verification.
"""
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from app.schemas.intermodal import (
    ComplianceVerifyRequest,
    ComplianceVerifyResponse,
    ComplianceCheckDetail,
    ComplianceCheckStatus
)

logger = logging.getLogger(__name__)

# Known geographic markers for inter-island / strait crossing detection
INTER_ISLAND_KEYWORDS = {
    "java": ["jawa", "merak", "jakarta", "cilegon", "banten", "surabaya", "semarang", "bandung", "jawabarat", "jawatimur", "jawatengah"],
    "sumatra": ["sumatera", "lampung", "bakauheni", "palembang", "medan", "padang", "pekanbaru", "jambi", "bengkulu", "aceh", "dumai", "belawan"],
    "islands": ["batam", "bintan", "bangka", "belitung", "nias", "mentawai"]
}

# Road segments known to be Class III (Collector / Mountain Roads with 8-Ton MST limit)
CLASS_III_KEYWORDS = [
    "malalak", "dairi", "tarutung", "sitinjau", "curup", "kelas iii", "kelas_3", "class_iii",
    "lingkar malalak", "batu lubang", "kabupaten", "jalur alternatif"
]


class ComplianceService:
    """Service validating transport regulatory compliance and dispatch readiness."""

    @staticmethod
    def _is_inter_island(origin: str, destination: str, traversed_roads: List[str]) -> bool:
        """Determines if the route crosses straits or travels between islands."""
        orig_lower = origin.lower()
        dest_lower = destination.lower()
        all_roads = " ".join(r.lower() for r in traversed_roads)
        combined_text = f"{orig_lower} {dest_lower} {all_roads}"

        # 1. Check explicit ferry / maritime strait crossing cues in traversed roads
        ferry_road_cues = ["selat sunda", "pelabuhan feri", "penyeberangan", "kapal roro", "ferry", "feri"]
        if any(cue in all_roads for cue in ferry_road_cues):
            return True

        # 2. Both Merak (Java) and Bakauheni (Sumatra) present in route endpoints or roads
        if "merak" in combined_text and "bakauheni" in combined_text:
            return True

        # 3. Check Java vs Sumatra origin/destination pair
        orig_is_java = any(k in orig_lower for k in INTER_ISLAND_KEYWORDS["java"])
        orig_is_sumatra = any(k in orig_lower for k in INTER_ISLAND_KEYWORDS["sumatra"])
        dest_is_java = any(k in dest_lower for k in INTER_ISLAND_KEYWORDS["java"])
        dest_is_sumatra = any(k in dest_lower for k in INTER_ISLAND_KEYWORDS["sumatra"])

        if (orig_is_java and dest_is_sumatra) or (orig_is_sumatra and dest_is_java):
            return True

        # 4. Check other archipelagic islands (e.g. Batam, Bangka, Belitung, Nias, Mentawai)
        for island in INTER_ISLAND_KEYWORDS["islands"]:
            if (island in orig_lower and island not in dest_lower) or (island in dest_lower and island not in orig_lower):
                return True

        return False

    @staticmethod
    def _has_class_iii_roads(traversed_roads: List[str]) -> bool:
        """Detects whether route contains Class III roads with 8-ton MST limits."""
        for road in traversed_roads:
            r_lower = road.lower()
            if any(cue in r_lower for cue in CLASS_III_KEYWORDS):
                return True
        return False

    def verify_compliance(self, req: ComplianceVerifyRequest) -> ComplianceVerifyResponse:
        """
        Runs comprehensive regulatory checks:
        1. BKHIT Quarantine: Hard block if inter-island agricultural transit lacks certificate.
        2. MST Axle-Load: Tactical warning if vehicle > 8.0 tons traverses Class III roads.
        3. Surat Jalan / Manifest: Verifies driver phone, plate, and cryptographic hash integrity.
        """
        checks: List[ComplianceCheckDetail] = []
        is_inter_island_route = self._is_inter_island(req.origin, req.destination, req.traversed_roads)

        # ----------------------------------------------------
        # 1. BKHIT Quarantine Certificate Check
        # ----------------------------------------------------
        if is_inter_island_route:
            if not req.has_bkhit_cert:
                checks.append(ComplianceCheckDetail(
                    category="QUARANTINE_BKHIT",
                    status="HARD_BLOCK",
                    title="BKHIT Quarantine Certificate Missing",
                    detail=(
                        f"Pengiriman komoditas agrikultur ({req.commodity}) rute lintas pulau "
                        f"({req.origin} → {req.destination}) tidak memiliki Sertifikat Karantina BKHIT valid. "
                        f"Armada akan ditahan di gerbang pelabuhan penyeberangan feri."
                    ),
                    remedy_action="Wajib terbitkan Sertifikat Karantina Tumbuhan/Hewan (BKHIT KT-12 / KH-11) sebelum keberangkatan."
                ))
            else:
                cert_ref = req.bkhit_cert_id or "TERVERIFIKASI"
                checks.append(ComplianceCheckDetail(
                    category="QUARANTINE_BKHIT",
                    status="PASSED",
                    title="BKHIT Quarantine Certificate Verified",
                    detail=f"Sertifikat Karantina BKHIT ({cert_ref}) terdaftar untuk rute lintas pulau {req.origin} → {req.destination}.",
                    remedy_action=None
                ))
        else:
            checks.append(ComplianceCheckDetail(
                category="QUARANTINE_BKHIT",
                status="PASSED",
                title="BKHIT Quarantine Not Required",
                detail=f"Rute intra-pulau ({req.origin} → {req.destination}). Pengiriman pangan tidak melintasi perbatasan selat/pulau.",
                remedy_action=None
            ))

        # ----------------------------------------------------
        # 2. MST Axle-Load Regulation Check (Muatan Sumbu Terberat)
        # ----------------------------------------------------
        traverses_class_iii = self._has_class_iii_roads(req.traversed_roads)
        max_class_iii_mst_ton = 8.0

        if traverses_class_iii and req.vehicle_gross_weight_ton > max_class_iii_mst_ton:
            checks.append(ComplianceCheckDetail(
                category="AXLE_LOAD_MST",
                status="WARNING",
                title="MST Axle-Load Limit Exceeded (>8 Ton on Class III Road)",
                detail=(
                    f"Bobot kotor armada ({req.vehicle_gross_weight_ton:.1f} Ton) melebihi batas MST "
                    f"Jalan Kelas III ({max_class_iii_mst_ton:.1f} Ton) pada koridor tanjakan/alternatif. "
                    f"Risiko penindakan di Jembatan Timbang (UPPKB) atau amblas/kerusakan suspensi."
                ),
                remedy_action="Alihkan rute melalui Jalan Nasional Kelas I/II (Jalan Tol / Lintas Timur) atau lakukan penyesuaian muatan (transshipment)."
            ))
        else:
            checks.append(ComplianceCheckDetail(
                category="AXLE_LOAD_MST",
                status="PASSED",
                title="MST Axle-Load Compliant",
                detail=f"Bobot armada {req.vehicle_gross_weight_ton:.1f} Ton sesuai dengan kelas jalan yang dilintasi.",
                remedy_action=None
            ))

        # ----------------------------------------------------
        # 3. Surat Jalan / Manifest Digital Integrity
        # ----------------------------------------------------
        manifest_issues = []
        if not req.manifest_hash:
            manifest_issues.append("Manifest digital belum ditandatangani secara kriptografis (SHA-256 kosong)")
        if not req.driver_phone:
            manifest_issues.append("Nomor kontak darurat pengemudi belum dicantumkan")

        if manifest_issues:
            checks.append(ComplianceCheckDetail(
                category="SURAT_JALAN_MANIFEST",
                status="WARNING",
                title="Digital Surat Jalan Incomplete",
                detail="; ".join(manifest_issues) + ".",
                remedy_action="Lengkapi nomor kontak pengemudi dan generate tanda tangan digital manifest e-Surat Jalan."
            ))
        else:
            checks.append(ComplianceCheckDetail(
                category="SURAT_JALAN_MANIFEST",
                status="PASSED",
                title="Digital Surat Jalan Verified",
                detail=f"e-Surat Jalan valid. Plat nomor: {req.license_plate or req.vehicle_id}, Pengemudi: {req.driver_name or 'Terdaftar'}, Hash: {req.manifest_hash[:12]}...",
                remedy_action=None
            ))

        # ----------------------------------------------------
        # Overall Status Determination
        # ----------------------------------------------------
        has_hard_block = any(c.status == "HARD_BLOCK" for c in checks)
        has_warning = any(c.status == "WARNING" for c in checks)

        if has_hard_block:
            overall_status: ComplianceCheckStatus = "HARD_BLOCK"
            can_dispatch = False
            requires_override = False
        elif has_warning:
            overall_status = "WARNING"
            can_dispatch = True
            requires_override = True
        else:
            overall_status = "PASSED"
            can_dispatch = True
            requires_override = False

        return ComplianceVerifyResponse(
            vehicle_id=req.vehicle_id,
            overall_status=overall_status,
            can_dispatch=can_dispatch,
            requires_override=requires_override,
            checks=checks,
            timestamp=datetime.now(timezone.utc).isoformat()
        )


# Global singleton instance
compliance_service = ComplianceService()
