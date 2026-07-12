'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

export interface TimelineSnapshot {
  timestamp: string;      // ISO 8601
  label: string;          // "T+1h", "T+6h", etc.
  data: Record<string, unknown>;  // snapshot of crisis state at that point
}

interface TimelineScrubberProps {
  snapshots: TimelineSnapshot[];
  onSeek: (snapshot: TimelineSnapshot) => void;
  isLive?: boolean;
}

export function TimelineScrubber({ snapshots, onSeek, isLive = true }: TimelineScrubberProps) {
  const [currentIdx, setCurrentIdx] = useState(snapshots.length - 1);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const seek = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, snapshots.length - 1));
    setCurrentIdx(clamped);
    onSeek(snapshots[clamped]);
  }, [snapshots, onSeek]);

  useEffect(() => {
    if (!isPlaying) {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      return;
    }
    playIntervalRef.current = setInterval(() => {
      setCurrentIdx((prev) => {
        const next = prev + 1;
        if (next >= snapshots.length) {
          setIsPlaying(false);
          return prev;
        }
        onSeek(snapshots[next]);
        return next;
      });
    }, 1500);
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [isPlaying, snapshots, onSeek]);

  if (snapshots.length === 0) return null;

  return (
    <div
      id="timeline-scrubber"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[560px] z-20"
    >
      <div className="bg-slate-900/70 backdrop-blur-lg border border-white/10 rounded-2xl shadow-2xl px-5 py-3">
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button
            id="timeline-play-btn"
            onClick={() => setIsPlaying((v) => !v)}
            className="text-cyan-400 hover:text-cyan-300 transition-colors text-lg w-8 flex-shrink-0"
            aria-label={isPlaying ? 'Pause playback' : 'Play timeline'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          {/* Slider */}
          <div className="flex-1 relative">
            <input
              id="timeline-slider"
              type="range"
              min={0}
              max={snapshots.length - 1}
              value={currentIdx}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full h-1 appearance-none bg-slate-700 rounded-full cursor-pointer accent-cyan-400"
            />
          </div>

          {/* Current timestamp */}
          <div className="text-right flex-shrink-0">
            <div className="text-xs font-semibold text-cyan-400">
              {snapshots[currentIdx]?.label ?? ''}
            </div>
            {isLive && currentIdx === snapshots.length - 1 && (
              <div className="flex items-center gap-1 text-xs text-emerald-400">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
