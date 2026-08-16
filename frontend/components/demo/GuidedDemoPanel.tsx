'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { HUB_NODES } from '@/lib/mapboxRoutingService';
import {
  CloudLightning,
  Car,
  Satellite,
  Anchor,
  TrendingUp,
  MessageSquare,
  CheckCircle2,
  Play,
  SkipForward,
  RotateCcw,
  Pause,
} from 'lucide-react';

interface GuidedDemoPanelProps {
  stage: number;
  isRunning: boolean;
  isReplay: boolean;
  crisisId: string | null;
  confidence: number;
  summary: string;
  isAuto: boolean;
  onStart: (opts?: { origin?: string; destination?: string }) => void;
  onAdvance: () => void;
  onToggleAuto: () => void;
  onReset: () => void;
  isSidebarOpen?: boolean;
  selectedOrigin?: string;
  selectedDestination?: string;
  onSelectPreset?: (origin: string, dest: string) => void;
}

export function GuidedDemoPanel({
  stage,
  isRunning,
  isReplay,
  crisisId,
  confidence,
  summary,
  isAuto,
  onStart,
  onAdvance,
  onToggleAuto,
  onReset,
  isSidebarOpen = false,
  selectedOrigin = 'belawan',
  selectedDestination = 'tebingtinggi',
  onSelectPreset,
}: GuidedDemoPanelProps) {
  const [qrVisible, setQrVisible] = useState(false);
  void isReplay;
  void onSelectPreset;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [logStep, setLogStep] = useState(0);

  useEffect(() => {
    if (stage === 1 || stage === 2) {
      const interval = setInterval(() => {
        setLogStep((prev) => (prev < 5 ? prev + 1 : 5));
      }, 1200);
      return () => clearInterval(interval);
    } else {
      setLogStep(0);
    }
  }, [stage]);

  const swarmLogs = [
    `> [00:01.2] DataCollectionAgent: Ingesting BMKG radar (68.5mm), TomTom flow (+35m), AISstream vessel feed...`,
    `> [00:02.1] OSINTHazardAgent: Scraping OSINT feeds & Google News: "Banjir Tebing Tinggi Jalinsum Terputus"...`,
    `> [00:03.0] PredictionAgent: Simulating FourCastNet Earth-2 48h spatial hazard inundation model...`,
    `> [00:03.9] RouteOptimizationAgent: Executing NVIDIA cuOpt GPU matrix: Calculating tangential clearance...`,
    `> [00:04.7] EconomicIntelligenceAgent: Fetching PIHPS price stream: Projected CPO/Minyak inflation +1.8%...`,
    `> [00:05.5] DecisionSupportAgent: DeepSeek V3.2 CoT reasoning & Consensus Gate: 91.4% (VALIDATED THREAT)...`,
  ];

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

  if (!isRunning) {
    return null;
  }

  const stageTitles = [
    'User Route & Ingestion Setup',
    'Agent Swarm Analysis',
    'GraphRAG Consensus Gate',
    'Validated Alert & Reroute',
    'WhatsApp & Fleet Dispatch',
  ];

  const stageExplainers = [
    'Silakan tentukan rute krisis dengan mengeklik 2 titik marker pada Peta 4D di sebelah kiri (Klik 1: Start 🟢, Klik 2: End 🟡). Sistem akan merender rute baseline hijau sebelum disrupsi disimulasikan.',
    '6 agen AI memproses data secara paralel. Setiap agen ahli di satu domain: pemetaan bahaya, optimasi rute, proyeksi ekonomi, dan dukungan keputusan krisis.',
    'Consensus Gate mengevaluasi skor kepercayaan dari semua agen. Krisis divalidasi ketika skor tertimbang > 85% — mencegah alarm palsu.',
    'Disrupsi tervalidasi. AI Tangential Avoidance Router menghitung rute pengalihan aman via cuOpt GPU khusus untuk koridor pilihan Anda.',
    'Notifikasi WhatsApp telah dikirim ke operator logistik dengan ringkasan krisis, rute pengalihan NVIDIA cuOpt, dan deep-link dashboard.',
  ];

  const sources = [
    { name: 'BMKG', Icon: CloudLightning, color: 'border-yellow-500/30 text-yellow-400 bg-yellow-950/20' },
    { name: 'TomTom', Icon: Car, color: 'border-orange-500/30 text-orange-400 bg-orange-950/20' },
    { name: 'NASA', Icon: Satellite, color: 'border-red-500/30 text-red-400 bg-red-950/20' },
    { name: 'AISstream', Icon: Anchor, color: 'border-blue-500/30 text-blue-400 bg-blue-950/20' },
    { name: 'PIHPS', Icon: TrendingUp, color: 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20' },
    { name: 'Social', Icon: MessageSquare, color: 'border-purple-500/30 text-purple-400 bg-purple-950/20' },
  ];

  const agents = [
    { key: 'DataCollectionAgent', label: 'Data Collection' },
    { key: 'OSINTHazardAgent', label: 'OSINT & Hazard' },
    { key: 'PredictionAgent', label: 'Prediction' },
    { key: 'RouteOptimizationAgent', label: 'Route Optimization' },
    { key: 'EconomicIntelligenceAgent', label: 'Economic Intel' },
    { key: 'DecisionSupportAgent', label: 'Decision Support' },
  ];

  const dynamicRightOffset = isSidebarOpen ? 'right-[408px]' : 'right-6';

  return (
    <div
      className={`fixed bottom-6 ${dynamicRightOffset} z-50 w-96 rounded-2xl border border-slate-800 bg-slate-950/90 backdrop-blur-xl p-5 text-slate-100 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300 transition-all pointer-events-auto`}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            STAGE {stage + 1}/5: {stageTitles[stage].toUpperCase()}
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
            onReset();
          }}
          className="text-slate-400 hover:text-white text-xs transition p-1 hover:bg-slate-900 rounded-md cursor-pointer"
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
          <div className="flex flex-col gap-2.5">
            {/* Direct Map Click Prompt Banner */}
            <div className="bg-cyan-950/40 border border-cyan-500/40 p-2.5 rounded-xl flex flex-col gap-1.5 shadow-md">
              <div className="flex items-center justify-between text-[11px] font-bold text-cyan-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  📌 Klik Peta 4D Langsung:
                </span>
                <span className="text-[9px] font-mono bg-cyan-900/60 px-1.5 py-0.5 rounded border border-cyan-400/40 text-cyan-200">
                  INTERAKTIF
                </span>
              </div>
              <p className="text-[10px] text-slate-300 leading-tight">
                Klik marker kota/pelabuhan pada canvas peta di sebelah kiri untuk mengeset titik <strong className="text-cyan-400">Start (🟢)</strong> lalu <strong className="text-amber-400">End (🟡)</strong>.
              </p>
            </div>

            {/* Selected Node Status Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className={`p-2 rounded-xl border flex flex-col gap-1 text-[10px] transition-all ${selectedOrigin ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-200 shadow-sm' : 'bg-slate-950/60 border-dashed border-slate-700 text-slate-400'}`}>
                <span className="font-bold text-cyan-400 flex items-center gap-1">
                  <span>🟢 START (Klik 1)</span>
                  {selectedOrigin && <CheckCircle2 className="w-3 h-3 text-cyan-400" />}
                </span>
                <span className="font-mono font-bold text-[11px] truncate">
                  {selectedOrigin ? HUB_NODES[selectedOrigin]?.name || selectedOrigin.toUpperCase() : 'Pilih Marker Peta...'}
                </span>
              </div>
              <div className={`p-2 rounded-xl border flex flex-col gap-1 text-[10px] transition-all ${selectedDestination ? 'bg-amber-950/60 border-amber-500/50 text-amber-200 shadow-sm' : 'bg-slate-950/60 border-dashed border-slate-700 text-slate-400'}`}>
                <span className="font-bold text-amber-400 flex items-center gap-1">
                  <span>🟡 END (Klik 2)</span>
                  {selectedDestination && <CheckCircle2 className="w-3 h-3 text-amber-400" />}
                </span>
                <span className="font-mono font-bold text-[11px] truncate">
                  {selectedDestination ? HUB_NODES[selectedDestination]?.name || selectedDestination.toUpperCase() : 'Pilih Marker Peta...'}
                </span>
              </div>
            </div>

            {/* Sensor feeds */}
            <div className="grid grid-cols-6 gap-1 pt-1 border-t border-slate-800/40">
              {sources.map((src) => (
                <div
                  key={src.name}
                  className={`flex items-center justify-center p-1 border rounded text-[9px] font-bold font-mono ${src.color}`}
                  title={src.name}
                >
                  <src.Icon className="w-3 h-3 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === 1 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400 font-bold">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                STAGE 2/5: PARALLEL SWARM INGESTION
              </span>
              <span>6 AGENT UNITS</span>
            </div>
            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-cyan-400 h-full rounded-full animate-pulse transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round(((logStep + 1) / 6) * 100))}%` }}
              />
            </div>
            {/* 6 Agent Status Matrix Grid */}
            <div className="grid grid-cols-2 gap-1.5">
              {agents.map((agent, i) => {
                const isRunningAgent = i === logStep;
                const isDoneAgent = i < logStep;
                return (
                  <div
                    key={agent.key}
                    className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-[10px] font-mono transition-all ${
                      isRunningAgent
                        ? 'border-cyan-400 bg-cyan-950/80 text-cyan-200 shadow-sm ring-2 ring-cyan-500/20'
                        : isDoneAgent
                          ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                          : 'border-slate-850 bg-slate-950/40 text-slate-500'
                    }`}
                  >
                    {isDoneAgent ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : isRunningAgent ? (
                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-slate-700 shrink-0" />
                    )}
                    <span className="truncate">{agent.label}</span>
                  </div>
                );
              })}
            </div>
            {/* Live Glass-Box Terminal Stream */}
            <div className="bg-[#05070a] border border-cyan-500/40 rounded-xl p-2.5 font-mono text-[10px] text-cyan-300 shadow-inner flex flex-col gap-1">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest border-b border-slate-800/80 pb-1 flex justify-between">
                <span>Agent Reasoning Terminal Stream</span>
                <span className={logStep === 5 ? 'text-emerald-400 font-bold' : 'text-cyan-400 animate-pulse'}>
                  {logStep === 5 ? '● SWARM 100% COMPLETE' : '● SWARM ACTIVE'}
                </span>
              </div>
              <p className="line-clamp-2 leading-snug font-medium text-cyan-200">
                {swarmLogs[logStep]}
              </p>
            </div>
            {logStep === 5 && (
              <div className="bg-emerald-950/80 border border-emerald-500/60 p-2 rounded-xl flex items-center justify-between text-[10px] font-bold text-emerald-300 shadow-lg shadow-emerald-500/20 animate-in fade-in duration-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-bounce" />
                  <span>ANALISIS 6 AI SWARM SELESAI (100%)</span>
                </span>
                <span className="text-[9px] font-mono bg-emerald-900/90 px-1.5 py-0.5 rounded text-emerald-200 uppercase font-black tracking-wider border border-emerald-400/50">
                  SIAP ADVANCE
                </span>
              </div>
            )}
          </div>
        )}

        {stage === 2 && (
          <div className="flex flex-col gap-2.5 py-0.5">
            <div className="flex justify-between items-center text-xs text-slate-300">
              <span className="font-bold font-mono">Consensus Confidence Score</span>
              <span className="text-sm font-black text-emerald-400 font-mono">
                {(confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-yellow-500 to-emerald-400 h-full rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
            {/* 6 Agents All Completed Matrix */}
            <div className="grid grid-cols-3 gap-1">
              {agents.map((agent) => (
                <div
                  key={agent.key}
                  className="flex items-center gap-1 p-1 rounded-md border border-emerald-500/30 bg-emerald-950/20 text-[9px] font-mono text-emerald-300"
                >
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{agent.label}</span>
                </div>
              ))}
            </div>
            {/* Live Glass-Box Terminal Stream */}
            <div className="bg-[#05070a] border border-emerald-500/40 rounded-xl p-2.5 font-mono text-[10px] text-emerald-300 shadow-inner flex flex-col gap-1">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest border-b border-slate-800/80 pb-1 flex justify-between">
                <span>GraphRAG Consensus Evaluation</span>
                <span className="text-emerald-400 font-bold">VALIDATED (&gt;85%)</span>
              </div>
              <p className="line-clamp-2 leading-snug font-medium text-emerald-200">
                {swarmLogs[5]}
              </p>
            </div>
            {logStep === 5 && (
              <div className="bg-emerald-950/80 border border-emerald-500/60 p-2 rounded-xl flex items-center justify-between text-[10px] font-bold text-emerald-300 shadow-lg shadow-emerald-500/20 animate-in fade-in duration-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-bounce" />
                  <span>CONSENSUS GATE SIAP (100%)</span>
                </span>
                <span className="text-[9px] font-mono bg-emerald-900/90 px-1.5 py-0.5 rounded text-emerald-200 uppercase font-black tracking-wider border border-emerald-400/50">
                  SIAP ADVANCE
                </span>
              </div>
            )}
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
            <CheckCircle2 className="w-9 h-9 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
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
                onAdvance();
              }}
              className={`flex-1 py-2 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1.5 transition duration-200 ${
                stage === 0
                  ? 'bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 shadow-md shadow-cyan-500/20'
                  : logStep === 5
                    ? 'bg-cyan-400 text-slate-950 font-black hover:bg-cyan-300 shadow-lg shadow-cyan-500/50 animate-pulse border-2 border-cyan-300'
                    : 'bg-cyan-500/80 text-slate-950 font-bold hover:bg-cyan-400'
              }`}
            >
              {stage === 0 ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Inject Crisis & Run Swarm</span>
                </>
              ) : logStep === 5 ? (
                <>
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Next Step (Swarm Complete 100%)</span>
                </>
              ) : (
                <>
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Next Step</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStart({ origin: selectedOrigin, destination: selectedDestination });
              }}
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 active:scale-95 transition duration-200 shadow-md shadow-cyan-500/20 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart Demo</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleAuto();
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition duration-200 cursor-pointer flex items-center justify-center gap-1.5 ${
              isAuto
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {isAuto ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Auto</span>
              </>
            )}
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
            className="hover:text-cyan-400 transition cursor-pointer"
          >
            {qrVisible ? 'Hide Phone Remote' : '📱 Show Phone Remote'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onStart();
            }}
            className="hover:text-slate-300 transition cursor-pointer"
          >
            ↺ Reset Demo
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
