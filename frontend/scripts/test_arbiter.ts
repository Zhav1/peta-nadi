import assert from 'node:assert';
import { SpatialHashArbiter } from '../lib/spatialHashArbiter.ts';
import type { DeclutterItem } from '../lib/spatialHashArbiter.ts';

console.log('[TEST] Starting SpatialHashArbiter verification...');

const arbiter = new SpatialHashArbiter(28);

// 1. Normal decluttering
const normalCandidates: DeclutterItem[] = [
  { id: 'item-1', screenX: 100, screenY: 100, priority: 50, width: 80, height: 24 },
  { id: 'item-2', screenX: 500, screenY: 500, priority: 50, width: 80, height: 24 },
  { id: 'item-overlapping', screenX: 105, screenY: 102, priority: 20, width: 80, height: 24 },
];

const winners = arbiter.arbitrate(normalCandidates);
assert.strictEqual(winners.has('item-1'), true, 'item-1 should win');
assert.strictEqual(winners.has('item-2'), true, 'item-2 should win');
assert.strictEqual(winners.has('item-overlapping'), false, 'item-overlapping should be decluttered');
console.log('✅ PASS: Normal candidate decluttering');

// 2. Pathological inputs: -Infinity, +Infinity, NaN, astronomical numbers
const pathologicalCandidates: DeclutterItem[] = [
  { id: 'inf-neg-pos', screenX: -Infinity, screenY: Infinity, priority: 90, width: 80, height: 24 },
  { id: 'inf-pos-neg', screenX: Infinity, screenY: -Infinity, priority: 90, width: 80, height: 24 },
  { id: 'nan-coords', screenX: NaN, screenY: NaN, priority: 90, width: 80, height: 24 },
  { id: 'nan-dimensions', screenX: 100, screenY: 100, priority: 90, width: NaN, height: NaN },
  { id: 'huge-coords', screenX: 1e15, screenY: 1e15, priority: 90, width: 80, height: 24 },
  { id: 'negative-huge', screenX: -1e15, screenY: -1e15, priority: 90, width: 80, height: 24 },
  { id: 'huge-footprint', screenX: 200, screenY: 200, priority: 90, width: 1e9, height: 1e9 },
  { id: 'valid-target', screenX: 300, screenY: 300, priority: 70, width: 80, height: 24 },
];

let extremeWinners: Set<string>;
try {
  extremeWinners = arbiter.arbitrate(pathologicalCandidates);
  console.log('✅ PASS: Executed pathological inputs without throwing RangeError');
} catch (err) {
  console.error('❌ FAIL: Threw error on pathological inputs:', err);
  process.exit(1);
}

assert.strictEqual(extremeWinners.has('valid-target'), true, 'valid-target should be processed');
assert.strictEqual(extremeWinners.has('inf-neg-pos'), false, 'infinite item should be safely ignored');
assert.strictEqual(extremeWinners.has('inf-pos-neg'), false, 'infinite item should be safely ignored');
assert.strictEqual(extremeWinners.has('nan-coords'), false, 'NaN item should be safely ignored');
assert.strictEqual(extremeWinners.has('huge-coords'), false, 'Huge coords should be safely ignored');
assert.strictEqual(extremeWinners.has('huge-footprint'), false, 'Huge footprint should be safely ignored');

console.log('✅ ALL SPATIAL HASH ARBITER TESTS PASSED (100% CLEAN)!');
