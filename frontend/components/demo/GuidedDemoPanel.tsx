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
  X,
  MapPin,
  Circle,
  Smartphone,
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
    'Penyiapan Rute & Titik Pantau',
    'Analisis Data Multi-Sumber',
    'Verifikasi Konsensus Risiko',
    'Peringatan Tervalidasi & Pengalihan',
    'Notifikasi Armada Logistik',
  ];

  const stageExplainers = [
    'Silakan tentukan rute krisis dengan mengeklik 2 titik marker pada Peta Operasi di sebelah kiri (Klik 1: Start, Klik 2: End). Sistem akan merender rute baseline hijau sebelum disrupsi disimulasikan.',
    'Modul analisis memproses data secara terpadu untuk pemetaan bahaya, rute alternatif, dan proyeksi dampak ekonomi pasar.',
    'Sistem mengevaluasi tingkat keyakinan data multi-sumber guna menyaring peringatan palsu sebelum diterbitkan.',
    'Gangguan tervalidasi. Sistem menghitung rute pengalihan aman di luar zona bahaya khusus untuk koridor pilihan Anda.',
    'Notifikasi telah dikirim ke operator logistik dengan ringkasan krisis, rute pengalihan teroptimasi, dan tautan dasbor.',
  ];

  const sources = [
    { name: 'BMKG', Icon: CloudLightning, color: 'border-yellow-500/30 text-yellow-400 bg-yellow-950/20' },
    { name: 'TomTom', Icon: Car, color: 'border-orange-500/30 text-orange-400 bg-orange-950/20' },
    { name: 'NASA', Icon: Satellite, color: 'border-red-500/30 text-red-400 bg-red-950/20' },
    { name: 'AISstream', Icon: Anchor, color: 'border-blue-500/30 text-blue-400 bg-blue-950/20' },
    { name: 'PIHPS', Icon: TrendingUp, color: 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20' },
    { name: 'Social', Icon: MessageSquare, color: 'border-purple-500/30 text-purple-400 bg-purple-950/20' },
  ];



  const dynamicRightOffset = isSidebarOpen ? 'right-[408px]' : 'right-6';

  return (
    <div
      className={`fixed bottom-6 ${dynamicRightOffset} z-50 w-96 rounded-lg border border-[#1c2432] bg-[#0c1017] p-4 text-slate-100 shadow-xl flex flex-col gap-3 animate-in slide-in-from-bottom-4 duration-200 transition-all pointer-events-auto font-sans`}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex justify-between items-center border-b border-[#1c2432] pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
          <h4 className="text-xs font-semibold text-slate-200 tracking-wide uppercase">
            Tahap {stage + 1} dari 5: {stageTitles[stage]}
          </h4>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onReset();
          }}
          className="text-slate-400 hover:text-white text-xs transition p-1 hover:bg-[#121822] rounded cursor-pointer"
          aria-label="Tutup panel demo"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stepper Progress Indicator */}
      <div className="flex justify-between items-center gap-1 px-0.5">
        {stageTitles.map((_, idx) => (
          <div key={idx} className="flex-1 flex flex-col gap-1 items-center">
            <div
              className={`w-full h-1 rounded-full transition-all duration-200 ${
                idx <= stage ? 'bg-cyan-400' : 'bg-[#1c2432]'
              }`}
            />
          </div>
        ))}
      </div>

      {/* Stage Explainer */}
      <div className="rounded-md border border-[#1c2432] bg-[#121822] p-3 text-xs text-slate-300 leading-relaxed">
        {stageExplainers[stage]}
      </div>

      {/* Interactive visual feedback per stage */}
      <div className="min-h-[110px] border border-[#1c2432] bg-[#121822] rounded-md p-3 flex flex-col justify-center">
        {stage === 0 && (
          <div className="flex flex-col gap-2.5">
            {/* Direct Map Click Prompt */}
            <div className="bg-[#0c1017] border border-[#1c2432] p-2.5 rounded-md flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs font-medium text-slate-200">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Pilih Simpul Peta Operasi:</span>
                </span>
                <span className="text-xs font-mono text-cyan-400">
                  Interaktif
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-normal">
                Klik marker kota/pelabuhan pada peta untuk mengeset titik <strong className="text-cyan-300 font-medium">Asal</strong> lalu <strong className="text-amber-300 font-medium">Tujuan</strong>.
              </p>
            </div>

            {/* Selected Node Status Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className={`p-2 rounded-md border flex flex-col gap-1 text-xs transition-colors ${selectedOrigin ? 'bg-[#0c1017] border-[#1c2432] text-slate-200' : 'bg-[#0c1017]/50 border-dashed border-[#1c2432] text-slate-500'}`}>
                <span className="font-medium text-cyan-400 flex items-center gap-1">
                  <Circle className="w-2.5 h-2.5 fill-cyan-400 text-cyan-400" />
                  <span>Asal (Klik 1)</span>
                  {selectedOrigin && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 ml-auto" />}
                </span>
                <span className="font-mono tabular-nums text-xs truncate">
                  {selectedOrigin ? HUB_NODES[selectedOrigin]?.name || selectedOrigin.toUpperCase() : 'Pilih Marker Peta...'}
                </span>
              </div>
              <div className={`p-2 rounded-md border flex flex-col gap-1 text-xs transition-colors ${selectedDestination ? 'bg-[#0c1017] border-[#1c2432] text-slate-200' : 'bg-[#0c1017]/50 border-dashed border-[#1c2432] text-slate-500'}`}>
                <span className="font-medium text-amber-400 flex items-center gap-1">
                  <Circle className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                  <span>Tujuan (Klik 2)</span>
                  {selectedDestination && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 ml-auto" />}
                </span>
                <span className="font-mono tabular-nums text-xs truncate">
                  {selectedDestination ? HUB_NODES[selectedDestination]?.name || selectedDestination.toUpperCase() : 'Pilih Marker Peta...'}
                </span>
              </div>
            </div>

            {/* Sensor feeds */}
            <div className="grid grid-cols-6 gap-1 pt-1 border-t border-[#1c2432]">
              {sources.map((src) => (
                <div
                  key={src.name}
                  className={`flex items-center justify-center p-1 border rounded text-xs font-mono ${src.color}`}
                  title={src.name}
                >
                  <src.Icon className="w-3 h-3 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === 1 && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>Pemrosesan Telemetri Lapangan</span>
              </span>
              <span className="font-mono text-slate-400 text-xs">
                {logStep === 5 ? 'Selesai' : 'Memproses...'}
              </span>
            </div>
            <div className="w-full bg-[#080d14] h-1.5 rounded-full overflow-hidden border border-[#1c2432]">
              <div
                className="bg-cyan-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round(((logStep + 1) / 6) * 100))}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded border border-[#1c2432] bg-[#0c1017] text-slate-300">
                <span className="text-slate-400 block mb-0.5">Sensor & Arus Jalan</span>
                <span className="font-mono text-cyan-300 font-medium">BMKG & TomTom</span>
              </div>
              <div className="p-2 rounded border border-[#1c2432] bg-[#0c1017] text-slate-300">
                <span className="text-slate-400 block mb-0.5">Pemetaan Bahaya</span>
                <span className="font-mono text-cyan-300 font-medium">Radius Terkonfirmasi</span>
              </div>
            </div>
          </div>
        )}

        {stage === 2 && (
          <div className="flex flex-col gap-2.5 py-0.5">
            <div className="flex justify-between items-center text-xs text-slate-300">
              <span className="font-medium">Skor Keyakinan Multi-Sumber</span>
              <span className="text-xs font-semibold text-emerald-400 font-mono tabular-nums">
                {(confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-[#080d14] h-1.5 rounded-full overflow-hidden border border-[#1c2432]">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
            <div className="p-2.5 rounded border border-emerald-500/30 bg-[#0c1017] flex items-center justify-between text-xs text-emerald-300">
              <span className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Konsensus Peringatan Tervalidasi</span>
              </span>
              <span className="font-mono text-xs text-emerald-400">&gt;85% Sesuai</span>
            </div>
          </div>
        )}

        {stage === 3 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                Peringatan Krisis Aktif
              </span>
            </div>
            <p className="text-xs text-slate-300 line-clamp-3 italic leading-relaxed">
              &quot;{summary || 'Memproses rekomendasi Dukungan Keputusan...'}&quot;
            </p>
          </div>
        )}

        {stage === 4 && (
          <div className="flex flex-col items-center gap-2 text-center py-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            <div className="text-xs font-semibold text-slate-200">Notifikasi Dispatched</div>
            <div className="text-xs text-slate-400 max-w-[260px] leading-normal">
              Notifikasi operasional telah dikirim ke operator armada rute Deli Serdang & Belawan.
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
              className="flex-1 py-2 px-3 rounded-md text-xs font-semibold bg-white text-[#080d14] hover:bg-slate-200 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
            >
              {stage === 0 ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Mulai Simulasi Disrupsi</span>
                </>
              ) : logStep === 5 ? (
                <>
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Langkah Berikutnya</span>
                </>
              ) : (
                <>
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Langkah Berikutnya</span>
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
              className="flex-1 py-2 px-3 rounded-md text-xs font-semibold bg-white text-[#080d14] hover:bg-slate-200 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Mulai Ulang Demo</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleAuto();
            }}
            className={`px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              isAuto
                ? 'bg-amber-950/40 text-amber-300 border border-amber-500/40'
                : 'border border-[#1c2432] bg-[#121822] text-slate-300 hover:text-white hover:bg-[#1a2230]'
            }`}
          >
            {isAuto ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Jeda</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Otomatis</span>
              </>
            )}
          </button>
        </div>

        <div className="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-[#1c2432]">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setQrVisible((prev) => !prev);
            }}
            className="hover:text-slate-200 transition cursor-pointer flex items-center gap-1.5"
          >
            <Smartphone className="w-3.5 h-3.5 text-slate-400" />
            <span>{qrVisible ? 'Sembunyikan Remote' : 'Remote Ponsel'}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onStart();
            }}
            className="hover:text-slate-200 transition cursor-pointer flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Demo</span>
          </button>
        </div>
      </div>

      {/* QR Code section for Phone Remote */}
      {qrVisible && (
        <div className="flex flex-col items-center gap-2 bg-[#121822] p-4 border border-[#1c2432] rounded-md">
          <canvas ref={canvasRef} className="rounded" />
          <div className="text-center">
            <div className="text-xs font-semibold text-slate-200">Scan QR Code</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Buka pengendali jarak jauh pada ponsel
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
