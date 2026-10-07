'use client';

interface ChainNode {
  node?: string;
  name?: string;
  entity_id?: string;
  relation: string;
}

interface CausalChainPanelProps {
  chain: ChainNode[];
}

export function CausalChainPanel({ chain }: CausalChainPanelProps) {
  return (
    <div className="space-y-1 animate-fade-in" role="list" aria-label="Causal chain">
      {chain.map((item, i) => {
        const displayName = item.node || item.name || item.entity_id || 'Titik Rantai';
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="text-slate-200 font-medium truncate font-mono">{displayName}</span>
            {i < chain.length - 1 && (
              <>
                <span className="text-slate-600">→</span>
                <span className="text-slate-400 italic truncate font-mono text-xs">{item.relation}</span>
                <span className="text-slate-600">→</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
