/**
 * Phase 176.5 — base-map paint for the dark command surface.
 *
 * The stock dark-v11 style paints land at hsl(0,0%,16%) and water at
 * hsl(0,0%,12%): a 4-point separation that disappears under the near-black
 * chrome, so Sumatra's silhouette reads as one flat slab. These literals widen
 * land/water separation and add a subtle slate-blue tint to sea and land (user
 * revision: "map is too dark — add a slight colour"). Still far darker than the
 * command chrome's text, and no competing hue: the tint sits under the hazard
 * paint, never beside it.
 *
 * Layer ids are the ones dark-v11 actually ships (verified against the style
 * JSON): `land` is the background layer, `water`/`waterway` carry the sea,
 * and `admin-0-boundary`(+`-bg`) carry coastline and country borders.
 */
export const MAP_BASE_PAINT = {
  /** Background / landmass. Slate-blue tint (not neutral grey). */
  land: '#121b24',
  /** Sea surface — one step deeper than land, same slate family. */
  water: '#0a121a',
  /** Inland water lines so rivers do not read brighter than the sea. */
  waterway: '#0a121a',
  /** Coastline + admin boundary stroke. */
  coastline: 'rgba(255,255,255,0.08)',
} as const;

export const MAP_BASE_LAYER_IDS = {
  land: 'land',
  water: 'water',
  waterway: 'waterway',
  coastline: 'admin-0-boundary',
  coastlineBg: 'admin-0-boundary-bg',
} as const;
