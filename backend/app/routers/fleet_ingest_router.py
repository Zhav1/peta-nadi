"""
PreHub : Self-Serve Fleet Onboarding & Live GPS Ingestion REST Router.
Provides endpoints for single vehicle registration, bulk CSV/Excel manifest parsing,
standard TMS GPS telematics webhooks, and local fleet management.
"""
import io
import csv
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status

from app.schemas.fleet_ingest import (
    SingleVehicleRegisterRequest,
    BulkManifestUploadRequest,
    TMSVehicleTelemetryPing,
    FleetIngestResponse,
    ManifestTemplateResponse,
)
from app.auth.supabase_auth import get_optional_user, UserSession, ROLE_DISPATCHER
from app.services.telemetry_service import (
    telemetry_service,
    SUMATRA_STRATEGIC_HUBS,
)
from app.routers.vehicles_router import clear_fleet_cache

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/fleet",
    tags=["Fleet Onboarding & Telemetry Ingestion"],
)

MANIFEST_CSV_HEADERS = [
    "vehicle_id",
    "name",
    "modality",
    "driver_name",
    "driver_phone",
    "cargo",
    "origin",
    "destination",
    "speed_kmh",
    "temperature_c",
]

SAMPLE_CSV_CONTENT = (
    "vehicle_id,name,modality,driver_name,driver_phone,cargo,origin,destination,speed_kmh,temperature_c\n"
    "BK-8821-XA,Truk Sayur Berastagi #4,truck,Budi Santoso,+6281234567890,12 Ton Cabai & Wortel,Kabanjahe (Karo),Pasar Induk Lau Cih Medan,55.0,2.6\n"
    "BK-9102-TK,Truk Beras BULOG Tebing,truck,Agus Prayitno,+628119876543,20 Ton Beras SPHP,Pelabuhan Belawan,Tebing Tinggi,65.0,\n"
    "MV-901-SUMATERA,KM Selat Malaka Express,maritime,Kapten Rahman,+6281355556666,1500 Ton Minyak Goreng,Pelabuhan Belawan,Pelabuhan Dumai,22.0,\n"
    "AIR-901-MEDAN,Kargo Udara Cabai KNO-HLP,air,Pilot Hendra,+6281900001111,4.5 Ton Komoditas Segar,Bandara Kualanamu (KNO),Halim Perdanakusuma (HLP),560.0,3.0\n"
)


def _parse_csv_manifest_text(csv_text: str) -> List[Dict[str, Any]]:
    """Helper to parse CSV string into list of vehicle dictionaries."""
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    results = []
    for row in reader:
        # Strip keys and values
        clean_row = {k.strip(): v.strip() for k, v in row.items() if k}
        vid = clean_row.get("vehicle_id")
        if not vid:
            continue

        speed_val = 60.0
        if clean_row.get("speed_kmh"):
            try:
                speed_val = float(clean_row["speed_kmh"])
            except ValueError:
                speed_val = 60.0

        temp_val = None
        if clean_row.get("temperature_c"):
            try:
                temp_val = float(clean_row["temperature_c"])
            except ValueError:
                temp_val = None

        modality_val = clean_row.get("modality", "truck").lower()
        if modality_val not in ("truck", "maritime", "air"):
            modality_val = "truck"

        results.append({
            "vehicle_id": vid,
            "name": clean_row.get("name") or vid,
            "modality": modality_val,
            "driver_name": clean_row.get("driver_name"),
            "driver_phone": clean_row.get("driver_phone"),
            "cargo": clean_row.get("cargo"),
            "origin": clean_row.get("origin"),
            "destination": clean_row.get("destination"),
            "speed_kmh": speed_val,
            "temperature_c": temp_val,
            "status": "moving",
            "tracking_mode": clean_row.get("tracking_mode") or "ROUTE_ESTIMATED",
            "departure_time": clean_row.get("departure_time"),
        })
    return results


