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
        <div className="bg-orange-400/5 border border-orange-400/20 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide">
            Inflation Forecast
          </p>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">{forecast.commodity}</span>
            <span className="text-sm font-bold text-orange-400">
              +{forecast.pct_increase.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Projected over next {forecast.timeframe_hours}h · {forecast.region.replace(/_/g, ' ')}
          </p>
        </div>
      )}

      {/* Historical price chart */}
      {loadingChart ? (
        <div className="w-full h-[160px] flex items-center justify-center bg-slate-800/40 rounded-xl animate-pulse">
          <span className="text-[10px] text-slate-500">Loading dynamic chart data...</span>
        </div>
      ) : (
        <PriceChart
          data={chartData}
          crisisDate={`D-0`}
          title="PIHPS Commodity Prices (30d)"
        />
      )}

      {/* LTM episodes */}
      {Array.isArray(crisis.economic_intelligence_finding?.data?.ltm_episodes) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Historical Analogues
          </p>
          {(crisis.economic_intelligence_finding.data.ltm_episodes as Array<{
            title: string; inflation_multiplier: number; recovery_days: number; similarity_score: number;
          }>).map((ep, i) => (
            <div key={i} className="bg-slate-800/50 rounded-xl p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-xs font-medium text-slate-300">{ep.title}</span>
                <span className="text-xs text-cyan-400">
                  {Math.round(ep.similarity_score * 100)}% similar
                </span>
              </div>
              <p className="text-xs text-slate-500">
                ×{ep.inflation_multiplier.toFixed(1)} inflation · {ep.recovery_days}d recovery
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

