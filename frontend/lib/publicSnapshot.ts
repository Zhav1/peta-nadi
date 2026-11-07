import type {
  DashboardBootstrapResponse,
  DashboardSection,
  DashboardSectionStatus,
} from '@/lib/types';

export const PUBLIC_DASHBOARD_SNAPSHOT_KEY = 'sumatra_mainland';
export const SUMATRA_MAINLAND_PROVINCES = [
  'Aceh',
  'Sumatera Utara',
  'Sumatera Barat',
  'Riau',
  'Jambi',
  'Sumatera Selatan',
  'Bengkulu',
  'Lampung',
] as const;

export const PUBLIC_SECTION_NAMES = [
  'incidents',
  'news',
  'news_market_regime',
  'fire_hotspots',
  'weather_summary',
  'weather_spatial_polygons',
  'weather_advisory_polygons',
  'corridor_context',
  'corridor_contexts',
  'traffic_flow_segments',
  'disaster_reports',
  'official_warnings',
  'fleet',
  'source_health',
] as const;

export type PublicSectionName = typeof PUBLIC_SECTION_NAMES[number];

export interface PublicDashboardSnapshotEnvelope extends DashboardBootstrapResponse {
  version?: number;
}

function unknownSection(): DashboardSection<unknown> {
  return { status: 'unknown', data: null, error: 'Snapshot belum memiliki data untuk bagian ini.' };
}

export function createUnknownPublicSnapshot(): PublicDashboardSnapshotEnvelope {
  return {
    schema_version: 1,
    snapshot_key: PUBLIC_DASHBOARD_SNAPSHOT_KEY,
    computed_at: null,
    stale: false,
    shadow_mode: true,
    role: 'GUEST',
    company_id: null,
    modality: null,
    version: 1,
    source_freshness: {},
    coverage: {
      mainland_provinces: [...SUMATRA_MAINLAND_PROVINCES],
      province_coverage_status: 'unknown',
      road_coverage_status: 'unknown',
    },
    sections: Object.fromEntries(PUBLIC_SECTION_NAMES.map((name) => [name, unknownSection()])),
  };
}

const SECTION_STATUSES = new Set<string>([
  'ok',
  'stale',
  'degraded',
  'timeout',
  'unknown',
  'empty',
]);

export function parseLocationCoords(value: unknown): { lat: number; lon: number } | null {
  if (!value) return null;
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (obj.type === 'Point' && Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
      const lon = Number(obj.coordinates[0]);
      const lat = Number(obj.coordinates[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) return { lat, lon };
    }
    return null;
  }
  const str = String(value).trim();
  if (!str) return null;

  // 1. WKT: POINT(lon lat)
  const wktMatch = str.match(/POINT\s*\(\s*([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s*\)/i);
  if (wktMatch) {
    const lon = Number(wktMatch[1]);
    const lat = Number(wktMatch[2]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) return { lat, lon };
  }

  // 2. GeoJSON serialized string
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsed = JSON.parse(str);
      if (parsed?.type === 'Point' && Array.isArray(parsed.coordinates) && parsed.coordinates.length >= 2) {
        const lon = Number(parsed.coordinates[0]);
        const lat = Number(parsed.coordinates[1]);
        if (Number.isFinite(lon) && Number.isFinite(lat)) return { lat, lon };
      }
    } catch {}
  }

  // 3. PostGIS EWKB / WKB hex (e.g. 0101000020E6100000...)
  let hex = str;
  if (hex.startsWith('0x') || hex.startsWith('0X')) hex = hex.slice(2);
  if (hex.length >= 42 && hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex)) {
    try {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const byteOrder = view.getUint8(0);
      if (byteOrder === 0 || byteOrder === 1) {
        const littleEndian = byteOrder === 1;
        const geomType = view.getUint32(1, littleEndian);
        const baseType = geomType & 0x0fffffff;
        if (baseType === 1) { // Point type
          let offset = 5;
          if ((geomType & 0x20000000) !== 0) {
            // PostGIS SRID flag present
            offset += 4;
          }
          if (view.byteLength >= offset + 16) {
            const lon = view.getFloat64(offset, littleEndian);
            const lat = view.getFloat64(offset + 8, littleEndian);
            if (Number.isFinite(lon) && Number.isFinite(lat)) return { lat, lon };
          }
        }
      }
    } catch {}
  }

  return null;
}

