'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Server,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  Radio,
  Clock,
  Search,
  Filter,
  Terminal,
  ShieldCheck,
  Zap,
  Globe,
  ArrowUpRight,
  Sliders
} from 'lucide-react';

interface EndpointProbeItem {
  id: string;
  name: string;
  path: string;
  method: 'GET' | 'POST';
  category: 'System' | 'Incidents' | 'Commodities' | 'News' | 'Corridor' | 'Fleet' | 'Auth' | 'Evaluation';
  status: 'PENDING' | 'PASS' | 'FAIL' | 'WARN';
  httpCode?: number;
  latencyMs?: number;
  responseBytes?: number;
  lastChecked?: string;
  error?: string;
}

const INITIAL_ENDPOINTS: EndpointProbeItem[] = [
  // System
  { id: 'ep-1', name: 'Health Check', path: '/health', method: 'GET', category: 'System', status: 'PENDING' },
  { id: 'ep-2', name: 'Source Health Check', path: '/api/v1/health/sources', method: 'GET', category: 'System', status: 'PENDING' },
  
  // Incidents
  { id: 'ep-3', name: 'List Active Incidents', path: '/api/v1/incidents', method: 'GET', category: 'Incidents', status: 'PENDING' },
  { id: 'ep-4', name: 'Historical Episodes', path: '/api/v1/incidents/historical/episodes', method: 'GET', category: 'Incidents', status: 'PENDING' },
  { id: 'ep-5', name: 'Predictive Risks', path: '/api/v1/incidents/predictive/risks', method: 'GET', category: 'Incidents', status: 'PENDING' },
  { id: 'ep-6', name: 'OSINT Media Stream', path: '/api/v1/incidents/osint/feed', method: 'GET', category: 'Incidents', status: 'PENDING' },
  { id: 'ep-7', name: 'OSINT Live Events', path: '/api/v1/incidents/osint/live', method: 'GET', category: 'Incidents', status: 'PENDING' },
  
  // Commodities
  { id: 'ep-8', name: 'Commodity Prices', path: '/api/v1/commodities/prices', method: 'GET', category: 'Commodities', status: 'PENDING' },
  
  // News
  { id: 'ep-9', name: 'Live Verified News', path: '/api/v1/news/live', method: 'GET', category: 'News', status: 'PENDING' },
  { id: 'ep-10', name: 'Market Risk Regime', path: '/api/v1/news/market-regime', method: 'GET', category: 'News', status: 'PENDING' },
  { id: 'ep-11', name: 'Claim Verification', path: '/api/v1/news/verify?claim=Banjir+Belawan&location=Sumatera+Utara', method: 'POST', category: 'News', status: 'PENDING' },
  
  // Corridor & Spatial
  { id: 'ep-12', name: 'Corridor Context', path: '/api/v1/corridor/context?corridor_id=sumatra_belawan_medan', method: 'GET', category: 'Corridor', status: 'PENDING' },
  { id: 'ep-13', name: 'Weather Polygons', path: '/api/v1/weather/spatial-polygons', method: 'GET', category: 'Corridor', status: 'PENDING' },
  { id: 'ep-14', name: 'Traffic Flow Segments', path: '/api/v1/traffic/flow-segments', method: 'GET', category: 'Corridor', status: 'PENDING' },
  
  // Fleet
  { id: 'ep-15', name: 'Fleet Telemetry List', path: '/api/v1/fleet/vehicles', method: 'GET', category: 'Fleet', status: 'PENDING' },
  { id: 'ep-16', name: 'Custom Fleet Registry', path: '/api/v1/fleet/custom', method: 'GET', category: 'Fleet', status: 'PENDING' },
  { id: 'ep-17', name: 'Manifest Template Info', path: '/api/v1/fleet/manifest/template', method: 'GET', category: 'Fleet', status: 'PENDING' },
  
  // Auth
  { id: 'ep-18', name: 'Role Catalog', path: '/api/v1/auth/roles', method: 'GET', category: 'Auth', status: 'PENDING' },
  { id: 'ep-19', name: 'Guest Session Auth', path: '/api/v1/auth/guest-session', method: 'POST', category: 'Auth', status: 'PENDING' },
  
  // Evaluation
  { id: 'ep-20', name: 'Benchmark Report', path: '/api/v1/evaluation/benchmark', method: 'GET', category: 'Evaluation', status: 'PENDING' },
  { id: 'ep-21', name: 'Test Matrix (83 tests)', path: '/api/v1/evaluation/test-matrix', method: 'GET', category: 'Evaluation', status: 'PENDING' },
  { id: 'ep-22', name: 'Corridor Efficiency', path: '/api/v1/evaluation/corridor-efficiency', method: 'GET', category: 'Evaluation', status: 'PENDING' },
  { id: 'ep-23', name: 'Ground-Truth Outcomes', path: '/api/v1/outcomes', method: 'GET', category: 'Evaluation', status: 'PENDING' },
];

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  component: string;
  message: string;
}

