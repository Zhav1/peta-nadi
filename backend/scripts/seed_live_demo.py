"""End-to-end live-evaluation workflow demo (WS-LIVE wiring proof).

Mimics the real dispatcher flow entirely through the HTTP API:
  1. SETUJUI RUTE   -> POST /api/v1/approvals   (MitigationTab; pred persisted
     at decision time from the active forecast carried on recommended_route)
  2. Selesaikan Trip -> POST/PATCH /api/v1/fleet/travels (LaporanAktualModal;
     disruption_id links the rit to the incident for ledger corroboration)
  3. Catat verifikasi-> POST /api/v1/outcomes    (FIELD_REPORT, no pred sent ->
     auto-joins the stored decision-time forecast)
  4. Seed bulk      -> POST /api/v1/outcomes x N (explicit stored preds,
     mixed TP/TN/FP/FN + mixed non-echo sources)
  5. Verify         -> GET /api/v1/evaluation/live shows N>0 with metrics.

Run:  cd backend && python scripts/seed_live_demo.py
Idempotent: demo rows (INC-LIVE-DEMO-*) are cleared first, locally and remote.
"""
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # noqa: E402

from app.auth.supabase_auth import create_guest_token, ROLE_DISPATCHER  # noqa: E402
from app.db import local_storage  # noqa: E402
from app.main import app  # noqa: E402

DEMO_TAG = "INC-LIVE-DEMO-"
WORKFLOW_INCIDENT = f"{DEMO_TAG}001"

# (incident_suffix, pred_prob, observed_delay_h, price_spike_pct, source, verifier, note)
# N=12 target: TP=5, TN=4, FP=2, FN=1  (cut: pred>=0.50, actual delay>=2.0h)
SEED_ROWS = [
    # 001 is written by the workflow itself (auto-join, no explicit pred).
    ("002", 0.87, 3.8, 12.6, "FIELD_REPORT", "surveyor-satgas-pangan-sumut",
     "Banjir susulan Km 42 Tebing Tinggi; antrean 3.8 jam, cabai +12.6%."),
    ("003", 0.76, 2.9, 9.4, "POLDA_TRAFFIC_POLICE", "polda-sumut-pos-km38",
     "Satu lajur dibuka bergantian; delay 2.9 jam terpantau CCTV."),
    ("004", 0.95, 6.1, 18.2, "FIELD_REPORT", "dispatcher-posko-belawan",
     "Luapan Sei Belawan; 6.1 jam, beras SPHP +18.2% di pasar induk."),
    ("005", 0.64, 2.4, 7.1, "ANTARA_NEWS", "redaksi-antara-sumut",
     "LKBN Antara: longsor Sibolangit, evakuasi 2.4 jam."),
    ("006", 0.91, 4.2, 11.4, "FIELD_REPORT", "surveyor-dishub-tebing",
     "Workflow row: reroute via Lubuk Pakam, aktual 4.2 jam."),
    ("007", 0.22, 0.6, 1.8, "FIELD_REPORT", "surveyor-satgas-pangan-sumut",
     "Genangan surut <1 jam; arus normal, harga stabil."),
    ("008", 0.31, 1.1, 2.4, "BMKG_ALL_CLEAR", "bmkg-stamet-kualanamu",
     "Peringatan dicabut; delay residu 1.1 jam."),
    ("009", 0.12, 0.3, 0.9, "AUTOMATED_SENSOR", "tms-telemetri-armada",
     "Telemetri 24 unit: deviasi <0.3 jam, koridor lancar."),
    ("010", 0.45, 1.8, 4.0, "FIELD_REPORT", "surveyor-dishub-medan",
     "Hujan deras tanpa genangan; antrean GT 1.8 jam."),
    ("011", 0.72, 0.9, 2.1, "FIELD_REPORT", "surveyor-satgas-pangan-sumut",
     "Prakiraan meleset: air tidak naik; delay hanya 0.9 jam."),
    ("012", 0.58, 1.2, 3.3, "POLDA_TRAFFIC_POLICE", "polda-sumut-pos-km51",
     "Rekayasa kontraflow cepat; delay 1.2 jam di bawah ambang."),
    ("013", 0.35, 3.3, 10.2, "FIELD_REPORT", "dispatcher-posko-pematang",
     "Kejutan: jembatan darurat amblas; delay 3.3 jam tak terprediksi."),
]


def cleanup_remote(sb) -> None:
    async def _run():
        try:
            got = await asyncio.to_thread(
                lambda: sb.table("ground_truth_outcomes")
                .select("id").like("incident_id", f"{DEMO_TAG}%").execute()
            )
            ids = [r.get("id") for r in (getattr(got, "data", None) or []) if r.get("id")]
            for i in ids:
                await asyncio.to_thread(
                    lambda i=i: sb.table("ground_truth_outcomes").delete().eq("id", i).execute()
                )
            print(f"remote outcomes deleted: {len(ids)}")
        except Exception as e:  # offline Supabase -> local only, fine
            print(f"remote cleanup skipped ({str(e)[:100]})")

    asyncio.run(_run())