@router.post("/register", response_model=FleetIngestResponse)
async def register_single_vehicle(
    payload: SingleVehicleRegisterRequest,
    user: UserSession = Depends(get_optional_user),
):
    """
    Register an individual vehicle and cargo manifest.
    RBAC: Requires the 'fleet:write' permission (Dispatcher). Guest and Regulator roles are denied with 403.
    """
    if "fleet:write" not in (user.permissions or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "FORBIDDEN",
                "message": f"Akses ditolak: Hanya operator dengan wewenang 'fleet:write' (Dispatcher) yang dapat mendaftarkan armada. Peran Anda saat ini adalah {user.role}.",
                "current_role": user.role,
                "required_permissions": ["fleet:write"],
            },
        )

    try:
        vehicle_dict = payload.model_dump()
        vehicle_dict["organization_id"] = user.org_name
        vehicle_dict["company_id"] = user.company_id or user.org_name
        vehicle_dict["company_name"] = user.org_name
        vehicle_dict["created_by"] = user.name
        vehicle_dict["tracking_mode"] = payload.tracking_mode or "ROUTE_ESTIMATED"
        vehicle_dict["departure_time"] = payload.departure_time
        vehicle_dict["origin_coords"] = payload.origin_coords
        vehicle_dict["dest_coords"] = payload.dest_coords
        
        saved = telemetry_service.register_custom_vehicle(vehicle_dict)
        clear_fleet_cache()
        return FleetIngestResponse(
            status="success",
            message=f"Armada {saved.get('vehicle_id')} ({saved.get('name')}) berhasil didaftarkan [mode: {saved.get('tracking_mode', 'ROUTE_ESTIMATED')}].",
            registered_count=1,
            vehicles=[saved],
        )
    except Exception as e:
        logger.error(f"Failed to register vehicle {payload.vehicle_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mendaftarkan armada: {str(e)}",
        )


@router.post("/upload-manifest", response_model=FleetIngestResponse)
async def upload_fleet_manifest(
    payload: BulkManifestUploadRequest,
    user: UserSession = Depends(get_optional_user),
):
    """
    Upload and parse a batch manifest via JSON payload (list of vehicles or raw csv_text).
    RBAC: Requires the 'manifests:upload' permission (Dispatcher). Guest and Regulator roles are denied with 403.
    """
    if "manifests:upload" not in (user.permissions or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "FORBIDDEN",
                "message": f"Akses ditolak: Hanya operator dengan wewenang 'manifests:upload' (Dispatcher) yang dapat mengunggah manifest armada. Peran Anda saat ini adalah {user.role}.",
                "current_role": user.role,
                "required_permissions": ["manifests:upload"],
            },
        )

    vehicles_to_register: List[Dict[str, Any]] = []

    if payload.csv_text:
        vehicles_to_register = _parse_csv_manifest_text(payload.csv_text)
    elif payload.vehicles:
        for v in payload.vehicles:
            d = v.model_dump()
            d["organization_id"] = user.org_name
            d["company_id"] = user.company_id or user.org_name
            d["company_name"] = user.org_name
            d["created_by"] = user.name
            vehicles_to_register.append(d)

    if not vehicles_to_register:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Diperlukan daftar 'vehicles' atau string 'csv_text' yang valid.",
        )

    try:
        registered_count = telemetry_service.register_batch_custom_vehicles(vehicles_to_register)
        clear_fleet_cache()
        custom_list = telemetry_service.list_custom_vehicles()
        
        return FleetIngestResponse(
            status="success",
            message=f"Berhasil mengimpor {registered_count} armada ke dalam sistem pemantauan.",
            registered_count=registered_count,
            vehicles=custom_list[:registered_count],
        )
    except Exception as e:
        logger.error(f"Failed to process bulk manifest: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memproses manifest armada: {str(e)}",
        )


@router.post("/upload-manifest/file", response_model=FleetIngestResponse)
async def upload_fleet_manifest_file(
    file: UploadFile = File(...),
    manifest_name: Optional[str] = Form(None),
    user: UserSession = Depends(get_optional_user),
):
    """
    Upload and parse a batch manifest via multipart CSV file.
    RBAC: Requires the 'manifests:upload' permission (Dispatcher). Guest and Regulator roles are denied with 403.
    """
    if "manifests:upload" not in (user.permissions or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "FORBIDDEN",
                "message": f"Akses ditolak: Hanya operator dengan wewenang 'manifests:upload' (Dispatcher) yang dapat mengunggah manifest armada. Peran Anda saat ini adalah {user.role}.",
                "current_role": user.role,
                "required_permissions": ["manifests:upload"],
            },
        )

    content_bytes = await file.read()
    try:
        csv_text = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        csv_text = content_bytes.decode("latin-1")
    
    vehicles_to_register = _parse_csv_manifest_text(csv_text)
    if not vehicles_to_register:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File CSV kosong atau tidak memiliki baris data armada yang valid.",
        )

    try:
        for v in vehicles_to_register:
            v["organization_id"] = user.org_name
            v["company_id"] = user.company_id or user.org_name
            v["company_name"] = user.org_name
            v["created_by"] = user.name

        registered_count = telemetry_service.register_batch_custom_vehicles(vehicles_to_register)
        clear_fleet_cache()
        custom_list = telemetry_service.list_custom_vehicles()
        
        return FleetIngestResponse(
            status="success",
            message=f"Berhasil mengimpor {registered_count} armada dari file CSV.",
            registered_count=registered_count,
            vehicles=custom_list[:registered_count],
        )
    except Exception as e:
        logger.error(f"Failed to process CSV file manifest: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memproses file manifest armada: {str(e)}",
        )


