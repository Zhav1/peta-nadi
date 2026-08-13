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
      {/* Sensory Evidence Chain (Evidentiary Drill-down integration) */}
      <div className="space-y-3 pt-3 border-t border-white/10">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Sensory Evidence Chain
        </p>

        {/* Crowdsourced OSINT */}
        <div className="bg-[#1e2024]/40 border border-white/10 rounded-sm p-3 hover:border-[#00F0FF]/30 transition-all text-[11px] leading-tight">
          <div className="flex justify-between items-center mb-1">
            <span className="font-bold text-slate-200">{crisis.evidence?.osint_author || "@LogisticsWatcher_ID"}</span>
            <span className="text-[9px] font-mono text-[#ffb950]">OSINT VERIFIED</span>
          </div>
          <p className="text-slate-400">{crisis.evidence?.osint_text || "\"Standstill delay at the main highway crossing. Avoid the corridor, queue extends for 3km.\""}</p>
        </div>

        {/* Delay Matrix */}
        <div className="bg-[#1e2024]/40 border border-white/10 rounded-sm p-3 hover:border-[#00F0FF]/30 transition-all">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Delay Matrix</span>
            <span className="text-[9px] font-mono text-red-400 font-bold">{crisis.evidence?.delay_minutes || "+150 MIN"}</span>
          </div>
          <div className="h-10 flex items-end gap-1">
            {(crisis.evidence?.delay_history || [20, 30, 25, 50, 70, 90]).map((h: number, i: number) => {
              const maxVal = Math.max(...(crisis.evidence?.delay_history || [20, 30, 25, 50, 70, 90]), 10);
              const heightPct = `${(h / maxVal) * 90}%`;
              const isLast = i === (crisis.evidence?.delay_history || [20, 30, 25, 50, 70, 90]).length - 1;
              return (
                <div 
                  key={i} 
                  className={`flex-1 transition-all ${
                    isLast 
                      ? 'bg-red-500/50 shadow-[0_0_8px_rgba(239,68,68,0.5)]' 
                      : 'bg-[#00F0FF]/15'
                  }`} 
                  style={{ height: heightPct }}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-1 text-[7px] font-mono text-slate-500">
            <span>-4H</span>
            <span>-2H</span>
            <span className="text-red-400">NOW</span>
          </div>
        </div>
      </div>
    </div>
  );
}
