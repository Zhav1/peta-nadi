import assert from 'node:assert/strict';
import { DashboardRequestSignals } from '../lib/dashboardMemoryCache.ts';

const requests = new DashboardRequestSignals();
const firstAnalytics = requests.signal('analytics.prices', 'user-a:beras:7');
assert.equal(firstAnalytics.aborted, false);
assert.equal(requests.signal('analytics.prices', 'user-a:beras:7'), firstAnalytics,
  'the same resource key reuses its in-flight cancellation signal');

const changedFilter = requests.signal('analytics.prices', 'user-a:beras:14');
assert.equal(firstAnalytics.aborted, true, 'changing filters cancels the obsolete read');
assert.equal(changedFilter.aborted, false);

const independentReport = requests.signal('reports.approvals', 'user-a:approvals');
requests.signal('analytics.prices', 'user-b:beras:14');
assert.equal(independentReport.aborted, false, 'changing another resource does not cancel approvals');

requests.dispose();
assert.equal(changedFilter.aborted, true, 'section unmount cancels active resource reads');
assert.equal(independentReport.aborted, true);
assert.equal(requests.signal('reports.erp-summary', 'user-a:erp').aborted, true,
  'disposed scopes do not start orphaned requests');

requests.activate();
assert.equal(requests.signal('reports.erp-summary', 'user-a:erp').aborted, false,
  'a mounted scope can start requests again after lifecycle cleanup');
requests.dispose();

console.log('Dashboard request-signal tests passed.');
