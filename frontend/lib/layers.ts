import { ScatterplotLayer, PathLayer, PolygonLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { densifyPath, type LonLat } from './pathDensifier';
import type { FireHotspot, MaritimeVector, DisasterZone, IncidentSummary, RouteRecommendation } from './types';

/** Severity → RGBA color */
function severityColor(severity: string, alpha = 200): [number, number, number, number] {
  switch (severity) {
    case 'critical': return [239, 68, 68, alpha];
    case 'high':     return [249, 115, 22, alpha];
    case 'medium':   return [234, 179, 8, alpha];
    default:         return [34, 197, 94, alpha];
  }
}

export function buildCrisisPinsLayer(
  incidents: IncidentSummary[],
  selectedId: string | null,
  onClick: (id: string) => void
) {
  return new ScatterplotLayer({
    id: 'crisis-pins',
    slot: 'top',
    data: incidents.filter((i) => i.lat != null && i.lon != null),
    positionFormat: 'XYZ',
    getPosition: (d) => [d.lon!, d.lat!, 0],
    billboard: true,
    antialiasing: true,
    getRadius: (d) => {
      const base = d.severity === 'critical' ? 2000 : d.severity === 'high' ? 1500 : 1000;
      return d.id === selectedId ? base * 1.5 : base;
    },
    radiusMinPixels: 8,
    radiusMaxPixels: 36,
    getFillColor: (d) => severityColor(d.severity),
    getLineColor: (d) => d.id === selectedId ? [255, 255, 255, 240] : [255, 255, 255, 100],
    stroked: true,
    lineWidthMinPixels: 2,
    pickable: true,
    onClick: (info) => info.object && onClick((info.object as IncidentSummary).id),
    updateTriggers: { getRadius: selectedId, getLineColor: selectedId },
  });
}

export function buildRoutePathsLayer(routes: RouteRecommendation[], activeIdx: number | null) {
  const targetIdx = activeIdx ?? 0;
  return new PathLayer({
    id: 'route-paths',
    slot: 'top',
    data: routes.map((r, i) => {
      const rawWaypoints: LonLat[] = r.waypoints.map((wp) => [wp.lon, wp.lat]);
      const densified = densifyPath(rawWaypoints, 30); // densify every 30km for smooth arcs
      return {
        path: densified,
        isActive: i === targetIdx,
        riskScore: r.risk_score,
      };
    }),
    getPath: (d) => d.path,
    getColor: (d) =>
      d.isActive
        ? [34, 211, 238, 255]          // cyan — selected route
        : [249, 115, 22, 180],         // orange — alternative route
    getWidth: (d) => (d.isActive ? 6 : 3),
    widthMinPixels: 3,
    widthMaxPixels: 12,
    capRounded: true,
    jointRounded: true,
    billboard: true,
    wrapLongitude: true,
    pickable: true,
    updateTriggers: { getColor: activeIdx, getWidth: activeIdx },
  });
}

export function buildFireHeatmapLayer(hotspots: FireHotspot[]) {
  return new HeatmapLayer({
    id: 'fire-heatmap',
    slot: 'bottom',
    data: hotspots,
    getPosition: (d) => d.coordinates,
    getWeight: (d) => d.confidence / 100,
    radiusPixels: 50,
    intensity: 1.2,
    threshold: 0.03,
    colorRange: [
      [0, 0, 255, 0],
      [255, 140, 0, 180],
      [255, 50, 0, 255],
    ],
    pickable: false,
  });
}

export function buildDisasterZonesLayer(
  zones: DisasterZone[],
  onClick: (zone: DisasterZone) => void
) {
  return new PolygonLayer({
    id: 'disaster-zones',
    slot: 'bottom',
    data: zones,
    getPolygon: (d) => d.polygon,
    getFillColor: (d) => {
      const r = Math.round(255 * d.risk);
      return [r, Math.round(255 * (1 - d.risk * 0.7)), 0, 70];
    },
    getLineColor: [255, 100, 0, 200],
    getLineWidth: 2,
    lineWidthMinPixels: 1,
    extruded: false,
    filled: true,
    stroked: true,
    pickable: true,
    onClick: (info) => info.object && onClick(info.object as DisasterZone),
  });
}

export function buildMaritimeLayer(vectors: MaritimeVector[]) {
  return new PathLayer({
    id: 'maritime-paths',
    slot: 'middle',
    data: vectors.map((m) => ({
      ...m,
      path: densifyPath(m.path as LonLat[], 25),
    })),
    getPath: (d) => d.path,
    getColor: [34, 211, 238, 120],   // translucent cyan
    getWidth: 2,
    widthMinPixels: 1,
    capRounded: true,
    jointRounded: true,
    wrapLongitude: true,
    pickable: false,
    dashArray: [4, 2],               // dashed line for vessels
  });
}
