'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import type { CrisisState, DemoStatus } from '@/lib/types';

export interface ReplaySnapshot {
  crisis_id: string;
  stage: number;
  mock_agents: boolean;
  offline: boolean;
  crisis_state: CrisisState;
  events: any[];
}

export function useDemoState(onCrisisReady?: (crisis: CrisisState) => void) {
  const [stage, setStage] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isReplay, setIsReplay] = useState<boolean>(false);
  const [crisisId, setCrisisId] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [validated, setValidated] = useState<boolean>(false);
  const [summary, setSummary] = useState<string>('');
  
  // Holds the fully loaded/replayed crisis state
  const [fullCrisisState, setFullCrisisState] = useState<CrisisState | null>(null);
  // Holds the filtered crisis state for the current stage
  const [currentCrisisState, setCurrentCrisisState] = useState<CrisisState | null>(null);
  
  const [isAuto, setIsAuto] = useState<boolean>(false);
  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Track agent statuses for stepper
  const [agentStatuses, setAgentStatuses] = useState<Record<string, 'pending' | 'running' | 'done'>>({
    DataCollectionAgent: 'pending',
    OSINTHazardAgent: 'pending',
    PredictionAgent: 'pending',
    RouteOptimizationAgent: 'pending',
    EconomicIntelligenceAgent: 'pending',
    DecisionSupportAgent: 'pending',
  });

  // Client-side crisis state filtering to unlock values stage-by-stage
  const getFilteredState = useCallback((full: CrisisState, currentStage: number): CrisisState => {
    const base: CrisisState = {
      crisis_id: full.crisis_id,
      title: full.title,
      type: full.type,
      is_simulated: full.is_simulated,
      lat: full.lat,
      lon: full.lon,
      region: full.region,
      created_at: full.created_at,
      updated_at: full.updated_at,
      messages: [...(full.messages || [])],
      status: 'detecting',
      validated: false,
      overall_confidence: 0,
      route_recommendations: [],
    };

    if (currentStage >= 1) {
      base.status = 'validating';
      base.data_collection_finding = full.data_collection_finding;
      base.osint_hazard_finding = full.osint_hazard_finding;
      base.prediction_finding = full.prediction_finding;
      base.route_optimization_finding = full.route_optimization_finding;
      base.economic_intelligence_finding = full.economic_intelligence_finding;
    }

    if (currentStage >= 2) {
      base.overall_confidence = full.overall_confidence || 0.91;
      base.consensus_breakdown = full.consensus_breakdown || {
        DataCollectionAgent: 0.95,
        OSINTHazardAgent: 0.88,
        PredictionAgent: 0.90,
        RouteOptimizationAgent: 0.94,
        EconomicIntelligenceAgent: 0.89
      };
    }

    if (currentStage >= 3) {
      base.status = 'validated';
      base.validated = true;
      base.decision_support_output = full.decision_support_output;
      base.route_recommendations = full.route_recommendations || [];
      base.inflation_forecast = full.inflation_forecast;
      base.causal_chain = full.causal_chain;
      base.hazard_polygons = full.hazard_polygons;
      base.affected_polygon = full.affected_polygon;
    }

    if (currentStage >= 4) {
      // Stage 4 has the same data visible but notification is marked sent
    }

    return base;
  }, []);

  const notifiedKeyRef = useRef<string | null>(null);

  // Update current filtered state when stage or fullCrisisState changes
  useEffect(() => {
    if (fullCrisisState) {
      const filtered = getFilteredState(fullCrisisState, stage);
      setCurrentCrisisState(filtered);
      
      // Sync other states
      setConfidence(filtered.overall_confidence || 0);
      setValidated(filtered.validated || false);
      setSummary(filtered.decision_support_output || '');

      // Sync agent statuses
      const updatedStatuses: Record<string, 'pending' | 'running' | 'done'> = {
        DataCollectionAgent: 'pending',
        OSINTHazardAgent: 'pending',
        PredictionAgent: 'pending',
        RouteOptimizationAgent: 'pending',
        EconomicIntelligenceAgent: 'pending',
        DecisionSupportAgent: 'pending',
      };

      if (stage >= 1) {
        updatedStatuses.DataCollectionAgent = 'done';
        updatedStatuses.OSINTHazardAgent = 'done';
        updatedStatuses.PredictionAgent = 'done';
        updatedStatuses.RouteOptimizationAgent = 'done';
        updatedStatuses.EconomicIntelligenceAgent = 'done';
        updatedStatuses.DecisionSupportAgent = 'done';
      }
      setAgentStatuses(updatedStatuses);

      // Notify parent ONCE when crisis is ready to display in sidebar/map (Stage 3+)
      const notifyKey = `${fullCrisisState.crisis_id}_${stage}`;
      if (stage >= 3 && onCrisisReady && notifiedKeyRef.current !== notifyKey) {
        notifiedKeyRef.current = notifyKey;
        onCrisisReady(filtered);
      }
    }
  }, [stage, fullCrisisState, getFilteredState, onCrisisReady]);

  // Starts the demo run
  const start = useCallback(async (opts?: { mock_agents?: boolean; offline?: boolean }) => {
    setIsReplay(false);
    setIsRunning(true);
    setStage(0);

    try {
      // Request demo start from backend
      const res = await api.demo.start(opts);
      if (res && res.crisis_id) {
        setCrisisId(res.crisis_id);
        try {
          const statusRes = await api.demo.status(res.crisis_id);
          if (statusRes && statusRes.crisis_state) {
            setFullCrisisState(statusRes.crisis_state);
          }
        } catch (statusErr) {
          console.warn('Demo started but initial status fetch was delayed:', statusErr);
        }
        return;
      }
    } catch (err) {
      console.warn('Backend demo API call failed, activating client-side offline demo runner:', err);
    }

    // Fallback for offline / mock mode when backend is unreachable
    const fallbackId = `belawan-demo-offline-${Math.floor(Math.random() * 1000)}`;
    setCrisisId(fallbackId);
    setFullCrisisState({
      crisis_id: fallbackId,
      title: 'Inflation Spike Alert: Rice Stock Depletion',
      type: 'port_closure',
      is_simulated: true,
      lat: 3.79,
      lon: 98.68,
      region: 'north_sumatra',
      status: 'validated',
      overall_confidence: 0.91,
      validated: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: [],
      decision_support_output: 'Belawan Port closure detected. Directing bulk grain trucks via Medan-Tebing Tinggi toll road detour.',
      route_recommendations: [
        {
          description: 'Medan-Tebing Tinggi Detour',
          waypoints: [
            { lat: 3.7922, lon: 98.6776 },
            { lat: 3.6850, lon: 98.6700 },
            { lat: 3.6420, lon: 98.6720 },
            { lat: 3.5850, lon: 98.6920 },
            { lat: 3.5410, lon: 98.7180 },
            { lat: 3.5520, lon: 98.8050 },
            { lat: 3.5600, lon: 98.8750 },
            { lat: 3.5680, lon: 98.9560 },
            { lat: 3.4850, lon: 99.0450 },
            { lat: 3.3280, lon: 99.1620 },
            { lat: 3.1600, lon: 99.1150 },
            { lat: 2.9595, lon: 99.0687 }
          ],
          distance_km: 42.5,
          eta_minutes: 58,
          fuel_increase_pct: 12.5,
          risk_score: 0.2
        }
      ],
      evidence: {
        cctv_label: 'BELAWAN_STORAGE_CAM',
        osint_text: 'Low incoming volume at the grain terminals. Port gates temporarily restricted.'
      }
    });
  }, []);

  // Advances stage
  const advance = useCallback(async () => {
    if (isReplay || (crisisId && crisisId.startsWith('belawan-demo-offline'))) {
      setStage((prev) => {
        if (prev < 4) return prev + 1;
        setIsAuto(false);
        return prev;
      });
      return;
    }

    if (!crisisId) return;
    try {
      const res = await api.demo.advance(crisisId);
      setStage(res.stage);
      if (res.stage >= 4) {
        setIsAuto(false);
      }
    } catch (err) {
      console.warn('Failed to advance demo online, falling back to local stage increment:', err);
      setStage((prev) => (prev < 4 ? prev + 1 : prev));
    }
  }, [crisisId, isReplay]);

  // Sync state by polling (primarily for mobile remote synchronization)
  const pollStatus = useCallback(async () => {
    if (!crisisId || isReplay || crisisId.startsWith('belawan-demo-offline')) return;
    try {
      const statusRes = await api.demo.status(crisisId);
      if (statusRes.stage !== stage) {
        setStage(statusRes.stage);
        if (statusRes.stage >= 4) {
          setIsAuto(false);
        }
      }
    } catch (err) {
      console.warn('Failed to poll demo status (skipping offline ID):', err);
    }
  }, [crisisId, stage, isReplay]);

  // Setup polling when active (runs every 2 seconds if running and not in replay)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRunning && crisisId && !isReplay) {
      interval = setInterval(pollStatus, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, crisisId, isReplay, pollStatus]);

  // Handle auto-advance timer
  useEffect(() => {
    if (isAuto) {
      autoIntervalRef.current = setInterval(() => {
        setStage((prev) => {
          if (prev < 4) {
            // For live mode, advance via API
            if (!isReplay && crisisId) {
              api.demo.advance(crisisId).catch(console.error);
            }
            return prev + 1;
          } else {
            setIsAuto(false);
            return prev;
          }
        });
      }, 15000); // 15 seconds per stage
    } else {
      if (autoIntervalRef.current) {
        clearInterval(autoIntervalRef.current);
      }
    }

    return () => {
      if (autoIntervalRef.current) {
        clearInterval(autoIntervalRef.current);
      }
    };
  }, [isAuto, isReplay, crisisId]);

  const toggleAuto = useCallback(() => {
    setIsAuto((prev) => !prev);
  }, []);

  const reset = useCallback(() => {
    setStage(0);
    setIsRunning(false);
    setIsReplay(false);
    setCrisisId(null);
    setConfidence(0);
    setValidated(false);
    setSummary('');
    setFullCrisisState(null);
    setCurrentCrisisState(null);
    setIsAuto(false);
    notifiedKeyRef.current = null;
    if (autoIntervalRef.current) {
      clearInterval(autoIntervalRef.current);
    }
  }, []);

  // Hydrate from a saved replay file
  const loadReplay = useCallback((snapshot: ReplaySnapshot) => {
    reset();
    setIsReplay(true);
    setIsRunning(true);
    setCrisisId(snapshot.crisis_id);
    setFullCrisisState(snapshot.crisis_state);
    setStage(0);
  }, [reset]);

  // Download the current demo run snapshot as a JSON file
  const saveReplay = useCallback(async () => {
    if (!crisisId) return;
    try {
      let snapshot: ReplaySnapshot;
      if (isReplay && fullCrisisState) {
        snapshot = {
          crisis_id: crisisId,
          stage: stage,
          mock_agents: true,
          offline: true,
          crisis_state: fullCrisisState,
          events: []
        };
      } else {
        snapshot = (await api.demo.replay(crisisId)) as ReplaySnapshot;
      }
      
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `belawan_replay_${crisisId}_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to save replay:', err);
    }
  }, [crisisId, isReplay, fullCrisisState, stage]);

  return {
    stage,
    isRunning,
    isReplay,
    crisisId,
    agentStatuses,
    confidence,
    validated,
    summary,
    currentCrisisState,
    isAuto,
    start,
    advance,
    toggleAuto,
    reset,
    loadReplay,
    saveReplay,
  };
}
