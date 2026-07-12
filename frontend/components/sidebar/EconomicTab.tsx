'use client';
import PriceChart from '@/components/charts/PriceChart';
import type { CrisisState } from '@/lib/types';

// Synthetic PIHPS stub data — will be replaced by real Supabase query in Phase 6
const STUB_PRICES = Array.from({ length: 30 }, (_, i) => ({
  date: `D-${30 - i}`,
  beras: 14000 + Math.round(Math.random() * 1000),
  minyak: 17000 + Math.round(Math.random() * 1500),
  cabai: 55000 + Math.round(Math.random() * 20000),
}));

interface EconomicTabProps {
  crisis: CrisisState;
}

export function EconomicTab({ crisis }: EconomicTabProps) {
  const forecast = crisis.inflation_forecast;

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
      <PriceChart
        data={STUB_PRICES}
        crisisDate={`D-0`}
        title="PIHPS Commodity Prices (30d)"
      />

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
