'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  CloudLightning,
  Car,
  Satellite,
  Anchor,
  TrendingUp,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';

interface GuidedDemoPanelProps {
  stage: number;
  isRunning: boolean;
  isReplay: boolean;
  crisisId: string | null;
  confidence: number;
  summary: string;
  isAuto: boolean;
  onStart: () => void;
  onAdvance: () => void;
  onToggleAuto: () => void;
  onReset: () => void;
  isSidebarOpen?: boolean;
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
}: GuidedDemoPanelProps) {
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

  if (!isRunning) {
    return null;
  }

  const stageTitles = [
    'Injecting Real-time Sensors',
    'Agent Swarm Analysis',
    'GraphRAG Consensus Gate',
    'Validated Alert & Reroute',
    'WhatsApp & Fleet Dispatch',
  ];

  const stageExplainers = [
    'PetaNadi menarik data real-time dari 6 sumber: cuaca (BMKG), kemacetan (TomTom), peta kebakaran (NASA), antrean pelabuhan (AISstream), harga pangan (PIHPS), dan laporan media sosial.',
    '6 agen AI memproses data secara paralel. Setiap agen ahli di satu domain: pemetaan bahaya, optimasi rute, proyeksi ekonomi, dan dukungan keputusan krisis.',
    'Consensus Gate mengevaluasi skor kepercayaan dari semua agen. Krisis hanya divalidasi ketika skor tertimbang melebihi 85% — mencegah alarm palsu terhadap armada logistik.',
    'Penutupan Koridor Belawan tervalidasi. Dashboard menampilkan zona bahaya, rute pengalihan aman via cuOpt GPU, dan proyeksi dampak ekonomi terhadap harga komoditas.',
    'Notifikasi WhatsApp telah dikirim ke operator logistik dengan ringkasan krisis, rute pengalihan NVIDIA cuOpt, dan deep-link kembali ke dashboard PetaNadi.',
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
          <div className="grid grid-cols-3 gap-2">
            {sources.map((src, i) => (
              <div
                key={src.name}
                className={`flex items-center gap-1.5 px-2.5 py-2 border rounded-lg text-xs font-semibold select-none ${src.color} animate-fade-in`}
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <src.Icon className="w-3.5 h-3.5 shrink-0" />
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
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 active:scale-98 transition duration-200 shadow-md shadow-cyan-500/20 cursor-pointer"
            >
              ⏭ Next Step
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStart();
              }}
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 active:scale-95 transition duration-200 shadow-md shadow-cyan-500/20 cursor-pointer"
            >
              ↺ Restart Demo
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleAuto();
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition duration-200 cursor-pointer ${
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
