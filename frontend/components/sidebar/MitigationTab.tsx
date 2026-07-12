'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { CrisisState, RouteRecommendation } from '@/lib/types';

interface MitigationTabProps {
  crisis: CrisisState;
  activeRouteIdx: number | null;
  onSelectRoute: (idx: number) => void;
  onApproveSuccess?: (msg: string) => void;
}

interface RouteCardProps {
  route: RouteRecommendation;
  idx: number;
  isActive: boolean;
  onSelect: () => void;
  isApproved: boolean;
  approving: boolean;
  onApprove: () => void;
}

function RouteCard({
  route,
  idx,
  isActive,
  onSelect,
  isApproved,
  approving,
  onApprove,
}: RouteCardProps) {
  const riskColor = route.risk_score > 0.7 ? 'text-red-400' : route.risk_score > 0.4 ? 'text-yellow-400' : 'text-emerald-400';
  
  return (
    <div
      id={`route-option-${idx}`}
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
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
      
      <div className="flex gap-3 text-xs text-slate-500 mb-1">
        <span>📍 {route.distance_km.toFixed(0)} km</span>
        <span>⏱ {route.eta_minutes} min</span>
        <span>⛽ +{route.fuel_increase_pct.toFixed(0)}%</span>
      </div>

      {isActive && (
        <div className="mt-3 pt-2 border-t border-white/5">
          {isApproved ? (
            <div className="w-full py-1 px-2 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center justify-center gap-1.5">
              <span>✓</span> Route Approved & Logged
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApprove();
              }}
              disabled={approving}
              className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors flex items-center justify-center gap-1.5 ${
                approving ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {approving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  Logging Approval...
                </>
              ) : (
                'Approve Route'
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function MitigationTab({
  crisis,
  activeRouteIdx,
  onSelectRoute,
  onApproveSuccess,
}: MitigationTabProps) {
  const [approvedRouteId, setApprovedRouteId] = useState<string | null>(null);
  const [approvingIdx, setApprovingIdx] = useState<number | null>(null);

  // Load existing approvals on mount for this incident
  useEffect(() => {
    async function loadApprovals() {
      if (!crisis.crisis_id) return;
      try {
        const res = await api.approvals.list(crisis.crisis_id);
        if (res.items && res.items.length > 0) {
          // Find if any matches the recommendations route description
          // or just match on route_id index string
          const latest = res.items[0];
          setApprovedRouteId(latest.route_id);
        }
      } catch (err) {
        console.error('Failed to load approvals:', err);
      }
    }
    loadApprovals();
  }, [crisis.crisis_id]);

  if (!crisis.route_recommendations || crisis.route_recommendations.length === 0) {
    return (
      <p className="text-xs text-slate-500 text-center py-6">
        No route alternatives generated yet.
      </p>
    );
  }

  const handleApprove = async (idx: number, route: RouteRecommendation) => {
    if (!crisis.crisis_id) return;
    setApprovingIdx(idx);
    try {
      const res = await api.approvals.create({
        incident_id: crisis.crisis_id,
        route_id: String(idx),
        recommended_route: route,
        operator_id: 'anonymous',
      });
      
      if (res.status === 'success' || res.status === 'queued') {
        setApprovedRouteId(String(idx));
        if (onApproveSuccess) {
          onApproveSuccess(
            res.status === 'success'
              ? `Route option ${idx + 1} approved & logged successfully ✓`
              : `Route option ${idx + 1} approved (offline queue) ✓`
          );
        }
      }
    } catch (err) {
      console.error('Failed to approve route:', err);
    } finally {
      setApprovingIdx(null);
    }
  };

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
          isApproved={approvedRouteId === String(idx)}
          approving={approvingIdx === idx}
          onApprove={() => handleApprove(idx, route)}
        />
      ))}
    </div>
  );
}
