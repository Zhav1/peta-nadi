/**
 * PreHub: Offline Pan-Sumatra High-Density Fleet Corridor Snapping Service
 *
 * Singleton service that fetches and caches pre-baked road & channel-snapped polylines
 * from `/data/fleet_corridors_snapped.json` once on client startup.
 *
 * Powers 60 FPS dead-reckoning and vehicle trajectory interpolation without burdening
 * the backend telemetry polling loop with massive coordinate arrays.
 */

export interface SnappedCorridorFeature {
  vehicle_id: string;
  modality: 'truck' | 'maritime' | 'air';
  origin: string;
  destination: string;
  total_distance_km: number;
  vertex_count: number;
  coordinates: [number, number][];
}

export type SnappedCorridorsData = Record<string, SnappedCorridorFeature>;

class CorridorSnappingService {
  private cache: Map<string, [number, number][]> = new Map();
  private metadataCache: Map<string, SnappedCorridorFeature> = new Map();
  private loadPromise: Promise<void> | null = null;
  private isLoaded: boolean = false;

  /**
   * Asynchronously loads snapped corridor coordinates from the static public JSON file.
   * Dedupes multiple concurrent calls so the file is fetched at most once.
   */
  public async loadCorridors(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      if (typeof window === 'undefined') return;

      try {
        const res = await fetch('/data/fleet_corridors_snapped.json');
        if (!res.ok) {
          console.warn(`[CorridorSnappingService] Failed to fetch corridors: HTTP ${res.status}`);
          this.loadPromise = null;
          return;
        }

        const data: SnappedCorridorsData = await res.json();
        for (const [vehicleId, feature] of Object.entries(data)) {
          if (feature && Array.isArray(feature.coordinates)) {
            this.cache.set(vehicleId, feature.coordinates);
            this.metadataCache.set(vehicleId, feature);
          }
        }
        this.isLoaded = true;
      } catch (err) {
        console.warn('[CorridorSnappingService] Error loading snapped corridors:', err);
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Synchronously retrieves high-density snapped road/channel coordinates for a vehicle.
   * Returns null if corridors have not finished loading or if vehicle is not in dataset.
   */
  public getCorridorCoordinates(vehicleId: string): [number, number][] | null {
    if (!vehicleId) return null;
    return this.cache.get(vehicleId) || null;
  }

  /**
   * Caches or updates high-density coordinates for a vehicle (e.g. from on-demand API fetch).
   */
  public setCorridorCoordinates(vehicleId: string, coordinates: [number, number][]): void {
    if (!vehicleId || !Array.isArray(coordinates)) return;
    this.cache.set(vehicleId, coordinates);
  }

  /**
   * Ingests pre-parsed snapped corridors data directly (for testing or SSR hydration).
   */
  public ingestCorridors(data: SnappedCorridorsData): void {
    if (!data || typeof data !== 'object') return;
    for (const [vehicleId, feature] of Object.entries(data)) {
      if (feature && Array.isArray(feature.coordinates)) {
        this.cache.set(vehicleId, feature.coordinates);
        this.metadataCache.set(vehicleId, feature);
      }
    }
    this.isLoaded = true;
  }

  /**
   * Retrieves full corridor metadata including origin, destination, and distance.
   */
  public getCorridorMetadata(vehicleId: string): SnappedCorridorFeature | null {
    if (!vehicleId) return null;
    return this.metadataCache.get(vehicleId) || null;
  }

  /**
   * Returns true if coordinates for the vehicle exist in memory.
   */
  public hasCorridor(vehicleId: string): boolean {
    return this.cache.has(vehicleId);
  }

  /**
   * Number of loaded corridors currently in memory.
   */
  public get loadedCount(): number {
    return this.cache.size;
  }

  /**
   * Returns true if the service has completed loading corridor waypoints.
   */
  public get loaded(): boolean {
    return this.isLoaded;
  }
}

// Global client singleton
export const corridorSnappingService = new CorridorSnappingService();

// Trigger background preload on module evaluation in browser
if (typeof window !== 'undefined') {
  corridorSnappingService.loadCorridors().catch(() => {});
}
