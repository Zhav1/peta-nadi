# Phase 49: Learnings & Operational Insights

## 1. Architectural Learnings

### 1.1. Single-Corridor Anchoring in Early Prototyping
- **Observation:** In early hackathon/M1 iterations, focusing on a single corridor (Belawan–Medan–Tebing Tinggi) allowed rapid prototyping. However, as the scope expanded to Pan-Sumatra, hardcoded values and heuristics accumulated in:
  - Bounding box adapter filters.
  - Waypoint defaults and choke-point calculations.
  - LLM prompts and fallback UI strings.
- **Principle:** When building a domain-specific geographic platform, never bake geographic assumptions (e.g. `lon <= 98.75` for "East") into low-level geometry math. Use vector algebra (e.g., normal/perpendicular vectors from origin-destination segments) rather than coordinate thresholds.

### 1.2. Graph Node Coordinate Coupling
- **Observation:** In `agents/nodes/route_optimization.py`, the network graph loaded edge weights and names, but discarded node coordinates. When evaluating intermodal choke-point delays, the algorithm had to generate dummy waypoints near Belawan.
- **Solution:** By caching `node_coords` when reading `road_network_sumatra.json`, traversed graph nodes can be mapped to real geographic coordinates. This ensures that route calculation and downstream spatial calculations (choke-point delays, distance, hazard intersection) are aligned.

### 1.3. Multi-Port Maritime Telemetry
- **Observation:** AIS vessel telemetry APIs allow subscribing to multiple bounding boxes simultaneously. Tracking a single port creates a blind spot for island-wide supply chain analysis.
- **Solution:** Partitioning vessel registries into per-port buckets enables localized congestion thresholds while maintaining a single streaming connection to `aisstream.io`.

---

## 2. Invariant Checklist for Future Phases
- [ ] Always run tests using the backend virtual environment: `backend\.venv\Scripts\python -m pytest backend/tests`.
- [ ] Always verify frontend build using `npm run build` after removing or refactoring shared libraries.
- [ ] Ensure all LLM prompts in `agents/nodes/` use dynamic `{region}` interpolation.
- [ ] Ensure any newly added ports or highway nodes are present in both `data/road_network_sumatra.json` and `frontend/lib/aiDynamicRouter.ts`.