export function normalizeIncidentItem(item: unknown, index: number): Record<string, unknown> {
  const raw = (item && typeof item === 'object') ? { ...(item as Record<string, unknown>) } : {};

  // Ensure deterministic, non-empty id
  const rawId = raw.id ?? raw.incident_id ?? raw.crisis_id ?? raw.event_id;
  let id = rawId != null ? String(rawId).trim() : '';
  if (!id) {
    const titlePart = String(raw.title || raw.name || 'incident').slice(0, 20);
    const timePart = String(raw.created_at || raw.observed_at || raw.updated_at || index);
    id = `incident-${titlePart}-${timePart}`.replace(/\s+/g, '-').toLowerCase();
  }
  raw.id = id;
  if (!raw.incident_id) {
    raw.incident_id = id;
  }

  // Ensure lat and lon
  let lat = raw.lat != null && raw.lat !== '' ? Number(raw.lat) : (raw.latitude != null && raw.latitude !== '' ? Number(raw.latitude) : null);
  let lon = raw.lon != null && raw.lon !== '' ? Number(raw.lon) : (raw.longitude != null && raw.longitude !== '' ? Number(raw.longitude) : (raw.lng != null && raw.lng !== '' ? Number(raw.lng) : null));

  if ((lat == null || !Number.isFinite(lat) || lon == null || !Number.isFinite(lon)) && raw.location) {
    const coords = parseLocationCoords(raw.location);
    if (coords) {
      if (lat == null || !Number.isFinite(lat)) lat = coords.lat;
      if (lon == null || !Number.isFinite(lon)) lon = coords.lon;
    }
  }

  if (Number.isFinite(lat)) {
    raw.lat = lat as number;
    raw.latitude = lat as number;
  }
  if (Number.isFinite(lon)) {
    raw.lon = lon as number;
    raw.longitude = lon as number;
  }

  return raw;
}

export function normalizeIncidentsSectionData(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((item, idx) => normalizeIncidentItem(item, idx));
  }
  if (data && typeof data === 'object') {
    const dataObj = { ...(data as Record<string, unknown>) };
    if (Array.isArray(dataObj.items)) {
      dataObj.items = dataObj.items.map((item, idx) => normalizeIncidentItem(item, idx));
    }
    if (Array.isArray(dataObj.data)) {
      dataObj.data = dataObj.data.map((item, idx) => normalizeIncidentItem(item, idx));
    }
    return dataObj;
  }
  return data;
}

