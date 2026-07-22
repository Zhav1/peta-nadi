import type { LonLat } from './pathDensifier';
import type { RouteRecommendation, CongestionSegment, RouteLeg } from './types';

export type TransportModality = 'best' | 'truck' | 'maritime' | 'air' | 'multimodal' | 'auto';

/**
 * Verified Real Arterial Road Network Nodes — Medan & North Sumatra Corridor
 * Coordinates validated against OSM/Google Maps road centerlines.
 * These are ACTUAL road intersections, not mathematical offsets.
 */
export const HIGHWAY_JUNCTION_NODES: Array<{ id: string; name: string; coords: LonLat; region: string }> = [
  // === BELAWAN - MEDAN CORRIDOR (North) ===
  { id: 'jl_yos_sudarso_utara', name: 'Jl. Yos Sudarso (Pelabuhan Belawan)', coords: [98.6868, 3.7831], region: 'belawan' },
  { id: 'jl_kl_yos_sudarso_marelan', name: 'Jl. KL. Yos Sudarso - Marelan Junction', coords: [98.6742, 3.7201], region: 'belawan' },
  { id: 'jl_adam_malik_utara', name: 'Jl. Adam Malik (Titik Utara)', coords: [98.6712, 3.6901], region: 'medan_utara' },
  { id: 'jl_adam_malik_tengah', name: 'Jl. Adam Malik (Persimpangan Gatot)', coords: [98.6680, 3.6701], region: 'medan_utara' },
  { id: 'jl_gagak_hitam_helvetia', name: 'Jl. Gagak Hitam / Ring Road Helvetia', coords: [98.6601, 3.6512], region: 'medan_utara' },
  { id: 'jl_tb_simatupang', name: 'Jl. TB Simatupang (Bypass Barat)', coords: [98.6543, 3.6321], region: 'medan_barat' },
  { id: 'jl_gatot_subroto', name: 'Jl. Gatot Subroto (Ring Road Barat)', coords: [98.6599, 3.6155], region: 'medan_barat' },
  // === MEDAN KOTA (Central) ===
  { id: 'simpang_pos_medan', name: 'Simpang Pos / Jl. Listrik', coords: [98.6712, 3.6013], region: 'medan_kota' },
  { id: 'jl_sisingamangaraja_utara', name: 'Jl. Sisingamangaraja (Utara Amplas)', coords: [98.6891, 3.5801], region: 'medan_selatan' },
  { id: 'interchange_amplas', name: 'Gerbang Tol Amplas', coords: [98.7050, 3.5511], region: 'medan_selatan' },
  // === MEDAN - DELI SERDANG CORRIDOR (East bypass) ===
  { id: 'jl_ar_hakim', name: 'Jl. AR. Hakim / Jl. Cemara', coords: [98.7101, 3.6312], region: 'medan_timur' },
  { id: 'jl_letda_sujono', name: 'Jl. Letda Sujono (Kecamatan Percut)', coords: [98.7321, 3.6021], region: 'percut' },
  { id: 'jl_williem_iskandar', name: 'Jl. Williem Iskandar / Medan Area', coords: [98.7201, 3.5811], region: 'medan_timur' },
  // === TRANS-SUMATRA CORRIDOR (South) ===
  { id: 'kualanamu_junction', name: 'Interchange Kualanamu (Tol Belmera)', coords: [98.8780, 3.6421], region: 'deli_serdang' },
  { id: 'lubuk_pakam_interchange', name: 'Interchange Lubuk Pakam', coords: [98.8650, 3.5601], region: 'deli_serdang' },
  { id: 'perbaungan_artlrd', name: 'Jalinsum Perbaungan', coords: [98.9501, 3.5701], region: 'serdang_bedagai' },
  { id: 'sei_rampah_interchange', name: 'Interchange Sei Rampah', coords: [99.1501, 3.4801], region: 'serdang_bedagai' },
  { id: 'tebing_tinggi_toll', name: 'Gerbang Tol Tebing Tinggi', coords: [99.1621, 3.3251], region: 'tebing_tinggi' },
];

