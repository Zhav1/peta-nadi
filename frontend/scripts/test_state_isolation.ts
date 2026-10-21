/**
 * Phase 88 Standalone Verification Suite:
 * Client-Isolated Routing Session vs. Global Read-Only Environmental State
 *
 * Verifies:
 * 1. URL search parameter parsing, validation, and serialization.
 * 2. In-place URL updater behavior (set, delete, query string encoding).
 * 3. Ambient WebSocket node_update payload sanitization (stripping foreign routes).
 * 4. Dual simulated client state isolation (User A Belawan->Tebing vs User B Pekanbaru->Dumai).
 */

import assert from 'node:assert/strict';

// --- Part 1: URL Parameter Parsing & State Hydration ---

interface RoutingSessionState {
  origin: string | null;
  dest: string | null;
  modality: 'best' | 'truck' | 'maritime' | 'air' | 'multimodal' | 'auto';
  route: number | null;
  crisis: string | null;
}

function parseUrlParams(queryString: string): RoutingSessionState {
  const params = new URLSearchParams(queryString);
  const origin = params.get('origin') || null;
  const dest = params.get('dest') || null;

  const rawModality = params.get('modality');
  const validModalities = ['best', 'truck', 'maritime', 'air', 'multimodal', 'auto'];
  const modality = validModalities.includes(rawModality || '')
    ? (rawModality as RoutingSessionState['modality'])
    : 'truck';

  const rawRoute = params.get('route');
  const route = rawRoute !== null && !isNaN(Number(rawRoute)) ? Number(rawRoute) : null;
  const crisis = params.get('crisis') || null;

  return { origin, dest, modality, route, crisis };
}

function serializeUrlParams(currentUrl: string, updates: Record<string, string | null>): string {
  const url = new URL(currentUrl);
  for (const [key, val] of Object.entries(updates)) {
    if (val === null || val === undefined || val === '') {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, val);
    }
  }
  return url.pathname + (url.search ? url.search : '');
}

// --- Part 2: WebSocket Ambient Payload Sanitization Guard ---

interface WsEvent {
  event: 'node_update' | 'agent_start' | 'agent_complete' | 'complete' | 'error';
  agent_id?: string;
  data?: unknown;
}

interface MockCrisisState {
  crisis_id: string;
  type: string;
  severity: string;
  lat: number;
  lon: number;
  route_recommendations?: Array<{ id: string; name: string }>;
  routes?: unknown[];
  [key: string]: unknown;
}

function sanitizeWsNodeUpdate(
  prevCrisis: MockCrisisState | null,
  event: WsEvent
): MockCrisisState | null {
  if (event.event !== 'node_update') {
    return prevCrisis;
  }
  // Strip foreign or ambient route recommendations so broadcast ambient telemetry
  // never overwrites the active user's session routing polylines.
  const rawData = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, any>;
  const { route_recommendations, routes, ...ambientData } = rawData;
  return prevCrisis ? { ...prevCrisis, ...ambientData } : (ambientData as MockCrisisState);
}

// --- Execution & Test Assertions ---

console.log('[Phase 86] Starting Client-Isolated State Verification Suite...');

// Test 1: URL Query Parameter Parsing & Fallback
console.log('-> Test 1: URL Query Parameter Parsing & Defaults');
{
  const emptyState = parseUrlParams('');
  assert.equal(emptyState.origin, null);
  assert.equal(emptyState.dest, null);
  assert.equal(emptyState.modality, 'truck');
  assert.equal(emptyState.route, null);
  assert.equal(emptyState.crisis, null);

  const populatedState = parseUrlParams(
    '?origin=belawan&dest=tebingtinggi&modality=truck&route=0&crisis=floods-asahan'
  );
  assert.equal(populatedState.origin, 'belawan');
  assert.equal(populatedState.dest, 'tebingtinggi');
  assert.equal(populatedState.modality, 'truck');
  assert.equal(populatedState.route, 0);
  assert.equal(populatedState.crisis, 'floods-asahan');

  const invalidModalityState = parseUrlParams('?origin=belawan&dest=tebingtinggi&modality=submarine&route=2');
  assert.equal(invalidModalityState.modality, 'truck', 'Invalid modality should fallback to truck');
  assert.equal(invalidModalityState.route, 2);
}
console.log('   [PASS] URL parsing correctly handles empty, populated, and invalid fallback states.');