export function normalizePublicSnapshot(value: unknown): PublicDashboardSnapshotEnvelope {
  if (!value || typeof value !== 'object') return createUnknownPublicSnapshot();
  const raw = value as Record<string, unknown>;
  if (raw.schema_version !== 1 || raw.snapshot_key !== PUBLIC_DASHBOARD_SNAPSHOT_KEY) {
    return createUnknownPublicSnapshot();
  }
  const rawSections = raw.sections && typeof raw.sections === 'object'
    ? raw.sections as Record<string, unknown>
    : {};
  const sections: Record<string, DashboardSection<unknown>> = {};
  for (const name of PUBLIC_SECTION_NAMES) {
    const candidate = rawSections[name];
    if (!candidate || typeof candidate !== 'object') {
      sections[name] = unknownSection();
      continue;
    }
    const section = candidate as Record<string, unknown>;
    const rawStatus = typeof section.status === 'string' ? section.status : 'unknown';
    const status: DashboardSectionStatus =
      rawStatus === 'empty'
        ? 'ok'
        : SECTION_STATUSES.has(rawStatus)
          ? (rawStatus as DashboardSectionStatus)
          : 'unknown';

    let data: unknown = section.data ?? null;
    if (name === 'incidents' && data) {
      data = normalizeIncidentsSectionData(data);
    }
    if (name === 'source_health' && data && typeof data === 'object') {
      const dataObj = data as Record<string, unknown>;
      if (!Array.isArray(dataObj.sources)) {
        const sourcesList = Object.entries(dataObj)
          .filter(([key, val]) => key !== 'sources' && val && typeof val === 'object')
          .map(([key, val]) => {
            const v = val as Record<string, unknown>;
            const rawStat = String(v.status || 'unknown').toLowerCase();
            const stat = rawStat === 'ok' ? 'healthy' : rawStat;
            return {
              name: key,
              status: stat,
              last_seen: (v.last_success_at || v.updated_at || null) as string | null,
            };
          });
        data = { ...dataObj, sources: sourcesList };
      }
    }

    sections[name] = {
      status,
      data,
      ...(typeof section.error === 'string' ? { error: section.error } : {}),
      ...(typeof section.cached === 'boolean' ? { cached: section.cached } : {}),
      ...(typeof section.observed_at === 'string' || section.observed_at === null
        ? { observed_at: section.observed_at as string | null }
        : {}),
      ...(typeof section.valid_until === 'string' || section.valid_until === null
        ? { valid_until: section.valid_until as string | null }
        : {}),
      ...(typeof section.source === 'string' || section.source === null
        ? { source: section.source as string | null }
        : {}),
    };
  }
  const computedAt = typeof raw.computed_at === 'string' ? raw.computed_at : null;
  const version = typeof raw.version === 'number' ? raw.version : 1;
  return {
    ...createUnknownPublicSnapshot(),
    schema_version: 1,
    snapshot_key: PUBLIC_DASHBOARD_SNAPSHOT_KEY,
    computed_at: computedAt,
    stale: raw.stale === true,
    shadow_mode: true,
    role: typeof raw.role === 'string' ? raw.role : 'GUEST',
    company_id: null,
    modality: typeof raw.modality === 'string' ? (raw.modality as 'truck' | 'vessel' | 'air') : null,
    sections: sections as DashboardBootstrapResponse['sections'],
    version,
    source_freshness: raw.source_freshness && typeof raw.source_freshness === 'object'
      ? raw.source_freshness as Record<string, unknown>
      : {},
    coverage: {
      ...createUnknownPublicSnapshot().coverage,
      ...(raw.coverage && typeof raw.coverage === 'object' ? raw.coverage as Record<string, unknown> : {}),
      mainland_provinces: [...SUMATRA_MAINLAND_PROVINCES],
      road_coverage_status:
        (raw.coverage as Record<string, unknown> | undefined)?.road_coverage_status ?? 'unknown',
    },
  };
}

export function markPublicSnapshotStale(
  snapshot: DashboardBootstrapResponse,
): PublicDashboardSnapshotEnvelope {
  return {
    ...snapshot,
    stale: true,
    version: (snapshot as PublicDashboardSnapshotEnvelope).version ?? 1,
    sections: Object.fromEntries(
      Object.entries(snapshot.sections).map(([name, section]) => [
        name,
        section?.status === 'ok' ? { ...section, status: 'stale' } : section,
      ]),
    ) as DashboardBootstrapResponse['sections'],
  };
}

export function isUsefulPublicSnapshot(snapshot: DashboardBootstrapResponse): boolean {
  return Boolean(snapshot.computed_at) && Object.values(snapshot.sections).some(
    (section) => section?.data != null && (section.status === 'ok' || section.status === 'stale' || (section.status as string) === 'empty'),
  );
}

type AnyRecord = Record<string, unknown>;
type FeatureCollectionLike = GeoJSON.FeatureCollection | GeoJSON.Feature | AnyRecord[] | AnyRecord | null | undefined;

function record(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' ? value as AnyRecord : null;
}

