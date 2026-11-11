'use client';

interface ChainNode {
  node?: string;
  name?: string;
  entity_id?: string;
  relation: string;
  impact_score?: number;
  /** True only when the LLM actually arbitrated this hop. */
  llm_used?: boolean;
}

interface CausalChainPanelProps {
  chain: ChainNode[];
}

/** Max nodes rendered: the panel distills the chain to its first 3 hops. */
const MAX_CHAIN_NODES = 3;

/**
 * M9 truth: the LLM-attribution verb ("diklasifikasikan LLM sebagai") is only
 * shown when the pipeline actually used the LLM for that hop (llm_used ===
 * true); otherwise a neutral verb stands in. No "+ action" pills.
 */
function neutralRelation(relation: string, llmUsed?: boolean): string {
  if (!llmUsed && /llm/i.test(relation)) return 'terklasifikasi';
  return relation;
}

export function CausalChainPanel({ chain }: CausalChainPanelProps) {
  if (!chain || chain.length === 0) return null;
  const nodes = chain.slice(0, MAX_CHAIN_NODES);
  const last = nodes.length - 1;
  const hiddenCount = chain.length - nodes.length;
  return (
    <div className="relative" role="list" aria-label="Causal chain">
      <style>{`@keyframes causal-fade-slide{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {/* Vertical connector line */}
      <span aria-hidden="true" className="absolute left-[5px] top-2 bottom-2 w-px bg-white/10" />
      <ol className="space-y-3">
        {nodes.map((item, i) => {
          const displayName = item.node || item.name || item.entity_id || 'Titik Rantai';
          const isLast = i === last;
          return (
            <li
              key={i}
              role="listitem"
              className="relative pl-5 motion-safe:animate-[causal-fade-slide_320ms_ease-out_both] motion-reduce:animate-none"
              style={{ animationDelay: `${Math.min(i, MAX_CHAIN_NODES) * 60}ms` }}
            >
              {/* Timeline dot */}
              <span
                aria-hidden="true"
                className={`absolute left-0 top-1 h-[11px] w-[11px] rounded-full border ${
                  i === 0
                    ? 'bg-cyan-400 border-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.55)]'
                    : isLast
                      ? 'bg-slate-200 border-slate-400'
                      : 'bg-[#0c1017] border-cyan-500/60'
                }`}
              />
              <div className="text-xs font-sans font-semibold text-slate-100 leading-snug">
                {displayName}
              </div>
              {!isLast && item.relation && (
                <div className="mt-1 inline-flex items-center gap-1.5 rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-xs font-mono text-cyan-200">
                  <span aria-hidden="true" className="text-cyan-400">→</span>
                  <span className="truncate">{neutralRelation(item.relation, item.llm_used)}</span>
                </div>
              )}
              {isLast && (
                <div className="mt-1 text-xs font-mono text-slate-500">titik akhir rantai</div>
              )}
            </li>
          );
        })}
      </ol>
      {hiddenCount > 0 && (
        <div className="pl-5 pt-1 text-xs font-mono text-slate-500">
          … {hiddenCount} langkah lainnya
        </div>
      )}
    </div>
  );
}