def main() -> None:
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {create_guest_token(role=ROLE_DISPATCHER)}"}

    # 0. Idempotent reset of demo rows.
    import sqlite3
    conn = sqlite3.connect(str(BACKEND_DIR / "data" / "prehub_local.db"))
    cur = conn.cursor()
    for table in ("ground_truth_outcomes", "route_decision_traces"):
        cur.execute(f"DELETE FROM {table} WHERE incident_id LIKE '{DEMO_TAG}%'")
        print(f"local {table} demo rows deleted: {cur.rowcount}")
    conn.commit()
    conn.close()
    try:
        from app.db.supabase_client import get_write_client
        cleanup_remote(get_write_client())
    except Exception as e:
        print(f"remote cleanup unavailable ({str(e)[:100]})")

    # 1. SETUJUI RUTE — approval carries the active forecast; pred_source should
    #    be explicit_route and the trace must store pred_prob=0.91.
    approval_payload = {
        "incident_id": WORKFLOW_INCIDENT,
        "route_id": "1",
        "action": "ACCEPT",
        "tactical_action": "REROUTE",
        "operator_id": "dispatcher-demo",
        "recommended_route": {
            "eta_minutes": 150,
            "vehicle_id": "TRK-003-BELAWAN-TEBING",
            "pred_prob": 0.91,
            "raw_prob": 0.83,
            "p_max": 0.688,
            "weights_version": "ECONOMIC_ACTIVE",
            "active_sources": ["BMKG_RADAR", "TOMTOM_FLOW"],
            "forecast_created_at": "2026-10-26T10:00:00+00:00",
        },
        "notes": "Demo live: setujui rute pengalihan Belawan-Tebing via Lubuk Pakam.",
    }
    r = client.post("/api/v1/approvals", json=approval_payload, headers=headers)
    assert r.status_code == 201, r.text
    print("1. SETUJUI RUTE ->", r.status_code, r.json())

    # 2. Selesaikan Trip — rit linked via disruption_id; realised actuals
    #    baseline 3.5h -> actual 7.7h so ledger observed ~= outcome 4.2h.
    truck = client.post("/api/v1/fleet/trucks", json={
        "truck_id": "BK-8821-LIVE",
        "name": "Truk Live Demo Cabai #1",
        "driver_name": "Demo Driver",
    }, headers=headers)
    assert truck.status_code in (200, 201), truck.text
    travel = client.post("/api/v1/fleet/travels", json={
        "truck_id": "BK-8821-LIVE",
        "origin_name": "Pelabuhan Belawan",
        "origin_coords": [98.68, 3.78],
        "destination_name": "Hub Tebing Tinggi",
        "dest_coords": [99.16, 3.33],
        "commodity_key": "cabai_merah",
        "cargo_tonnage": 10.0,
        "sla_deadline_hours": 12.0,
        "baseline_time_hours": 3.5,
        "disruption_id": WORKFLOW_INCIDENT,
        "rerouted": True,
        "status": "moving",
    }, headers=headers)
    assert travel.status_code == 201, travel.text
    travel_id = travel.json()["id"]
    print("2a. Rit dibuat ->", travel_id)
    patched = client.patch(f"/api/v1/fleet/travels/{travel_id}", json={
        "actual_time_hours": 7.7,
        "actual_fuel_liters": 22.0,
        "disruption_id": WORKFLOW_INCIDENT,
        "status": "delivered",
    }, headers=headers)
    assert patched.status_code == 200, patched.text
    print("2b. Selesaikan Trip -> actual 7.7h / baseline 3.5h (ledger observed 4.2h)")

    # 3. Catat verifikasi — FIELD_REPORT, NO pred sent: must auto-join 0.91.
    outcome = client.post("/api/v1/outcomes", json={
        "incident_id": WORKFLOW_INCIDENT,
        "horizon": "T+12h",
        "observed_delay_hours": 4.2,
        "actual_price_spike_pct": 11.4,
        "verified_by": "surveyor-dishub-tebing",
        "verification_source": "FIELD_REPORT",
        "notes": "Workflow row: reroute via Lubuk Pakam, aktual 4.2 jam.",
    })
    assert outcome.status_code == 201, outcome.text
    print("3. Catat verifikasi ->", outcome.status_code, outcome.json())
    assert outcome.json().get("pred_source") == "stored_decision_trace", outcome.json()
    assert outcome.json().get("pred_prob") == 0.91, outcome.json()

    # 4. Seed the remaining 11 rows with explicit stored preds.
    for suffix, pred, delay, spike, source, verifier, note in SEED_ROWS:
        if suffix == "006":
            continue  # written by the workflow above
        rr = client.post("/api/v1/outcomes", json={
            "incident_id": f"{DEMO_TAG}{suffix}",
            "horizon": "T+12h",
            "observed_delay_hours": delay,
            "actual_price_spike_pct": spike,
            "verified_by": verifier,
            "verification_source": source,
            "notes": note,
            "pred_prob": pred,
            "raw_prob": round(max(0.05, pred - 0.08), 4),
            "p_max": 0.688,
            "weights_version": "ECONOMIC_ACTIVE",
            "active_sources": ["BMKG_RADAR", "TOMTOM_FLOW"],
        })
        assert rr.status_code == 201, (suffix, rr.text)
    print("4. Seed 11 baris eksplisit -> ok (total genuin demo = 12)")

    # 5. Verify live aggregate.
    live = client.get("/api/v1/evaluation/live").json()["live"]
    print(
        f"5. LIVE n={live['n']} sufficient={live['sufficient']} "
        f"echoes={live['excluded_echoes']} missing={live['missing_pred']} "
        f"proxy={live['proxy_count']}"
    )
    print("   confusion:", live.get("confusion_matrix"))
    print("   metrics:", live.get("metrics"))
    print("   calibration:", {
        k: (live.get("calibration") or {}).get(k)
        for k in ("brier_score", "expected_calibration_error")
    })
    assert live["n"] >= 10 and live["sufficient"] and live["metrics"], live
    print("WORKFLOW DEMO OK")


if __name__ == "__main__":
    main()