function sectionItems(data: FeatureCollectionLike): unknown[] {
  if (Array.isArray(data)) return data;
  const value = record(data);
  if (!value) return [];
  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) return value.features;
  if (value.type === 'Feature') return [value];
  for (const key of ['features', 'items', 'segments', 'reports', 'warnings', 'events', 'hotspots']) {
    if (Array.isArray(value[key])) return value[key] as unknown[];
  }
  return [];
}

function validPosition(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 &&
    Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
}

function featureForItem(
  item: unknown,
  sectionName: string,
  section: DashboardSection<unknown> | undefined,
  index: number,
): GeoJSON.Feature | null {
  const raw = record(item);
  if (!raw) return null;
  const rawGeometry = record(raw.geometry);
  let geometry: GeoJSON.Geometry | null = null;
  if (rawGeometry?.type && rawGeometry.coordinates != null) {
    geometry = rawGeometry as unknown as GeoJSON.Geometry;
  } else if (raw.type === 'Point' && validPosition(raw.coordinates)) {
    geometry = { type: 'Point', coordinates: [Number(raw.coordinates[0]), Number(raw.coordinates[1])] };
  } else {
    let lon = Number(raw.lon ?? raw.longitude ?? raw.lng);
    let lat = Number(raw.lat ?? raw.latitude);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      if (raw.location) {
        const parsed = parseLocationCoords(raw.location);
        if (parsed) {
          lat = parsed.lat;
          lon = parsed.lon;
        }
      }
    }
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      geometry = { type: 'Point', coordinates: [lon, lat] };
    } else {
      const polygon = record(raw.geometry_polygon ?? raw.polygon);
      if (polygon?.type && polygon.coordinates != null) {
        geometry = polygon as unknown as GeoJSON.Geometry;
      }
    }
  }
  if (!geometry) return null;

  const originalProperties = record(raw.properties) ?? {};
  const properties: AnyRecord = {
    ...originalProperties,
    evidence_kind: sectionName,
    source_name: originalProperties.source_name ?? originalProperties.source ?? raw.source_name ?? raw.source ?? section?.source ?? null,
    observed_at: originalProperties.observed_at ?? originalProperties.updated_at ?? originalProperties.ts ?? raw.observed_at ?? raw.updated_at ?? raw.ts ?? raw.timestamp ?? raw.published_at ?? null,
    valid_until: originalProperties.valid_until ?? raw.valid_until ?? raw.expires_at ?? null,
    name: originalProperties.name ?? originalProperties.title ?? raw.name ?? raw.title ?? raw.headline ?? raw.checkpoint ?? null,
    is_forecast: sectionName === 'official_warnings' || sectionName === 'weather_advisory_polygons' || originalProperties.is_forecast === true,
    geometry_provenance: originalProperties.geometry_provenance ?? (sectionName === 'weather_spatial_polygons' || sectionName === 'weather_advisory_polygons' ? 'generated' : 'observed'),
  };
  return {
    type: 'Feature',
    id: (raw.id ?? raw.evidence_id ?? `${sectionName}-${index}`) as string | number,
    geometry,
    properties,
  } as GeoJSON.Feature;
}

export function publicSectionFeatureCollection(
  section: DashboardSection<unknown> | undefined,
  sectionName: string,
): GeoJSON.FeatureCollection {
  if (!section?.data) return { type: 'FeatureCollection', features: [] };
  const features = sectionItems(section.data as FeatureCollectionLike)
    .map((item, index) => featureForItem(item, sectionName, section, index))
    .filter((feature): feature is GeoJSON.Feature => feature !== null);
  return { type: 'FeatureCollection', features };
}

function coordinatesOfPoint(geometry: unknown): [number, number] | null {
  const value = record(geometry);
  if (value?.type !== 'Point' || !validPosition(value.coordinates)) return null;
  return [Number(value.coordinates[0]), Number(value.coordinates[1])];
}

