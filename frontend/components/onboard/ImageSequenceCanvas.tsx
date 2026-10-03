'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, Zap, Navigation, CheckCircle } from 'lucide-react';

const TOTAL_FRAMES = 121;

// 4 Focused Operational Narrative Stages
const CHAPTERS = [
  {
    id: 1,
    range: [0, 30],
    phase: 'TAHAP 01',
    title: 'Deteksi Anomali Genangan Air & Longsor Jalinsum',
    desc: 'Sensor hidrologi BMKG dan penurunan kecepatan TomTom (<12 km/jam) mengindikasikan kelumpuhan arteri distribusi di KM 142-145.',
    icon: AlertTriangle,
    metrics: [
      { label: 'Indikator Banjir', val: 'Genangan 45 cm' },
      { label: 'Kecepatan Arteri', val: '12 km/jam' },
      { label: 'Latensi Deteksi', val: '< 2.4 detik' },
    ],
  },
  {
    id: 2,
    range: [31, 60],
    phase: 'TAHAP 02',
    title: 'Validasi Multi-Sensor & Penelusuran Causal Graph',
    desc: 'Agen intelijen memvalidasi laporan lapangan secara silang dengan ambang konsensus >85%, memproyeksikan potensi lonjakan harga cabai dan minyak goreng di Medan.',
    icon: Zap,
    metrics: [
      { label: 'Ambang Konsensus', val: '> 85% Terverifikasi' },
      { label: 'Multi-Sensor Ingest', val: 'BMKG + TomTom' },
      { label: 'Proyeksi Inflasi', val: 'Pasar Kota Medan' },
    ],
  },
  {
    id: 3,
    range: [61, 90],
    phase: 'TAHAP 03',
    title: 'Kalkulasi Rute Pengalihan Tangensial (Bypass)',
    desc: 'Mesin optimasi deterministik NetworkX & OR-Tools menghitung rute alternatif di luar radius bahaya menyusuri simpul arteri OSM terverifikasi.',
    icon: Navigation,
    metrics: [
      { label: 'Waktu Komputasi', val: '< 2 ms (CPU)' },
      { label: 'Buffer Penghindaran', val: 'R + 2.0 km' },
      { label: 'Simpul Arteri Terpilih', val: 'Tebing Tinggi' },
    ],
  },
  {
    id: 4,
    range: [91, 120],
    phase: 'TAHAP 04',
    title: 'Pemulihan Arus Pasokan Koridor Pangan',
    desc: 'Rekomendasi mitigasi diteruskan ke operator armada logistik, mengalihkan konvoi pengangkut komoditas tanpa penumpukan antrean panjang.',
    icon: CheckCircle,
    metrics: [
      { label: 'Status Koridor', val: 'Terkendali' },
      { label: 'Moda Distribusi', val: 'Truk Darat / Tol' },
      { label: 'Efisiensi Waktu', val: 'Optimal' },
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
  const [loadedCount, setLoadedCount] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // 1. Frame Drawer
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

    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    const targetWidth = Math.floor(cssWidth * dpr);
    const targetHeight = Math.floor(cssHeight * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const imgWidth = img.naturalWidth || 1920;
    const imgHeight = img.naturalHeight || 1080;
    const scale = Math.max(cssWidth / imgWidth, cssHeight / imgHeight);
    const drawWidth = imgWidth * scale;
    const drawHeight = imgHeight * scale;
    const x = (cssWidth - drawWidth) / 2;
    const y = (cssHeight - drawHeight) / 2;

    ctx.drawImage(img, x, y, drawWidth, drawHeight);
  }, []);

  // 2. Preload frames
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
    }, 1500);

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

        const frameIndex = Math.min(
          Math.floor(scrollProgress * (TOTAL_FRAMES - 1)),
          TOTAL_FRAMES - 1
        );

        if (frameIndex !== currentFrameRef.current) {
          currentFrameRef.current = frameIndex;
          drawFrame(frameIndex);

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

  return (
    <div ref={containerRef} className="relative w-full h-[250vh] bg-[#080d14]">
      {/* Sticky Fullscreen Canvas Viewport */}
      <div className="sticky top-0 w-full h-screen overflow-hidden flex items-center justify-center bg-[#080d14] z-20">
        
        {/* Canvas Display */}
        <canvas
          ref={canvasRef}
          className="w-full h-full block select-none pointer-events-none object-cover opacity-75"
        />

        {/* Subtle Dark Gradient Overlay for Typographic Contrast */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#080d14]/70 via-transparent to-[#080d14]/90" />

        {/* Right Editorial Chapter Navigation Rail */}
        <div className="absolute right-6 md:right-10 top-1/2 -translate-y-1/2 z-30 hidden md:flex flex-col gap-2">
          {CHAPTERS.map((chap, idx) => {
            const isActive = idx === activeChapterIndex;
            return (
              <button
                key={chap.id}
                onClick={() => jumpToChapter(chap.range[0])}
                className={`flex items-center gap-3 px-3.5 py-2 rounded-md transition-all cursor-pointer text-left ${
                  isActive
                    ? 'bg-[#121822] border border-white/20 text-white'
                    : 'bg-[#0c1017]/80 border border-white/8 text-slate-400 hover:text-slate-200 hover:border-white/15'
                }`}
              >
                <span className="font-mono text-xs font-semibold text-slate-400">
                  0{chap.id}
                </span>
                <span className="text-xs font-medium max-w-[130px] truncate">
                  {chap.title.split(' ')[0]} {chap.title.split(' ')[1]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bottom Editorial Narrative Card */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4 pointer-events-auto">
          <div className="bg-[#0c1017] border border-white/10 rounded-lg p-6 shadow-2xl flex flex-col gap-4">
            
            {/* Stage Identification Header */}
            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
              <div className="flex items-center gap-2.5">
                <ChapterIcon className="w-4 h-4 text-white shrink-0" />
                <span className="font-mono text-xs font-bold text-slate-400 tracking-wider">
                  {activeChapter.phase}
                </span>
              </div>
              <span className="font-mono text-xs text-slate-400">
                Tahap {activeChapterIndex + 1} dari {CHAPTERS.length}
              </span>
            </div>

            {/* Title & Description */}
            <div className="space-y-1.5">
              <h3 className="font-headline text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">
                {activeChapter.title}
              </h3>
              <p className="font-sans text-sm text-slate-300 leading-relaxed">
                {activeChapter.desc}
              </p>
            </div>

            {/* Tabular Telemetry Row */}
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/8">
              {activeChapter.metrics.map((m, idx) => (
                <div key={idx} className="flex flex-col">
                  <span className="font-sans text-[11px] text-slate-400">{m.label}</span>
                  <span className="font-mono text-xs sm:text-sm font-semibold text-white mt-0.5">
                    {m.val}
                  </span>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* Loading Indicator */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-[#080d14] flex flex-col items-center justify-center gap-3 z-30">
            <span className="font-mono text-xs text-slate-400 uppercase tracking-widest">
              Memuat visualisasi kronologi ({loadedCount}/{TOTAL_FRAMES})
            </span>
          </div>
        )}

      </div>
    </div>
  );
}
