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

      // Notify parent when crisis is ready to display in sidebar/map (Stage 3+)
      if (stage >= 3 && onCrisisReady) {
        onCrisisReady(filtered);
      }
    }
  }, [stage, fullCrisisState, getFilteredState, onCrisisReady]);

  // Starts the demo run
  const start = useCallback(async (opts?: { mock_agents?: boolean; offline?: boolean }) => {
    try {
      setIsReplay(false);
      setIsRunning(true);
      setStage(0);
      
      // Request demo start
      const res = await api.demo.start(opts);
      setCrisisId(res.crisis_id);
      
      // Fetch initial status to get full crisis state
      const statusRes = await api.demo.status(res.crisis_id);
      setFullCrisisState(statusRes.crisis_state);
    } catch (err) {
      console.error('Failed to start demo:', err);
      setIsRunning(false);
    }
  }, []);

  // Advances stage
  const advance = useCallback(async () => {
    if (isReplay) {
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
      console.error('Failed to advance demo:', err);
    }
  }, [crisisId, isReplay]);

  // Sync state by polling (primarily for mobile remote synchronization)
  const pollStatus = useCallback(async () => {
    if (!crisisId || isReplay) return;
    try {
      const statusRes = await api.demo.status(crisisId);
      if (statusRes.stage !== stage) {
        setStage(statusRes.stage);
        if (statusRes.stage >= 4) {
          setIsAuto(false);
        }
      }
    } catch (err) {
      console.error('Failed to poll demo status:', err);
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
