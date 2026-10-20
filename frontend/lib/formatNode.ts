/**
 * Human-readable node label formatting for map endpoints (origin/destination).
 *
 * Map clicks can produce opaque IDs (`regency-159-indragiri-hilir`, `node-medan-amplas`,
 * `pin-98.6722-3.5952`). Every user-facing surface must render a place name instead of
 * those IDs, so all resolvers here return display-name metadata and a slug pretty-printer
 * as the last-resort fallback.
 */
import type { GeocodeNode } from './types';
import { HUB_NODES, PAN_SUMATRA_GAZETTEER, normalizeRegencyId } from './mapboxRoutingService';

export interface NodeDisplayInfo {
  name?: string | null;
  display_name?: string | null;
  kabupaten?: string | null;
  province?: string | null;
  type?: string | null;
}

export type ResolvedNodeInfo = NodeDisplayInfo & { coords?: [number, number] };

export type CustomNodeMap = Record<string, { coords?: [number, number]; name: string } | undefined>;

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

/**
 * Turns an opaque map ID into a readable label:
 * `regency-159-indragiri-hilir` -> `Indragiri Hilir`, `node-medan-amplas` -> `Medan Amplas`.
 */
export function prettyNodeSlug(nodeId: string): string {
  if (!nodeId) return '';

  const pinMatch = nodeId.match(/^pin-(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/i);
  if (pinMatch) return `Titik ${pinMatch[1]}, ${pinMatch[2]}`;

  let slug = normalizeRegencyId(nodeId)
    .replace(/^node-/i, '')
    .replace(/^regency-/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!slug) return nodeId;

  // Keep short acronyms (OKI, KNO, PLM...) uppercase; title-case everything else.
  slug = slug
    .split(' ')
    .map((word) => {
      if (word.length <= 3 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  return slug;
}

/**
 * Canonical endpoint label: `${display_name || name}${kabupaten ? `, ${kabupaten}` : ''}${province ? `, ${province}` : ''}`.
 * Kabupaten/province are skipped when the display_name already carries them, so
 * `Tembilahan (Kab. Indragiri Hilir)` does not become `..., Indragiri Hilir, Indragiri Hilir, Riau`.
 */
export function formatNodeDisplay(info?: NodeDisplayInfo | null): string {
  if (!info) return '';

  const primary = (info.display_name || info.name || '').trim();
  if (!primary) return '';

  const parts = [primary];
  const primaryLower = primary.toLowerCase();

  const kabupaten = (info.kabupaten || '').trim();
  if (kabupaten && !primaryLower.includes(kabupaten.toLowerCase())) {
    parts.push(kabupaten);
  }

  const province = (info.province || '').trim();
  if (province && !primaryLower.includes(province.toLowerCase())) {
    parts.push(province);
  }

  return parts.join(', ');
}

/**
 * Resolves a map node ID against hubs, the local Pan-Sumatra gazetteer and user-pinned
 * custom nodes (in that order). Never returns a raw `regency-...` ID for the name.
 */
export function resolveNodeDisplayInfo(
  nodeId?: string | null,
  customNodes?: CustomNodeMap | null
): ResolvedNodeInfo | null {
  if (!nodeId) return null;

  const hub = HUB_NODES[nodeId];
  if (hub) {
    return {
      name: hub.name,
      display_name: hub.name,
      province: hub.province ?? null,
      type: hub.type,
      coords: hub.coords,
    };
  }

  const normalizedId = normalizeRegencyId(nodeId).toLowerCase();
  const match = PAN_SUMATRA_GAZETTEER.find(
    (g: GeocodeNode) =>
      g.name.toLowerCase() === normalizedId ||
      (g.display_name || '').toLowerCase() === normalizedId ||
      `node-${slugify(g.name)}` === normalizedId ||
      `regency-${slugify(g.name)}` === normalizedId
  );
  if (match) {
    return {
      name: match.name,
      display_name: match.display_name || match.name,
      kabupaten: match.kabupaten ?? null,
      province: match.province ?? null,
      type: match.type,
      coords: [match.lon, match.lat],
    };
  }

  const custom = customNodes?.[nodeId];
  if (custom) {
    return { name: custom.name, display_name: custom.name, coords: custom.coords };
  }

  const pretty = prettyNodeSlug(nodeId);
  return { name: pretty, display_name: pretty };
}

/**
 * Convenience wrapper for render sites that only need the final string.
 * `info` wins when the caller already resolved the node (e.g. DashboardClient's customNodesRef).
 */
export function formatNodeId(
  nodeId?: string | null,
  info?: NodeDisplayInfo | null,
  customNodes?: CustomNodeMap | null
): string {
  if (!nodeId) return '';
  const resolved = info ?? resolveNodeDisplayInfo(nodeId, customNodes);
  return formatNodeDisplay(resolved) || prettyNodeSlug(nodeId) || nodeId;
}
