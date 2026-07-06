# Phase 0 Learnings — Foundation & Repo Setup

This document lists all environment constraints and structural decisions made during Phase 0 to guide future development steps.

---

## 1. Environment & Constraints

*   **Docker:** Not installed. Do not attempt to run `docker-compose` or spin up local service containers.
    *   *Mitigation:* Use direct local native services (WSL2 Redis, Memurai, or local Windows Redis service) and cloud-hosted Supabase Cloud.
*   **Monorepo layout:**
    - `backend/` — FastAPI backend with a python venv `.venv`.
    - `frontend/` — Next.js 14 frontend.
    - `agents/` — LangGraph agent package.
    - `infra/` — DB migrations and documentation.
    - `src/` — Pre-existing research and lag analysis scripts. **Do not modify or move these scripts** as they validate the economic lag correlation theories.

---

## 2. Issues Found & Resolved

### 2.1 GitAttributes and line endings
*   **Issue:** Git staging warned about CRLF replacing LF for code files during `git add`.
*   **Fix:** Added a `.gitattributes` file in the root directory to enforce `text=auto` and force LF line endings (`eol=lf`) for code files (`*.py`, `*.ts`, `*.tsx`, `*.js`, `*.json`, `*.md`, `*.sql`, `*.css`).
*   **Learning:** Always configure `.gitattributes` early in a monorepo setup to avoid cross-platform encoding clashes during team collaboration or deployment.

### 2.2 Shell syntax
*   **Issue:** PowerShell lacks Unix commands like `head`.
*   **Fix:** Avoid piping to `head` in scripts or terminal commands. Use PowerShell commands like `Select-Object -First 30` or handle logs via standard file inspection.
*   **Learning:** Maintain OS-awareness when executing terminal checks in pair-programming sessions.
