'use client';
import { useEffect, useRef, useCallback } from 'react';
import type { WsEvent } from '@/lib/types';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';

export function useCrisisSocket(
  crisisId: string | null,
  onMessage: (event: WsEvent) => void
) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(1000);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage; // keep stable ref without re-connecting

  const connect = useCallback(() => {
    if (!crisisId) return;
    const ws = new WebSocket(`${WS_BASE}/ws/crisis/${crisisId}`);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log(`[WS] Connected → crisis:${crisisId}`);
      retryDelayRef.current = 1000;
    };

    ws.onmessage = (e) => {
      try {
        onMessageRef.current(JSON.parse(e.data) as WsEvent);
      } catch {
        console.warn('[WS] Failed to parse message', e.data);
      }
    };

    ws.onclose = () => {
      console.log(`[WS] Closed — retrying in ${retryDelayRef.current}ms`);
      reconnectRef.current = setTimeout(() => {
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30_000);
        connect();
      }, retryDelayRef.current);
    };

    ws.onerror = () => ws.close(); // triggers onclose → reconnect
  }, [crisisId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  // Expose send for initial payload delivery
  return {
    send: (data: unknown) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify(data));
      }
    },
    close: () => socketRef.current?.close(),
  };
}
