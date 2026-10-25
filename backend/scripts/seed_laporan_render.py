"""Seed demo travels on a REMOTE backend (e.g. Render) via live HTTPS API.

Why this exists
--------------
``seed_laporan_demo.py`` writes straight into SQLite (``backend/data/prehub_local.db``,
``/app/data/prehub_local.db`` in Docker). On Render's free plan that filesystem is
EPHEMERAL: rows vanish on every redeploy / restart / cold-start wipe, so a local
seed never shows up on the production Laporan tab.

The ERP/travel ledger is SQLite-only by design (``travel_ledger_service`` ->
``local_storage.list_travels``; ``build_erp_summary`` hardcodes
``storage="local_sqlite"``; no Supabase table backs travels). The only
production-safe way to populate Render's ledger is through the public REST API,
which writes to whichever SQLite file the Render process owns:

    POST {BACKEND_URL}/api/v1/auth/guest-session   {"role": "DISPATCHER"} -> token
    POST {BACKEND_URL}/api/v1/fleet/trucks          (Bearer token, fleet:write)
    POST {BACKEND_URL}/api/v1/fleet/travels         (Bearer token, fleet:write)
    GET  {BACKEND_URL}/api/v1/erp/summary           (verify total_trips > 0)

Payload shape mirrors ``seed_laporan_demo.py`` (same gazetteer / commodities /
trucks / status mix); money is derived server-side from BPJT tariffs, Pertamina
rates and the 4-tier spoilage model, so the client never sends cost figures.

SAFETY: dry-run is the default. The script only performs GETs (health +
erp/summary, read-only) unless SEED_LIVE=1 is set explicitly. No secrets are
hardcoded; the dispatcher token is minted at runtime or passed via env.

Usage:
    # Dry-run (default): build payloads, probe remote health + current ERP totals
    BACKEND_URL=https://peta-nadi.onrender.com python backend/scripts/seed_laporan_render.py

    # Live seed (explicit opt-in, 12 travels by default):
    BACKEND_URL=https://peta-nadi.onrender.com SEED_LIVE=1 \\
        python backend/scripts/seed_laporan_render.py

    # Live seed with a pre-minted dispatcher token (skips guest-session mint):
    BACKEND_URL=https://peta-nadi.onrender.com SEED_LIVE=1 \\
        DISPATCHER_TOKEN=<jwt> python backend/scripts/seed_laporan_render.py

Env knobs (all optional except BACKEND_URL for any network step):
    BACKEND_URL       e.g. https://peta-nadi.onrender.com (no trailing slash)
    SEED_LIVE         set to "1" to actually POST; anything else = dry-run
    DISPATCHER_TOKEN  Bearer JWT with fleet:write (else minted via guest-session)
    SEED_COMPANY_ID   dispatcher tenant claim (default: pos_logistik)
    SEED_COMPANY_NAME human org name (default: PT Samudera Logistik Sumatra)
    SEED_N_TRAVELS    number of travels to create live (default: 12, max: 60)
    SEED_RANDOM_SEED  deterministic RNG seed (default: 42)
"""

import json
import os
import random
import sys
import urllib.error
import urllib.request

# Canonical payload constants live in seed_laporan_demo.py; duplicated here in
# minimal form so this script stays stdlib-only (no backend imports needed).
PLACES = {
    "Medan": [98.6722, 3.5952],
    "Belawan": [98.6790, 3.7750],
    "Tebing Tinggi": [99.1611, 3.3285],
    "Pematang Siantar": [99.0628, 2.9597],
    "Binjai": [98.4853, 3.6001],
    "Lubuk Pakam": [98.8712, 3.5614],
    "Kisaran": [99.6126, 2.9844],
}
COMMODITIES = ["beras", "cabai_merah", "bawang_merah", "minyak_goreng", "daging_sapi", "ikan_segar"]
TRUCKS = [
    {"truck_id": "BK-8821-XA", "name": "Truk Cold-Chain Berastagi #1",
     "driver_name": "Budi Santoso", "driver_phone": "+628126100001"},
    {"truck_id": "BK-7450-XB", "name": "Truk Sembako Medan #2",
     "driver_name": "Agus Wijaya", "driver_phone": "+628126100002"},
    {"truck_id": "BK-9133-XC", "name": "Truk Sayur Mayur #3",
     "driver_name": "Dewi Lestari", "driver_phone": "+628126100003"},
    {"truck_id": "BK-6287-XD", "name": "Truk Ikan Segar Belawan #4",
     "driver_name": "Joko Prasetyo", "driver_phone": "+628126100004"},
]
BASELINE_TOLLS = ["BELMERA", "MEDAN_TEBINGTINGGI"]

