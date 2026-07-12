'use client';
import type { CrisisState } from '@/lib/types';

interface EvidenceTabProps {
  crisis: CrisisState;
}

const AGENT_LABELS: Record<string, string> = {
  data_collection: 'Data Collection',
  osint_hazard: 'OSINT & Hazard',
  prediction: 'Prediction',
  route_optimization: 'Route Optimization',
  economic_intelligence: 'Economic Intelligence',
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.85 ? 'bg-emerald-400' : value >= 0.6 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

export function EvidenceTab({ crisis }: EvidenceTabProps) {
  const findings = [
    { key: 'data_collection', finding: crisis.data_collection_finding },
    { key: 'osint_hazard', finding: crisis.osint_hazard_finding },
    { key: 'prediction', finding: crisis.prediction_finding },
    { key: 'route_optimization', finding: crisis.route_optimization_finding },
    { key: 'economic_intelligence', finding: crisis.economic_intelligence_finding },
  ].filter((f) => f.finding != null);

  return (
    <div className="space-y-4">
      {/* Executive summary */}
      {crisis.decision_support_output && (
        <div className="bg-cyan-400/5 border border-cyan-400/20 rounded-xl p-3">
          <p className="text-xs text-slate-300 leading-relaxed">
            {crisis.decision_support_output}
          </p>
        </div>
      )}

      {/* Consensus breakdown */}
      {crisis.consensus_breakdown && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Consensus Breakdown
          </p>
          {Object.entries(crisis.consensus_breakdown).map(([key, val]) => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{key.replace(/_/g, ' ')}</span>
              </div>
              <ConfidenceBar value={val} />
            </div>
          ))}
        </div>
      )}

      {/* Agent findings */}
      {findings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Agent Findings
          </p>
          {findings.map(({ key, finding }) => (
            <div key={key} className="bg-slate-800/50 rounded-xl p-3 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-300">
                  {AGENT_LABELS[key] ?? key}
                </span>
                <ConfidenceBar value={finding!.confidence} />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{finding!.summary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