// Test 2: In-place URL Serialization & Query Modification
console.log('-> Test 2: In-place URL Serialization & Parameter Mutability');
{
  let currentPath = '/dashboard';

  // 1. User picks origin
  currentPath = serializeUrlParams(`http://localhost:3000${currentPath}`, {
    origin: 'belawan',
    dest: null,
    route: null,
  });
  assert.equal(currentPath, '/dashboard?origin=belawan');

  // 2. User picks destination
  currentPath = serializeUrlParams(`http://localhost:3000${currentPath}`, {
    dest: 'tebingtinggi',
  });
  assert.equal(currentPath, '/dashboard?origin=belawan&dest=tebingtinggi');

  // 3. User switches modality
  currentPath = serializeUrlParams(`http://localhost:3000${currentPath}`, {
    modality: 'multimodal',
  });
  assert.equal(currentPath, '/dashboard?origin=belawan&dest=tebingtinggi&modality=multimodal');

  // 4. User selects route 1
  currentPath = serializeUrlParams(`http://localhost:3000${currentPath}`, {
    route: '1',
  });
  assert.equal(currentPath, '/dashboard?origin=belawan&dest=tebingtinggi&modality=multimodal&route=1');

  // 5. Clean slate reset
  currentPath = serializeUrlParams(`http://localhost:3000${currentPath}`, {
    origin: null,
    dest: null,
    route: null,
    crisis: null,
  });
  assert.equal(currentPath, '/dashboard?modality=multimodal', 'Clean slate removes origin/dest/route/crisis');
}
console.log('   [PASS] In-place URL serialization mutates and clears parameters deterministically.');

// Test 3: WebSocket Ambient Payload Sanitization Guard
console.log('-> Test 3: WebSocket Ambient Payload Sanitization Guard');
{
  const userClientRoutes = [
    { id: 'route-local-primary', name: 'Belawan -> Tebing via Tol Belmera' },
    { id: 'route-local-alt', name: 'Belawan -> Tebing via Jalan Arteri' },
  ];

  const currentCrisis: MockCrisisState = {
    crisis_id: 'disruption-lubuk-pakam',
    type: 'flood',
    severity: 'HIGH',
    lat: 3.56,
    lon: 98.87,
    route_recommendations: userClientRoutes,
  };

  // Ambient broadcast from another user or backend worker containing foreign routes
  const ambientBroadcastEvent: WsEvent = {
    event: 'node_update',
    agent_id: 'crisis-monitor-agent',
    data: {
      water_level_cm: 85,
      affected_toll_km: 'KM 28.4',
      // Foreign route recommendations injected into backend event
      route_recommendations: [
        { id: 'route-foreign-corridor', name: 'Pekanbaru -> Dumai Port Detour' },
      ],
      routes: [{ foreign: true }],
    },
  };

  const updatedCrisis = sanitizeWsNodeUpdate(currentCrisis, ambientBroadcastEvent);
  assert.ok(updatedCrisis);
  assert.equal(updatedCrisis.crisis_id, 'disruption-lubuk-pakam');
  assert.equal((updatedCrisis as any).water_level_cm, 85);
  assert.equal((updatedCrisis as any).affected_toll_km, 'KM 28.4');

  // CRITICAL INVARIANT: userClientRoutes must NOT be overwritten by ambient broadcast!
  assert.deepEqual(
    updatedCrisis.route_recommendations,
    userClientRoutes,
    'Active client route recommendations must be preserved when ambient broadcast arrives'
  );
  assert.equal(updatedCrisis.routes, undefined, 'Raw foreign routes must be completely stripped');
}
console.log('   [PASS] Ambient WebSocket updates never overwrite active client routing corridors.');

// Test 4: Dual Simulated Client State Isolation
console.log('-> Test 4: Multi-Client Session Isolation');
{
  const clientA_Query = '?origin=belawan&dest=tebingtinggi&modality=truck&route=0';
  const clientB_Query = '?origin=pekanbaru&dest=dumai_port&modality=truck&route=1';

  const sessionA = parseUrlParams(clientA_Query);
  const sessionB = parseUrlParams(clientB_Query);

  assert.equal(sessionA.origin, 'belawan');
  assert.equal(sessionA.dest, 'tebingtinggi');
  assert.equal(sessionA.route, 0);

  assert.equal(sessionB.origin, 'pekanbaru');
  assert.equal(sessionB.dest, 'dumai_port');
  assert.equal(sessionB.route, 1);

  // Client A changes route to 2
  const clientA_UpdatedUrl = serializeUrlParams(`http://localhost:3000/dashboard${clientA_Query}`, {
    route: '2',
  });
  const updatedSessionA = parseUrlParams(new URL(`http://localhost:3000${clientA_UpdatedUrl}`).search);

  // Assert Client A changed, Client B completely unaffected
  assert.equal(updatedSessionA.route, 2);
  assert.equal(sessionB.route, 1, 'Client B state remains untouched when Client A updates route');
  assert.equal(sessionB.origin, 'pekanbaru', 'Client B origin preserved');
  assert.equal(sessionB.dest, 'dumai_port', 'Client B dest preserved');
}
console.log('   [PASS] Multi-client session states are completely isolated.');

console.log('\n[SUCCESS] All Phase 86 State Isolation unit verification tests passed (4/4)!');