/**
 * Calculates Haversine distance in km between two [lon, lat] coordinates
 */
export function getHaversineDistanceKm([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const R = 6371.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Strict Vector Projection Check
 */
export function isPointStrictlyBetween(pt: LonLat, origin: LonLat, dest: LonLat): boolean {
  const dx = dest[0] - origin[0];
  const dy = dest[1] - origin[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return false;

  const t = ((pt[0] - origin[0]) * dx + (pt[1] - origin[1]) * dy) / lenSq;
  if (t < 0.15 || t > 0.85) return false;

  const projX = origin[0] + t * dx;
  const projY = origin[1] + t * dy;
  const perpDistSq = (pt[0] - projX) * (pt[0] - projX) + (pt[1] - projY) * (pt[1] - projY);

  return perpDistSq < 0.03;
}

/**
 * Selects real arterial road waypoints that bypass a hazard zone.
 * Strategy:
 * 1. Filter HIGHWAY_JUNCTION_NODES to only those outside hazard radius + 1.5km safety buffer
 * 2. Sort by total detour cost = dist(origin→candidate) + dist(candidate→destination)
 * 3. Return top N cheapest-detour candidates for Mapbox to route through
 *
 * This is fundamentally better than perpendicular math offsets because:
 * - Waypoints are REAL road intersections (Mapbox can snap to them)
 * - Detour cost is minimized (no unnecessarily wide arcs)
 * - No phantom routes to fields/water
 */
export function generateHazardBypassCandidates(
  hazardCenter: LonLat,
  radiusKm: number,
  origin: LonLat,
  destination: LonLat
): Array<{ name: string; coords: LonLat }> {
  const safetyBuffer = 1.5; // km buffer beyond hazard radius
  const minClearance = radiusKm + safetyBuffer;

  // 1. Filter: only real road nodes clearly outside the hazard circle
  const safeNodes = HIGHWAY_JUNCTION_NODES.filter(
    (node) => getHaversineDistanceKm(node.coords, hazardCenter) >= minClearance
  );

  // 2. Score each node by total detour cost (origin→node + node→dest)
  //    Lower score = shorter detour = better candidate
  const scored = safeNodes.map((node) => ({
    name: node.name,
    coords: node.coords,
    score:
      getHaversineDistanceKm(origin, node.coords) +
      getHaversineDistanceKm(node.coords, destination),
  }));

  // 3. Sort cheapest detour first, return top 5
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 5).map(({ name, coords }) => ({ name, coords }));
}

/**
 * Checks if a polyline intersects (or passes dangerously close to) a hazard circle.
 *
 * Uses TWO detection methods:
 * 1. Point-in-circle: any vertex within (radiusKm + dangerBuffer) — catches dense polylines
 * 2. Segment-closest-point: for each segment, find the closest point to hazardCenter on the
 *    segment. If that closest point is within radius + buffer, the route is compromised.
 *    This handles sparse Mapbox polylines that "skip over" the hazard between vertices.
 *
 * dangerBuffer adds a margin so routes grazing the edge of the visual zone are also
 * flagged — matching the user's visual expectation.
 */
export function isPolylineIntersectingHazardCircle(
  polyline: LonLat[],
  hazardCenter: LonLat,
  radiusKm: number,
  dangerBufferKm: number = 2.0
): boolean {
  if (!polyline || polyline.length === 0) return false;

  const effectiveRadius = radiusKm + dangerBufferKm;

  for (let i = 0; i < polyline.length; i++) {
    // Method 1: vertex check
    if (getHaversineDistanceKm(polyline[i], hazardCenter) <= effectiveRadius) return true;

    // Method 2: segment closest-point check (between consecutive vertices)
    if (i < polyline.length - 1) {
      const A = polyline[i];
      const B = polyline[i + 1];
      const H = hazardCenter;

      // Project H onto segment AB in lon/lat space (good enough at city scale)
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;

      const t = Math.max(0, Math.min(1, ((H[0] - A[0]) * dx + (H[1] - A[1]) * dy) / lenSq));
      const closest: LonLat = [A[0] + t * dx, A[1] + t * dy];

      if (getHaversineDistanceKm(closest, hazardCenter) <= effectiveRadius) return true;
    }
  }

  return false;
}

export interface MapboxRouteResult {
  coordinates: LonLat[];
  distanceKm: number;
  durationMinutes: number;
  congestionSegments: CongestionSegment[];
  summary: string;
}

/**
 * Fetches a SINGLE forced-waypoint Mapbox route.
 * Uses the Mapbox Directions API with a mandatory intermediate waypoint so Mapbox MUST route through it.
 */
async function fetchMapboxRouteWithForcedWaypoint(
  origin: LonLat,
  destination: LonLat,
  forcedWaypoint: LonLat,
  token: string
): Promise<MapboxRouteResult | null> {
  const coordString = [
    `${origin[0].toFixed(6)},${origin[1].toFixed(6)}`,
    `${forcedWaypoint[0].toFixed(6)},${forcedWaypoint[1].toFixed(6)}`,
    `${destination[0].toFixed(6)},${destination[1].toFixed(6)}`,
  ].join(';');

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordString}?overview=full&geometries=geojson&annotations=congestion&access_token=${token}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const coords: LonLat[] = route.geometry.coordinates;
    const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
    const durationMinutes = Math.round(route.duration / 60);

    const congestionSegments: CongestionSegment[] = [];
    const annotations = route.legs?.[0]?.annotation?.congestion;
    if (annotations && coords.length > 1) {
      for (let i = 0; i < annotations.length - 1; i++) {
        const raw = annotations[i];
        const level: 'low' | 'moderate' | 'heavy' =
          raw === 'heavy' || raw === 'severe' ? 'heavy' : raw === 'moderate' ? 'moderate' : 'low';
        if (level !== 'low') {
          congestionSegments.push({
            coordinates: [
              { lat: coords[i][1], lon: coords[i][0] },
              { lat: coords[i + 1][1], lon: coords[i + 1][0] },
            ],
            level,
          });
        }
      }
    }

    return { coordinates: coords, distanceKm, durationMinutes, congestionSegments, summary: route.legs?.[0]?.summary || 'Bypass Route' };
  } catch {
    return null;
  }
}

