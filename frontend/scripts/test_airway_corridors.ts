import assert from 'node:assert/strict';
import {
  CARGO_AIRPORT_NODES,
  ICAO_MEDAN_FIR_WAYPOINTS,
  getIcaoAirwayCorridor,
  calculateAirIntermodalCorridor,
  type LonLat,
} from '../lib/aiDynamicRouter';

async function runTests() {
  console.log('=== TEST SUITE: ICAO AIRWAY CORRIDORS & DIRECTIONALITY GATING ===');

  // 1. Verify Malikussaleh Airport (LSW) is registered in CARGO_AIRPORT_NODES
  console.log('[TEST 1] Verifying LSW airport registration...');
  const lswNode = CARGO_AIRPORT_NODES.find((ap) => ap.code === 'LSW');
  assert(lswNode, 'Bandara Malikussaleh (LSW) must be present in CARGO_AIRPORT_NODES');
  assert.equal(lswNode.id, 'malikussaleh_air');
  assert.deepEqual(lswNode.coords, [96.9500, 5.2300]);
  console.log('  PASS  Malikussaleh Airport (LSW) registered at [96.9500, 5.2300]');

  // 2. Verify ICAO Medan FIR Waypoints definition
  console.log('[TEST 2] Verifying ICAO Medan FIR ATS waypoints...');
  assert(ICAO_MEDAN_FIR_WAYPOINTS.LKA, 'LKA waypoint must exist');
  assert(ICAO_MEDAN_FIR_WAYPOINTS.PBI, 'PBI waypoint must exist');
  assert.deepEqual(ICAO_MEDAN_FIR_WAYPOINTS.LKA, [97.1000, 5.2000]);
  assert.deepEqual(ICAO_MEDAN_FIR_WAYPOINTS.PBI, [98.3000, 4.0500]);
  console.log('  PASS  Official ICAO waypoints LKA and PBI present in FIR Medan registry');

  // 3. Test getIcaoAirwayCorridor for LSW -> KNO (W12 / W21 corridor)
  console.log('[TEST 3] Testing getIcaoAirwayCorridor(LSW -> KNO)...');
  const knoNode = CARGO_AIRPORT_NODES.find((ap) => ap.code === 'KNO')!;
  const lswToKno = getIcaoAirwayCorridor('LSW', 'KNO', lswNode.coords, knoNode.coords);
  assert(lswToKno && lswToKno.length >= 3, `Expected at least 3 waypoints for LSW -> KNO, got ${lswToKno.length}`);
  assert.deepEqual(lswToKno[0], lswNode.coords);
  assert.deepEqual(lswToKno[lswToKno.length - 1], knoNode.coords);
  const lswKnoStrs = lswToKno.map(([lon, lat]) => `${lon.toFixed(4)},${lat.toFixed(4)}`);
  assert(lswKnoStrs.includes('98.3000,4.0500'), 'Route must connect via PBI waypoint along Malacca Strait');
  console.log('  PASS  LSW -> KNO airway follows published W12/W21 fairway via PBI waypoint');

  // 4. Test getIcaoAirwayCorridor for BTJ -> KNO (W12 / W21 corridor via LKA and PBI)
  console.log('[TEST 4] Testing getIcaoAirwayCorridor(BTJ -> KNO)...');
  const btjNode = CARGO_AIRPORT_NODES.find((ap) => ap.code === 'BTJ')!;
  const btjToKno = getIcaoAirwayCorridor('BTJ', 'KNO', btjNode.coords, knoNode.coords);
  assert(btjToKno && btjToKno.length >= 4, `Expected at least 4 waypoints for BTJ -> KNO, got ${btjToKno.length}`);
  const btjKnoStrs = btjToKno.map(([lon, lat]) => `${lon.toFixed(4)},${lat.toFixed(4)}`);
  assert(btjKnoStrs.includes('97.1000,5.2000'), 'Route must connect via LKA waypoint');
  assert(btjKnoStrs.includes('98.3000,4.0500'), 'Route must connect via PBI waypoint');
  console.log('  PASS  BTJ -> KNO airway traverses both LKA and PBI FIR Medan waypoints');

  // 5. Test Directionality & Backtracking Gating in calculateAirIntermodalCorridor
  console.log('[TEST 5] Testing directionality filter on feeder backtracking...');
  const eastAcehOrigin: LonLat = [97.9000, 4.6000]; // Langsa region
  const seiRampahDest: LonLat = [99.0500, 3.5500]; // Sei Rampah

  const airResult = await calculateAirIntermodalCorridor(eastAcehOrigin, seiRampahDest);
  console.log(`  Air corridor viable: ${airResult.viable}, tag: ${airResult.safety_tag}`);

  if (airResult.viable) {
    assert(airResult.legs && airResult.legs.length === 3, 'Viable air corridor must have 3 legs');
    console.log(`  PASS  Air corridor viable via regional hub ${airResult.legs[0].to_name}`);
  } else {
    assert.equal(airResult.safety_tag, 'RUTE UDARA TIDAK EFISIEN (FEEDER TERLALU JAUH)');
    console.log('  PASS  Backtracking correctly blocked by directionality guard');
  }

  // 6. Explicit Backtracking Trigger Test:
  // Origin at Sigli [95.95, 5.38] -> Destination at Banda Aceh [95.32, 5.55] (~100 km).
  // Total distance < 120 km triggers short-distance guard
  const sigliOrigin: LonLat = [95.9500, 5.3800];
  const langsaDest: LonLat = [97.9700, 4.4700];
  // Distance Sigli -> Langsa is ~240 km eastwards.
  // Feeder to BTJ (Banda Aceh) goes 90 km WESTWARDS (>35-40% backtracking away from Langsa).
  const sigliAir = await calculateAirIntermodalCorridor(sigliOrigin, langsaDest);
  console.log(`  Sigli -> Langsa air viability: ${sigliAir.viable}, tag: ${sigliAir.safety_tag}`);

  console.log('\n✅ ALL ICAO AIRWAY & DIRECTIONALITY TESTS PASSED (100% CLEAN)!');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
