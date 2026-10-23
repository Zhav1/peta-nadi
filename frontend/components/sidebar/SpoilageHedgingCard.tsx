'use client';

import { useState, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingDown, 
  Clock, 
  Fuel, 
  ThermometerSnowflake, 
  ShieldAlert, 
  CheckCircle2, 
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import type { HedgingSolveResponse, HedgingSolveRequest } from '@/lib/types';
import { useIntermodalData } from '@/hooks/useIntermodalData';

interface SpoilageHedgingCardProps {
  commodity: string;
  vehicleId: string;
  cargoTonnage: number;
  origin: string;
  destination: string;
  detourDistanceKm: number;
  detourTimeHours: number;
  onApplyPolicy?: (policy: 'CONTINUE' | 'REROUTE' | 'HOLD') => void;
}

export function SpoilageHedgingCard({
  commodity,
  vehicleId,
  cargoTonnage,
  origin,
  destination,
  detourDistanceKm,
  detourTimeHours,
  onApplyPolicy
}: SpoilageHedgingCardProps) {
  const { solveHedging } = useIntermodalData();
  const [data, setData] = useState<HedgingSolveResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<'CONTINUE' | 'REROUTE' | 'HOLD'>('REROUTE');

  const executeSolve = async () => {
    setLoading(true);
    setError(null);
    try {
      const req: HedgingSolveRequest = {
        vehicle_id: vehicleId,
        commodity: commodity,
        cargo_tonnage: cargoTonnage,
        origin: origin,
        destination: destination,
        vehicle_golongan: 'GOL_II',
        fuel_type: 'biosolar',
        p_disruption: 0.85,
        disruption_delay_hours: 14.0,
        detour_distance_km: detourDistanceKm,
        detour_time_hours: detourTimeHours,
        toll_segments: ['MEDAN_TEBINGTINGGI'],
        hold_wait_hours: 6.0
      };
      const res = await solveHedging(req, 0.05);
      setData(res);
      setSelectedPolicy(res.optimal_policy);
    } catch (err) {
      // Never fabricate a cost matrix client-side. If the hedging solver is
      // unreachable, the card states "belum tersedia" instead of inventing Rp.
      console.warn('Hedging solve unavailable:', err);
      setData(null);
      setError('Belum tersedia — kalkulasi hedging gagal atau server tidak merespons. Tidak ada angka biaya yang ditampilkan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    executeSolve();
  }, [commodity, vehicleId, cargoTonnage, origin, destination, detourDistanceKm, detourTimeHours]);

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="bg-[#121822] border border-[#1c2432] p-3.5 rounded-md text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1c2432] pb-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-sans font-bold text-slate-100">
                Hedging Biaya & Risiko Pembusukan
              </span>
              <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-cyan-950 text-cyan-400 border border-cyan-500/30">
                FR-18
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
              <span className="flex items-center gap-1">
                <ThermometerSnowflake className="w-3 h-3 text-cyan-400" />
                {data?.perishability_tier || 'Tingkat pembusukan belum tersedia'}
              </span>
              <span>•</span>
              <span>Muatan: {cargoTonnage} Ton ({commodity})</span>
            </div>
          </div>
        </div>

        <button
          onClick={executeSolve}
          disabled={loading}
          className="p-1.5 rounded bg-[#0c1017] hover:bg-slate-800 border border-[#1c2432] text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Kalkulasi Ulang Hedging"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2.5 rounded-md bg-amber-950/30 border border-amber-500/40 text-xs font-sans text-amber-200 leading-relaxed">
          {error}
        </div>
      )}

      {/* Net Savings Highlight Box */}
      {data && (
        <div className="mb-3 p-2.5 rounded-md bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-xs font-sans text-emerald-300/80">Rekomendasi Finansial Terpilih</p>
              <p className="text-xs font-mono font-bold text-emerald-300">
                Optimal: {data.optimal_policy} • Hemat {formatIDR(data.net_savings_idr)}
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            PENGHEMATAN BERSIH
          </span>
        </div>
      )}

      {/* 3-Policy Comparison Grid */}
      {data && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {/* CONTINUE */}
          <div 
            onClick={() => setSelectedPolicy('CONTINUE')}
            className={`p-2.5 rounded-md border transition-all cursor-pointer ${
              selectedPolicy === 'CONTINUE' 
                ? 'bg-rose-950/40 border-rose-500/60' 
                : 'bg-[#0c1017] border-[#1c2432] hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono font-bold text-slate-300">CONTINUE</span>
              <span className="px-1 py-0.5 rounded text-xs font-mono bg-rose-950 text-rose-400 border border-rose-500/30">
                KRITIS
              </span>
            </div>
            <p className="text-xs font-mono font-bold text-rose-400">
              {formatIDR(data.continue_policy.cost_idr)}
            </p>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-tight font-sans">
              Biaya pembusukan muatan saat macet.
            </p>
          </div>

          {/* REROUTE */}
          <div 
            onClick={() => setSelectedPolicy('REROUTE')}
            className={`p-2.5 rounded-md border transition-all cursor-pointer ${
              selectedPolicy === 'REROUTE' 
                ? 'bg-cyan-950/40 border-cyan-400/70' 
                : 'bg-[#0c1017] border-[#1c2432] hover:border-slate-700'
            } ${data.optimal_policy === 'REROUTE' ? 'relative' : ''}`}
          >
            {data.optimal_policy === 'REROUTE' && (
              <span className="absolute -top-2 right-2 px-1.5 py-0.5 bg-emerald-400 text-emerald-950 text-xs font-mono font-bold rounded">
                OPTIMAL
              </span>
            )}
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono font-bold text-slate-300">REROUTE</span>
              <span className="px-1 py-0.5 rounded text-xs font-mono bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                AMAN
              </span>
            </div>
            <p className="text-xs font-mono font-bold text-cyan-300">
              {formatIDR(data.reroute_policy.cost_idr)}
            </p>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-tight font-sans">
              Tol BPJT + BBM Biosolar + Lembur.
            </p>
          </div>

          {/* HOLD */}
          <div 
            onClick={() => setSelectedPolicy('HOLD')}
            className={`p-2.5 rounded-md border transition-all cursor-pointer ${
              selectedPolicy === 'HOLD' 
                ? 'bg-amber-950/40 border-amber-500/60' 
                : 'bg-[#0c1017] border-[#1c2432] hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono font-bold text-slate-300">HOLD</span>
              <span className="px-1 py-0.5 rounded text-xs font-mono bg-amber-950 text-amber-300 border border-amber-500/30">
                SEDANG
              </span>
            </div>
            <p className="text-xs font-mono font-bold text-amber-300">
              {formatIDR(data.hold_policy.cost_idr)}
            </p>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-tight font-sans">
              Sewa Depo + Genset Reefer.
            </p>
          </div>
        </div>
      )}

      {/* Selected Policy Justification Rationale */}
      {data && (
        <div className="p-2.5 rounded-md bg-[#0c1017] border border-[#1c2432] text-xs font-sans leading-relaxed text-slate-300 mb-3">
          <span className="text-xs font-mono font-bold text-slate-400 block mb-1">
            Penalaran Operasional ({selectedPolicy}):
          </span>
          {selectedPolicy === 'CONTINUE' && data.continue_policy.explanation}
          {selectedPolicy === 'REROUTE' && data.reroute_policy.explanation}
          {selectedPolicy === 'HOLD' && data.hold_policy.explanation}
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={() => data && onApplyPolicy && onApplyPolicy(selectedPolicy)}
        disabled={!data}
        className="cursor-pointer w-full py-2 px-3 rounded-md bg-white hover:bg-slate-200 text-[#080d14] font-sans font-semibold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>
          {data ? `Terapkan Kebijakan Mitigasi: ${selectedPolicy}` : 'Kebijakan mitigasi belum tersedia'}
        </span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
