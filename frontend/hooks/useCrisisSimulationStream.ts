import { useState, useCallback, useRef } from 'react';
import { CrisisState } from '@/lib/types';

export interface AgentStreamStatus {
  agent_id: string;
  name: string;
  status: 'idle' | 'running' | 'complete' | 'error';
  confidence: number;
  summary: string;
  lastRunAt: string;
}

export interface SimulationPayload {
  lat: number;
  lon: number;
  type: string;
  radiusKm: number;
  title?: string;
  origin?: string;
  destination?: string;
  commodity?: string;
  cargoTonnage?: number;
  hasBkhitCert?: boolean;
  vehicleGrossWeightTon?: number;
  polygon?: [number, number][];
}

export function useCrisisSimulationStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [streamResult, setStreamResult] = useState<CrisisState | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStreamStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const triggerSimulation = useCallback(
    async (payload: SimulationPayload, onComplete?: (crisis: CrisisState) => void) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsStreaming(true);
      setError(null);
      setActiveAgent('data_collection');

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      try {
        const response = await fetch(`${apiUrl}/api/v1/simulate/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...payload,
            severity: 'critical',
            region: 'north_sumatra',
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Simulation stream failed with status ${response.status}`);
        }

        if (!response.body) {
          throw new Error('ReadableStream not supported by browser response.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const jsonStr = trimmed.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const parsed = JSON.parse(jsonStr);

              if (parsed.event === 'node_update') {
                const node = parsed.node;
                const agentId = parsed.agent_id;
                const agentName = parsed.agent_name || agentId;
                const conf = parsed.confidence ?? 0.85;
                const sum = parsed.summary ?? '';

                setActiveAgent(node);
                setAgentStatuses((prev) => ({
                  ...prev,
                  [agentId]: {
                    agent_id: agentId,
                    name: agentName,
                    status: 'complete',
                    confidence: conf,
                    summary: sum,
                    lastRunAt: parsed.timestamp || new Date().toISOString(),
                  },
                }));

                // Dispatch window event for top nav HUD
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent('prehub:agent_status_updated', {
                      detail: {
                        agent_id: agentId,
                        status: 'complete',
                        confidence: conf,
                        summary: sum,
                      },
                    })
                  );
                }
              } else if (parsed.event === 'simulation_complete') {
                const state = parsed.state || {};
                const crisisState: CrisisState = {
                  crisis_id: parsed.crisis_id || 'simulated-active',
                  title: state.title || payload.title || `Simulasi ${payload.type.toUpperCase()}`,
                  type: (payload.type as any) || 'flood',
                  severity: (state.severity || 'critical') as any,
                  status: 'validated',
                  is_simulated: true,
                  lat: payload.lat,
                  lon: payload.lon,
                  region: state.region || 'Sumatera Utara',
                  overall_confidence: parsed.validated ? 0.94 : 0.65,
                  validated: parsed.validated ?? true,
                  created_at: parsed.timestamp || new Date().toISOString(),
                  updated_at: parsed.timestamp || new Date().toISOString(),
                  route_recommendations: parsed.routes || state.route_recommendations || [],
                  hedging_breakdown: parsed.hedging || state.hedging_breakdown,
                  compliance_status: parsed.compliance || state.compliance_status,
                  decision_support_output: parsed.copilot_summary || state.decision_support_output,
                  causal_chain: parsed.causal_chain || state.causal_chain || [],
                  messages: state.messages || [],
                };

                setStreamResult(crisisState);
                setIsStreaming(false);
                setActiveAgent(null);

                if (onComplete) {
                  onComplete(crisisState);
                }
              } else if (parsed.event === 'error') {
                setError(parsed.message || 'Stream error');
                setIsStreaming(false);
                setActiveAgent(null);
              }
            } catch (e) {
              console.error('Failed to parse SSE line:', e);
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Simulation streaming error:', err);
          setError(err.message || 'Simulation connection error');
          setIsStreaming(false);
          setActiveAgent(null);
        }
      }
    },
    []
  );

  const cancelSimulation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setActiveAgent(null);
  }, []);

  return {
    isStreaming,
    activeAgent,
    agentStatuses,
    streamResult,
    error,
    triggerSimulation,
    cancelSimulation,
  };
}
