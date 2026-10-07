# Learnings — Phase 5: Notifications & Human-in-the-Loop

This document outlines key technical insights, fixed bugs, constraints, and environment lessons learned during the execution of Phase 5. Refer to this to avoid repeating similar mistakes in subsequent phases.

---

## 1. Supabase Schema Mismatch (Critical Bug Fix)

*   **Issue:** The REST endpoints for listing and getting incidents in `backend/app/routers/incidents.py` were failing silently, logging `"Supabase unavailable"` and returning empty arrays.
*   **Discovery:** A raw SQL schema query (`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'incidents';`) revealed that the primary key column in the remote database is actually `incident_id` (type `uuid`), whereas the codebase was selecting and filtering using `"id"`.
*   **Resolution:**
    1.  Modified `backend/app/routers/incidents.py` list and retrieve queries to use `incident_id` instead of `id`.
    2.  Mapped the returned database key `incident_id` to both `id` and `crisis_id` in responses, maintaining backward compatibility with the frontend and LangGraph states.
*   **Preventative Rule:** Always check the live database column names via SQL inspection instead of assuming standard ORM naming conventions or initial SQL migrations (`000_init.sql`) match the deployed DB exactly.

---

## 2. Table Selection for Ingestion Health Checks

*   **Context:** The project has both a `data_sources` and a `source_health` table.
*   **Discovery:** Inspecting rows via SQL revealed that the `data_sources` table was completely empty, while the `source_health` table was populated with active status values (`green`, `yellow`, `red`) and timestamps from the Phase 1 ingestion adapters.
*   **Resolution:** Configured the `/api/v1/health/sources` endpoint to query `source_health` and map its status colors to frontend specifications (`healthy`, `degraded`, `down`, `unknown`).
*   **Preventative Rule:** Before implementing analytical endpoints, check which tables actually contain data to avoid querying empty schemas.

---

## 3. WhatsApp Cloud API Constraints & Sandbox Routing

*   **Constraint:** Meta's WhatsApp Business API requires a templates approval process (taking up to 24 hours) for formal template notifications.
*   **Solution:** Plain text messages sent to registered WhatsApp sandbox numbers bypass the approval requirement and are delivered immediately. This is optimal for development and hackathon demonstrations.
*   **Architectural Design:** Agent 6 (`decision_support.py`) does not import the `notification_service` directly to prevent circular dependency and secret leakage. Instead, the agent posts to an internal webhook `/api/notify` on the FastAPI server, which processes and fires the WhatsApp API request.

---

## 4. Frontend ESLint Strictness

*   **Constraint:** Next.js production builds (`next build`) are configured with strict ESLint check parameters. The build will fail with exit code 1 if there are any unused variables or unused catch parameters.
*   **Issue:** An unused error variable in `catch (e)` inside `SourceHealthBanner.tsx` caused the compile run to fail.
*   **Resolution:** Modified it to use parameterless catch `catch { ... }`.
*   **Preventative Rule:** Never leave unused arguments, variables, or import statements in frontend code. Always run `npm run build` locally to verify compile success before declaring a phase complete.

---

## 5. Local pytest Environment Configuration

*   **Context:** When running backend pytest in Windows, python imports will fail with `ModuleNotFoundError: No module named 'app'` or `No module named 'agents'`.
*   **Resolution:** Explicitly set the `PYTHONPATH` prefix to include both the root and backend folders:
    ```powershell
    $env:PYTHONPATH="d:\College\Pidi.id;d:\College\Pidi.id\backend"; .\.venv\Scripts\pytest
    ```
