import assert from 'node:assert/strict';
import {
  DashboardMemoryCache,
  SingleFlightRequest,
  dashboardDataKey,
  dashboardIdentityKey,
} from '../lib/dashboardMemoryCache.ts';

const cache = new DashboardMemoryCache(2, 100);
const dispatcher = dashboardIdentityKey({ id: 'user-a', role: 'DISPATCHER', companyId: 'company-a' });
const regulator = dashboardIdentityKey({ id: 'user-a', role: 'REGULATOR', companyId: 'company-a' });
const otherCompany = dashboardIdentityKey({ id: 'user-a', role: 'DISPATCHER', companyId: 'company-b' });
const approvalsKey = dashboardDataKey(dispatcher, 'reports.approvals');

cache.setIdentity(dispatcher);
const requestGeneration = cache.generation;
assert.equal(cache.set(approvalsKey, { total: 3 }, requestGeneration, 10), true);
assert.deepEqual(cache.get<{ total: number }>(approvalsKey, 50), { value: { total: 3 }, updatedAt: 10 });
assert.equal(cache.get(approvalsKey, 111), null, 'expired entries are not returned');

cache.set(approvalsKey, { total: 4 }, cache.generation, 120);
const erpKey = dashboardDataKey(dispatcher, 'reports.erp', { companyId: 'company-a' });
cache.set(erpKey, { total: 8 }, cache.generation, 121);
cache.get(approvalsKey, 122); // Make approvals the most-recently-used entry.
cache.set(dashboardDataKey(dispatcher, 'analytics.price', { commodity: 'beras' }), [], cache.generation, 123);
assert.equal(cache.get(erpKey, 124), null, 'least-recently-used entries are evicted at capacity');
assert.equal(cache.size, 2);

const preIdentityChangeGeneration = cache.generation;
cache.setIdentity(regulator);
assert.equal(cache.size, 0, 'role changes clear all cached dashboard data');
assert.equal(cache.set(approvalsKey, { total: 999 }, preIdentityChangeGeneration, 125), false,
  'a response from the previous identity cannot repopulate the cache');
assert.notEqual(dispatcher, regulator);
assert.notEqual(dispatcher, otherCompany, 'company changes produce a distinct cache identity');

const flights = new SingleFlightRequest();
const first = flights.begin();
assert.ok(first);
assert.equal(flights.begin(), null, 'a scheduled poll skips while the prior request is active');
flights.abort();
assert.equal(first.signal.aborted, true, 'lifecycle cleanup aborts active work');
const second = flights.begin();
assert.ok(second, 'a later activation can start a fresh request');
flights.finish(first);
assert.equal(flights.isActive, true, 'a late completion cannot release a newer request');
flights.finish(second);
assert.equal(flights.isActive, false);

console.log('Dashboard memory-cache and single-flight tests passed.');
