'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function AnalyticsSection() {
  const [ricePrice, setRicePrice] = useState<number>(12400);
  const [shallotsDelta, setShallotsDelta] = useState<string>("+14.2%");
  const [priceHistory, setPriceHistory] = useState<number[]>([12000, 12200, 12400, 12300, 12500]);

  useEffect(() => {
    async function loadPrices() {
      try {
        const [riceRes, shallotsRes] = await Promise.all([
          api.commodities.prices({ commodity: 'beras', limit: 5 }),
          api.commodities.prices({ commodity: 'cabai_merah', limit: 2 })
        ]);
        if (riceRes.items.length > 0) {
          setRicePrice(riceRes.items[0].price_idr);
          setPriceHistory(riceRes.items.map(item => item.price_idr).reverse());
        }
        if (shallotsRes.items.length >= 2) {
          const latest = shallotsRes.items[0].price_idr;
          const prev = shallotsRes.items[1].price_idr;
          const delta = ((latest - prev) / prev) * 100;
          setShallotsDelta(`${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`);
        }
      } catch (err) {
        console.error('Failed to load prices for AnalyticsSection:', err);
      }
    }
    loadPrices();
  }, []);

  // Compute heights for the 5 bars based on priceHistory (min 10%, max 90%)
  const maxP = Math.max(...priceHistory, 1);
  const minP = Math.min(...priceHistory, 0) * 0.95;
  const barHeights = priceHistory.map(p => `${((p - minP) / (maxP - minP)) * 80 + 10}%`);

  return (
    <div className="w-full h-full grid grid-cols-12 gap-6 overflow-hidden pointer-events-auto">
      {/* Left Section: Correlation Heatmap */}
      <section className="col-span-12 lg:col-span-8 flex flex-col min-h-0">
        {/* HUD Telemetry Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="space-y-1">
            <h2 className="font-headline text-2xl font-bold tracking-tight text-[#00F0FF] uppercase">ARCHIPELAGO_HEATMAP</h2>
            <p className="text-[10px] font-mono text-slate-400 uppercase">Spatial Correlator: Shallots / Rice Cluster Analysis</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-[#1e2024]/40 backdrop-blur-xl border border-white/10 px-3 py-1.5 flex flex-col items-end">
              <span className="text-[9px] text-slate-400 uppercase font-bold tracking-widest">Active Corridors</span>
              <span className="text-xs text-[#00F0FF] font-mono">2,419 UNIT/S</span>
            </div>
            <div className="bg-[#1e2024]/40 backdrop-blur-xl border border-red-500/20 px-3 py-1.5 flex flex-col items-end">
              <span className="text-[9px] text-red-400 uppercase font-bold tracking-widest">Disrupted</span>
              <span className="text-xs text-red-400 font-mono">14 NODES</span>
            </div>
          </div>
        </div>

        {/* Map Viewport */}
        <div className="flex-1 relative rounded-sm bg-surface-container-low border border-white/5 overflow-hidden group">
          <img 
            className="w-full h-full object-cover opacity-60 mix-blend-luminosity grayscale contrast-125" 
            alt="Dark stylized tactical satellite map" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCGn3Xw-ie0tQ-D162IDQ0D9MtZdESBF3EdiphoVdcSdj3mSHY_fFCfpf0x5AYg4Dwox9yrwDqzRhYFSL1UqmqM6bDlnro33oqVniO_oj-O4l5NCu-Ro5wRZ2fpFpc3xusb8XObZFd67Bm1ZMYwRka3k0tjtjEawhUX8PDfmfX9vKtqfaQH0MTf0GG9pcFhi0ixuEmLF8dpVfb5wSsA4sSWRuI9zAXko8ophNHHlMGyP91VNtU1o3RVNyOlzjzYb503MsfxgESUa_U"
          />
          {/* SVG Overlay for Data Visualization (Simulated) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 500">
            {/* Disrupted Corridors */}
            <path className="opacity-80" d="M 150 250 Q 250 150 400 280" fill="none" stroke="#ffb4ab" strokeDasharray="4 2" strokeWidth="1.5"></path>
            <path className="opacity-90" d="M 400 280 Q 550 400 700 320" fill="none" stroke="#93000a" strokeWidth="2"></path>
            {/* Price Spike Zones */}
            <circle className="animate-pulse" cx="400" cy="280" fill="url(#spikeGradient)" r="40"></circle>
            <circle cx="720" cy="330" fill="url(#spikeGradient)" r="25"></circle>
            <circle cx="210" cy="180" fill="url(#spikeGradient)" r="15"></circle>
            <defs>
              <radialGradient id="spikeGradient">
                <stop offset="0%" stopColor="#ffb4ab" stopOpacity="0.6"></stop>
                <stop offset="100%" stopColor="#93000a" stopOpacity="0"></stop>
              </radialGradient>
            </defs>
          </svg>

          {/* Floating Data Tags */}
          <div className="absolute top-1/2 left-1/3 bg-[#1e2024]/40 backdrop-blur-xl border border-[#00F0FF]/30 p-3 text-[10px]">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-[#00F0FF] animate-ping"></div>
              <span className="font-bold uppercase tracking-tighter">JAVA_CENTRAL_HUB</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4">
              <span className="text-slate-400">RICE_INDEX:</span><span className="text-[#00F0FF] font-mono">{ricePrice.toLocaleString()}/KG</span>
              <span className="text-slate-400">SHALLOTS:</span><span className="text-red-400 font-bold font-mono">{shallotsDelta}</span>
            </div>
          </div>

          {/* HUD Corners */}
          <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-[#00F0FF]/30"></div>
          <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-[#00F0FF]/30"></div>
          <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-[#00F0FF]/30"></div>
          <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-[#00F0FF]/30"></div>
        </div>
      </section>

      {/* Right Section: Sidebar Dashboard */}
      <section className="col-span-12 lg:col-span-4 bg-surface-container/30 backdrop-blur-md border border-white/5 p-6 flex flex-col gap-6 overflow-y-auto no-scrollbar rounded-sm">
        {/* Inflation Comparison Card */}
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <h3 className="font-headline text-sm font-bold tracking-widest text-on-surface uppercase">Inflation_Variancy</h3>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Live Delta: {shallotsDelta}</span>
          </div>
          <div className="h-44 bg-[#1e2024]/40 backdrop-blur-xl border border-white/10 rounded-sm p-4 relative flex items-end gap-2">
            {/* Neon Cyan (Predictive) Graph Bars (Dynamic) */}
            {barHeights.map((h, i) => (
              <div key={i} className="flex-1 bg-[#00F0FF]/10 relative group h-full">
                <div 
                  className="absolute bottom-0 w-full bg-[#00F0FF]/25 border-t border-[#00F0FF] transition-all duration-500" 
                  style={{ height: h }}
                />
              </div>
            ))}
            {/* Glowing Red (Actual) Graph Overlay (Simulated dynamic shift) */}
            <div className="absolute inset-x-4 bottom-4 h-full flex items-end gap-2 pointer-events-none">
              {barHeights.map((h, i) => (
                <div 
                  key={i} 
                  className="flex-1 bg-red-400/5 border-t-2 border-red-400 shadow-[0_-4px_12px_rgba(255,180,171,0.2)] transition-all duration-500"
                  style={{ height: `calc(${h} + ${i % 2 === 0 ? '5%' : '-3%'})` }}
                />
              ))}
            </div>
            {/* Legend */}
            <div className="absolute top-4 left-4 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[#00F0FF]"></div>
                <span className="text-[9px] uppercase font-bold tracking-tighter">Predictive</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-400"></div>
                <span className="text-[9px] uppercase font-bold tracking-tighter text-red-400">Actual</span>
              </div>
            </div>
          </div>
        </div>

        {/* Leading Indicators List */}
        <div className="space-y-4 flex-1">
          <h3 className="font-headline text-sm font-bold tracking-widest text-on-surface uppercase">Indicator_Risk_Ranking_24H</h3>
          <div className="space-y-2">
            {/* Item 1: High Risk */}
            <div className="bg-[#1e2024]/40 backdrop-blur-xl border border-white/10 p-3 border-l-4 border-l-red-400 flex justify-between items-center group cursor-pointer hover:bg-surface-container-high transition-colors">
              <div className="space-y-0.5">
                <p className="text-xs font-bold font-headline uppercase tracking-wider">SHALLOTS_SHALLOT</p>
                <p className="text-[10px] text-slate-400">Supply Chain Constriction • Sumatra Route</p>
              </div>
              <div className="text-right">
                <div className="px-2 py-0.5 bg-red-400/10 text-red-400 text-[9px] font-bold uppercase rounded-sm border border-red-400/20 mb-1">High Risk</div>
                <p className="text-[11px] font-mono text-red-400 font-bold">+18.5% VOL</p>
              </div>
            </div>
            {/* Item 2: Elevated */}
            <div className="bg-[#1e2024]/40 backdrop-blur-xl border border-white/10 p-3 border-l-4 border-l-orange-400 flex justify-between items-center group cursor-pointer hover:bg-surface-container-high transition-colors">
              <div className="space-y-0.5">
                <p className="text-xs font-bold font-headline uppercase tracking-wider">BIRD_EYE_CHILI</p>
                <p className="text-[10px] text-slate-400">Climatic Volatility • West Java</p>
              </div>
              <div className="text-right">
                <div className="px-2 py-0.5 bg-orange-400/10 text-orange-400 text-[9px] font-bold uppercase rounded-sm border border-orange-400/20 mb-1">Elevated</div>
                <p className="text-[11px] font-mono text-orange-400 font-bold">+6.2% VOL</p>
              </div>
            </div>
            {/* Item 3: Stable */}
            <div className="bg-[#1e2024]/40 backdrop-blur-xl border border-white/10 p-3 border-l-4 border-l-[#00F0FF] flex justify-between items-center group cursor-pointer hover:bg-surface-container-high transition-colors">
              <div className="space-y-0.5">
                <p className="text-xs font-bold font-headline uppercase tracking-wider">RICE_PREMIUM</p>
                <p className="text-[10px] text-slate-400">State Reserve Injection • National</p>
              </div>
              <div className="text-right">
                <div className="px-2 py-0.5 bg-[#00F0FF]/10 text-[#00F0FF] text-[9px] font-bold uppercase rounded-sm border border-[#00F0FF]/20 mb-1">Stable</div>
                <p className="text-[11px] font-mono text-[#00F0FF]">-1.2% VOL</p>
              </div>
            </div>
            {/* Item 4: Critical */}
            <div className="bg-[#1e2024]/40 backdrop-blur-xl border border-white/10 p-3 border-l-4 border-l-red-500 flex justify-between items-center group cursor-pointer hover:bg-surface-container-high transition-colors">
              <div className="space-y-0.5">
                <p className="text-xs font-bold font-headline uppercase tracking-wider">GARLIC_WHITE</p>
                <p className="text-[10px] text-slate-400">Port Congestion • Tanjung Priok</p>
              </div>
              <div className="text-right">
                <div className="px-2 py-0.5 bg-red-600 text-white text-[9px] font-bold uppercase rounded-sm mb-1">CRITICAL</div>
                <p className="text-[11px] font-mono text-red-500 font-bold">+24.9% VOL</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Meta */}
        <div className="pt-4 border-t border-white/5 mt-auto">
          <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 uppercase tracking-[0.2em]">
            <span>SECURE_FEED: EST_NODE_01</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF]"></span>
              SYNCHRONIZED
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
