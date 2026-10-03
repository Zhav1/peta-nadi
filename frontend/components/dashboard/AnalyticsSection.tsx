'use client';

import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ArcLayer, ScatterplotLayer } from '@deck.gl/layers';
import { 
  TrendingUp, 
  Activity, 
  ShieldAlert, 
  Layers, 
  ArrowUpRight, 
  Wheat, 
  Flame, 
  ShoppingBag
} from 'lucide-react';
import { api } from '@/lib/api';
import type { CrisisState, CorridorContext, RouteRecommendation } from '@/lib/types';

import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface AnalyticsSectionProps {
  selectedCrisis?: CrisisState | null;
  corridorContext?: CorridorContext | null;
  activeRoutes?: RouteRecommendation[];
  onSwitchTab?: (tab: 'map' | 'analytics' | 'simulation' | 'reports' | 'evaluation') => void;
}

interface CommodityArcItem {
  from: [number, number];
  to: [number, number];
  status: 'critical' | 'disrupted' | 'clear';
  commodity: string;
}

interface MarketScatterItem {
  position: [number, number];
  name: string;
  status: 'critical' | 'warning' | 'clear';
  radius: number;
}

export default function AnalyticsSection({
  selectedCrisis,
  corridorContext,
  activeRoutes,
  onSwitchTab
}: AnalyticsSectionProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const deckOverlayRef = useRef<MapboxOverlay | null>(null);

  const [ricePrice, setRicePrice] = useState<number>(12400);
  const [shallotsDelta, setShallotsDelta] = useState<string>("+14.2%");
  const [priceHistory, setPriceHistory] = useState<number[]>([12000, 12200, 12400, 12300, 12500]);
  const [activeGraphNode, setActiveGraphNode] = useState<number>(0);

  // Fetch prices on mount
  useEffect(() => {
    async function loadPrices() {
      try {
        const [riceRes, shallotsRes] = await Promise.all([
          api.commodities.prices({ commodity: 'beras', limit: 5 }),
          api.commodities.prices({ commodity: 'cabai_merah', limit: 2 })
        ]);
        if (riceRes && riceRes.items && riceRes.items.length > 0) {
          setRicePrice(riceRes.items[0].price_idr);
          setPriceHistory(riceRes.items.map((item: { price_idr: number }) => item.price_idr).reverse());
        }
        if (shallotsRes && shallotsRes.items && shallotsRes.items.length >= 2) {
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

  // Initialize Mapbox & Deck.gl spatial archipelago map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [104.5, 1.8], // Center over Indonesia (Sumatra - Java corridor)
        zoom: 5.2,
        pitch: 35,
        bearing: -10,
        attributionControl: false,
      });

      mapRef.current = map;

      map.on('load', () => {
        map.resize();
        // Setup Deck.gl MapboxOverlay
        try {
          const deckOverlay = new MapboxOverlay({
            interleaved: false,
            layers: []
          });

          map.addControl(deckOverlay as unknown as mapboxgl.IControl);
          deckOverlayRef.current = deckOverlay;

          // Update Deck.gl layers
          updateDeckLayers();
        } catch (deckErr) {
          console.warn('Deck.gl overlay initialization error:', deckErr);
        }
      });
    } catch (err) {
      console.warn('Mapbox initialization error in AnalyticsSection:', err);
    }

    // ResizeObserver to ensure canvas fills container on layout updates / tab switches
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Deck.gl Arc & Scatterplot Layers
  const updateDeckLayers = () => {
    if (!deckOverlayRef.current) return;

    // Archipelago Logistics Arcs (Belawan -> Medan -> Tebing -> Java)
    const arcData: CommodityArcItem[] = [
      {
        from: [98.68, 3.78], // Belawan Port
        to: [98.67, 3.59],   // Medan Hub
        status: 'critical',  // Flooded corridor
        commodity: 'CPO / Cooking Oil'
      },
      {
        from: [98.68, 3.78], // Belawan Port
        to: [106.84, -6.20], // Jakarta / Java Central Hub
        status: 'disrupted', // Maritime Delay
        commodity: 'Rice & Flour Freight'
      },
      {
        from: [99.16, 3.33], // Tebing Tinggi Interchange
        to: [98.67, 3.59],   // Medan
        status: 'clear',     // Safe Detour
        commodity: 'Shallots & Vegetables'
      },
      {
        from: [104.75, -2.99], // Palembang Hub
        to: [106.84, -6.20],   // Jakarta
        status: 'clear',
        commodity: 'General Goods'
      }
    ];

    const scatterData: MarketScatterItem[] = [
      { position: [98.68, 3.78], name: 'Belawan Port', status: 'critical', radius: 35000 },
      { position: [98.67, 3.59], name: 'Medan Hub', status: 'warning', radius: 25000 },
      { position: [99.16, 3.33], name: 'Tebing Tinggi', status: 'clear', radius: 20000 },
      { position: [106.84, -6.20], name: 'Java Central Hub', status: 'warning', radius: 45000 },
    ];

    const arcLayer = new ArcLayer<CommodityArcItem>({
      id: 'commodity-flow-arcs',
      data: arcData,
      getSourcePosition: (d: CommodityArcItem) => d.from,
      getTargetPosition: (d: CommodityArcItem) => d.to,
      getSourceColor: (d: CommodityArcItem) => d.status === 'critical' ? [239, 68, 68, 255] : d.status === 'disrupted' ? [245, 158, 11, 255] : [0, 240, 255, 200],
      getTargetColor: (d: CommodityArcItem) => d.status === 'critical' ? [239, 68, 68, 200] : d.status === 'disrupted' ? [245, 158, 11, 200] : [16, 185, 129, 200],
      getWidth: 3.5,
      getHeight: 0.4,
      greatCircle: true,
    });

    const scatterLayer = new ScatterplotLayer<MarketScatterItem>({
      id: 'market-hub-spots',
      data: scatterData,
      getPosition: (d: MarketScatterItem) => d.position,
      getFillColor: (d: MarketScatterItem) => d.status === 'critical' ? [239, 68, 68, 160] : d.status === 'warning' ? [245, 158, 11, 140] : [16, 185, 129, 120],
      getLineColor: () => [255, 255, 255, 200],
      getRadius: (d: MarketScatterItem) => d.radius,
      radiusMinPixels: 8,
      radiusMaxPixels: 30,
      lineWidthMinPixels: 1.5,
      stroked: true,
    });

    deckOverlayRef.current.setProps({
      layers: [arcLayer, scatterLayer]
    });
  };

  // Update deck layers when data changes
  useEffect(() => {
    updateDeckLayers();
  }, [selectedCrisis, corridorContext, activeRoutes]);

  // Compute bar heights
  const maxP = Math.max(...priceHistory, 1);
  const minP = Math.min(...priceHistory, 0) * 0.95;
  const barHeights = priceHistory.map(p => `${((p - minP) / (maxP - minP)) * 75 + 15}%`);

  // GraphRAG Chain of Impact Nodes
  const causalChain = [
    { label: 'Belawan Port Closed', sub: 'Flash Flood + High Waves', status: 'CRITICAL', color: 'text-red-400 border-red-500/40 bg-red-500/10' },
    { label: 'CPO & Rice Truck Stalled', sub: 'Jalinsum 4.2 km Congestion', status: 'WARNING', color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
    { label: 'Medan Market Supply Drop', sub: '-35% Daily Volume Delivered', status: 'WARNING', color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
    { label: 'Retail Price Spike +18.5%', sub: 'Predicted 48h Market Impact', status: 'ALERT', color: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10' }
  ];

  return (
    <div className="w-full h-full grid grid-cols-12 gap-6 overflow-hidden pointer-events-auto">
      
      {/* LEFT SECTION: 4D Mapbox/Deck.gl Spatial Canvas & GraphRAG Chain */}
      <section className="col-span-12 lg:col-span-8 flex flex-col min-h-0 gap-4">
        
        {/* Telemetry Header */}
        <div className="flex flex-wrap justify-between items-center gap-4 bg-[#0c1017] border border-white/10 p-5 rounded-xl shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-slate-300" />
              <h2 className="font-headline text-lg font-semibold tracking-wide text-white">
                Peta Arus Distribusi & Kerentanan Pangan
              </h2>
            </div>
            <p className="text-xs font-sans text-slate-400 mt-1">
              Korelasi spasial Deck.gl: aliran komoditas strategis dan pemantauan volatilitas harga pasar.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-[#121822] border border-white/10 px-3.5 py-2 rounded-lg flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-300" />
              <div>
                <span className="text-xs text-slate-400 font-medium block">Koridor Terpantau</span>
                <span className="text-xs font-mono font-bold text-white">4 Jalur Utama</span>
              </div>
            </div>

            <div className="bg-[#121822] border border-red-500/30 px-3.5 py-2 rounded-lg flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <div>
                <span className="text-xs text-red-400 font-medium block">Simpul Terdampak</span>
                <span className="text-xs font-mono font-bold text-red-400">1 Titik (Belawan)</span>
              </div>
            </div>

            <div className="bg-[#121822] border border-amber-500/30 px-3.5 py-2 rounded-lg flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-xs text-amber-400 font-medium block">Risiko Volatilitas</span>
                <span className="text-xs font-mono font-bold text-amber-400">{shallotsDelta}</span>
              </div>
            </div>
          </div>
        </div>

        {/* MAP CANVAS VIEWPORT CONTAINER */}
        <div className="flex-1 relative rounded-xl border border-white/10 overflow-hidden bg-[#080d14] min-h-[360px]">
          
          {/* Mapbox Canvas */}
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

          {/* Causal Chain Panel */}
          <div className="absolute top-4 left-4 right-4 z-20 bg-[#0c1017] border border-white/10 p-4 rounded-xl shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-300" />
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-200">
                  Rantai Kausalitas Dampak
                </span>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Koridor: Belawan &rarr; Medan &rarr; Trans-Sumatera
              </span>
            </div>

            {/* Causal Chain Nodes */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              {causalChain.map((node, idx) => (
                <div 
                  key={idx}
                  onClick={() => setActiveGraphNode(idx)}
                  className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                    activeGraphNode === idx 
                      ? 'bg-white/10 border-white/40' 
                      : 'bg-[#121822] border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-mono font-medium text-slate-400">SIMPUL 0{idx + 1}</span>
                    <span className="text-xs font-mono font-medium px-1.5 py-0.5 rounded bg-black/40 text-slate-300">{node.status}</span>
                  </div>
                  <p className="text-xs font-semibold text-white truncate">{node.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{node.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Region Metric Badge */}
          <div className="absolute bottom-4 left-4 z-20 bg-[#0c1017] border border-white/10 p-4 rounded-xl text-xs space-y-1.5 shadow-xl max-w-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-semibold text-xs tracking-wide text-white">KORIDOR SUMATERA UTARA</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 pt-1 font-mono text-xs">
              <span className="text-slate-400">Harga Beras:</span>
              <span className="text-slate-200 font-bold">Rp {ricePrice.toLocaleString('id-ID')} / kg</span>
              <span className="text-slate-400">Delta Bawang:</span>
              <span className="text-red-400 font-bold">{shallotsDelta}</span>
            </div>
            {onSwitchTab && (
              <button
                onClick={() => onSwitchTab('simulation')}
                className="mt-2.5 w-full py-2 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                Simulasi Skenario Dampak <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* RIGHT SECTION: Sidebar (Inflation Variance & Commodity Risk Ranking) */}
      <section className="col-span-12 lg:col-span-4 bg-[#0c1017] border border-white/10 p-5 flex flex-col gap-6 overflow-y-auto no-scrollbar rounded-xl shadow-xl">
        
        {/* Inflation Variance Card */}
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-300" /> Variansi Inflasi Pasar
            </h3>
            <span className="text-xs font-mono text-slate-300 font-medium">
              Delta: {shallotsDelta}
            </span>
          </div>

          <div className="h-44 bg-[#121822] border border-white/10 rounded-lg p-4 relative flex items-end gap-2 overflow-hidden">
            {/* Legend */}
            <div className="absolute top-3 left-3 flex items-center gap-4 z-10">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-slate-300" />
                <span className="text-xs text-slate-300 font-mono">Prediktif</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-red-400" />
                <span className="text-xs text-red-400 font-mono">Aktual</span>
              </div>
            </div>

            {/* Bars */}
            {barHeights.map((h, i) => (
              <div key={i} className="flex-1 bg-white/5 relative group h-full rounded-t-sm overflow-hidden">
                <div 
                  className="absolute bottom-0 w-full bg-white/20 border-t-2 border-white/40 transition-all duration-300" 
                  style={{ height: h }}
                />
              </div>
            ))}

            {/* Actual Overlay Bars */}
            <div className="absolute inset-x-4 bottom-4 h-full flex items-end gap-2 pointer-events-none">
              {barHeights.map((h, i) => (
                <div 
                  key={i} 
                  className="flex-1 bg-red-500/10 border-t-2 border-red-400 transition-all duration-300"
                  style={{ height: `calc(${h} + ${i % 2 === 0 ? '6%' : '-4%'})` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Commodity Indicator Risk Ranking 24H */}
        <div className="space-y-3 flex-1 flex flex-col min-h-0">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" /> Peringkat Risiko Komoditas (24 Jam)
            </h3>
            <span className="text-xs font-mono text-slate-400">Sinkronisasi PIHPS</span>
          </div>

          <div className="space-y-2.5 overflow-y-auto no-scrollbar flex-1 pr-1">
            
            {/* Item 1 */}
            <div className="bg-[#121822] border border-red-500/30 hover:border-red-500/60 p-3.5 rounded-lg transition-colors cursor-pointer">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-semibold text-white">Cabai Merah & Bawang</span>
                </div>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40">
                  RISIKO TINGGI
                </span>
              </div>
              <p className="text-xs text-slate-400">Penyempitan Pasokan Jalur Sumatera</p>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5 font-mono text-xs">
                <span className="text-slate-400">Volatilitas:</span>
                <span className="text-red-400 font-bold">+18.5%</span>
              </div>
            </div>

            {/* Item 2 */}
            <div className="bg-[#121822] border border-amber-500/30 hover:border-amber-500/60 p-3.5 rounded-lg transition-colors cursor-pointer">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-white">Cabai Rawit</span>
                </div>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  WASPADA
                </span>
              </div>
              <p className="text-xs text-slate-400">Anomali Cuaca Sumatera Barat</p>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5 font-mono text-xs">
                <span className="text-slate-400">Volatilitas:</span>
                <span className="text-amber-400 font-bold">+6.2%</span>
              </div>
            </div>

            {/* Item 3 */}
            <div className="bg-[#121822] border border-emerald-500/30 hover:border-emerald-500/60 p-3.5 rounded-lg transition-colors cursor-pointer">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <Wheat className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-white">Beras Premium</span>
                </div>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  STABIL
                </span>
              </div>
              <p className="text-xs text-slate-400">Injeksi Cadangan Beras Pemerintah (Bulog)</p>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5 font-mono text-xs">
                <span className="text-slate-400">Volatilitas:</span>
                <span className="text-emerald-400 font-bold">-1.2%</span>
              </div>
            </div>

            {/* Item 4 */}
            <div className="bg-[#121822] border border-red-500/30 hover:border-red-500/60 p-3.5 rounded-lg transition-colors cursor-pointer">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-semibold text-white">Bawang Putih</span>
                </div>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40">
                  KRITIS
                </span>
              </div>
              <p className="text-xs text-slate-400">Kongesti Arteri Pelabuhan Belawan</p>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5 font-mono text-xs">
                <span className="text-slate-400">Volatilitas:</span>
                <span className="text-red-400 font-bold">+24.5%</span>
              </div>
            </div>

          </div>
        </div>

      </section>

    </div>
  );
}