@router.post("/telemetry/ingest")
async def ingest_tms_telemetry(payload: TMSVehicleTelemetryPing):
    """
    Standard webhook ingestion endpoint for external TMS (Traccar, EasyGo, McEasy, GPS trackers).
    Updates vehicle coordinate kinematics and evaluates cold-chain temperature limits in real-time.
    """
    try:
        ping_dict = payload.model_dump()
        logged = telemetry_service.ingest_gps_ping(ping_dict)
        clear_fleet_cache()
        return {
            "status": "success",
            "message": f"Telemetri GPS untuk {payload.vehicle_id} berhasil diterima.",
            "data": logged,
        }
    except Exception as e:
        logger.error(f"Failed to ingest telematics ping for {payload.vehicle_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Format telemetri GPS tidak valid: {str(e)}",
        )


@router.get("/custom", response_model=List[Dict[str, Any]])
async def list_custom_fleet(
    modality: Optional[str] = None,
    company_id: Optional[str] = Query(None, description="Tenant filter for regulator/guest introspection"),
    user: UserSession = Depends(get_optional_user),
):
    """
    Retrieve custom user-onboarded fleet vehicles.
    Dispatchers only ever see their own tenant's onboarded assets; regulator and
    guest sessions keep the macro view (optionally narrowed with ?company_id=).
    """
    scoped_company = company_id
    if user and user.role == ROLE_DISPATCHER:
        scoped_company = user.company_id
        if not scoped_company:
            return []
    return telemetry_service.list_custom_vehicles(modality=modality, company_id=scoped_company)


@router.delete("/custom/{vehicle_id}")
async def delete_custom_fleet_unit(
    vehicle_id: str,
    user: UserSession = Depends(get_optional_user),
):
    """
    Delete a custom registered fleet unit.
    RBAC: Requires the 'fleet:write' permission (Dispatcher). Guest and Regulator roles are denied with 403.
    """
    if "fleet:write" not in (user.permissions or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "FORBIDDEN",
                "message": f"Akses ditolak: Hanya operator dengan wewenang 'fleet:write' (Dispatcher) yang dapat menghapus armada. Peran Anda saat ini adalah {user.role}.",
                "current_role": user.role,
                "required_permissions": ["fleet:write"],
            },
        )

    success = telemetry_service.remove_custom_vehicle(vehicle_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Armada dengan ID '{vehicle_id}' tidak ditemukan dalam database kustom.",
        )

    clear_fleet_cache()
    return {
        "status": "success",
        "message": f"Armada '{vehicle_id}' berhasil dihapus dari sistem.",
        "vehicle_id": vehicle_id,
    }


@router.get("/manifest/template", response_model=ManifestTemplateResponse)
async def get_manifest_template():
    """Retrieve standard manifest CSV headers, sample template, and supported strategic hubs."""
    hub_list = [
        {"name": name, "coordinates": coords}
        for name, coords in sorted(SUMATRA_STRATEGIC_HUBS.items())
    ]
    return ManifestTemplateResponse(
        headers=MANIFEST_CSV_HEADERS,
        sample_csv=SAMPLE_CSV_CONTENT,
        supported_hubs=hub_list,
    )


@router.post("/telemetry/simulate-ping")
async def simulate_gps_ping(payload: TMSVehicleTelemetryPing):
    """
    Interactive test helper for evaluators and UI simulation.
    Dispatches a real-time GPS ping to dynamically move a vehicle on the live map.
    """
    return await ingest_tms_telemetry(payload)
