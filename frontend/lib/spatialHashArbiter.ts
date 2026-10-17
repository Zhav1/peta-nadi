/**
 * SpatialHash Label & Marker Anti-Clutter Arbiter
 *
 * High-performance screen-space decluttering engine ported from bilawalsidhu/gods-eye-view.
 * Evaluates candidate labels and markers across 32px grid cells using bit-packed Smi keys,
 * multi-tier priority arbitrations, fair-share quota allocation, and temporal hysteresis
 * to eliminate label strobing/flickering during map pan/zoom.
 */

export const CELL_SIZE_PX = 32;
export const MIN_LIFETIME_MS = 2500;
export const COOLDOWN_MS = 1200;

export const PRIORITY_SELECTED_ROUTE = 100;
export const PRIORITY_STRATEGIC_HUB = 80;
export const PRIORITY_REGENCY_NODE = 60;
export const PRIORITY_FLEET_CALLSIGN = 40;
export const PRIORITY_VILLAGE_DESA = 20;

export type DeclutterCategory = 'route' | 'hub' | 'regency' | 'fleet' | 'village';

export interface DeclutterItem {
  id: string;
  screenX: number;
  screenY: number;
  priority: number;
  width?: number;
  height?: number;
  category?: DeclutterCategory;
  text?: string;
  coords?: [number, number]; // [lon, lat]
}

interface HysteresisRecord {
  firstVisibleAt: number;
  lastVisibleAt: number;
  lastHiddenAt: number;
  visible: boolean;
}

/**
 * Bit-packed Smi key generator: ((cx + 2048) << 14) | ((cy + 2048) & 0x3fff)
 * Provides instant hash collision lookup without string allocation.
 */
export function packCellKey(cx: number, cy: number): number {
  return (((cx + 2048) & 0x3fff) << 14) | ((cy + 2048) & 0x3fff);
}

export class SpatialHashArbiter {
  private occupiedCells: Map<number, string> = new Map();
  private history: Map<string, HysteresisRecord> = new Map();
  private maxFleetQuota: number;

  constructor(maxFleetQuota: number = 24) {
    this.maxFleetQuota = maxFleetQuota;
  }

  /**
   * Reset temporal history (e.g. on route change or major mode reset).
   */
  public resetHistory(): void {
    this.history.clear();
    this.occupiedCells.clear();
  }

  /**
   * Arbitrate a set of candidate screen-space items.
   * Returns a set of winning item IDs that are permitted to render without visual overlap.
   */
  public arbitrate(candidates: DeclutterItem[], currentTime: number = performance.now()): Set<string> {
    this.occupiedCells.clear();
    const winningIds = new Set<string>();

    // 1. Calculate effective priority with temporal hysteresis boost/cooldown
    const scoredCandidates = candidates.map((item) => {
      let effectivePriority = item.priority;
      const hist = this.history.get(item.id);

      if (hist) {
        if (hist.visible) {
          const visibleDuration = currentTime - hist.firstVisibleAt;
          if (visibleDuration < MIN_LIFETIME_MS) {
            // Hysteresis boost: keep recently displayed labels stable during panning
            effectivePriority += 35;
          }
        } else {
          const hiddenDuration = currentTime - hist.lastHiddenAt;
          if (hiddenDuration < COOLDOWN_MS) {
            // Cooldown penalty: avoid immediate re-strobing
            effectivePriority -= 25;
          }
        }
      }

      return {
        item,
        effectivePriority,
      };
    });

    // 2. Sort descending by effective priority
    scoredCandidates.sort((a, b) => b.effectivePriority - a.effectivePriority);

    let fleetCallsignsRendered = 0;

    // 3. Grid collision resolution
    for (const { item } of scoredCandidates) {
      if (item.category === 'fleet' && fleetCallsignsRendered >= this.maxFleetQuota) {
        continue;
      }

      const w = item.width || 80;
      const h = item.height || 24;

      const minCx = Math.floor((item.screenX - w / 2) / CELL_SIZE_PX);
      const maxCx = Math.floor((item.screenX + w / 2) / CELL_SIZE_PX);
      const minCy = Math.floor((item.screenY - h / 2) / CELL_SIZE_PX);
      const maxCy = Math.floor((item.screenY + h / 2) / CELL_SIZE_PX);

      let hasCollision = false;
      const targetKeys: number[] = [];

      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
          const key = packCellKey(cx, cy);
          if (this.occupiedCells.has(key)) {
            hasCollision = true;
            break;
          }
          targetKeys.push(key);
        }
        if (hasCollision) break;
      }

      if (!hasCollision) {
        for (const k of targetKeys) {
          this.occupiedCells.set(k, item.id);
        }
        winningIds.add(item.id);
        if (item.category === 'fleet') {
          fleetCallsignsRendered++;
        }
      }
    }

    // 4. Update hysteresis state
    for (const item of candidates) {
      const isWinner = winningIds.has(item.id);
      const prev = this.history.get(item.id);

      if (isWinner) {
        if (!prev || !prev.visible) {
          this.history.set(item.id, {
            firstVisibleAt: currentTime,
            lastVisibleAt: currentTime,
            lastHiddenAt: prev?.lastHiddenAt ?? 0,
            visible: true,
          });
        } else {
          prev.lastVisibleAt = currentTime;
          prev.visible = true;
        }
      } else {
        if (prev && prev.visible) {
          prev.lastHiddenAt = currentTime;
          prev.visible = false;
        }
      }
    }

    return winningIds;
  }
}

// Global default arbiter instance
export const defaultSpatialHashArbiter = new SpatialHashArbiter(28);

/**
 * Convenience helper to arbitrate candidate items against screen viewport.
 */
export function arbitrateVisibleLabels(
  items: DeclutterItem[],
  arbiter: SpatialHashArbiter = defaultSpatialHashArbiter,
  timestamp?: number
): Set<string> {
  return arbiter.arbitrate(items, timestamp);
}

/**
 * Generates Mapbox GL expression for zoom-based Level of Detail (LOD).
 */
export function getMapboxZoomLODExpression(layerType: 'fleet-icon' | 'hub-node' | 'regency-node'): any {
  switch (layerType) {
    case 'fleet-icon':
      return [
        'interpolate',
        ['linear'],
        ['zoom'],
        4.0, 0.35,
        7.5, 0.50,
        10.0, 0.85,
        14.0, 1.05,
      ];
    case 'hub-node':
      return [
        'interpolate',
        ['linear'],
        ['zoom'],
        5.0, 4.0,
        8.0, 6.5,
        12.0, 9.0,
      ];
    case 'regency-node':
      return [
        'interpolate',
        ['linear'],
        ['zoom'],
        7.5, 3.0,
        9.5, 4.5,
        12.0, 6.0,
      ];
  }
}