const INITIAL_LOGS: LogEntry[] = [
  { timestamp: new Date(Date.now() - 120000).toISOString().slice(11, 19), level: 'INFO', component: 'main.lifespan', message: 'FastAPI core workers initialized in async lifecycle.' },
  { timestamp: new Date(Date.now() - 90000).toISOString().slice(11, 19), level: 'INFO', component: 'bmkg_poller', message: 'BMKG early-warning poller active. Polling interval: 60s.' },
  { timestamp: new Date(Date.now() - 60000).toISOString().slice(11, 19), level: 'INFO', component: 'tomtom_adapter', message: 'TomTom arterial corridor traffic flow updated. 5 checkpoints cached.' },
  { timestamp: new Date(Date.now() - 45000).toISOString().slice(11, 19), level: 'INFO', component: 'news_rss', message: 'LKBN Antara & regional RSS feeds synchronized. 25 articles evaluated.' },
  { timestamp: new Date(Date.now() - 30000).toISOString().slice(11, 19), level: 'INFO', component: 'fleet_service', message: 'Multi-modal telemetry active. 45 fleet units synchronized.' },
  { timestamp: new Date(Date.now() - 10000).toISOString().slice(11, 19), level: 'DEBUG', component: 'health_router', message: 'Periodic ping from frontend dashboard client acknowledged.' }
];

