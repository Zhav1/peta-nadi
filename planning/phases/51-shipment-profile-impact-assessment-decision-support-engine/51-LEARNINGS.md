# Phase 51: Key Learnings & Architecture Patterns

## Key Learnings

### 1. Information Aggregation vs. Decision Support
- Aggregating data (news, weather, traffic) is necessary but insufficient for real-world operations. A dispatcher does not have time to synthesize 10 raw reports into an operational action under pressure.
- **The Core Value is the Decision Recommendation**: Knowing *who is affected*, *what is at stake*, *which detour is legal and physically feasible*, and *what the financial cost delta is*.

### 2. Deterministic Logic Must Anchor AI Reasoning
- LLMs excel at unstructured inputs: extracting crisis entities from local news articles, parsing BMKG text forecasts, and drafting driver notifications.
- Deterministic algorithms must govern physical and legal constraints:
  - Vehicle gross weight vs. bridge class limits (MST)
  - Quarantine certificate mandates (BKHIT)
  - Perishable spoilage half-life calculations
  - Multi-stop shortest path / detour routing
- Delegating axle-load feasibility to an LLM produces unpredictable errors; anchoring it in Python NetworkX and mathematical functions guarantees reproducibility and auditor trust.

### 3. Dual-Layer Persistence (Cloud First, SQLite Fallback)
- Critical infrastructure systems cannot fail when cloud connectivity drops.
- Designing a local SQLite WAL fallback that mirrors cloud Supabase tables allows the dashboard to operate seamlessly in field environments, offline simulations, or during temporary cloud provider outages.

### 4. Cloud Platform Free-Tier Lifecycle Realities
- Render and Supabase have different criteria for "inactivity":
  - **Render**: Monitors inbound HTTP requests on the web service port ($15\text{ min}$ threshold).
  - **Supabase**: Monitors PostgreSQL database query volume ($7\text{ days}$ threshold).
- An external ping hitting only an in-memory health endpoint will keep Render awake while allowing Supabase to be paused. The keep-alive strategy must query the database layer directly.