BACKEND_URL = os.environ.get("BACKEND_URL", "").rstrip("/")
SEED_LIVE = os.environ.get("SEED_LIVE") == "1"
DISPATCHER_TOKEN = os.environ.get("DISPATCHER_TOKEN", "").strip()
COMPANY_ID = os.environ.get("SEED_COMPANY_ID", "pos_logistik")
COMPANY_NAME = os.environ.get("SEED_COMPANY_NAME", "PT Samudera Logistik Sumatra")
N_TRAVELS = max(1, min(int(os.environ.get("SEED_N_TRAVELS", "12")), 60))
RNG_SEED = int(os.environ.get("SEED_RANDOM_SEED", "42"))


def _haversine_km(origin, dest) -> float:
    import math
    lon1, lat1 = float(origin[0]), float(origin[1])
    lon2, lat2 = float(dest[0]), float(dest[1])
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2)
    return 6371.0 * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def _pick_status(rng: random.Random) -> str:
    r = rng.random()
    if r < 0.60:
        return "delivered"
    if r < 0.80:
        return "rerouted"
    if r < 0.87:
        return "moving"
    if r < 0.93:
        return "planned"
    return "failed"


def build_truck_payloads() -> list:
    return [
        {
            "truck_id": t["truck_id"],
            "name": t["name"],
            "modality": "truck",
            "vehicle_golongan": "GOL_II",
            "driver_name": t["driver_name"],
            "driver_phone": t["driver_phone"],
            "company_id": COMPANY_ID,
            "company_name": COMPANY_NAME,
            "gross_weight_ton": 12.0,
            "fuel_type": "biosolar",
            "notes": "Seed demo laporan (render)",
        }
        for t in TRUCKS
    ]


def build_travel_payloads(rng: random.Random) -> list:
    payloads = []
    for _ in range(N_TRAVELS):
        truck = rng.choice(TRUCKS)
        commodity = rng.choice(COMMODITIES)
        origin_name, dest_name = rng.sample(list(PLACES.keys()), 2)
        origin, dest = PLACES[origin_name], PLACES[dest_name]
        baseline_time = round(rng.uniform(4.0, 14.0), 1)
        blocked_delay = round(rng.uniform(0.0, 6.0), 1)
        status = _pick_status(rng)
        rerouted = status == "rerouted" or (status == "delivered" and rng.random() < 0.35)
        sla = max(1.0, round(baseline_time + blocked_delay * 0.5 + rng.uniform(-1.0, 2.0), 1))

        kwargs = {
            "truck_id": truck["truck_id"],
            "origin_name": origin_name,
            "origin_coords": origin,
            "destination_name": dest_name,
            "dest_coords": dest,
            "commodity_key": commodity,
            "cargo_tonnage": round(rng.uniform(2.0, 12.0), 1),
            "sla_deadline_hours": sla,
            "baseline_time_hours": baseline_time,
            "blocked_delay_hours": blocked_delay,
            "baseline_toll_segments": list(BASELINE_TOLLS),
            "rerouted": rerouted,
            "disruption_id": f"DISRUPSI-BANJIR-{rng.randint(1, 4):02d}"
            if (rerouted or blocked_delay > 2) else None,
            "status": status,
            "notes": "Seed demo laporan (render)",
        }
        if status in ("delivered", "rerouted"):
            est_fuel = _haversine_km(origin, dest) / 3.5
            kwargs["actual_time_hours"] = round(
                max(0.5, baseline_time + blocked_delay - rng.uniform(0.5, blocked_delay + 1.5)), 1)
            kwargs["actual_fuel_liters"] = round(est_fuel * rng.uniform(0.85, 0.98), 1)
            kwargs["actual_toll_segments"] = ["BELMERA"] if rerouted else list(BASELINE_TOLLS)
        elif status == "failed" and rng.random() < 0.5:
            est_fuel = _haversine_km(origin, dest) / 3.5
            kwargs["actual_time_hours"] = round(baseline_time + blocked_delay + rng.uniform(2.0, 4.0), 1)
            kwargs["actual_fuel_liters"] = round(est_fuel * 1.3, 1)
            kwargs["rerouted"] = True
        payloads.append(kwargs)
    return payloads


