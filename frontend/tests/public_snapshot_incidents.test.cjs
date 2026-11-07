/* eslint-disable @typescript-eslint/no-require-imports -- Node's test harness is CommonJS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const frontendRoot = path.resolve(__dirname, '..');
const publicSnapshotTsPath = path.join(frontendRoot, 'lib', 'publicSnapshot.ts');
const source = fs.readFileSync(publicSnapshotTsPath, 'utf8');

// Transpile TypeScript to CommonJS for testing
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});

const exportsObj = {};
const moduleObj = { exports: exportsObj };
const runFn = new Function('module', 'exports', 'require', transpiled.outputText);
runFn(moduleObj, exportsObj, (id) => {
  if (id.startsWith('@/')) {
    return {};
  }
  return require(id);
});

const {
  parseLocationCoords,
  normalizeIncidentItem,
  normalizeIncidentsSectionData,
  normalizePublicSnapshot,
  PUBLIC_DASHBOARD_SNAPSHOT_KEY,
} = moduleObj.exports;

test('parseLocationCoords decodes PostGIS EWKB hex point correctly', () => {
  const ewkbHex = '0101000020E61000006666666666CA584054E3A59BC4A00A40';
  const coords = parseLocationCoords(ewkbHex);
  assert.ok(coords, 'Expected coords to be decoded');
  assert.equal(Math.round(coords.lat * 10000) / 10000, 3.3285);
  assert.equal(Math.round(coords.lon * 10000) / 10000, 99.1625);
});

test('parseLocationCoords decodes 0x-prefixed EWKB hex', () => {
  const ewkbHex = '0x0101000020E61000006666666666CA584054E3A59BC4A00A40';
  const coords = parseLocationCoords(ewkbHex);
  assert.ok(coords);
  assert.equal(Math.round(coords.lat * 10000) / 10000, 3.3285);
  assert.equal(Math.round(coords.lon * 10000) / 10000, 99.1625);
});

test('parseLocationCoords decodes WKT POINT string correctly', () => {
  const wkt = 'POINT(99.1625 3.3285)';
  const coords = parseLocationCoords(wkt);
  assert.ok(coords);
  assert.equal(coords.lon, 99.1625);
  assert.equal(coords.lat, 3.3285);
});

test('parseLocationCoords decodes GeoJSON Point object', () => {
  const geojson = { type: 'Point', coordinates: [99.1625, 3.3285] };
  const coords = parseLocationCoords(geojson);
  assert.ok(coords);
  assert.equal(coords.lon, 99.1625);
  assert.equal(coords.lat, 3.3285);
});

test('parseLocationCoords decodes serialized GeoJSON Point string', () => {
  const str = JSON.stringify({ type: 'Point', coordinates: [99.1625, 3.3285] });
  const coords = parseLocationCoords(str);
  assert.ok(coords);
  assert.equal(coords.lon, 99.1625);
  assert.equal(coords.lat, 3.3285);
});

test('normalizeIncidentItem guarantees non-empty id and populates lat/lon from EWKB location', () => {
  const raw = {
    incident_id: 'inc-12345',
    title: 'Banjir Tebing Tinggi',
    location: '0101000020E61000006666666666CA584054E3A59BC4A00A40',
    lat: null,
    lon: null,
    status: 'validated',
  };

  const item = normalizeIncidentItem(raw, 0);
  assert.equal(item.id, 'inc-12345');
  assert.equal(item.incident_id, 'inc-12345');
  assert.equal(Math.round(item.lat * 10000) / 10000, 3.3285);
  assert.equal(Math.round(item.lon * 10000) / 10000, 99.1625);
});

test('normalizeIncidentItem generates deterministic id if both id and incident_id are missing', () => {
  const raw = {
    title: 'Longsor Sibolga',
    created_at: '2026-11-07T12:00:00Z',
    status: 'validated',
  };

  const item = normalizeIncidentItem(raw, 2);
  assert.ok(item.id, 'Expected id to be generated');
  assert.ok(item.id.includes('longsor-sibolga'));
  assert.equal(item.incident_id, item.id);
});

test('normalizePublicSnapshot normalizes incidents section array data', () => {
  const rawEnvelope = {
    schema_version: 1,
    snapshot_key: PUBLIC_DASHBOARD_SNAPSHOT_KEY,
    computed_at: '2026-11-07T12:00:00Z',
    sections: {
      incidents: {
        status: 'ok',
        data: [
          {
            incident_id: 'uuid-inc-1',
            title: 'Kecelakaan Tol Medan',
            location: '0101000020E61000006666666666CA584054E3A59BC4A00A40',
            lat: null,
            lon: null,
          },
        ],
      },
    },
  };

  const snapshot = normalizePublicSnapshot(rawEnvelope);
  const incidents = snapshot.sections.incidents.data;
  assert.ok(Array.isArray(incidents));
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].id, 'uuid-inc-1');
  assert.equal(Math.round(incidents[0].lat * 10000) / 10000, 3.3285);
  assert.equal(Math.round(incidents[0].lon * 10000) / 10000, 99.1625);
});

test('normalizePublicSnapshot normalizes incidents section object data with items', () => {
  const rawEnvelope = {
    schema_version: 1,
    snapshot_key: PUBLIC_DASHBOARD_SNAPSHOT_KEY,
    computed_at: '2026-11-07T12:00:00Z',
    sections: {
      incidents: {
        status: 'ok',
        data: {
          items: [
            {
              incident_id: 'uuid-inc-2',
              title: 'Jalan Rusak Kisaran',
              location: 'POINT(99.1625 3.3285)',
              lat: null,
              lon: null,
            },
          ],
          total: 1,
        },
      },
    },
  };

  const snapshot = normalizePublicSnapshot(rawEnvelope);
  const incidents = snapshot.sections.incidents.data.items;
  assert.ok(Array.isArray(incidents));
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].id, 'uuid-inc-2');
  assert.equal(incidents[0].lat, 3.3285);
  assert.equal(incidents[0].lon, 99.1625);
});
