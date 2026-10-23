import { useState, useCallback, useRef } from 'react';
import { CrisisState, CrisisType, CrisisStatus, Severity } from '@/lib/types';
import { getBaseUrl } from '@/lib/api';
import { DEFAULT_REGION, toRegionSlug } from '@/lib/region';

const VALID_SEVERITIES: readonly Severity[] = ['low', 'medium', 'high', 'critical'];

/** Normalizes a backend/payload severity; missing/unknown keeps the critical default. */
function normalizeSeverity(value: unknown): Severity {
  const raw = String(value ?? '').trim().toLowerCase();
  return (VALID_SEVERITIES as readonly string[]).includes(raw) ? (raw as Severity) : 'critical';
}

/** Coerces a candidate numeric value, returning `null` when it is not finite. */
function finiteOrNull(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

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
  severity?: Severity;
  region?: string;
  origin?: string;
  destination?: string;
  origin_coords?: [number, number] | number[];
  dest_coords?: [number, number] | number[];
  origin_name?: string;
  dest_name?: string;
  commodity?: string;
  cargo_tonnage?: number;
  has_bkhit_cert?: boolean;
  vehicle_gross_weight_ton?: number;
  modality?: string;
  radius_km?: number;
  // camelCase aliases remain accepted for older callers (backend normalizes).
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

      const apiUrl = getBaseUrl();
      // The map click / polygon target is authoritative: fold any display label
      // to the backend slug and only fall back when the caller omitted it.
      const payloadRegion = toRegionSlug(payload.region) || DEFAULT_REGION;
      const payloadSeverity = normalizeSeverity(payload.severity);

      try {
        const response = await fetch(`${apiUrl}/api/v1/simulate/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...payload,
            // Keep the slug contract for backend agents/APIs; `normalizeRegion`
            // is applied only where the region is displayed.
            severity: payloadSeverity,
            region: payloadRegion,
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
                // The worker ships the full LangGraph state; forward every field the
                // sidebar reads instead of synthesizing confidence/region/severity.
                const state = (parsed.state || {}) as Partial<CrisisState> & Record<string, any>;

                const confidence = finiteOrNull(state.overall_confidence)
                  ?? finiteOrNull(parsed.overall_confidence)
                  ?? 0;
                const resolvedLat = finiteOrNull(state.lat) ?? payload.lat;
                const resolvedLon = finiteOrNull(state.lon) ?? payload.lon;
                const resolvedTitle =
                  state.title || payload.title || `Simulasi ${payload.type.toUpperCase()}`;
                const resolvedType = ((state.type || payload.type || 'flood') as CrisisType);

                // Consensus Gate honesty: an archived signal was NOT validated, even
                // if a stale/mock field claims otherwise. Never default to `true` —
                // real simulations without an explicit validation flag are unverified.
                const isArchived = (parsed.status ?? state.status) === 'archived';
                const isValidated = isArchived ? false : (parsed.validated ?? state.validated ?? false);

                const crisisState: CrisisState = {
                  crisis_id: parsed.crisis_id || state.crisis_id || 'simulated-active',
                  title: resolvedTitle,
                  type: resolvedType,
                  severity: normalizeSeverity(state.severity ?? parsed.severity ?? payloadSeverity),
                  status: ((state.status as CrisisStatus) || 'validated'),
                  is_simulated: state.is_simulated ?? true,
                  lat: resolvedLat,
                  lon: resolvedLon,
                  // Keep the slug for API queries; display layers normalize it.
                  region: toRegionSlug(state.region) || payloadRegion,
                  overall_confidence: confidence,
                  validated: isValidated,
                  created_at: state.created_at || parsed.timestamp || new Date().toISOString(),
                  updated_at: state.updated_at || parsed.timestamp || new Date().toISOString(),
                  route_recommendations: parsed.routes || state.route_recommendations || [],
                  hedging_breakdown: parsed.hedging || state.hedging_breakdown,
                  compliance_status: parsed.compliance || state.compliance_status,
                  decision_support_output: parsed.copilot_summary || state.decision_support_output,
                  causal_chain: parsed.causal_chain || state.causal_chain || [],
                  messages: state.messages || [],
                  // Agent findings power EvidenceTab + the Mitigation/Economic impact cards.
                  data_collection_finding: state.data_collection_finding,
                  osint_hazard_finding: state.osint_hazard_finding,
                  prediction_finding: state.prediction_finding,
                  route_optimization_finding: state.route_optimization_finding,
                  economic_intelligence_finding: state.economic_intelligence_finding,
                  congestion_forecast: state.congestion_forecast,
                  hazard_polygons: state.hazard_polygons,
                  inflation_forecast: state.inflation_forecast,
                  ltm_episodes: state.ltm_episodes,
                  consensus_breakdown: state.consensus_breakdown,
                  verified_news_citations: state.verified_news_citations,
                  news_attributions: state.news_attributions,
                  blocked_corridors: state.blocked_corridors,
                  news_affected_commodities: state.news_affected_commodities,
                  affected_locations: state.affected_locations,
                  zone_tier: state.zone_tier,
                  tier_reason: state.tier_reason,
                  custom_hazard_label: state.custom_hazard_label,
                  impact_profile: state.impact_profile,
                  radius_km: state.radius_km,
                  geometry_polygon: state.geometry_polygon,
                  verification_audit: state.verification_audit,
                  evidence: state.evidence,
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
