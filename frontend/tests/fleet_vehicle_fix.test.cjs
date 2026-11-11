/* eslint-disable @typescript-eslint/no-require-imports -- Node's test harness is CommonJS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const frontendRoot = path.resolve(__dirname, '..');

// fleetScope.ts only imports types, so a plain transpile is enough to load it.
function loadFleetScope() {
  const filename = path.join(frontendRoot, 'lib', 'fleetScope.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports;
}

// FleetVehicleLayer's animate loop plots a unit exactly when `getVehicleFix`
// returns a position: the maritime/air branch `continue`s on `!serverFix`
// (components/map/FleetVehicleLayer.tsx, "Non-corridor unit without a ping").
// So "getVehicleFix returns a fix" IS "produces a map feature".
test('maritime unit with a server fix produces a feature', () => {
  const { getVehicleFix } = loadFleetScope();

  // Direct API shape (/api/v1/fleet/vehicles): flat current_coords.
  const withFix = {
    vehicle_id: 'AIS-525011003',
    modality: 'maritime',
    current_coords: [99.15, 4.12],
    tracking_mode: 'LIVE_GPS',
  };
  assert.deepEqual(getVehicleFix(withFix), [99.15, 4.12]);

  // Edge-snapshot / durable-cache shape: only the server-reported
  // [prev, curr, next] path triple — path[1] is the current fix (the
  // backend invariant pass treats it as such), so the unit must plot.
  const pathOnly = {
    vehicle_id: 'AIS-525011004',
    modality: 'maritime',
    path: [[99.0, 4.0], [99.15, 4.12], [99.3, 4.3]],
  };
  assert.deepEqual(getVehicleFix(pathOnly), [99.15, 4.12]);
});

test('maritime unit without any fix produces no feature (never a fabricated point)', () => {
  const { getVehicleFix } = loadFleetScope();

  // No position fields at all.
  assert.equal(
    getVehicleFix({ vehicle_id: 'AIS-525011005', modality: 'maritime', status: 'moving' }),
    null
  );

  // Null coordinates stay rejected.
  assert.equal(
    getVehicleFix({
      vehicle_id: 'AIS-525011005',
      modality: 'maritime',
      current_coords: [null, null],
    }),
    null
  );

  // A dense corridor (not the [prev, curr, next] triple) is a route, not a
  // position — midpoints stay excluded.
  assert.equal(
    getVehicleFix({
      vehicle_id: 'AIS-525011005',
      modality: 'maritime',
      path: [[99.0, 4.0], [99.1, 4.05], [99.2, 4.1], [99.3, 4.3]],
    }),
    null
  );
});
