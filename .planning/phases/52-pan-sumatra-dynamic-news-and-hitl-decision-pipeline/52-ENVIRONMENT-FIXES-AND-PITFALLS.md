# Phase 52: Environment Fixes, Pitfalls, Inconsistencies & Learnings Audited

This document captures the real engineering discoveries, environmental traps, field mismatches, and solutions encountered during Phase 52, ensuring future context windows and developer agents do not repeat the same errors.

---

## 1. Environmental Traps & Supabase Configuration

### A. The "Service Role Key" Anon Token Impersonation
- **Context & Symptom**: During initial writes from `unified_news_ingestor.py` to `public.news_articles`, `public.incidents`, and `public.route_approvals`, Supabase REST returned `401 Unauthorized` / `42501 permission denied for table`.
- **Root Cause**: The `.env` file had `SUPABASE_SERVICE_ROLE_KEY` populated with the project's standard `anon` public JWT key, rather than a true service role key with admin bypass capabilities. As a result, PostgreSQL Row Level Security (RLS) treated all backend operations as unauthenticated or anonymous client requests.
- **Fix & Rule**: Explicit RLS policies were established in `008_news_articles_and_realtime.sql`:
  ```sql
  CREATE POLICY "Allow public read on news_articles" 
    ON public.news_articles FOR SELECT 
    TO anon, authenticated 
    USING (true);

  CREATE POLICY "Allow public insert on news_articles" 
    ON public.news_articles FOR INSERT 
    TO anon, authenticated 
    WITH CHECK (true);
  ```
  *Lesson*: Never assume backend code automatically bypasses RLS in cloud environments unless the key's payload `role` is verified as `service_role`.

### B. PostGIS REST Ingestion Format
- **Context & Symptom**: Passing GeoJSON geometries or coordinate tuples to Supabase PostgREST `GEOGRAPHY(Point, 4326)` columns failed with format parsing errors.
- **Fix & Rule**: PostgREST accepts Well-Known Text (WKT) with the SRID prefix:
  ```python
  postgis_point = f"SRID=4326;POINT({lon} {lat})"
  ```
  Always format PostGIS points as `SRID=4326;POINT(longitude latitude)` (note longitude comes first in GIS coordinate axes).

---

## 2. Plotholes & Variable Name Mismatches

### A. Impact Assessment Field Name Discrepancies
- **Discrepancy 1**: `ImpactedVehicleAssessment` uses `spoilage_loss_idr` and `late_arrival_risk_pct`.
  - *Trap*: Do NOT call it `cargo_spoilage_risk` or `spoilage_cost`.
- **Discrepancy 2**: `DisruptionImpactRequest` accepts `hazard_type`.
  - *Trap*: Do NOT name it `incident_type` or pass `affected_corridors` (it takes `title`, `lat`, `lon`, `radius_km`, and `hazard_type`).
- **Discrepancy 3**: `ImpactAssessmentService.assess_disruption_impact()` returns `DisruptionImpactResponse` with `impacted_vehicles`, NOT `impacted_assessments`.

### B. HITL Action Request Schema & Operator Aliases
- **Discrepancy**: Frontend `HitlDecisionDrawer.tsx` dispatched:
  ```json
  {
    "approval_id": "...",
    "decision": "APPROVE",
    "approved_by": "Dispatcher Command (HITL)",
    "notes": "..."
  }
  ```
  while `news_router.py` initially strictly required:
  ```json
  {
    "approval_id": "...",
    "action": "ACCEPT",
    "operator_id": "..."
  }
  ```
- **Fix & Rule**: Aliased both in `HitlActionRequest` (`action` and `decision`, `operator_id` and `approved_by`), and normalized `APPROVE` $\to$ `ACCEPT` before persisting to `public.route_approvals`.

### C. HITL Pending Endpoint Key Alignment
- **Discrepancy**: `news_router.py` returned `{ "count": n, "pending_approvals": [...] }`, while the frontend hook and drawer expected `{ "count": n, "items": [...] }` with enriched `impact_assessment` and `news_citation` objects.
- **Fix & Rule**: Enhanced `GET /api/v1/news/hitl-pending` to return both `items` and `pending_approvals`, formatting child vehicle records into standard economic cost matrices so the drawer can calculate net detour savings immediately.

---

## 3. Remote Synchronization & Merge Boundaries

### A. LKBN ANTARA CMS Root Domain Redirects
- **Discovery (from Colleague's Audit)**: Random synthetic article IDs in mock datasets (e.g. `495201`) trigger HTTP 301/302 redirects to Antara's root homepage (`https://sumut.antaranews.com/`).
- **Resolution**:
  - Live scraper parses authentic URLs directly from RSS XML `<link>`.
  - Any demo fixture links fallback to indexed Google News search queries (`https://news.google.com/search?q=...`) rather than static dead URLs.
  - Frontend mappers use a sanitization guard (`cleanLink`) preventing empty or dead IDs from navigating to root domains.

### B. TopNavTelemetry Viewport Clearance (100% Zoom Rule)
- **Constraint**: On standard laptop displays (1280x800, 100% zoom), wide telemetry HUDs collide with right-hand map controls (`Layer Peta`, `Legenda`).
- **Resolution**:
  - Kept padding compact (`px-2.5 py-1.5`) and streamlined label texts.
  - Wrapped HUD with `w-fit overflow-visible` and `left-[368px]`, preserving $\ge 96.4\text{px}$ clearance between telemetry end ($X = 923.7\text{px}$) and map controls ($X = 1020.2\text{px}$).

---

## 4. Anti-Patterns Eradicated
- ❌ Hardcoded mock fallback articles (`NEWS-001` through `NEWS-004`) removed from `news_aggregator.py`, `news_router.py`, and `useNewsVerification.ts`.
- ❌ Hardcoded Tebing Tinggi coordinates (`3.568, 98.956`) removed from alerts.
- ❌ Synthetic random prices (`random.seed()`) removed from `commodity_router.py`.
- ❌ Synthetic social tweets (`MOCK_SOCIAL_POSTS`) removed from `social_scraper.py`.
- ❌ Generic AI purple/pink gradients banned; strict glassmorphism (`#0c1017`, `border-white/10`) applied.
- ❌ Raw emojis banned; Lucide SVG icons used everywhere.
- ✅ `cursor-pointer` added to all interactive elements.
