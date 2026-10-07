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
    title: 'Deteksi Genangan Air & Hambatan Jalur',
    desc: 'Peringatan cuaca BMKG dan penurunan kecepatan lalu lintas mengindikasikan gangguan distribusi di jalur lintas utama.',
    icon: AlertTriangle,
  },
  {
    id: 2,
    range: [31, 60],
    phase: 'TAHAP 02',
    title: 'Validasi Multi-Sumber & Analisis Dampak Pasar',
    desc: 'Sistem memverifikasi laporan lapangan dengan data cuaca dan lalu lintas untuk memproyeksikan keterlambatan pasokan komoditas pokok.',
    icon: Zap,
  },
  {
    id: 3,
    range: [61, 90],
    phase: 'TAHAP 03',
    title: 'Kalkulasi Rute Pengalihan Distribusi',
    desc: 'Menghitung rute alternatif di luar area terdampak guna memastikan armada pangan tetap bergerak aman.',
    icon: Navigation,
  },
  {
    id: 4,
    range: [91, 120],
    phase: 'TAHAP 04',
    title: 'Penerusan Rekomendasi ke Operator Armada',
    desc: 'Panduan rute alternatif diteruskan ke operator armada logistik untuk menjaga ketepatan waktu pengiriman.',
    icon: CheckCircle,
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

        {/* Bottom Editorial Narrative Card */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 w-full max-w-xl px-4 pointer-events-auto">
          <div className="bg-[#0c1017] border border-white/10 rounded-lg p-5 shadow-2xl flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <ChapterIcon className="w-4 h-4 text-white shrink-0" />
              <span className="font-mono text-xs font-semibold text-slate-400 tracking-wider">
                {activeChapter.phase}
              </span>
            </div>

            <h3 className="font-headline text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">
              {activeChapter.title}
            </h3>
            <p className="font-sans text-xs sm:text-sm text-slate-300 leading-relaxed">
              {activeChapter.desc}
            </p>
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
