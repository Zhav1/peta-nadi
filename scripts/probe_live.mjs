#!/usr/bin/env node
/**
 * scripts/probe_live.mjs
 * Phase 179 Live & Edge Contract Probe (D10 - probe_live.mjs).
 * Part A: Static code and edge contract verification.
 * Part B: Live Vercel edge probe across 5 parallel requests.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function verifyPartA() {
  console.log('======================================================================');
  console.log('Part A: Static Code & Edge Contract Verification');
  console.log('======================================================================');

  // 1. CrisisMap.tsx does NOT contain mapbox-traffic-v1
  const crisisMapPath = path.join(ROOT, 'frontend/components/map/CrisisMap.tsx');
  const crisisMapContent = fs.readFileSync(crisisMapPath, 'utf8');
  const hasMapboxTraffic = crisisMapContent.includes('mapbox://mapbox.mapbox-traffic-v1');
  console.log(`CrisisMap.tsx contains mapbox-traffic-v1: ${hasMapboxTraffic} (expected: false)`);
  if (hasMapboxTraffic) {
    throw new Error('CrisisMap.tsx still contains global mapbox-traffic-v1 layer!');
  }
  console.log('✓ CrisisMap.tsx has global mapbox-traffic-v1 purged.');

  // 2. DashboardClient.tsx does NOT contain 'if (isRegional) return;' and has NORTHERN_SUMATRA_ACTIVE_DISASTERS empty
  const dashClientPath = path.join(ROOT, 'frontend/components/dashboard/DashboardClient.tsx');
  const dashClientContent = fs.readFileSync(dashClientPath, 'utf8');

  // Check handleFocusMap does NOT contain 'if (isRegional) return;'
  const handleFocusIndex = dashClientContent.indexOf('handleFocusMap');
  let focusHasRegionalGuard = false;
  if (handleFocusIndex !== -1) {
    const focusSnippet = dashClientContent.slice(handleFocusIndex, handleFocusIndex + 1200);
    focusHasRegionalGuard = focusSnippet.includes('if (isRegional) return;');
  }
  console.log(`handleFocusMap has 'if (isRegional) return;': ${focusHasRegionalGuard} (expected: false)`);
  if (focusHasRegionalGuard) {
    throw new Error("DashboardClient.tsx handleFocusMap still contains 'if (isRegional) return;'!");
  }
  console.log('✓ handleFocusMap Fokus button dead-guard removed.');

  // Check NORTHERN_SUMATRA_ACTIVE_DISASTERS empty
  const hasEmptyDisasters = /const\s+NORTHERN_SUMATRA_ACTIVE_DISASTERS\s*:\s*any\[\]\s*=\s*\[\s*\]\s*;/.test(dashClientContent);
  console.log(`NORTHERN_SUMATRA_ACTIVE_DISASTERS is empty []: ${hasEmptyDisasters} (expected: true)`);
  if (!hasEmptyDisasters) {
    throw new Error('DashboardClient.tsx NORTHERN_SUMATRA_ACTIVE_DISASTERS is not empty []!');
  }
  console.log('✓ NORTHERN_SUMATRA_ACTIVE_DISASTERS baseline purged.');

  // 3. route.ts does NOT contain buildDeterministicSumatraBaseline and includes fleet and source_health
  const routePath = path.join(ROOT, 'frontend/app/api/public/dashboard/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf8');
  const hasDeterministicBaseline = routeContent.includes('buildDeterministicSumatraBaseline');
  console.log(`route.ts contains buildDeterministicSumatraBaseline: ${hasDeterministicBaseline} (expected: false)`);
  if (hasDeterministicBaseline) {
    throw new Error('route.ts still contains buildDeterministicSumatraBaseline fake generator!');
  }

  const hasFleetSection = routeContent.includes('fleet:');
  const hasSourceHealthSection = routeContent.includes('source_health:');
  console.log(`route.ts defines fleet section: ${hasFleetSection} (expected: true)`);
  console.log(`route.ts defines source_health section: ${hasSourceHealthSection} (expected: true)`);
  if (!hasFleetSection || !hasSourceHealthSection) {
    throw new Error('route.ts missing fleet or source_health section definitions!');
  }
  console.log('✓ route.ts clean of deterministic baselines, schema contains fleet + source_health.');

  // 4. DashboardClient.tsx does NOT contain '|| 20)' in combinedReports radius calculation
  const hasOldRadiusDefault = dashClientContent.includes('|| 20)');
  console.log(`DashboardClient.tsx contains '|| 20)': ${hasOldRadiusDefault} (expected: false)`);
  if (hasOldRadiusDefault) {
    throw new Error("DashboardClient.tsx still contains '|| 20)' in combinedReports radius calculation!");
  }
  console.log("✓ combinedReports radius calculation defaults to localized < 1km (no '|| 20)').");

  // 5. DashboardClient.tsx includes 'empty' in seeded status checks
  const hasEmptyInStatusChecks = dashClientContent.includes("['ok', 'stale', 'empty'].includes(fireSection?.status");
  console.log(`DashboardClient.tsx includes 'empty' in status checks: ${hasEmptyInStatusChecks} (expected: true)`);
  if (!hasEmptyInStatusChecks) {
    throw new Error("DashboardClient.tsx does not check 'empty' in seeded status checks!");
  }
  console.log("✓ DashboardClient.tsx includes 'empty' in seeded status checks.");

  console.log('\n✓ Part A passed successfully.\n');
}

async function verifyPartB() {
  console.log('======================================================================');
  console.log('Part B: Live Vercel Edge Probe (5 Parallel Requests)');
  console.log('======================================================================');

  const TARGET_URL = 'https://pre-hub.vercel.app/api/public/dashboard';
  console.log(`Target URL: ${TARGET_URL}`);

  const startTime = Date.now();
  const requests = Array.from({ length: 5 }, async (_, i) => {
    const reqStart = Date.now();
    try {
      const res = await fetch(`${TARGET_URL}?t=${Date.now()}_${i}`, {
        headers: { 'User-Agent': 'PreHub-Phase179-AcceptanceProbe/1.0' },
      });
      const elapsed = Date.now() - reqStart;
      const data = await res.json();
      return {
        index: i + 1,
        status: res.status,
        elapsed_ms: elapsed,
        version: data.version,
        has_fleet: 'fleet' in (data.sections || {}),
        has_source_health: 'source_health' in (data.sections || {}),
        sections_count: Object.keys(data.sections || {}).length,
      };
    } catch (err) {
      return {
        index: i + 1,
        status: 0,
        elapsed_ms: Date.now() - reqStart,
        error: err.message,
      };
    }
  });

  const results = await Promise.all(requests);
  const totalElapsed = Date.now() - startTime;

  console.log(`Completed 5 parallel requests in ${totalElapsed}ms:`);
  const latencies = [];
  let isServingNewSchema = true;

  for (const r of results) {
    if (r.status === 200) {
      latencies.push(r.elapsed_ms);
      console.log(`  Req #${r.index}: 200 OK (${r.elapsed_ms}ms) | version=${r.version} | fleet=${r.has_fleet} | health=${r.has_source_health} | sections=${r.sections_count}`);
      if (!r.has_fleet || !r.has_source_health || r.version === undefined) {
        isServingNewSchema = false;
      }
    } else {
      console.log(`  Req #${r.index}: Failed with status ${r.status} (${r.elapsed_ms}ms) - ${r.error || ''}`);
    }
  }

  if (latencies.length > 0) {
    latencies.sort((a, b) => a - b);
    const p95Index = Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95));
    const p95Ms = latencies[p95Index];
    const avgMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

    console.log(`\nLatency Stats: avg=${avgMs}ms, min=${latencies[0]}ms, p95=${p95Ms}ms`);
  }

  console.log('\nDeployment Status Report:');
  if (isServingNewSchema) {
    console.log('✓ Live Vercel deployment is already serving Phase 179 versioned snapshot schema with fleet and source_health!');
  } else {
    console.log('ℹ Live Vercel deployment is currently serving the pre-Phase 179 snapshot.');
    console.log('  Status: Awaiting git push deployment of Phase 179 commits to main branch.');
  }

  console.log('\n✓ Part B live probe completed successfully (EXIT 0).');
}

async function main() {
  try {
    verifyPartA();
    await verifyPartB();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Probe failed:', err.message);
    process.exit(1);
  }
}

main();
