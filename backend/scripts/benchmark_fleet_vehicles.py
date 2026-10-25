import time
from fastapi.testclient import TestClient
from app.main import app
from app.routers.vehicles_router import clear_fleet_cache

clear_fleet_cache()
client = TestClient(app)

t0 = time.perf_counter()
res1 = client.get('/api/v1/fleet/vehicles')
t1 = time.perf_counter()
cold_ms = (t1 - t0) * 1000

t2 = time.perf_counter()
res2 = client.get('/api/v1/fleet/vehicles')
t3 = time.perf_counter()
warm_ms = (t3 - t2) * 1000

t4 = time.perf_counter()
res3 = client.get('/api/v1/fleet/vehicles?include_geometry=false')
t5 = time.perf_counter()
warm_stripped_ms = (t5 - t4) * 1000

print(f"Cold latency: {cold_ms:.2f} ms (Status: {res1.status_code}, Vehicles: {res1.json()['total_vehicles']})")
print(f"Warm latency: {warm_ms:.2f} ms (Status: {res2.status_code}, Vehicles: {res2.json()['total_vehicles']})")
print(f"Warm (include_geometry=false) latency: {warm_stripped_ms:.2f} ms (Status: {res3.status_code}, Vehicles: {res3.json()['total_vehicles']})")
