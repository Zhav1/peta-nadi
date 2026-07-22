'use client';
import { useEffect, useRef, useState } from 'react';
import { useDemoState } from '@/hooks/useDemoState';
import type { CrisisState } from '@/lib/types';
import QRCode from 'qrcode';

interface GuidedDemoPanelProps {
  onCrisisReady: (crisis: CrisisState) => void;
}

export function GuidedDemoPanel({ onCrisisReady }: GuidedDemoPanelProps) {
  const {
    stage,
    isRunning,
    isReplay,
    crisisId,
    confidence,
    summary,
    isAuto,
    start,
    advance,
    toggleAuto,
    reset,
    saveReplay,
  } = useDemoState(onCrisisReady);

  const [qrVisible, setQrVisible] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Generate QR Code when demo starts and has a crisisId
  useEffect(() => {
    if (isRunning && crisisId && canvasRef.current) {
      const hostname = window.location.hostname || 'localhost';
      const remoteUrl = `http://${hostname}:3000/demo-remote?crisis_id=${crisisId}`;
      QRCode.toCanvas(
        canvasRef.current,
        remoteUrl,
        {
          width: 96,
          margin: 1,
          color: {
            dark: '#22d3ee', // Cyan 400
            light: '#0f172a', // Slate 900
          },
        },
        (error) => {
          if (error) console.error('QR Code generation error:', error);
        }
      );
    }
  }, [isRunning, crisisId, qrVisible]);

  // Auto-advance demo stages every 1.8 seconds when running
  useEffect(() => {
    if (!isRunning || !isAuto) return;
    const timer = setInterval(() => {
      if (stage < 4) {
        advance();
      }
    }, 1800);
    return () => clearInterval(timer);
  }, [isRunning, isAuto, stage, advance]);

  if (!isRunning) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            start({ mock_agents: false, offline: false });
          }}
          className="flex items-center gap-2 px-5 py-2.5 font-bold rounded-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 active:scale-95 transition duration-200 shadow-xl shadow-cyan-500/25 border border-cyan-400/50"
        >
          <span className="animate-pulse">▶</span> Run Demo
        </button>
      </div>
    );
  }

  const stageTitles = [
    'Injecting Real-time Sensors',
    'Agent Swarm Analysis',
    'GraphRAG Consensus Gate',
    'Validated Alert & Reroute',
    'WhatsApp & Fleet Dispatch',
  ];

  const stageExplainers = [
    'PetaNadi is pulling real-time data from 6 sources: weather (BMKG), congestion (TomTom), fire maps (NASA), port queues (AISstream), commodity prices (PIHPS), and social media reports.',
    '6 AI agents process the data in parallel. Each specializes in a domain: hazard mapping, route optimization, economic forecasting, and crisis decision support.',
    'The Consensus Gate evaluates confidence scores from all agents. A crisis is only validated when the weighted score exceeds 85% — preventing false alarms.',
    'The Belawan Port closure is validated. The dashboard now shows the crisis pin, alternative routes, and projected economic impact on commodity prices.',
    'A WhatsApp alert has been sent to logistics operators with the crisis summary, recommended detour, and a deep-link back to this dashboard.',
  ];

  const sources = [
    { name: 'BMKG', icon: '🌩️', color: 'border-yellow-500/30 text-yellow-400 bg-yellow-950/20' },
    { name: 'TomTom', icon: '🚗', color: 'border-orange-500/30 text-orange-400 bg-orange-950/20' },
    { name: 'NASA', icon: '🛰️', color: 'border-red-500/30 text-red-400 bg-red-950/20' },
    { name: 'AISstream', icon: '⚓', color: 'border-blue-500/30 text-blue-400 bg-blue-950/20' },
    { name: 'PIHPS', icon: '💰', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20' },
    { name: 'Social', icon: '📱', color: 'border-purple-500/30 text-purple-400 bg-purple-950/20' },
  ];

  const agents = [
    { key: 'DataCollectionAgent', label: 'Data Collection' },
    { key: 'OSINTHazardAgent', label: 'OSINT & Hazard' },
    { key: 'PredictionAgent', label: 'Prediction' },
    { key: 'RouteOptimizationAgent', label: 'Route Optimization' },
    { key: 'EconomicIntelligenceAgent', label: 'Economic Intel' },
    { key: 'DecisionSupportAgent', label: 'Decision Support' },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 rounded-2xl border border-slate-800 bg-slate-950/90 backdrop-blur-xl p-5 text-slate-100 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            {isReplay ? 'Offline Replay Mode' : 'Guided Presentation Stepper'}
          </span>
          <h4 className="text-sm font-bold text-slate-100 mt-0.5">
            Stage {stage + 1}: {stageTitles[stage]}
          </h4>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            reset();
          }}
          className="text-slate-400 hover:text-white text-xs transition p-1 hover:bg-slate-900 rounded-md"
        >
          ✕
        </button>
      </div>

      {/* Stepper Progress Indicator */}
      <div className="flex justify-between items-center gap-1.5 px-1 py-1">
        {stageTitles.map((_, idx) => (
          <div key={idx} className="flex-1 flex flex-col gap-1 items-center">
            <div
              className={`w-full h-1.5 rounded-full transition-all duration-300 ${
                idx <= stage
                  ? 'bg-cyan-400 shadow-sm shadow-cyan-500/50'
                  : 'bg-slate-800'
              }`}
            />
          </div>
        ))}
      </div>

      {/* Stage Explainer tooltip/card */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-3.5 text-xs text-slate-300 leading-relaxed relative">
        <span className="absolute -top-2 left-4 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-semibold text-cyan-400 uppercase">
          AI Stepper
        </span>
        {stageExplainers[stage]}
      </div>

      {/* Interactive visual feedback per stage */}
      <div className="min-h-[110px] border border-slate-850 bg-slate-900/30 rounded-xl p-3 flex flex-col justify-center">
        {stage === 0 && (
          <div className="grid grid-cols-3 gap-2">
            {sources.map((src, i) => (
              <div
                key={src.name}
                className={`flex items-center gap-1.5 px-2.5 py-2 border rounded-lg text-xs font-semibold select-none ${src.color} animate-fade-in`}
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <span>{src.icon}</span>
                <span>{src.name}</span>
              </div>
            ))}
          </div>
        )}

        {stage === 1 && (
          <div className="grid grid-cols-2 gap-2">
            {agents.map((agent) => (
              <div
                key={agent.key}
                className="flex items-center gap-2 p-1.5 rounded-lg border border-slate-800 bg-slate-950/60 text-[11px]"
              >
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-slate-300 font-medium">{agent.label}</span>
              </div>
            ))}
          </div>
        )}

        {stage === 2 && (
          <div className="flex flex-col items-center gap-2 py-1">
            <div className="text-xs text-slate-400">Consensus Confidence Score</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-emerald-400 font-mono">
                {(confidence * 100).toFixed(0)}%
              </span>
              <span className="text-xs font-semibold text-emerald-500 uppercase px-2 py-0.5 rounded bg-emerald-950/20 border border-emerald-500/20">
                Validated
              </span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-850">
              <div
                className="bg-gradient-to-r from-yellow-500 to-emerald-500 h-full rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Threshold: &gt; 85% to trigger alert</span>
          </div>
        )}

        {stage === 3 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                Active Crisis Alert
              </span>
            </div>
            <p className="text-[11px] text-slate-300 line-clamp-3 italic">
              &quot;{summary || 'Processing Decision Support recommendations...'}&quot;
            </p>
          </div>
        )}

        {stage === 4 && (
          <div className="flex flex-col items-center gap-2 text-center py-2">
            <div className="w-9 h-9 rounded-full bg-emerald-950/50 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-lg shadow-lg shadow-emerald-500/10">
              ✓
            </div>
            <div className="text-xs font-bold text-slate-200">WhatsApp Alert Delivered</div>
            <div className="text-[10px] text-slate-400 max-w-[240px]">
              Notification dispatched to transport fleet operators on Deli Serdang & Belawan routes.
            </div>
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {stage < 4 ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                advance();
              }}
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 active:scale-98 transition duration-200 shadow-md shadow-cyan-500/20"
            >
              ⏭ Next Step
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                saveReplay();
              }}
              className="flex-1 py-2 rounded-xl text-xs font-bold border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 active:scale-98 transition duration-200"
            >
              💾 Save Replay
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleAuto();
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition duration-200 ${
              isAuto
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {isAuto ? '⏸ Pause' : '▶ Auto'}
          </button>
        </div>

        <div className="flex justify-between items-center text-[10px] text-slate-500 pt-2 border-t border-slate-900 font-mono">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setQrVisible((prev) => !prev);
            }}
            className="hover:text-cyan-400 transition"
          >
            {qrVisible ? 'Hide Phone Remote' : '📱 Show Phone Remote'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              start({ mock_agents: false, offline: false });
            }}
            className="hover:text-slate-300 transition"
          >
            ↺ Restart Demo
          </button>
        </div>
      </div>

      {/* QR Code section for Phone Remote */}
      {qrVisible && (
        <div className="flex flex-col items-center gap-2 bg-slate-900/60 p-4 border border-slate-900 rounded-xl">
          <canvas ref={canvasRef} className="rounded-lg shadow-md" />
          <div className="text-center">
            <div className="text-[10px] font-bold text-cyan-400">Scan QR Code</div>
            <div className="text-[9px] text-slate-400 mt-0.5">
              Open the presenter remote control on your phone
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
