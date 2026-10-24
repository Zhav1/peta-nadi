"""M5 P2: routing hedging enrichment is additive and grounded (no invented Rp)."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_solve_path_without_commodity_stays_honest_null():
    r = client.post('/api/v1/routing/solve-path', json={
        'origin_id': 'tembilahan', 'dest_id': 'rengat',
        'origin_coords': [103.15, -0.3333], 'dest_coords': [102.3167, -0.55],
        'k_alternatives': 2,
    })
    assert r.status_code == 200
    body = r.json()
    assert body.get('status') in ('success', 'no_route')
    for route in body.get('routes', []):
        assert route.get('hedging') in (None, {}) or isinstance(route.get('hedging'), dict)

def test_solve_path_with_commodity_attaches_bpjt_pertamina_hedging():
    r = client.post('/api/v1/routing/solve-path', json={
        'origin_id': 'belawan_port', 'dest_id': 'tebing_tinggi',
        'k_alternatives': 3, 'commodity': 'beras', 'cargo_tonnage': 10,
        'vehicle_golongan': 'GOL_II', 'fuel_type': 'biosolar',
    })
    assert r.status_code == 200
    body = r.json()
    routes = body.get('routes', [])
    assert len(routes) >= 1
    # At least detour routes (index>=1) carry grounded hedging when 2+ routes exist
    if len(routes) >= 2:
        detours = [x for x in routes[1:] if x.get('hedging')]
        assert len(detours) >= 1, 'detour routes must carry hedging when commodity supplied'
        h = detours[0]['hedging']
        assert h['net_savings_idr'] >= 0
        assert h['optimal_policy'] in ('CONTINUE', 'REROUTE', 'HOLD')
        assert 'reroute_policy' in h and 'breakdown' in h['reroute_policy']
        # Phase 105 WP3: Flat alias fields alongside nested policies
        assert 'reroute_cost_idr' in h and isinstance(h['reroute_cost_idr'], (int, float))
        assert 'continue_cost_idr' in h and isinstance(h['continue_cost_idr'], (int, float))
        assert 'hold_cost_idr' in h and isinstance(h['hold_cost_idr'], (int, float))
        assert h['reroute_cost_idr'] == h['reroute_policy']['cost_idr']
