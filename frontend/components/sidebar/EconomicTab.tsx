'use client';
import { useState, useEffect } from 'react';
import PriceChart from '@/components/charts/PriceChart';
import { api } from '@/lib/api';
import type { CrisisState, PricePoint } from '@/lib/types';

interface EconomicTabProps {
  crisis: CrisisState;
}

export function EconomicTab({ crisis }: EconomicTabProps) {
  const forecast = crisis.inflation_forecast;
  const [chartData, setChartData] = useState<PricePoint[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);

  useEffect(() => {
    async function loadPrices() {
      setLoadingChart(true);
      try {
        const [berasRes, minyakRes, cabaiRes] = await Promise.all([
          api.commodities.prices({ commodity: 'beras', region: crisis.region, limit: 30 }),
          api.commodities.prices({ commodity: 'minyak_goreng', region: crisis.region, limit: 30 }),
          api.commodities.prices({ commodity: 'cabai_merah', region: crisis.region, limit: 30 }),
        ]);

        const merged = [];
        const length = Math.max(berasRes.items.length, minyakRes.items.length, cabaiRes.items.length);
        for (let i = 0; i < length; i++) {
          const b = berasRes.items[i] || { price_idr: 14000 };
          const m = minyakRes.items[i] || { price_idr: 17000 };
          const c = cabaiRes.items[i] || { price_idr: 55000 };
          
          merged.push({
            date: `D-${length - 1 - i}`,
            beras: b.price_idr,
            minyak: m.price_idr,
            cabai: c.price_idr,
          });
        }
        setChartData(merged);
      } catch (err) {
        console.error('Failed to load dynamic prices in EconomicTab:', err);
      } finally {
        setLoadingChart(false);
      }
    }
    loadPrices();
  }, [crisis.region]);

  return (
    <div className="space-y-4">
      {forecast && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
            Proyeksi Kenaikan Harga
          </p>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-300">
              {forecast.commodity || (forecast as any).anomalous_commodities?.[0] || 'Komoditas Pangan'}
            </span>
            <span className="text-sm font-bold text-amber-400 tabular-nums">
              +{typeof forecast.pct_increase === 'number'
                ? forecast.pct_increase.toFixed(1)
                : typeof (forecast as any).inflation_multiplier === 'number'
                ? (((forecast as any).inflation_multiplier - 1) * 100).toFixed(1)
                : '0.0'}%
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Estimasi {forecast.timeframe_hours ?? 48} jam ke depan · {(forecast.region || 'Sumatera').replace(/_/g, ' ')}
          </p>
        </div>
      )}

      {/* Historical price chart */}
      {loadingChart ? (
        <div className="w-full h-[160px] flex items-center justify-center bg-[#121822] border border-[#1c2432] rounded-md">
          <span className="text-xs font-mono text-slate-400">Memuat riwayat harga pangan...</span>
        </div>
      ) : (
        <PriceChart
          data={chartData}
          crisisDate={`D-0`}
          title="Riwayat Harga Komoditas PIHPS (30 Hari)"
        />
      )}

      {/* LTM episodes */}
      {Array.isArray(crisis.economic_intelligence_finding?.data?.ltm_episodes) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Preseden Disrupsi Serupa
          </p>
          {(crisis.economic_intelligence_finding.data.ltm_episodes as Array<{
            title: string; inflation_multiplier: number; recovery_days: number; similarity_score: number;
          }>).map((ep, i) => (
            <div key={i} className="bg-[#121822] border border-[#1c2432] rounded-lg p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-xs font-medium text-slate-200">{ep.title}</span>
                <span className="text-xs text-cyan-300 font-mono font-semibold tabular-nums">
                  {Math.round(ep.similarity_score * 100)}% kemiripan
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Kenaikan ×{ep.inflation_multiplier.toFixed(1)} · pemulihan {ep.recovery_days} hari
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

