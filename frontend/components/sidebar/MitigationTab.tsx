'use client';
import type { CrisisState, RouteRecommendation } from '@/lib/types';

interface MitigationTabProps {
  crisis: CrisisState;
  activeRouteIdx: number | null;
  onSelectRoute: (idx: number) => void;
}

function RouteCard({
  route,
  idx,
  isActive,
  onSelect,
}: {
  route: RouteRecommendation;
  idx: number;
  isActive: boolean;
  onSelect: () => void;
}) {
  const riskColor = route.risk_score > 0.7 ? 'text-red-400' : route.risk_score > 0.4 ? 'text-yellow-400' : 'text-emerald-400';
  return (
    <button
      id={`route-option-${idx}`}
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        isActive
          ? 'border-cyan-400/50 bg-cyan-400/10 ring-1 ring-cyan-400/30'
          : 'border-white/10 bg-slate-800/40 hover:border-white/20'
      }`}
    >
      <div className="flex justify-between items-start mb-1.5">
        <span className="text-xs font-semibold text-slate-200">
          {idx === 0 ? '★ Recommended' : `Option ${idx + 1}`}
        </span>
        <span className={`text-xs font-medium ${riskColor}`}>
          Risk: {Math.round(route.risk_score * 100)}%
        </span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed mb-2">{route.description}</p>
      <div className="flex gap-3 text-xs text-slate-500">
        <span>📍 {route.distance_km.toFixed(0)} km</span>
        <span>⏱ {route.eta_minutes} min</span>
        <span>⛽ +{route.fuel_increase_pct.toFixed(0)}%</span>
      </div>
    </button>
  );
}

export function MitigationTab({ crisis, activeRouteIdx, onSelectRoute }: MitigationTabProps) {
  if (!crisis.route_recommendations || crisis.route_recommendations.length === 0) {
    return (
      <p className="text-xs text-slate-500 text-center py-6">
        No route alternatives generated yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 leading-relaxed mb-3">
        Select an alternative to highlight it on the map.
      </p>
      {crisis.route_recommendations.map((route, idx) => (
        <RouteCard
          key={idx}
          route={route}
          idx={idx}
          isActive={activeRouteIdx === idx}
          onSelect={() => onSelectRoute(idx)}
        />
      ))}
    </div>
  );
}
