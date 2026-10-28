/**
 * Phase 176.5 — base-map paint for the dark command surface.
 *
 * The stock dark-v11 style paints land at hsl(0,0%,16%) and water at
 * hsl(0,0%,12%): a 4-point separation that disappears under the near-black
 * chrome, so Sumatra's silhouette reads as one flat slab. These literals keep
 * the palette (no new hues) but widen land/water separation and draw the
 * coastline/admin stroke as a single 6% white line.
 *
 * Layer ids are the ones dark-v11 actually ships (verified against the style
 * JSON): `land` is the background layer, `water`/`waterway` carry the sea,
 * and `admin-0-boundary`(+`-bg`) carry coastline and country borders.
 */
export const MAP_BASE_PAINT = {
  /** Background / landmass. */
  land: '#0d1219',
  /** Sea surface. */
  water: '#070a10',
  /** Inland water lines so rivers do not read brighter than the sea. */
  waterway: '#070a10',
  /** Coastline + admin boundary stroke. */
  coastline: 'rgba(255,255,255,0.06)',
} as const;

export const MAP_BASE_LAYER_IDS = {
  land: 'land',
  water: 'water',
  waterway: 'waterway',
  coastline: 'admin-0-boundary',
  coastlineBg: 'admin-0-boundary-bg',
} as const;
