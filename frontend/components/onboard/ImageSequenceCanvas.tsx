'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowDown, Zap, AlertTriangle, CheckCircle, Navigation, Lock, Unlock } from 'lucide-react';

const TOTAL_FRAMES = 121;

// 4 Cinematic Storytelling Chapters
const CHAPTERS = [
  {
    id: 1,
    range: [0, 30],
    phase: 'PHASE 01: REAL-TIME ANOMALY INGESTION',
    title: 'Flood Hazard Incident Detected at KM 142-145',
    subtitle: 'BMKG Hydrology & TomTom Traffic Speed Drop (<12 km/h)',
    desc: 'Multi-sensor ingest pipeline triggers early anomaly warning. Water level sensors confirm severe arterial blockage.',
    icon: AlertTriangle,
    accentColor: 'text-amber-400',
    badgeBg: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
    metrics: [
      { label: 'Water Level', val: '+45 cm' },
      { label: 'TomTom Traffic', val: '12 km/h' },
      { label: 'Ingestion Latency', val: '< 2.4s' },
    ],
  },
  {
    id: 2,
    range: [31, 60],
    phase: 'PHASE 02: LANGGRAPH 6-AGENT SWARM REASONING',
    title: 'Causal Graph & Consensus Verification (>85%)',
    subtitle: 'DeepSeek V3 + Gemini 3.1 CoT Synthesis',
    desc: 'OSINT Hazard Agent verifies news reports while Economic Agent projects food price inflation impact in Medan.',
    icon: Zap,
    accentColor: 'text-cyan-400',
    badgeBg: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
    metrics: [
      { label: 'Consensus Confidence', val: '94.2%' },
      { label: 'Agents Active', val: '6 Swarm' },
      { label: 'False Positive Target', val: '< 5%' },
    ],
  },
  {
    id: 3,
    range: [61, 90],
    phase: 'PHASE 03: NVIDIA CUOPT GPU ROUTE OPTIMIZATION',
    title: 'Tangential Danger Zone Detour Rerouting',
    subtitle: '18 Verified OSM Intersections & Waypoint Injection',
    desc: 'cuOpt GPU matrix solver calculates safe detour 2.0 km outside flood polygon in under 100ms.',
    icon: Navigation,
    accentColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    metrics: [
      { label: 'Matrix Solve Latency', val: '< 85 ms' },
      { label: 'Avoidance Radius', val: 'R + 2.0 km' },
      { label: 'Cost Reduction', val: '14.8%' },
    ],
  },
  {
    id: 4,
    range: [91, 120],
    phase: 'PHASE 04: AUTOMATED FLEET DISPATCH & RESILIENCE RESTORED',
    title: 'National Corridor Supply Chain Flow Resumed',
    subtitle: 'Real-time WhatsApp & Fleet Operator Dispatch',
    desc: 'Automated advisories broadcast to logistic fleets. Supply corridor flow resumes without bottleneck delays.',
    icon: CheckCircle,
    accentColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    metrics: [
      { label: 'Advisories Dispatched', val: '142 Fleets' },
      { label: 'Corridor Status', val: 'OPTIMAL' },
      { label: 'System Uptime', val: '99.99%' },
    ],
  },
];

