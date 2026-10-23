/**
 * Hazard-geometry normalization for the map.
 *
 * The backend prefers to emit GeoJSON polygons, but stored PostGIS geometry can
 * surface as WKB hex, WKT/EWKT or a bare ring depending on deployment age. The
 * map must never receive a shape it cannot draw, so every polygon entering
 * deck.gl / Mapbox goes through `toLonLatRing` first and invalid geometry is
 * dropped (or replaced by the caller's explicit fallback) instead of throwing.
 */

export type LonLat = [number, number];
export type LonLatRing = LonLat[];

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: LonLatRing[];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: LonLatRing[][];
}

const HEX_RE = /^(?:\\x)?([0-9a-fA-F]{16,})$/;
const NUMBER_RE = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Closes a ring so Mapbox/deck.gl always receive a valid linear ring. */
export function closeRing(ring: LonLatRing): LonLatRing {
  if (ring.length >= 3) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      return [...ring, [first[0], first[1]] as LonLat];
    }
  }
  return ring;
}

function validateRing(raw: unknown): LonLatRing | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const ring: LonLatRing = [];
  for (const point of raw) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const lon = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    ring.push([lon, lat]);
  }
  if (ring.length < 3) return null;
  return closeRing(ring);
}

/** Parses a POLYGON/MULTIPOLYGON WKT or EWKT string into a ring. */
function fromWkt(text: string): LonLatRing | null {
  const header = /^(?:SRID=\d+;)?\s*(MULTIPOLYGON|POLYGON)\s*/i.exec(text.trim());
  if (!header) return null;
  const body = text.trim().slice(header[0].length);
  const groups = body.match(/\(([^()]*)\)/g) ?? [];
  for (const group of groups) {
    const numbers = (group.match(NUMBER_RE) ?? []).map(Number);
    const ring: LonLatRing = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      ring.push([numbers[i], numbers[i + 1]]);
    }
    const valid = validateRing(ring);
    if (valid) return valid;
  }
  return null;
}

/**
 * Minimal WKB/EWKB (Polygon / MultiPolygon / GeometryCollection) reader.
 * PostGIS hex is the format PostgREST actually returns for geometry columns.
 */
function fromWkbHex(hex: string): LonLatRing | null {
  const match = HEX_RE.exec(hex.trim());
  if (!match) return null;
  const bytes = new Uint8Array(match[1].length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(match[1].slice(i * 2, i * 2 + 2), 16);
  }

  let offset = 0;
  const ensure = (size: number) => {
    if (offset + size > bytes.length) throw new Error('truncated WKB');
  };
  const uint32 = (little: boolean) => {
    ensure(4);
    const view = new DataView(bytes.buffer, offset, 4);
    const value = view.getUint32(0, little);
    offset += 4;
    return value;
  };
  const double = (little: boolean) => {
    ensure(8);
    const view = new DataView(bytes.buffer, offset, 8);
    const value = view.getFloat64(0, little);
    offset += 8;
    return value;
  };

  const readGeometry = (depth: number): LonLatRing | null => {
    if (depth > 8) return null;
    ensure(5);
    const little = bytes[offset] === 1;
    offset += 1;
    const typeInt = uint32(little);
    const hasZ = (typeInt & 0x80000000) !== 0;
    const hasM = (typeInt & 0x40000000) !== 0;
    const hasSrid = (typeInt & 0x20000000) !== 0;
    let base = typeInt & 0x1fffffff;
    if (base >= 1000) base %= 1000;
    if (hasSrid) uint32(little);

    if (base === 3) {
      const ringCount = uint32(little);
      let firstRing: LonLatRing | null = null;
      for (let r = 0; r < ringCount; r += 1) {
        const pointCount = uint32(little);
        const ring: LonLatRing = [];
        for (let p = 0; p < pointCount; p += 1) {
          const lon = double(little);
          const lat = double(little);
          if (hasZ) double(little);
          if (hasM) double(little);
          ring.push([lon, lat]);
        }
        if (!firstRing) firstRing = validateRing(ring);
      }
      return firstRing;
    }

    if (base === 6) {
      const polygonCount = uint32(little);
      for (let p = 0; p < polygonCount; p += 1) {
        const ring = readGeometry(depth + 1);
        if (ring) return ring;
      }
      return null;
    }

    if (base === 7) {
      const geometryCount = uint32(little);
      for (let g = 0; g < geometryCount; g += 1) {
        const ring = readGeometry(depth + 1);
        if (ring) return ring;
      }
      return null;
    }

    return null; // Point/LineString cannot become a hazard polygon
  };

  try {
    return readGeometry(0);
  } catch {
    return null;
  }
}

function fromObject(value: unknown, depth = 0): LonLatRing | null {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  const record = value as Record<string, unknown>;

  if (record.type === 'Feature' || record.geometry) {
    return fromObject(record.geometry, depth + 1);
  }
  if (record.type === 'FeatureCollection') {
    const features = Array.isArray(record.features) ? record.features : [];
    for (const feature of features) {
      const ring = fromObject(feature, depth + 1);
      if (ring) return ring;
    }
    return null;
  }
  if (record.type === 'GeometryCollection') {
    const geometries = Array.isArray(record.geometries) ? record.geometries : [];
    for (const geometry of geometries) {
      const ring = fromObject(geometry, depth + 1);
      if (ring) return ring;
    }
    return null;
  }

  return fromCoordinates(record.coordinates, depth + 1);
}

function fromCoordinates(value: unknown, depth = 0): LonLatRing | null {
  if (!Array.isArray(value) || value.length === 0 || depth > 6) return null;

  // Bare ring: [[lon, lat], ...]
  if (Array.isArray(value[0]) && isFiniteNumber((value[0] as unknown[])[0])) {
    return validateRing(value);
  }

  // Array of rings (Polygon) or array of polygons (MultiPolygon).
  const first = value[0];
  if (Array.isArray(first) && Array.isArray(first[0])) {
    if (Array.isArray(first[0]) && isFiniteNumber((first[0] as unknown[])[0])) {
      for (const ring of value) {
        const valid = validateRing(ring);
        if (valid) return valid;
      }
      return null;
    }
    for (const polygon of value) {
      const ring = fromCoordinates(polygon, depth + 1);
      if (ring) return ring;
    }
  }

  return null;
}

/**
 * Normalizes any hazard geometry representation into a closed `[lon, lat]` ring.
 * Returns `null` when the value is empty, malformed or not an areal shape.
 */
export function toLonLatRing(input: unknown): LonLatRing | null {
  if (input == null || input === '') return null;
  if (Array.isArray(input)) return fromCoordinates(input);
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return null;
    if (text.startsWith('{')) {
      try {
        return fromObject(JSON.parse(text));
      } catch {
        return null;
      }
    }
    if (/^(?:SRID=\d+;\s*)?(?:MULTI)?POLYGON/i.test(text)) {
      return fromWkt(text);
    }
    return fromWkbHex(text);
  }
  if (typeof input === 'object') return fromObject(input);
  return null;
}

/** Builds a GeoJSON Polygon from a ring, or `null` when the ring is unusable. */
export function ringToGeoJsonPolygon(ring: LonLatRing | null | undefined): GeoJsonPolygon | null {
  if (!ring || ring.length < 4) return null;
  return { type: 'Polygon', coordinates: [closeRing(ring)] };
}
