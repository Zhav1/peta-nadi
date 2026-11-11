/* eslint-disable @typescript-eslint/no-require-imports -- Node's test harness is CommonJS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const frontendRoot = path.resolve(__dirname, '..');

function compileToCjs(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
}

const baseUrlPath = path.join(frontendRoot, 'lib', 'baseUrl.ts');
const compiled = compileToCjs(fs.readFileSync(baseUrlPath, 'utf8'), baseUrlPath);
const loaded = new Module(baseUrlPath, module);
loaded.filename = baseUrlPath;
loaded.paths = Module._nodeModulePaths(path.dirname(baseUrlPath));
loaded._compile(compiled, baseUrlPath);
const baseUrl = loaded.exports;

test('PRODUCTION_API_BASE_URL points at the VPS, not the retired Render host', () => {
  assert.equal(baseUrl.PRODUCTION_API_BASE_URL, 'https://api.177-202-246-251.nip.io');
});

test('sanitizeBaseUrl rejects the decommissioned Render hosts', () => {
  assert.equal(baseUrl.sanitizeBaseUrl('https://peta-nadi.onrender.com'), null);
  assert.equal(baseUrl.sanitizeBaseUrl('https://prehub-backend.onrender.com'), null);
});

test('sanitizeBaseUrl accepts the VPS host and normalizes it', () => {
  assert.equal(
    baseUrl.sanitizeBaseUrl('https://api.177-202-246-251.nip.io/'),
    'https://api.177-202-246-251.nip.io'
  );
});