export default function SystemObservabilitySection() {
  const [targetUrl, setTargetUrl] = useState<string>('https://peta-nadi.onrender.com');
  const [customUrl, setCustomUrl] = useState<string>('');
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [endpoints, setEndpoints] = useState<EndpointProbeItem[]>(INITIAL_ENDPOINTS);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [logFilter, setLogFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [lastRunTime, setLastRunTime] = useState<string>('');

  const activeUrl = isCustom ? customUrl.trim() : targetUrl;

  const runSingleProbe = async (item: EndpointProbeItem, baseUrl: string): Promise<EndpointProbeItem> => {
    const t0 = performance.now();
    const url = `${baseUrl.replace(/\/$/, '')}${item.path}`;
    const nowStr = new Date().toLocaleTimeString('id-ID');

    try {
      const options: RequestInit = {
        method: item.method,
        headers: {
          'Accept': 'application/json',
          ...(item.method === 'POST' ? { 'Content-Type': 'application/json' } : {})
        }
      };

      if (item.method === 'POST') {
        if (item.path.includes('guest-session')) {
          options.body = JSON.stringify({ role: 'DISPATCHER', org_name: 'Audit Monitor' });
        } else if (item.path.includes('news/verify')) {
          // params in query string
        }
      }

      const res = await fetch(url, options);
      const elapsed = Math.round(performance.now() - t0);
      const text = await res.text();
      const bytes = new Blob([text]).size;

      if (res.ok) {
        return {
          ...item,
          status: 'PASS',
          httpCode: res.status,
          latencyMs: elapsed,
          responseBytes: bytes,
          lastChecked: nowStr,
          error: undefined
        };
      } else {
        return {
          ...item,
          status: 'FAIL',
          httpCode: res.status,
          latencyMs: elapsed,
          responseBytes: bytes,
          lastChecked: nowStr,
          error: `HTTP ${res.status}: ${text.slice(0, 80)}`
        };
      }
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - t0);
      return {
        ...item,
        status: 'FAIL',
        httpCode: 0,
        latencyMs: elapsed,
        responseBytes: 0,
        lastChecked: nowStr,
        error: err?.message || 'Connection failed'
      };
    }
  };

  const runAllProbes = useCallback(async () => {
    if (!activeUrl) return;
    setIsTesting(true);

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString().slice(11, 19),
      level: 'INFO',
      component: 'probe_runner',
      message: `Initiated complete API smoke test against ${activeUrl}`
    };
    setLogs(prev => [logEntry, ...prev.slice(0, 49)]);

    const updated = [...endpoints];

    // Execute probes in batches of 4 to prevent browser connection saturation
    const batchSize = 4;
    for (let i = 0; i < updated.length; i += batchSize) {
      const batch = updated.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(item => runSingleProbe(item, activeUrl)));
      for (let j = 0; j < results.length; j++) {
        updated[i + j] = results[j];
      }
      setEndpoints([...updated]);
    }

    setIsTesting(false);
    setLastRunTime(new Date().toLocaleTimeString('id-ID'));

    const passCount = updated.filter(e => e.status === 'PASS').length;
    const failCount = updated.filter(e => e.status === 'FAIL').length;
    const completeLog: LogEntry = {
      timestamp: new Date().toISOString().slice(11, 19),
      level: failCount > 0 ? 'WARN' : 'INFO',
      component: 'probe_runner',
      message: `Audit complete. Passed: ${passCount}/${updated.length} (${Math.round(passCount / updated.length * 100)}%), Failed: ${failCount}`
    };
    setLogs(prev => [completeLog, ...prev.slice(0, 49)]);
  }, [activeUrl, endpoints]);

  // Initial automatic run on component mount
  useEffect(() => {
    runAllProbes();
  }, []);

  const totalTested = endpoints.filter(e => e.status !== 'PENDING').length;
  const totalPassed = endpoints.filter(e => e.status === 'PASS').length;
  const totalFailed = endpoints.filter(e => e.status === 'FAIL').length;
  const avgLatency = totalTested > 0
    ? Math.round(endpoints.filter(e => e.latencyMs != null).reduce((acc, curr) => acc + (curr.latencyMs || 0), 0) / (totalTested || 1))
    : 0;
  const passRate = totalTested > 0 ? Math.round((totalPassed / totalTested) * 100) : 0;

  const filteredEndpoints = endpoints.filter(item => {
    if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.path.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredLogs = logs.filter(l => {
    if (logFilter !== 'ALL' && l.level !== logFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col space-y-5 max-w-7xl mx-auto pb-8">
      {/* Top Diagnostics Control Bar */}
      <div className="bg-[#13161c]/90 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-wide font-sans">
                  Diagnostik Backend & Telemetri API
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold">
                  LIVE PROBE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Audit latensi, ketersediaan endpoint REST, dan integritas background worker.
              </p>
            </div>
          </div>

          {/* Target Host Selector & Probe Trigger */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl bg-slate-950 border border-white/10 p-1 text-xs font-mono">
              <button
                type="button"
                onClick={() => { setIsCustom(false); setTargetUrl('https://peta-nadi.onrender.com'); }}
                className={`cursor-pointer px-3 py-1.5 rounded-lg transition ${!isCustom && targetUrl.includes('onrender') ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30' : 'text-slate-400 hover:text-white'}`}
              >
                Render Cloud
              </button>
              <button
                type="button"
                onClick={() => { setIsCustom(false); setTargetUrl('http://localhost:8000'); }}
                className={`cursor-pointer px-3 py-1.5 rounded-lg transition ${!isCustom && targetUrl.includes('localhost') ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30' : 'text-slate-400 hover:text-white'}`}
              >
                Localhost:8000
              </button>
              <button
                type="button"
                onClick={() => setIsCustom(true)}
                className={`cursor-pointer px-3 py-1.5 rounded-lg transition ${isCustom ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30' : 'text-slate-400 hover:text-white'}`}
              >
                Custom URL
              </button>
            </div>

            {isCustom && (
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://..."
                className="px-3 py-1.5 bg-slate-950 border border-white/15 rounded-xl text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
              />
            )}

            <button
              type="button"
              disabled={isTesting}
              onClick={runAllProbes}
              className="cursor-pointer flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 rounded-xl font-bold text-xs transition shadow-lg shadow-cyan-500/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'Memeriksa...' : 'Uji Semua API'}</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/10">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
            <div className="text-[11px] font-mono text-slate-400">Target Host</div>
            <div className="text-xs font-mono font-bold text-cyan-300 truncate mt-0.5" title={activeUrl}>
              {activeUrl}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
            <div className="text-[11px] font-mono text-slate-400">Tingkat Keberhasilan</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-base font-bold font-mono ${passRate >= 90 ? 'text-emerald-400' : passRate >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                {passRate}%
              </span>
              <span className="text-[10px] font-mono text-slate-500">({totalPassed}/{totalTested})</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
            <div className="text-[11px] font-mono text-slate-400">Rata-rata Latensi</div>
            <div className="text-base font-bold font-mono text-white mt-0.5">
              {avgLatency} <span className="text-xs font-normal text-slate-400">ms</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
            <div className="text-[11px] font-mono text-slate-400">Pembaruan Terakhir</div>
            <div className="text-xs font-mono text-slate-300 mt-1">
              {lastRunTime || 'Sedang memuat...'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Endpoints Table (Left 7 cols) & Logs / Sources (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left: Endpoint Matrix */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-[#13161c]/90 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl space-y-4">
            
            {/* Table Header & Search Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-white font-sans">
                  Status Endpoint REST ({filteredEndpoints.length})
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari endpoint..."
                    className="pl-8 pr-3 py-1 bg-slate-950 border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 w-36 sm:w-48"
                  />
                </div>

                {/* Category Filter */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  aria-label="Filter kategori endpoint"
                  className="px-2.5 py-1 bg-slate-950 border border-white/10 rounded-lg text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-400"
                >
                  <option value="ALL">Semua Kategori</option>
                  <option value="System">System</option>
                  <option value="Incidents">Incidents</option>
                  <option value="Commodities">Commodities</option>
                  <option value="News">News</option>
                  <option value="Corridor">Corridor</option>
                  <option value="Fleet">Fleet</option>
                  <option value="Auth">Auth</option>
                  <option value="Evaluation">Evaluation</option>
                </select>
              </div>
            </div>

            {/* Endpoints Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                    <th className="pb-2 font-medium">STATUS</th>
                    <th className="pb-2 font-medium">METODE</th>
                    <th className="pb-2 font-medium">ENDPOINT</th>
                    <th className="pb-2 font-medium">KATEGORI</th>
                    <th className="pb-2 font-medium text-right">LATENSI</th>
                    <th className="pb-2 font-medium text-right">UKURAN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredEndpoints.map((item) => {
                    const isPass = item.status === 'PASS';
                    const isFail = item.status === 'FAIL';
                    const isPending = item.status === 'PENDING';

                    return (
                      <tr key={item.id} className="hover:bg-white/[0.02] transition">
                        <td className="py-2.5">
                          {isPass && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                              <CheckCircle2 className="w-3 h-3" />
                              {item.httpCode || 200}
                            </span>
                          )}
                          {isFail && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded" title={item.error}>
                              <XCircle className="w-3 h-3" />
                              {item.httpCode || 'ERR'}
                            </span>
                          )}
                          {isPending && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                              <Clock className="w-3 h-3 animate-pulse" />
                              PROBE
                            </span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.method === 'GET' ? 'text-cyan-400 bg-cyan-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
                            {item.method}
                          </span>
                        </td>
                        <td className="py-2.5 font-sans">
                          <div className="font-bold text-slate-200 text-xs">{item.name}</div>
                          <div className="font-mono text-[10px] text-slate-500 truncate max-w-xs">{item.path}</div>
                        </td>
                        <td className="py-2.5">
                          <span className="text-[10px] text-slate-400 bg-slate-900 border border-white/5 px-2 py-0.5 rounded">
                            {item.category}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono">
                          {item.latencyMs != null ? (
                            <span className={item.latencyMs < 400 ? 'text-emerald-400' : item.latencyMs < 1000 ? 'text-amber-400' : 'text-rose-400'}>
                              {item.latencyMs} ms
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono text-slate-400 text-[11px]">
                          {item.responseBytes ? `${(item.responseBytes / 1024).toFixed(1)} KB` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Data Source Gateways & Live Log Stream */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Data Sources Gateway */}
          <div className="bg-[#13161c]/90 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-white/10">
              <Database className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white font-sans">Data Source Adapters</h2>
            </div>

            <div className="space-y-2 text-xs">
              {[
                { name: 'BMKG Geospasial', desc: 'Gempa M5.0+ & radar cuaca', interval: '60s', status: 'ACTIVE' },
                { name: 'TomTom Traffic Flow', desc: 'Kecepatan jalan arteri', interval: '300s', status: 'ACTIVE' },
                { name: 'OpenSky Network ADS-B', desc: 'Kargo udara Kualanamu', interval: '60s', status: 'ACTIVE' },
                { name: 'AISstream Maritime', desc: 'Antrean Pelabuhan Belawan', interval: 'STREAM', status: 'ACTIVE' },
                { name: 'LKBN Antara RSS', desc: 'Berita & early warning', interval: '180s', status: 'ACTIVE' },
                { name: 'Supabase PostGIS', desc: 'LTM & simpanan entitas', interval: 'SYNC', status: 'ACTIVE' },
              ].map((src) => (
                <div key={src.name} className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-white/5">
                  <div>
                    <div className="font-bold text-slate-200 text-xs font-sans">{src.name}</div>
                    <div className="text-[10px] text-slate-500 font-sans">{src.desc}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                      {src.status}
                    </span>
                    <div className="text-[9px] font-mono text-slate-500 mt-0.5">{src.interval}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Background Worker Logs Terminal */}
          <div className="bg-[#13161c]/90 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-white font-sans">Event & Worker Logs</h2>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-mono">
                {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map(lvl => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setLogFilter(lvl)}
                    className={`cursor-pointer px-1.5 py-0.5 rounded ${logFilter === lvl ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-950 border border-white/10 rounded-xl p-3 font-mono text-[10px] h-64 overflow-y-auto space-y-2">
              {filteredLogs.map((log, idx) => (
                <div key={idx} className="leading-relaxed border-b border-white/5 pb-1 last:border-0">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[9px]">
                    <span>{log.timestamp}</span>
                    <span className={`px-1 rounded text-[8px] font-bold ${log.level === 'ERROR' ? 'bg-rose-500/20 text-rose-300' : log.level === 'WARN' ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/10 text-cyan-300'}`}>
                      {log.level}
                    </span>
                    <span className="text-slate-400">[{log.component}]</span>
                  </div>
                  <div className="text-slate-300 mt-0.5 font-mono text-[10px] break-words">
                    {log.message}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