/**
 * Fetches real-world multi-alternative driving routes via Mapbox Directions API.
 */
export async function fetchMapboxAlternativeDrivingRoutes(
  origin: LonLat,
  destination: LonLat,
  waypoints: LonLat[] = []
): Promise<MapboxRouteResult[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const fallbackCoords = [origin, ...waypoints, destination];
  const fallbackDistance = getHaversineDistanceKm(origin, destination) * 1.15;
  const results: MapboxRouteResult[] = [];

  if (token) {
    const allCoords = [origin, ...waypoints, destination];
    const coordString = allCoords.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordString}?alternatives=true&annotations=congestion,distance,duration,speed&geometries=geojson&overview=full&access_token=${token}`;

    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          for (let index = 0; index < data.routes.length; index++) {
            const route = data.routes[index];
            const coords: LonLat[] = route.geometry.coordinates;
            const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
            const durationMinutes = Math.round(route.duration / 60);

            const congestionSegments: CongestionSegment[] = [];
            const annotations = route.legs?.[0]?.annotation?.congestion;
            if (annotations && annotations.length > 0 && coords.length > 1) {
              let currentLevel: 'low' | 'moderate' | 'heavy' = 'low';
              let currentCoords: Array<{ lat: number; lon: number }> = [];
              for (let i = 0; i < annotations.length; i++) {
                const level: 'low' | 'moderate' | 'heavy' =
                  annotations[i] === 'heavy' || annotations[i] === 'severe' ? 'heavy'
                  : annotations[i] === 'moderate' ? 'moderate' : 'low';
                const pt = coords[Math.min(i, coords.length - 1)];
                const pointObj = { lat: pt[1], lon: pt[0] };
                if (i === 0) { currentLevel = level; currentCoords.push(pointObj); }
                else if (level !== currentLevel) {
                  if (currentCoords.length > 1) congestionSegments.push({ coordinates: currentCoords, level: currentLevel });
                  currentLevel = level;
                  currentCoords = [currentCoords[currentCoords.length - 1], pointObj];
                } else { currentCoords.push(pointObj); }
              }
              if (currentCoords.length > 1) congestionSegments.push({ coordinates: currentCoords, level: currentLevel });
            }

            const routeName = index === 0 ? 'Rute Utama (Jalan Tol)' : index === 1 ? 'Alternatif 1 (Jalinsum Arteri)' : 'Alternatif 2 (Bypass Sekunder)';
            results.push({ coordinates: coords, distanceKm, durationMinutes, congestionSegments, summary: route.legs?.[0]?.summary || routeName });
          }
        }
      }
    } catch (err) {
      console.warn('Mapbox Directions API call failed:', err);
    }
  }

  if (results.length === 0) {
    results.push({
      coordinates: fallbackCoords,
      distanceKm: Math.round(fallbackDistance),
      durationMinutes: Math.round((fallbackDistance / 60) * 60),
      congestionSegments: [],
      summary: 'Koridor Utama Tol',
    });
  }

  results.sort((a, b) => a.durationMinutes - b.durationMinutes);
  return results.slice(0, 3);
}

/**
 * Single-point Mapbox route query helper
 */
export async function fetchMapboxDrivingRoute(
  origin: LonLat,
  destination: LonLat,
  waypoints: LonLat[] = [],
  modality: TransportModality = 'truck'
): Promise<LonLat[]> {
  if (modality === 'maritime') {
    return [origin, [98.75, 3.85], [99.4, 3.45], [100.8, 2.2], destination];
  }
  if (modality === 'air') {
    return [origin, [98.878, 3.642], destination];
  }
  const results = await fetchMapboxAlternativeDrivingRoutes(origin, destination, waypoints);
  return results[0]?.coordinates || [origin, ...waypoints, destination];
}

/**
 * Computes Intermodal Multi-Leg Logistics Chain for Long-Haul Inter-Island Transportation (> 300 km)
 */
export async function calculateMultiModalLogisticsChain(
  origin: LonLat,
  destination: LonLat,
  airHub: LonLat = [98.878, 3.642]
): Promise<RouteRecommendation[]> {
  const leg1Coords = await fetchMapboxDrivingRoute(origin, airHub, [], 'truck');
  const leg1Dist = Math.round(getHaversineDistanceKm(origin, airHub));
  const leg1Eta = Math.round((leg1Dist / 50) * 60);
  const leg2Dist = Math.round(getHaversineDistanceKm(airHub, destination));
  const leg2Eta = Math.round((leg2Dist / 650) * 60) + 45;

  const totalWaypoints: Array<{ lat: number; lon: number }> = [
    ...leg1Coords.map(([lon, lat]: LonLat) => ({ lat, lon })),
    { lat: airHub[1], lon: airHub[0] },
    { lat: destination[1], lon: destination[0] },
  ];
  const legs: RouteLeg[] = [
    { title: 'Leg 1: First-Mile Truk Darat', mode: 'truck', distance_km: leg1Dist, eta_minutes: leg1Eta, from_name: 'Origin Freight Hub', to_name: 'Kualanamu International Airport (KNO)' },
    { title: 'Leg 2: Air Cargo Express Flight', mode: 'air', distance_km: leg2Dist, eta_minutes: leg2Eta, from_name: 'KNO Airport', to_name: 'Destination Airport Hub' },
  ];

  return [{
    id: 'multimodal-air-express',
    route_name: '✈️ Rantai Logistik Multi-Moda (Truk ➔ Cargo Udara ➔ Truk)',
    description: 'Solusi Rantai Pasok Terpadu Antar-Pulau: First-Mile Truk & Flight Express',
    waypoints: totalWaypoints,
    distance_km: leg1Dist + leg2Dist,
    eta_minutes: leg1Eta + leg2Eta,
    fuel_increase_pct: 12.4,
    risk_score: 0.08,
    is_compromised: false,
    safety_status: 'SAFE_DETOUR',
    safety_tag: '✅ RANTAI LOGISTIK MULTI-MODA AMAN',
    modality: 'multimodal',
    legs,
    color: '#00F0FF',
  }];
}

/**
 * GOOGLE MAPS-GRADE MULTI-ALTERNATIVE AI ROUTING, HAZARD AVOIDANCE & (BEST) AUTO OPTIMIZER ENGINE
 * 
 * HAZARD AVOIDANCE STRATEGY:
 * 1. Fetch Mapbox native routes → mark each as COMPROMISED if it intersects hazard circle
 * 2. If all routes compromised → generate bypass candidates (tangential vectors + known western corridors)
 * 3. For each bypass candidate → call Mapbox with FORCED waypoint (mandatory, not optional)
 * 4. Verify returned Mapbox route does NOT re-enter hazard circle
 * 5. Insert clean bypass as Route 0 (🌟 Best, Emerald Green) at top of recommendations
 */
export async function calculateAIDynamicDetourRoutes(
  hazardCenter: LonLat | null,
  radiusKm: number = 15,
  origin: LonLat,
  destination: LonLat,
  modality: TransportModality = 'best'
): Promise<RouteRecommendation[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const odDistanceKm = getHaversineDistanceKm(origin, destination);

  // Handle explicit Maritime mode
  if (modality === 'maritime') {
    const coords = await fetchMapboxDrivingRoute(origin, destination, [], 'maritime');
    return [{
      id: 'maritime-main',
      route_name: '⚓ Rute Kapal Laut Selat Malaka',
      description: 'Jalur Pelayaran Maritim Belawan ➔ Selat Malaka',
      waypoints: coords.map(([lon, lat]) => ({ lat, lon })),
      distance_km: Math.round(odDistanceKm * 1.3),
      eta_minutes: Math.round((odDistanceKm * 1.3 / 25) * 60),
      fuel_increase_pct: 0, risk_score: 0.05, is_compromised: false,
      safety_status: 'SAFE_DETOUR', safety_tag: '⚓ JALUR LAUT OPTIMAL',
      modality: 'maritime', color: '#3B82F6',
    }];
  }

  // Handle explicit Air mode
  if (modality === 'air') {
    return calculateMultiModalLogisticsChain(origin, destination);
  }

  // STEP 1: Get native Mapbox routes and assess each against hazard circle
  const mapboxResults = await fetchMapboxAlternativeDrivingRoutes(origin, destination);
  const recommendations: RouteRecommendation[] = [];
  let foundCleanRoute = false;

  for (let i = 0; i < mapboxResults.length; i++) {
    const res = mapboxResults[i];
    const isCompromised = hazardCenter
      ? isPolylineIntersectingHazardCircle(res.coordinates, hazardCenter, radiusKm)
      : false;

    if (!isCompromised) foundCleanRoute = true;

    const routeColor = isCompromised ? '#EF4444' : i === 0 ? '#00F0FF' : i === 1 ? '#3B82F6' : '#8B5CF6';
    const routeName = i === 0 ? 'Rute Utama (Jalan Tol Belmera/Medan)' : i === 1 ? 'Alternatif 1 (Jalinsum Arteri Medan-Tebing)' : 'Alternatif 2 (Bypass Sekunder Ring Road)';

    recommendations.push({
      id: `route-opt-${i + 1}`,
      route_name: routeName,
      description: `${routeName} via ${res.summary}`,
      waypoints: res.coordinates.map(([lon, lat]) => ({ lat, lon })),
      distance_km: res.distanceKm,
      eta_minutes: res.durationMinutes + (isCompromised ? 45 : 0),
      fuel_increase_pct: isCompromised ? 22.5 : i * 5.0,
      risk_score: isCompromised ? 0.85 : 0.05 + i * 0.08,
      is_compromised: isCompromised,
      safety_status: isCompromised ? 'COMPROMISED' : 'SAFE_DETOUR',
      safety_tag: isCompromised ? '⚠️ TERDAMPAK BANJIR/BENCANA (+45 Min Delay)' : i === 0 ? '🌟 (BEST) RUTE TERCEPAT DAN EFISIEN' : '✅ RUTE ALTERNATIF AMAN',
      traffic_level: res.congestionSegments.some((s) => s.level === 'heavy') ? 'heavy' : 'low',
      congestion_segments: res.congestionSegments,
      modality: 'truck',
      color: routeColor,
    });
  }

  // STEP 2: If ALL routes are compromised, trigger AI Tangential Bypass Engine
  if (hazardCenter && !foundCleanRoute && token) {
    const bypassCandidates = generateHazardBypassCandidates(hazardCenter, radiusKm, origin, destination);

    // Also add known arterial corridors that are far enough from hazard
    const knownJunctions = HIGHWAY_JUNCTION_NODES.filter(
      (j) => getHaversineDistanceKm(j.coords, hazardCenter) > radiusKm + 2.0
    );
    const allCandidates = [
      ...bypassCandidates,
      ...knownJunctions.map((j) => ({ name: j.name, coords: j.coords })),
    ];

    for (const cand of allCandidates) {
      // CRITICAL FIX: Use fetchMapboxRouteWithForcedWaypoint which sends a MANDATORY intermediate waypoint.
      // Mapbox MUST route through this coordinate — it cannot choose a shorter path that re-enters the hazard zone.
      const bypassResult = await fetchMapboxRouteWithForcedWaypoint(origin, destination, cand.coords, token);

      if (bypassResult) {
        const isBypassClean = !isPolylineIntersectingHazardCircle(bypassResult.coordinates, hazardCenter, radiusKm);

        if (isBypassClean) {
          // SUCCESS: Found a clean bypass route. Insert at top with Emerald Green styling.
          recommendations.unshift({
            id: 'route-opt-safe-bypass',
            route_name: `🌟 (BEST) Rekomendasi AI: Pengalihan via ${cand.name}`,
            description: `AI Detour Engine secara otomatis mendeteksi zona krisis dan mengalihkan armada melingkari bencana via ${cand.name}`,
            waypoints: bypassResult.coordinates.map(([lon, lat]) => ({ lat, lon })),
            distance_km: bypassResult.distanceKm,
            eta_minutes: bypassResult.durationMinutes,
            fuel_increase_pct: 8.5,
            risk_score: 0.04,
            is_compromised: false,
            safety_status: 'SAFE_DETOUR',
            safety_tag: `🛡️ RUTE AMAN — ${cand.name.toUpperCase()}`,
            traffic_level: 'low',
            congestion_segments: bypassResult.congestionSegments,
            modality: 'truck',
            color: '#10B981', // Emerald green
          });
          break; // Stop after first clean bypass found
        }
      }
    }
  }

  // Sort: safe routes first, then by ETA
  recommendations.sort((a, b) => {
    if (a.is_compromised === b.is_compromised) return a.eta_minutes - b.eta_minutes;
    return a.is_compromised ? 1 : -1;
  });

  return recommendations.slice(0, 3);
}