def _http(method: str, url: str, body=None, token: str = "") -> tuple:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode()[:500]
        except Exception:
            detail = ""
        return e.code, {"_http_error": detail}


def main() -> int:
    rng = random.Random(RNG_SEED)
    trucks = build_truck_payloads()
    travels = build_travel_payloads(rng)
    print(f"[plan] backend={BACKEND_URL or '(unset)'} live={SEED_LIVE} "
          f"company={COMPANY_ID} trucks={len(trucks)} travels={len(travels)}")

    if not BACKEND_URL:
        print("[dry-run] BACKEND_URL unset; payloads built OK. Sample travel payload:")
        print(json.dumps(travels[0], indent=2, ensure_ascii=False))
        print("[dry-run] Set BACKEND_URL to probe remote health/ERP totals.")
        return 0

    # Read-only probes are safe in dry-run mode.
    code, health = _http("GET", f"{BACKEND_URL}/health")
    print(f"[probe] GET /health -> {code} "
          f"{str(health)[:200]}")
    code, summary = _http("GET", f"{BACKEND_URL}/api/v1/erp/summary?company_id={COMPANY_ID}")
    if code == 200:
        totals = (summary.get("totals") or {})
        print(f"[probe] ERP summary company={COMPANY_ID} "
              f"total_trips={totals.get('total_trips')} delivered={totals.get('delivered_trips')} "
              f"storage={summary.get('storage')} scope={summary.get('scope')}")
    else:
        print(f"[probe] ERP summary -> {code} {str(summary)[:300]}")

    if not SEED_LIVE:
        print("[dry-run] SEED_LIVE!=1: no POSTs sent. Sample travel payload that WOULD be sent:")
        print(json.dumps(travels[0], indent=2, ensure_ascii=False))
        print("[dry-run] To seed for real, re-run with SEED_LIVE=1 "
              "(optionally DISPATCHER_TOKEN=<jwt> to skip guest-session mint).")
        return 0

    token = DISPATCHER_TOKEN
    if not token:
        code, sess = _http("POST", f"{BACKEND_URL}/api/v1/auth/guest-session", {"role": "DISPATCHER"})
        if code != 200 or not sess.get("access_token"):
            print(f"[live] FAILED to mint dispatcher token -> {code} {str(sess)[:300]}")
            return 1
        token = sess["access_token"]
        print(f"[live] minted DISPATCHER token (company={sess.get('user', {}).get('company_id')})")

    ok_trucks = 0
    for t in trucks:
        code, _ = _http("POST", f"{BACKEND_URL}/api/v1/fleet/trucks", t, token)
        if code in (200, 201):
            ok_trucks += 1
        else:
            print(f"[live] truck {t['truck_id']} -> {code} (continuing)")
    print(f"[live] trucks upserted: {ok_trucks}/{len(trucks)}")

    ok_travels, fail = 0, 0
    for p in travels:
        code, _ = _http("POST", f"{BACKEND_URL}/api/v1/fleet/travels", p, token)
        if code in (200, 201):
            ok_travels += 1
        else:
            fail += 1
            print(f"[live] travel {p['origin_name']}->{p['destination_name']} -> {code} (continuing)")
    print(f"[live] travels created: {ok_travels}/{len(travels)} failed={fail}")

    code, verify = _http("GET", f"{BACKEND_URL}/api/v1/erp/summary?company_id={COMPANY_ID}")
    if code == 200:
        totals = verify.get("totals") or {}
        print(f"[verify] total_trips={totals.get('total_trips')} "
              f"delivered={totals.get('delivered_trips')} "
              f"saved Rp {totals.get('cost_saved_idr', 0):,.0f}")
        if (totals.get("total_trips") or 0) <= 0:
            print("[verify] FAIL: ERP summary still empty after live seed.")
            return 1
    else:
        print(f"[verify] ERP summary fetch failed -> {code}")
        return 1
    print("[live] done. Laporan tab should now render rows for company "
          f"{COMPANY_ID} (dispatcher view) and aggregates (regulator view).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