export default function ImageSequenceCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const currentFrameRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const isVisibleRef = useRef<boolean>(true);

  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);
  const [currentFrameNum, setCurrentFrameNum] = useState<number>(1);
  const [scrollProgressRatio, setScrollProgressRatio] = useState<number>(0);
  const [loadedCount, setLoadedCount] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // 1. High-Definition Ultra-Sharp Canvas Frame Drawer
  const drawFrame = useCallback((frameIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let img = imagesRef.current[frameIndex];
    if (!img || !img.complete || img.naturalWidth === 0) {
      for (let i = frameIndex - 1; i >= 0; i--) {
        if (imagesRef.current[i]?.complete && imagesRef.current[i].naturalWidth > 0) {
          img = imagesRef.current[i];
          break;
        }
      }
    }

    if (!img || !img.complete || img.naturalWidth === 0) return;

    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight;
    if (cssWidth === 0 || cssHeight === 0) return;

    // Use full Device Pixel Ratio (up to 2.5x) for HD sharpness
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const targetWidth = Math.floor(cssWidth * dpr);
    const targetHeight = Math.floor(cssHeight * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    // Reset 2D context transform matrix before scaling
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Highest quality image smoothing settings
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Aspect Ratio Cover Math
    const imgWidth = img.naturalWidth || 1920;
    const imgHeight = img.naturalHeight || 1080;
    const scale = Math.max(cssWidth / imgWidth, cssHeight / imgHeight);
    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;
    const x = (cssWidth - drawWidth) / 2;
    const y = (cssHeight - drawHeight) / 2;

    ctx.drawImage(img, x, y, drawWidth, drawHeight);
  }, []);

  // 2. Preload 121 frame images into memory cache
  useEffect(() => {
    let loaded = 0;
    const imgs: HTMLImageElement[] = [];

    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      const frameNum = String(i).padStart(3, '0');
      img.src = `/onboard/action-sequence/ezgif-frame-${frameNum}.jpg`;

      img.onload = () => {
        loaded++;
        setLoadedCount(loaded);
        if (i === 1) {
          setIsLoaded(true);
          setTimeout(() => drawFrame(0), 50);
        }
      };

      img.onerror = () => {
        loaded++;
        setLoadedCount(loaded);
      };

      imgs.push(img);
    }

    imagesRef.current = imgs;

    const safetyTimer = setTimeout(() => {
      setIsLoaded(true);
    }, 1200);

    return () => clearTimeout(safetyTimer);
  }, [drawFrame]);

  // 3. Handle Resize
  useEffect(() => {
    const handleResize = () => {
      drawFrame(currentFrameRef.current);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawFrame]);

  // 4. Intersection Observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisibleRef.current = entry.isIntersecting;
        });
      },
      { threshold: 0.01 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 5. Scroll Progress RAF Listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastChapterIdx = -1;

    const handleScroll = () => {
      if (!isVisibleRef.current) return;

      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      rafIdRef.current = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const totalScrollable = container.clientHeight - windowHeight;

        if (totalScrollable <= 0) return;

        const rawProgress = -rect.top / totalScrollable;
        const scrollProgress = Math.min(Math.max(rawProgress, 0), 1);
        setScrollProgressRatio(scrollProgress);

        const frameIndex = Math.min(
          Math.floor(scrollProgress * (TOTAL_FRAMES - 1)),
          TOTAL_FRAMES - 1
        );

        if (frameIndex !== currentFrameRef.current) {
          currentFrameRef.current = frameIndex;
          drawFrame(frameIndex);
          setCurrentFrameNum(frameIndex + 1);

          const newChapIdx = CHAPTERS.findIndex(
            (c) => frameIndex >= c.range[0] && frameIndex <= c.range[1]
          );
          if (newChapIdx !== -1 && newChapIdx !== lastChapterIdx) {
            lastChapterIdx = newChapIdx;
            setActiveChapterIndex(newChapIdx);
          }
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [drawFrame]);

  // Jump to specific chapter on click
  const jumpToChapter = (chapterRangeStart: number) => {
    const container = containerRef.current;
    if (!container) return;
    const totalScrollable = container.clientHeight - window.innerHeight;
    const targetProgress = chapterRangeStart / (TOTAL_FRAMES - 1);
    const targetScrollY = container.offsetTop + targetProgress * totalScrollable;

    window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
  };

  const activeChapter = CHAPTERS[activeChapterIndex] || CHAPTERS[0];
  const ChapterIcon = activeChapter.icon;
  const progressPercent = Math.round((loadedCount / TOTAL_FRAMES) * 100);
  const sequencePercent = Math.round(scrollProgressRatio * 100);
  const isSequenceComplete = currentFrameNum >= TOTAL_FRAMES - 1;

  return (
    <section id="sequence" ref={containerRef} className="relative w-full h-[300vh] bg-[#080d14]">
      {/* Sticky Fullscreen Pinned Canvas Viewport (100vw x 100vh) */}
      <div className="sticky top-0 w-full h-screen overflow-hidden flex items-center justify-center bg-[#080d14] z-30">
        
        {/* Top Floating Glow Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-white/10 z-20">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 transition-all duration-75 shadow-[0_0_15px_rgba(34,211,238,0.8)]"
            style={{ width: `${sequencePercent}%` }}
          />
        </div>

        {/* Ultra-Sharp High-Definition HD Canvas */}
        <canvas
          ref={canvasRef}
          className="w-full h-full block select-none pointer-events-none object-cover transition-all duration-300"
          style={{ filter: 'contrast(1.04) saturate(1.05) brightness(1.02)' }}
        />

        {/* Ambient Dark Gradient Overlay */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#080d14]/60 via-transparent to-[#080d14]/85" />
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_40%,#080d14_90%)]" />

        {/* Top-Left Telemetry Tag Overlay */}
        <div className="absolute top-8 left-8 z-10 flex items-center gap-3 px-4 py-2 rounded-full backdrop-blur-2xl bg-[#0c0e12]/90 border border-cyan-400/40 text-xs font-mono text-cyan-400 shadow-2xl">
          <img src="/logo_prehub.png" alt="PreHub" className="w-4 h-4 object-contain animate-pulse" />
          <span className="font-bold">4D SEQUENCE RUNTIME</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-200">FRAME {String(currentFrameNum).padStart(3, '0')} / {TOTAL_FRAMES}</span>
        </div>

        {/* Top-Right Sticky Pin Status Indicator */}
        <div className="absolute top-8 right-8 z-10 hidden md:flex items-center gap-2.5 px-4 py-2 rounded-full backdrop-blur-2xl bg-[#0c0e12]/90 border border-white/20 text-xs font-mono shadow-2xl">
          {isSequenceComplete ? (
            <>
              <Unlock className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
              <span className="text-emerald-400 font-bold uppercase tracking-wider">
                Sequence Complete &bull; Scroll Down
              </span>
            </>
          ) : (
            <>
              <Lock className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="text-cyan-400 font-bold uppercase tracking-wider">
                Scroll Locked &bull; {sequencePercent}% Completed
              </span>
            </>
          )}
        </div>

        {/* Right Floating Interactive Kinetic HUD Timeline */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 z-20 hidden lg:flex flex-col gap-3">
          {CHAPTERS.map((chap, idx) => {
            const isActive = idx === activeChapterIndex;
            return (
              <button
                key={chap.id}
                onClick={() => jumpToChapter(chap.range[0])}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl backdrop-blur-2xl transition-all duration-300 border cursor-pointer text-left group ${
                  isActive
                    ? 'bg-[#0c0e12]/95 border-cyan-400 text-white shadow-[0_0_30px_rgba(34,211,238,0.4)] scale-105'
                    : 'bg-[#0c0e12]/60 border-white/10 text-slate-400 hover:bg-[#0c0e12]/80 hover:border-white/30 hover:text-white'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold transition-transform group-hover:scale-110 ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 font-black shadow-md'
                      : 'bg-white/10 text-slate-400'
                  }`}
                >
                  0{chap.id}
                </div>
                <div className="flex flex-col">
                  <span className={`text-[10px] font-mono font-bold tracking-wider uppercase ${isActive ? 'text-cyan-400' : 'text-slate-400'}`}>
                    Phase 0{chap.id}
                  </span>
                  <span className="text-xs font-bold tracking-tight line-clamp-1 max-w-[140px]">
                    {chap.title.split(' ')[0]} {chap.title.split(' ')[1]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Bottom Floating Storytelling HUD Card */}
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-10 w-full max-w-2xl px-4 pointer-events-none">
          <div className="backdrop-blur-2xl bg-[#0c0e12]/95 border border-white/25 rounded-3xl p-6 shadow-[0_0_80px_rgba(0,0,0,0.9)] flex flex-col gap-4 pointer-events-auto transition-all duration-500">
            
            {/* Header Phase Pill & Icon */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 ${activeChapter.accentColor}`}>
                  <ChapterIcon className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className={`text-[10px] font-mono font-bold tracking-widest px-2.5 py-0.5 rounded-full border w-fit ${activeChapter.badgeBg}`}>
                    {activeChapter.phase}
                  </span>
                  <h3 className="text-base font-bold text-white tracking-tight mt-1">
                    {activeChapter.title}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-slate-300 text-xs font-mono shrink-0">
                <span>{isSequenceComplete ? 'Scroll to Next Section' : 'Keep Scrolling'}</span>
                <ArrowDown className="w-4 h-4 animate-bounce text-cyan-400" />
              </div>
            </div>

            {/* Description */}
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
              {activeChapter.desc}
            </p>

            {/* Live Telemetry Metrics Row */}
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/10 font-mono">
              {activeChapter.metrics.map((m, idx) => (
                <div key={idx} className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-medium">{m.label}</span>
                  <span className="text-xs sm:text-sm font-bold text-cyan-400 mt-0.5">{m.val}</span>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* Initial Loading Overlay State */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-[#080d14]/95 backdrop-blur-xl flex flex-col items-center justify-center gap-4 z-20">
            <img src="/logo_prehub.png" alt="PreHub" className="w-12 h-12 object-contain animate-bounce" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-white text-sm font-bold tracking-wide">
                Initializing 4D Sequence Player (High-Res 60 FPS)
              </span>
              <span className="text-cyan-400 text-xs font-mono font-bold">
                {progressPercent}% Loaded ({loadedCount}/{TOTAL_FRAMES})
              </span>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
