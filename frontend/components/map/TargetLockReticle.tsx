'use client';

import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';

interface TargetLockReticleProps {
  map: mapboxgl.Map | null;
  targetLngLat: [number, number] | null;
  currentPosRef?: React.RefObject<[number, number] | null>;
  callsign: string;
  onDismiss?: () => void;
}

export function TargetLockReticle({
  map,
  targetLngLat,
  currentPosRef,
  callsign,
}: TargetLockReticleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetLngLatRef = useRef<[number, number] | null>(targetLngLat);
  targetLngLatRef.current = targetLngLat;

  useEffect(() => {
    if (!map || !containerRef.current) return;

    const updatePosition = () => {
      if (!containerRef.current || !map) return;
      const lngLat = currentPosRef?.current || targetLngLatRef.current;
      if (!lngLat) return;

      // 3D globe horizon occlusion check
      let isOccluded = false;
      const proj = map.getProjection?.();
      if (proj && proj.name === 'globe') {
        const center = map.getCenter();
        const phi1 = (center.lat * Math.PI) / 180;
        const phi2 = (lngLat[1] * Math.PI) / 180;
        const deltaLambda = ((lngLat[0] - center.lng) * Math.PI) / 180;
        const cosAngle =
          Math.sin(phi1) * Math.sin(phi2) +
          Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
        if (cosAngle < 0.05) {
          isOccluded = true;
        }
      }

      const zoom = map.getZoom();
      const pt = map.project(lngLat);
      if (isOccluded || zoom < 3.8 || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
        containerRef.current.style.opacity = '0';
      } else {
        containerRef.current.style.opacity = '1';
        containerRef.current.style.transform = `translate3d(${Math.round(pt.x - 32)}px, ${Math.round(pt.y - 32)}px, 0)`;
      }
    };

    updatePosition();
    map.on('move', updatePosition);
    map.on('zoom', updatePosition);
    map.on('pitch', updatePosition);
    map.on('rotate', updatePosition);
    map.on('render', updatePosition);

    return () => {
      map.off('move', updatePosition);
      map.off('zoom', updatePosition);
      map.off('pitch', updatePosition);
      map.off('rotate', updatePosition);
      map.off('render', updatePosition);
    };
  }, [map, currentPosRef]);

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
 <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-[#0c1017] border border-white/10 text-xs tabular-nums text-slate-300 whitespace-nowrap shadow-xl">
 Armada · {callsign}
      </div>
    </div>
  );
}