function evidenceFromFeature(
  feature: GeoJSON.Feature,
  sectionName: string,
  index: number,
): AnyRecord {
  const properties = record(feature.properties) ?? {};
  const geometry = record(feature.geometry);
  const point = coordinatesOfPoint(feature.geometry);
  const allowedClassification = ['CONFIRMED_BLOCKAGE', 'PRECAUTIONARY_RISK', 'UNKNOWN'];
  const explicitClassification = properties.classification ?? properties.evidence_classification;
  const classification = allowedClassification.includes(String(explicitClassification))
    ? String(explicitClassification)
    : sectionName === 'disaster_reports' || sectionName === 'official_warnings' ||
        sectionName === 'weather_spatial_polygons' || sectionName === 'weather_advisory_polygons'
      ? 'PRECAUTIONARY_RISK'
      : 'UNKNOWN';
  const polygonGeometry = geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')
    ? feature.geometry
    : null;
  const result: AnyRecord = {
    evidence_id: String(feature.id ?? properties.evidence_id ?? properties.id ?? `${sectionName}-${index}`),
    version: 'hazard-evidence-v1',
    classification,
    hazard_type: properties.hazard_type ?? properties.type,
    geometry: polygonGeometry,
    geometry_provenance: properties.geometry_provenance ?? 'unknown',
    is_current: typeof properties.is_current === 'boolean' ? properties.is_current : undefined,
    is_forecast: properties.is_forecast === true || sectionName === 'official_warnings' || sectionName === 'weather_advisory_polygons',
    source_names: [String(properties.source_name ?? properties.source ?? 'Sumber tidak diketahui')],
    reason: String(properties.name ?? properties.title ?? properties.reason ?? sectionName),
  };
  if (point) result.point = point;
  return result;
}

export function buildHazardEvidenceContext(
  snapshot: DashboardBootstrapResponse | null | undefined,
  selectedEvidence?: unknown,
): {
  version: 'hazard-evidence-v1';
  coverage_status: 'complete' | 'verified_complete' | 'partial' | 'unknown';
  items: AnyRecord[];
  reason: string;
} {
  const sections = snapshot?.sections;
  const names = ['disaster_reports', 'official_warnings', 'weather_spatial_polygons', 'weather_advisory_polygons'] as const;
  const items = names.flatMap((name) => {
    const section = sections?.[name] as DashboardSection<unknown> | undefined;
    return publicSectionFeatureCollection(section, name).features.map((feature, index) =>
      evidenceFromFeature(feature, name, index),
    );
  });
  const selected = record(selectedEvidence);
  if (selected) {
    const selectedFeature = featureForItem(selected, 'selected_source', undefined, 0);
    if (selectedFeature) items.unshift(evidenceFromFeature(selectedFeature, 'selected_source', 0));
    const geometry = record(selected.geometry_polygon ?? selected.geometry);
    if (!selectedFeature && geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')) {
      items.unshift({
        evidence_id: String(selected.crisis_id ?? selected.id ?? 'selected-source'),
        version: 'hazard-evidence-v1',
        classification: 'UNKNOWN',
        geometry: geometry as unknown as GeoJSON.Geometry,
        geometry_provenance: selected.geometry_provenance ?? 'unknown',
        reason: String(selected.title ?? selected.name ?? 'Selected source evidence'),
        source_names: [String(selected.source_name ?? selected.source ?? 'Sumber tidak diketahui')],
      });
    }
  }

  const coverage = record(snapshot?.coverage);
  const roadCoverage = coverage?.road_coverage_status;
  const coverageStatus = roadCoverage === 'verified_complete'
    ? 'verified_complete'
    : roadCoverage === 'complete'
      ? 'complete'
      : roadCoverage === 'partial'
        ? 'partial'
        : 'unknown';
  return {
    version: 'hazard-evidence-v1',
    coverage_status: coverageStatus,
    items,
    reason: `Cakupan jalan Sumatra: ${String(roadCoverage ?? 'unknown')}`,
  };
}
