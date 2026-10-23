'use client';
import { useState, useEffect } from 'react';
import { LineChart, TrendingUp } from 'lucide-react';
import PriceChart from '@/components/charts/PriceChart';
import { api } from '@/lib/api';
import { normalizeRegion } from '@/lib/region';
import type { CrisisState, LTMEpisode, PricePoint } from '@/lib/types';

interface EconomicTabProps {
  crisis: CrisisState;
}

function resolveLtmEpisodes(crisis: CrisisState): LTMEpisode[] {
  const nested = crisis.economic_intelligence_finding?.data?.ltm_episodes;
  if (Array.isArray(nested) && nested.length > 0) return nested as LTMEpisode[];
  return Array.isArray(crisis.ltm_episodes) ? crisis.ltm_episodes : [];
}

function resolvePctIncrease(forecast: CrisisState['inflation_forecast']): number | null {
  if (!forecast) return null;
  if (typeof forecast.pct_increase === 'number') return forecast.pct_increase;
  if (typeof forecast.inflation_multiplier === 'number') {
    return (forecast.inflation_multiplier - 1) * 100;
  }
  return null;
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

        const merged: PricePoint[] = [];
        const length = Math.max(berasRes.items.length, minyakRes.items.length, cabaiRes.items.length);
        for (let i = 0; i < length; i++) {
          merged.push({
            date: `D-${length - 1 - i}`,
            beras: berasRes.items[i]?.price_idr,
            minyak: minyakRes.items[i]?.price_idr,
            cabai: cabaiRes.items[i]?.price_idr,
          });
        }
        setChartData(
          merged.filter((row) => row.beras != null || row.minyak != null || row.cabai != null)
        );
      } catch (err) {
        console.error('Failed to load dynamic prices in EconomicTab:', err);
        setChartData([]);
      } finally {
        setLoadingChart(false);
      }
    }
    loadPrices();
  }, [crisis.region]);

  const episodes = resolveLtmEpisodes(crisis);
  const pctIncrease = resolvePctIncrease(forecast);
  const commodityLabel =
    forecast?.commodity ||
    forecast?.anomalous_commodities?.[0] ||
    null;
  const regionLabel = normalizeRegion(forecast?.region || crisis.region);

  return (
    <div className="space-y-4">
      {forecast ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            Proyeksi Kenaikan Harga
          </p>
          <div className="flex justify-between items-center gap-2">
            <span className="text-xs text-slate-300">{commodityLabel || 'Komoditas Pangan'}</span>
            {pctIncrease !== null ? (
              <span className="text-sm font-bold text-amber-400 tabular-nums">
                +{pctIncrease.toFixed(1)}%
              </span>
            ) : (
              <span className="text-xs text-slate-400">Persentase belum tersedia</span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {typeof forecast.timeframe_hours === 'number'
              ? `Estimasi ${forecast.timeframe_hours} jam ke depan`
              : 'Horizon proyeksi belum tersedia'}
            {regionLabel ? ` · ${regionLabel}` : ''}
          </p>
        </div>
      ) : (
        <div className="bg-[#121822] border border-[#1c2432] rounded-lg p-3">
          <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
            <LineChart className="w-3.5 h-3.5 text-slate-500" />
            Proyeksi inflasi belum diterbitkan untuk krisis ini.
          </p>
        </div>
      )}

      {/* Prediction narrative (Phase 58 expansion A): prose overlay on computed horizons */}
      {(() => {
        const narrative = crisis.prediction_finding?.data?.narrative;
        return typeof narrative === 'string' && narrative.length > 0 ? (
          <div className="bg-[#121822] border border-[#1c2432] rounded-lg p-3">
            <p className="text-xs font-semibold text-cyan-300 uppercase tracking-wide mb-1">
              Narasi Prakiraan
            </p>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">{narrative}</p>
          </div>
        ) : null;
      })()}

      {/* Historical price chart */}
      {loadingChart ? (
        <div className="w-full h-[160px] flex items-center justify-center bg-[#121822] border border-[#1c2432] rounded-md">
          <span className="text-xs font-mono text-slate-400">Memuat riwayat harga pangan...</span>
        </div>
      ) : chartData.length > 0 ? (
        <PriceChart
          data={chartData}
          crisisDate={`D-0`}
          title="Riwayat Harga Komoditas PIHPS (30 Hari)"
        />
      ) : (
        <div className="w-full h-[160px] flex flex-col items-center justify-center gap-1.5 bg-[#121822] border border-[#1c2432] rounded-md">
          <LineChart className="w-5 h-5 text-slate-500" />
          <span className="text-xs font-mono text-slate-400">Riwayat harga PIHPS belum tersedia.</span>
        </div>
      )}

      {/* LTM episodes */}
      {episodes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Preseden Disrupsi Serupa
          </p>
          {episodes.map((ep, i) => (
            <div key={ep.episode_id || i} className="bg-[#121822] border border-[#1c2432] rounded-lg p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-xs font-medium text-slate-200">{ep.title}</span>
                {typeof ep.similarity_score === 'number' && (
                  <span className="text-xs text-cyan-300 font-mono font-semibold tabular-nums">
                    {Math.round(ep.similarity_score * 100)}% kemiripan
                  </span>
                )}
              </div>
              {(typeof ep.inflation_multiplier === 'number' || typeof ep.recovery_days === 'number') && (
                <p className="text-xs text-slate-400">
                  {typeof ep.inflation_multiplier === 'number' && `Kenaikan ×${ep.inflation_multiplier.toFixed(1)}`}
                  {typeof ep.inflation_multiplier === 'number' && typeof ep.recovery_days === 'number' && ' · '}
                  {typeof ep.recovery_days === 'number' && `pemulihan ${ep.recovery_days} hari`}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
