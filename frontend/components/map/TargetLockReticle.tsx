'use client';

import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';

interface TargetLockReticleProps {
  map: mapboxgl.Map | null;
  targetLngLat: [number, number] | null;
  callsign: string;
  onDismiss?: () => void;
}

export function TargetLockReticle({
  map,
  targetLngLat,
  callsign,
}: TargetLockReticleProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!map || !targetLngLat || !containerRef.current) return;

    const updatePosition = () => {
      if (!containerRef.current || !map || !targetLngLat) return;
      const pt = map.project(targetLngLat);
      containerRef.current.style.transform = `translate3d(${pt.x - 32}px, ${pt.y - 32}px, 0)`;
    };

    updatePosition();
    map.on('move', updatePosition);
    map.on('zoom', updatePosition);
    map.on('pitch', updatePosition);
    map.on('rotate', updatePosition);

    return () => {
      map.off('move', updatePosition);
      map.off('zoom', updatePosition);
      map.off('pitch', updatePosition);
      map.off('rotate', updatePosition);
    };
  }, [map, targetLngLat]);

  if (!targetLngLat) return null;

  return (
    <div
      ref={containerRef}
      className="absolute top-0 left-0 w-16 h-16 pointer-events-none z-30 transition-transform duration-75 will-change-transform"
      style={{ transform: 'translate3d(-9999px, -9999px, 0)' }}
    >
      <svg className="w-full h-full opacity-90" viewBox="0 0 64 64">
        {/* Top-Left Bracket */}
        <path d="M12 22 V12 H22" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Top-Right Bracket */}
        <path d="M42 12 H52 V22" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Bottom-Right Bracket */}
        <path d="M52 42 V52 H42" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Bottom-Left Bracket */}
        <path d="M22 52 H12 V42" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* 4 Cardinal Ticks */}
        <path d="M32 14 V18" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M32 46 V50" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14 32 H18" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M46 32 H50" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />

        {/* Center Target Pip */}
        <circle cx="32" cy="32" r="2" fill="#ffffff" />
      </svg>

      {/* Callsign Target Badge */}
      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-[#0c1017] border border-[#1c2432] text-xs font-mono tabular-nums text-white whitespace-nowrap shadow-xl">
        ARMADA: {callsign}
      </div>
    </div>
  );
}
