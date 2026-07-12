'use client';

interface ChainNode {
  node: string;
  relation: string;
}

interface CausalChainPanelProps {
  chain: ChainNode[];
}

export function CausalChainPanel({ chain }: CausalChainPanelProps) {
  return (
    <div className="space-y-1 animate-fade-in" role="list" aria-label="Causal chain">
      {chain.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="text-slate-200 font-medium truncate">{item.node}</span>
          {i < chain.length - 1 && (
            <>
              <span className="text-slate-600">→</span>
              <span className="text-slate-500 italic truncate">{item.relation}</span>
              <span className="text-slate-600">→</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
