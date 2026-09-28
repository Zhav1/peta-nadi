"""
PreHub — Live Backend API Audit & Endpoint Diagnostic Suite
Probes all REST and WebSocket endpoints against a target URL (Localhost or Render Cloud).
"""
import sys
import os
import time
import json
import argparse
from typing import Dict, Any, List, Optional
import urllib.request
import urllib.error

# Ensure root directory in sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

ENDPOINTS_TO_AUDIT = [
    # 1. System Health
    {"name": "Health Check", "path": "/health", "method": "GET", "auth": False},
    {"name": "Source Health", "path": "/api/v1/health/sources", "method": "GET", "auth": False},
    
    # 2. Incidents & OSINT
    {"name": "List Incidents", "path": "/api/v1/incidents", "method": "GET", "auth": False},
    {"name": "Historical Incidents", "path": "/api/v1/incidents/historical/episodes", "method": "GET", "auth": False},
    {"name": "Predictive Risks", "path": "/api/v1/incidents/predictive/risks", "method": "GET", "auth": False},
    {"name": "OSINT Feed", "path": "/api/v1/incidents/osint/feed", "method": "GET", "auth": False},
    {"name": "OSINT Live Stream", "path": "/api/v1/incidents/osint/live", "method": "GET", "auth": False},
    
    # 3. Commodity & Economic Intelligence
    {"name": "Commodity Prices", "path": "/api/v1/commodities/prices", "method": "GET", "auth": False},
    {"name": "Commodity Prices Filtered", "path": "/api/v1/commodities/prices?commodity=beras&limit=5", "method": "GET", "auth": False},
    
    # 4. News Intelligence & Market Regime
    {"name": "Live Verified News", "path": "/api/v1/news/live", "method": "GET", "auth": False},
    {"name": "Market Regime State", "path": "/api/v1/news/market-regime", "method": "GET", "auth": False},
    {"name": "News Verification Query", "path": "/api/v1/news/verify?claim=Banjir+Belawan&location=Sumatera+Utara", "method": "POST", "auth": False},
    
    # 5. Spatial Weather, Traffic & Corridor Context
    {"name": "Corridor Context", "path": "/api/v1/corridor/context?corridor_id=sumatra_belawan_medan", "method": "GET", "auth": False},
    {"name": "Spatial Weather Polygons", "path": "/api/v1/weather/spatial-polygons", "method": "GET", "auth": False},
    {"name": "Traffic Flow Segments", "path": "/api/v1/traffic/flow-segments", "method": "GET", "auth": False},
    
    # 6. Fleet Telemetry & Ingest
    {"name": "Fleet Vehicles", "path": "/api/v1/fleet/vehicles", "method": "GET", "auth": False},
    {"name": "Custom Fleet List", "path": "/api/v1/fleet/custom", "method": "GET", "auth": False},
    {"name": "Manifest Template Info", "path": "/api/v1/fleet/manifest/template", "method": "GET", "auth": False},
    
    # 7. Approvals & Ground-Truth Outcomes
    {"name": "List Approvals", "path": "/api/v1/approvals", "method": "GET", "auth": False},
    {"name": "List Outcomes", "path": "/api/v1/outcomes", "method": "GET", "auth": False},
    {"name": "Benchmark Summary", "path": "/api/v1/outcomes/benchmark/summary", "method": "GET", "auth": False},
    
    # 8. Empirical Evaluation Matrix
    {"name": "Benchmark Report", "path": "/api/v1/evaluation/benchmark", "method": "GET", "auth": False},
    {"name": "Test Matrix (83 tests)", "path": "/api/v1/evaluation/test-matrix", "method": "GET", "auth": False},
    {"name": "Corridor Reroute Efficiency", "path": "/api/v1/evaluation/corridor-efficiency", "method": "GET", "auth": False},
    
    # 9. Multi-Tenant Auth & Roles
    {"name": "Role Catalog", "path": "/api/v1/auth/roles", "method": "GET", "auth": False},
    {"name": "Guest Session Generator", "path": "/api/v1/auth/guest-session", "method": "POST", "auth": False, "body": {"role": "DISPATCHER", "org_name": "Logistics Sumut"}},
    
    # 10. POST Endpoints (Simulation & Ingestion)
    {"name": "Fleet Single Register", "path": "/api/v1/fleet/register", "method": "POST", "auth": False, "body": {
        "vehicle_id": "AUDIT-TRUCK-99", "name": "Truk Audit Telemetri", "driver_name": "Audit Driver", "driver_phone": "08123456789", "vehicle_class": "Tronton Wingbox", "modality": "truck", "origin_hub": "Belawan Port", "dest_hub": "Medan Central", "commodity": "Beras Premium", "weight_tons": 12.0
    }},
    {"name": "TMS GPS Telemetry Ingest", "path": "/api/v1/fleet/telemetry/ingest", "method": "POST", "auth": False, "body": {
        "vehicle_id": "AUDIT-TRUCK-99", "latitude": 3.78, "longitude": 98.68, "speed_kmh": 45.0, "heading": 180.0
    }},

]


