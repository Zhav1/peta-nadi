'use client';

import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { 
  TrendingUp, 
  Activity, 
  ShieldAlert, 
  Layers, 
  ArrowUpRight, 
  Info
} from 'lucide-react';
import { api } from '@/lib/api';
import type { CrisisState, CorridorContext, RouteRecommendation } from '@/lib/types';

import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface AnalyticsSectionProps {
  selectedCrisis?: CrisisState | null;
  corridorContext?: CorridorContext | null;
  activeRoutes?: RouteRecommendation[];
  onSwitchTab?: (tab: 'map' | 'analytics' | 'reports' | 'evaluation') => void;
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

  const [ricePrice, setRicePrice] = useState<number | null>(null);
  const [shallotsDelta, setShallotsDelta] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [isLoadingPrices, setIsLoadingPrices] = useState<boolean>(true);

  // Fetch real PIHPS prices on mount
  useEffect(() => {
    let isMounted = true;
    async function loadPrices() {
      setIsLoadingPrices(true);
      try {
        const [riceRes, shallotsRes] = await Promise.all([
          api.commodities.prices({ commodity: 'beras', limit: 5 }),
          api.commodities.prices({ commodity: 'cabai_merah', limit: 2 })
        ]);
        if (!isMounted) return;
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
      } finally {
        if (isMounted) setIsLoadingPrices(false);
      }
    }
    loadPrices();
    return () => {
      isMounted = false;
    };
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
        try {
          const deckOverlay = new MapboxOverlay({
            interleaved: false,
            layers: []
          });

          map.addControl(deckOverlay as unknown as mapboxgl.IControl);
          deckOverlayRef.current = deckOverlay;
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

  // Deck.gl Layer updater
  const updateDeckLayers = () => {
    if (!deckOverlayRef.current) return;
    deckOverlayRef.current.setProps({
      layers: []
    });
  };

  useEffect(() => {
    updateDeckLayers();
  }, [selectedCrisis, corridorContext, activeRoutes]);

  // Compute bar heights safely from real priceHistory
  const maxP = priceHistory.length > 0 ? Math.max(...priceHistory) : 1;
  const minP = priceHistory.length > 0 ? Math.min(...priceHistory) * 0.95 : 0;
  const barHeights = priceHistory.map((p) =>
    maxP === minP ? '50%' : `${((p - minP) / (maxP - minP)) * 75 + 15}%`
  );

  return (
    <div className="w-full min-h-full lg:h-full grid grid-cols-12 gap-6 pointer-events-auto">
      
      {/* LEFT SECTION: Spatial Canvas & Real Corridor Context */}
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
              Pemantauan spasial aliran komoditas pangan pokok dan pergerakan harga pasar.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-[#121822] border border-white/10 px-3.5 py-2 rounded-lg flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-300" />
              <div>
                <span className="text-xs text-slate-400 font-medium block">Rute Operasional</span>
                <span className="text-xs font-mono font-bold text-white tabular-nums">
                  {activeRoutes && activeRoutes.length > 0 ? `${activeRoutes.length} Koridor` : 'Data tidak tersedia'}
                </span>
              </div>
            </div>

            <div className="bg-[#121822] border border-white/10 px-3.5 py-2 rounded-lg flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-slate-300" />
              <div>
                <span className="text-xs text-slate-400 font-medium block">Disrupsi Aktif</span>
                <span className="text-xs font-mono font-bold text-white tabular-nums truncate max-w-[140px] block" title={selectedCrisis?.title || 'Data tidak tersedia'}>
                  {selectedCrisis ? selectedCrisis.title : 'Data tidak tersedia'}
                </span>
              </div>
            </div>

            <div className="bg-[#121822] border border-white/10 px-3.5 py-2 rounded-lg flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-300" />
              <div>
                <span className="text-xs text-slate-400 font-medium block">Delta Harga PIHPS</span>
                <span className="text-xs font-mono font-bold text-white tabular-nums">
                  {shallotsDelta !== null ? shallotsDelta : 'Data tidak tersedia'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* MAP CANVAS VIEWPORT CONTAINER */}
        <div className="flex-1 relative rounded-xl border border-white/10 overflow-hidden bg-[#080d14] min-h-[360px]">
          
          {/* Mapbox Canvas */}
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

          {/* Honest Status Overlay */}
          <div className="absolute top-4 left-4 z-20 bg-[#0c1017]/90 backdrop-blur-md border border-white/10 px-3.5 py-2 rounded-lg text-xs flex items-center gap-2 shadow-lg">
            <Info className="w-4 h-4 text-slate-400" />
            <span className="text-slate-300 font-sans">
              Visualisasi Aliran Komoditas Spasial (Sumatera - Jawa)
            </span>
          </div>

          {/* Region Metric Badge */}
          <div className="absolute bottom-4 left-4 z-20 bg-[#0c1017]/90 backdrop-blur-md border border-white/10 p-4 rounded-xl text-xs space-y-2 shadow-xl max-w-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${ricePrice !== null ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              <span className="font-semibold text-xs tracking-wide text-white">KORIDOR SUMATERA UTARA</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 pt-1 font-mono text-xs">
              <span className="text-slate-400">Harga Beras:</span>
              <span className="text-slate-200 font-bold tabular-nums">
                {ricePrice !== null ? `Rp ${ricePrice.toLocaleString('id-ID')} / kg` : 'Data tidak tersedia'}
              </span>
              <span className="text-slate-400">Delta Cabai:</span>
              <span className="font-bold tabular-nums text-slate-200">
                {shallotsDelta !== null ? (
                  <span className={shallotsDelta.startsWith('+') ? 'text-amber-400' : 'text-emerald-400'}>
                    {shallotsDelta}
                  </span>
                ) : (
                  'Data tidak tersedia'
                )}
              </span>
            </div>
            {onSwitchTab && (
              <button
                type="button"
                onClick={() => onSwitchTab('map')}
                className="mt-2.5 w-full py-2 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                Simulasi Bencana (Peta) <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* RIGHT SECTION: Sidebar (Real PIHPS Price History & Honest Risk Ranking) */}
      <section className="col-span-12 lg:col-span-4 bg-[#0c1017] border border-white/10 p-5 flex flex-col gap-6 overflow-y-auto no-scrollbar rounded-xl shadow-xl">
        
        {/* Price History Card */}
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-300" /> Riwayat Harga Beras (PIHPS)
            </h3>
            <span className="text-xs font-mono text-slate-300 font-medium tabular-nums">
              {ricePrice !== null ? `Rp ${ricePrice.toLocaleString('id-ID')} / kg` : 'Data tidak tersedia'}
            </span>
          </div>

          <div className="h-44 bg-[#121822] border border-white/10 rounded-lg p-4 relative flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
              <span>Tren 5 Titik Terakhir</span>
              <span className="text-slate-300">Sumber: PIHPS Bank Indonesia</span>
            </div>

            {/* Authentic Single-Dataset Bars or Honest Empty State */}
            {priceHistory.length > 0 ? (
              <div className="h-28 flex items-end gap-2 pt-2">
                {barHeights.map((h, i) => (
                  <div key={i} className="flex-1 bg-white/5 relative group h-full rounded-t-sm overflow-hidden flex flex-col justify-end items-center">
                    <div 
                      className="w-full bg-white/20 border-t-2 border-white/60 hover:bg-white/30 transition-all duration-300" 
                      style={{ height: h }}
                    />
                    <span className="font-mono text-xs text-slate-400 mt-1">T-{priceHistory.length - 1 - i}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-28 flex items-center justify-center text-xs text-slate-500 font-mono">
                {isLoadingPrices ? 'Menghubungkan ke PIHPS...' : 'Data tidak tersedia'}
              </div>
            )}
          </div>
        </div>

        {/* Commodity Indicator Risk Ranking 24H */}
        <div className="space-y-3 flex-1 flex flex-col min-h-0">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-slate-400" /> Peringkat Risiko Komoditas (24 Jam)
            </h3>
            <span className="text-xs font-mono text-slate-400">PIHPS</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center rounded-lg border border-dashed border-white/10 bg-[#121822]/50 text-slate-400">
            <Info className="w-5 h-5 mb-2 text-slate-500" />
            <p className="text-xs font-medium text-slate-300">Data pemeringkatan risiko belum tersedia</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xs font-sans">
              Pemeringkatan risiko volatilitas memerlukan data deret waktu PIHPS kontinu multi-pasar yang saat ini belum terhubung.
            </p>
          </div>
        </div>

      </section>

    </div>
  );
}
