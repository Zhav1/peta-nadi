# Phase 52: Strategic Learnings & Knowledge Extraction

## 1. Context & Architectural Insights

### A. Dynamic Geospatial Intelligence vs. Hardcoded Demos
Early iterations of the project relied on hardcoded news fixtures (`NEWS-001` to `NEWS-004`) localized to North Sumatra, which gave the illusion of function but broke down when testing cross-provincial scenarios (e.g. West Sumatra Sitinjau Lauik landslides or Lampung Bakauheni port congestion).
*Key Learning*: A logistics crisis platform must operate on authentic geographic entities. By building a dedicated Pan-Sumatra Gazetteer and multi-tier geocoding resolver (Gazetteer $\to$ Redis $\to$ Sumatra-bounded Nominatim), any disaster event anywhere across Sumatra's 10 provinces immediately resolves to actionable PostGIS coordinates.

### B. Two-Way Supabase Realtime Architecture
Relying solely on frontend polling causes telemetry delay and wasted compute. Enabling Supabase Realtime publication on `news_articles`, `incidents`, and `route_approvals` allows the backend ingestor to write once, while the Next.js UI updates reactively via WebSockets.

### C. Human-in-the-Loop (Globot Pattern)
In mission-critical logistics, automated routing should not blindly reroute multimillion-rupiah reefer trucks without operator visibility. The Globot HITL pattern provides:
1. **Verified Evidence Citation**: Linking the exact news article, outlet badge, and confidence score.
2. **Economic Trade-off Transparency**: Explicit comparison between potential cargo spoilage loss (IDR) and detour fuel/toll costs (IDR).
3. **Definitive Operator Control**: `[SETUJUI DETOUR]`, `[TAHAN BUFFER]`, or `[TETAP RUTE AWAL]` directly audited in database logs.

---

## 2. Best Practices for Future Context Windows
1. **Always Verify RLS Policies**: When creating new Supabase tables, never rely solely on service key bypass without confirming the token role.
2. **Maintain Strict Snake_Case Consistency**: Align schemas across Python Pydantic, Supabase tables, and TypeScript interfaces early to prevent mapping traps.
3. **Preserve Viewport Spatial Buffers**: Check responsive bounding boxes at standard desktop resolutions (1280x800) to ensure HUD elements never occlude map control buttons.
