import { performance } from 'node:perf_hooks';

async function fetchWithTiming(url, options = {}) {
  const t0 = performance.now();
  let status = 0;
  let headers = {};
  let bodyLength = 0;
  let json = null;
  let error = null;

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PreHub-Auditor/1.0',
        ...(options.headers || {}),
      },
    });
    status = res.status;
    res.headers.forEach((val, key) => {
      headers[key.toLowerCase()] = val;
    });

    const contentType = headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      json = await res.json();
      bodyLength = JSON.stringify(json).length;
    } else {
      const text = await res.text();
      bodyLength = text.length;
    }
  } catch (err) {
    error = err.message;
  }
  const durationMs = performance.now() - t0;

  return {
    url,
    status,
    durationMs,
    headers,
    bodyLength,
    json,
    error,
  };
}

function calculateStats(latencies) {
  if (!latencies.length) return { min: 0, avg: 0, median: 0, p95: 0, max: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;

  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Idx];

  return {
    min: Number(min.toFixed(2)),
    avg: Number(avg.toFixed(2)),
    median: Number(median.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    max: Number(max.toFixed(2)),
  };
}

async function runBenchmark(url, label, concurrency = 5, rounds = 3) {
  console.log(`\n======================================================`);
  console.log(`Starting Benchmark: ${label}`);
  console.log(`Target: ${url}`);
  console.log(`Concurrency: ${concurrency} users | Rounds: ${rounds} (Total: ${concurrency * rounds} requests)`);
  console.log(`======================================================`);

  const allLatencies = [];
  const roundResults = [];

  for (let round = 1; round <= rounds; round++) {
    const roundStart = performance.now();
    const tasks = Array.from({ length: concurrency }, (_, userIdx) => {
      // Add timestamp param to test edge/cold/warm concurrency realistically
      const testUrl = url.includes('?') ? `${url}&_t=${Date.now()}_u${userIdx}` : `${url}?_t=${Date.now()}_u${userIdx}`;
      return fetchWithTiming(testUrl);
    });

    const responses = await Promise.all(tasks);
    const roundDuration = performance.now() - roundStart;
    const roundLats = responses.map((r) => r.durationMs);
    allLatencies.push(...roundLats);

    const roundStats = calculateStats(roundLats);
    const successCount = responses.filter((r) => r.status === 200).length;

    console.log(`Round ${round}: ${successCount}/${concurrency} success in ${roundDuration.toFixed(1)}ms | Min: ${roundStats.min}ms, Avg: ${roundStats.avg}ms, P50: ${roundStats.median}ms, P95: ${roundStats.p95}ms, Max: ${roundStats.max}ms`);

    roundResults.push({
      round,
      responses,
      stats: roundStats,
      successCount,
    });

    // Small delay between rounds
    await new Promise((r) => setTimeout(r, 200));
  }

  const overallStats = calculateStats(allLatencies);
  console.log(`------------------------------------------------------`);
  console.log(`OVERALL STATS for ${label}:`);
  console.log(`  Min:    ${overallStats.min} ms`);
  console.log(`  Avg:    ${overallStats.avg} ms`);
  console.log(`  Median: ${overallStats.median} ms`);
  console.log(`  P95:    ${overallStats.p95} ms`);
  console.log(`  Max:    ${overallStats.max} ms`);
  console.log(`  Target < 2000 ms: ${overallStats.p95 < 2000 ? 'PASS (PASSED)' : 'FAIL'}`);

  return {
    label,
    url,
    rounds: roundResults,
    overallStats,
    passTarget: overallStats.p95 < 2000,
  };
}

async function inspectLiveDashboard() {
  console.log(`\n======================================================`);
  console.log(`Deep Layer Inspection: https://pre-hub.vercel.app/api/public/dashboard`);
  console.log(`======================================================`);

  const res = await fetchWithTiming('https://pre-hub.vercel.app/api/public/dashboard');
  if (res.status !== 200 || !res.json) {
    throw new Error(`Failed to fetch dashboard: status ${res.status}, error: ${res.error}`);
  }

  const json = res.json;
  const s = json.sections || {};

  // 1. Version, computed_at, x-public-snapshot-state
  const version = json.version;
  const computedAt = json.computed_at;
  const snapshotStateHeader = res.headers['x-public-snapshot-state'] || 'N/A';
  const ageSeconds = computedAt ? (Date.now() - Date.parse(computedAt)) / 1000 : null;

  console.log(`1. Metadata:`);
  console.log(`   - version: ${version}`);
  console.log(`   - computed_at: ${computedAt} (${ageSeconds ? ageSeconds.toFixed(1) + 's ago' : 'null'})`);
  console.log(`   - X-Public-Snapshot-State: ${snapshotStateHeader}`);

  // 2. Fleet breakdown
  const fleetSection = s.fleet || {};
  const fleetData = fleetSection.data || {};
  const vehicles = fleetData.vehicles || (Array.isArray(fleetData) ? fleetData : []);
  const totalFleet = fleetData.count || vehicles.length;

  const modalityCounts = {};
  for (const v of vehicles) {
    const mod = v.modality || v.type || 'unknown';
    modalityCounts[mod] = (modalityCounts[mod] || 0) + 1;
  }
  const maritimeCount = (modalityCounts['maritime'] || 0) + (modalityCounts['vessel'] || 0) + (modalityCounts['ship'] || 0);
  const airCount = (modalityCounts['air'] || 0) + (modalityCounts['aircraft'] || 0) + (modalityCounts['plane'] || 0);
  const landCount = (modalityCounts['land'] || 0) + (modalityCounts['truck'] || 0);

  console.log(`2. Fleet:`);
  console.log(`   - Status: ${fleetSection.status}`);
  console.log(`   - Total count: ${totalFleet} (vehicles array length: ${vehicles.length})`);
  console.log(`   - Modal breakdown:`, modalityCounts);
  console.log(`     * Maritime (kapal): ${maritimeCount}`);
  console.log(`     * Air (pesawat): ${airCount}`);
  console.log(`     * Land (trucks): ${landCount}`);

  // 3. News
  const newsSection = s.news || {};
  const newsItems = Array.isArray(newsSection.data) ? newsSection.data : (Array.isArray(newsSection) ? newsSection : []);
  const forbiddenKeywords = ['pelatihan motor listrik', 'bagikan helm'];
  const matchingForbidden = [];
  let validCoordCount = 0;

  for (const item of newsItems) {
    const title = (item.title || '').toLowerCase();
    const snippet = (item.snippet || item.summary || item.content || '').toLowerCase();
    for (const kw of forbiddenKeywords) {
      if (title.includes(kw) || snippet.includes(kw)) {
        matchingForbidden.push({ id: item.id, title: item.title, kw });
      }
    }
    const lat = item.latitude !== undefined ? item.latitude : item.lat;
    const lon = item.longitude !== undefined ? item.longitude : item.lon;
    if (typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon)) {
      validCoordCount++;
    }
  }

  console.log(`3. News:`);
  console.log(`   - Status: ${newsSection.status}`);
  console.log(`   - Total count: ${newsItems.length}`);
  console.log(`   - Forbidden junk keywords matches: ${matchingForbidden.length} (expected 0)`);
  if (matchingForbidden.length > 0) {
    console.log(`     Matches:`, matchingForbidden);
  }
  console.log(`   - Items with valid coordinates (Fokus button ready): ${validCoordCount}/${newsItems.length} (${((validCoordCount/newsItems.length)*100).toFixed(1)}%)`);

  // 4. Fire Hotspots
  const fireSection = s.fire_hotspots || {};
  const fireData = fireSection.data || {};
  const hotspotsList = fireData.hotspots || [];
  const hotspotCount = fireData.count ?? hotspotsList.length;

  console.log(`4. Fire Hotspots:`);
  console.log(`   - Status: ${fireSection.status} (inner data status: ${fireData.status})`);
  console.log(`   - Hotspot count: ${hotspotCount} (array length: ${hotspotsList.length})`);
  console.log(`   - Reason: ${fireData.reason || 'none'}`);

  // 5. Official Warnings
  const warnSection = s.official_warnings || {};
  const warningsList = Array.isArray(warnSection.data) ? warnSection.data : (warnSection.data?.items || []);
  console.log(`5. Official Warnings (Waspada Dini):`);
  console.log(`   - Status: ${warnSection.status}`);
  console.log(`   - Warning count: ${warningsList.length}`);
  if (warningsList.length > 0) {
    console.log(`   - Sample warning titles:`, warningsList.slice(0, 3).map((w) => w.title || w.headline));
  }

  // 6. Weather summary & weather spatial polygons
  const weatherSummary = s.weather_summary || {};
  const weatherPolys = s.weather_spatial_polygons || {};
  const weatherPolyFeatures = weatherPolys.data?.features || [];
  const cuacaStationsCount = weatherSummary.data?.cuaca?.count ?? (Array.isArray(weatherSummary.data) ? weatherSummary.data.length : 'N/A');

  console.log(`6. Weather:`);
  console.log(`   - weather_summary status: ${weatherSummary.status}`);
  console.log(`   - weather_summary station count: ${cuacaStationsCount}`);
  console.log(`   - weather_spatial_polygons status: ${weatherPolys.status}`);
  console.log(`   - weather_spatial_polygons count: ${weatherPolyFeatures.length}`);

  // 7. Traffic Flow Segments
  const trafficSection = s.traffic_flow_segments || {};
  const trafficData = trafficSection.data || {};
  const segments = Array.isArray(trafficData) ? trafficData : (trafficData.segments || []);

  let malaysiaSegments = 0;
  const vertexCounts = [];

  for (const seg of segments) {
    const lat = seg.lat ?? seg.latitude;
    const lon = seg.lon ?? seg.longitude;
    if (lat > 1.2 && lon > 100.15) {
      malaysiaSegments++;
    }
    const coords = seg.geometry?.coordinates || [];
    if (coords.length > 0) {
      vertexCounts.push(coords.length);
    }
  }

  const vStats = calculateStats(vertexCounts);
  console.log(`7. Traffic Flow Segments (TomTom Sumatra):`);
  console.log(`   - Status: ${trafficSection.status}`);
  console.log(`   - Segment count: ${segments.length}`);
  console.log(`   - Malaysia boundary violation segments (lat > 1.2 && lon > 100.15): ${malaysiaSegments} (expected 0)`);
  console.log(`   - Vertex count stats on polylines: min=${vStats.min}, avg=${vStats.avg}, max=${vStats.max}, median=${vStats.median}`);

  // 8. Disaster Reports & Incidents
  const disasterReports = s.disaster_reports || {};
  const disasterList = Array.isArray(disasterReports.data) ? disasterReports.data : [];

  const incidents = s.incidents || {};
  const incidentList = Array.isArray(incidents.data) ? incidents.data : [];

  // Check for hardcoded 20-35km radius circles
  const suspiciousCircles = [];
  for (const item of [...disasterList, ...incidentList]) {
    const radius = item.radius_km || item.radius || item.radiusKm;
    if (radius >= 20 && radius <= 35) {
      suspiciousCircles.push({ id: item.id, title: item.title, radius });
    }
  }

  console.log(`8. Disaster Reports & Incidents:`);
  console.log(`   - disaster_reports count: ${disasterList.length} (status: ${disasterReports.status})`);
  console.log(`   - incidents count: ${incidentList.length} (status: ${incidents.status})`);
  console.log(`   - Hardcoded 20-35km circles detected: ${suspiciousCircles.length} (expected 0)`);
  if (suspiciousCircles.length > 0) {
    console.log(`     Suspicious circles:`, suspiciousCircles);
  }

  // 9. Source health
  const sourceHealth = s.source_health || {};
  const healthData = sourceHealth.data || {};
  console.log(`9. Source Health:`);
  console.log(`   - Status: ${sourceHealth.status}`);
  console.log(`   - Source breakdown:`);
  for (const [k, v] of Object.entries(healthData)) {
    if (k === 'sources' && Array.isArray(v)) {
      console.log(`     * Detailed sources (${v.length}):`);
      for (const src of v) {
        console.log(`       - ${src.name}: ${src.status}`);
      }
    } else if (typeof v === 'object' && v !== null && v.status) {
      console.log(`     * ${k}: ${v.status} (age: ${v.age_seconds ?? 'null'}s, ttl: ${v.ttl_seconds}s)`);
    }
  }

  return {
    metadata: { version, computedAt, snapshotStateHeader, ageSeconds },
    fleet: { status: fleetSection.status, total: totalFleet, modalityCounts, maritimeCount, airCount, landCount },
    news: { status: newsSection.status, total: newsItems.length, forbiddenMatches: matchingForbidden.length, validCoordCount },
    fireHotspots: { status: fireSection.status, count: hotspotCount, reason: fireData.reason },
    officialWarnings: { status: warnSection.status, count: warningsList.length },
    weather: { summaryStatus: weatherSummary.status, stationCount: cuacaStationsCount, polysStatus: weatherPolys.status, polyCount: weatherPolyFeatures.length },
    traffic: { status: trafficSection.status, count: segments.length, malaysiaSegments, vertexStats: vStats },
    disasterAndIncidents: { disasterCount: disasterList.length, incidentCount: incidentList.length, suspiciousCircles: suspiciousCircles.length },
    sourceHealth: { status: sourceHealth.status, data: healthData },
  };
}

async function main() {
  try {
    const benchDashboard = await runBenchmark('https://pre-hub.vercel.app/api/public/dashboard', 'API Public Dashboard', 5, 3);
    const benchHtml = await runBenchmark('https://pre-hub.vercel.app/', 'HTML Root Document', 5, 3);
    const layerAudit = await inspectLiveDashboard();

    const output = {
      timestamp: new Date().toISOString(),
      benchmarks: {
        dashboard: benchDashboard.overallStats,
        htmlRoot: benchHtml.overallStats,
        dashboardPass: benchDashboard.passTarget,
        htmlPass: benchHtml.passTarget,
      },
      layerAudit,
    };

    console.log(`\n======================================================`);
    console.log(`AUDIT EXECUTION COMPLETE`);
    console.log(`Dashboard < 2000ms: ${benchDashboard.passTarget ? 'YES' : 'NO'}`);
    console.log(`HTML Root < 2000ms: ${benchHtml.passTarget ? 'YES' : 'NO'}`);
    console.log(`======================================================`);
  } catch (err) {
    console.error('Audit failed with error:', err);
    process.exit(1);
  }
}

main();