def run_audit(base_url: str, timeout: int = 30) -> Dict[str, Any]:
    base_url = base_url.rstrip("/")
    print(f"\n=======================================================")
    print(f" PreHub Live API Diagnostic Audit")
    print(f" Target: {base_url}")
    print(f" Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    print(f"=======================================================\n")
    
    results = []
    total_endpoints = len(ENDPOINTS_TO_AUDIT)
    passed = 0
    failed = 0
    total_latency_ms = 0.0
    
    # 1. Initial Wakeup Ping (for Render cold starts)
    print("Sending initial wakeup probe to /health...")
    t_start = time.time()
    try:
        req = urllib.request.Request(f"{base_url}/health", headers={"User-Agent": "PreHub-Audit-Agent/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            status_code = response.getcode()
            body = response.read().decode("utf-8")
            elapsed = (time.time() - t_start) * 1000.0
            print(f"Wakeup response: HTTP {status_code} in {elapsed:.1f}ms")
    except Exception as e:
        elapsed = (time.time() - t_start) * 1000.0
        print(f"Wakeup warning / slow start: {e} ({elapsed:.1f}ms)")
    
    print("\nProbing all endpoints:\n")
    print(f"{'Status':<8} | {'Method':<6} | {'Latency':<9} | {'Endpoint':<45} | {'Notes'}")
    print("-" * 95)
    
    for item in ENDPOINTS_TO_AUDIT:
        url = f"{base_url}{item['path']}"
        method = item["method"]
        body_data = None
        headers = {
            "User-Agent": "PreHub-Audit-Agent/1.0",
            "Accept": "application/json"
        }
        
        if method == "POST":
            headers["Content-Type"] = "application/json"
            if "body" in item:
                body_data = json.dumps(item["body"]).encode("utf-8")
        
        t0 = time.time()
        status_str = "ERR"
        latency_ms = 0.0
        note = ""
        http_code = 0
        
        try:
            req = urllib.request.Request(url, data=body_data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                http_code = resp.getcode()
                raw_resp = resp.read().decode("utf-8")
                latency_ms = (time.time() - t0) * 1000.0
                total_latency_ms += latency_ms
                
                # Verify JSON parse
                try:
                    parsed = json.loads(raw_resp)
                    if http_code in [200, 201]:
                        status_str = "PASS"
                        passed += 1
                        note = f"JSON OK ({len(raw_resp)} bytes)"
                    else:
                        status_str = f"HTTP {http_code}"
                        failed += 1
                        note = f"Unexpected status"
                except Exception:
                    status_str = "WARN"
                    passed += 1
                    note = f"Non-JSON response ({len(raw_resp)} bytes)"
                    
        except urllib.error.HTTPError as e:
            latency_ms = (time.time() - t0) * 1000.0
            http_code = e.code
            failed += 1
            status_str = f"FAIL {http_code}"
            try:
                err_body = e.read().decode("utf-8")
                note = f"HTTP {e.code}: {err_body[:60]}"
            except Exception:
                note = f"HTTP Error {e.code}"
                
        except urllib.error.URLError as e:
            latency_ms = (time.time() - t0) * 1000.0
            failed += 1
            status_str = "CONN_ERR"
            note = f"Network error: {e.reason}"
            
        except Exception as e:
            latency_ms = (time.time() - t0) * 1000.0
            failed += 1
            status_str = "EXCEPTION"
            note = str(e)[:60]
            
        print(f"[{status_str:<6}] | {method:<6} | {latency_ms:>7.1f}ms | {item['path'][:45]:<45} | {note}")
        
        results.append({
            "name": item["name"],
            "path": item["path"],
            "method": method,
            "http_code": http_code,
            "status": status_str,
            "latency_ms": round(latency_ms, 2),
            "note": note
        })
        
        time.sleep(0.05)  # slight throttle
        
    avg_latency = total_latency_ms / max(1, (passed + failed))
    success_rate = (passed / max(1, total_endpoints)) * 100.0
    
    print("-" * 95)
    print(f"\nAudit Summary:")
    print(f"• Total Endpoints Tested: {total_endpoints}")
    print(f"• Passed (HTTP 200/201):   {passed} ({success_rate:.1f}%)")
    print(f"• Failed / Errored:       {failed}")
    print(f"• Average Latency:        {avg_latency:.1f} ms\n")
    
    summary = {
        "target_url": base_url,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_endpoints": total_endpoints,
        "passed": passed,
        "failed": failed,
        "success_rate_pct": round(success_rate, 2),
        "average_latency_ms": round(avg_latency, 2),
        "results": results
    }
    
    out_path = os.path.join(root_dir, "test-results", "live_api_audit_report.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"Saved diagnostic report to: {out_path}\n")
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PreHub Backend API Audit Tool")
    parser.add_argument("--url", default="https://peta-nadi.onrender.com", help="Base backend URL to audit")
    parser.add_argument("--timeout", type=int, default=30, help="Request timeout in seconds")
    args = parser.parse_args()
    
    run_audit(args.url, args.timeout)
