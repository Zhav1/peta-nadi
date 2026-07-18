# Phase 8: NVIDIA Architecture Integration — Context & Decisions

## Overview
This phase integrates foundational NVIDIA APIs (NIM, cuOpt, FourCastNet) into the PetaNadi orchestrator to increase resilience, scale routing capabilities, and offload MLOps technical debt.

## Implementation Decisions (Locked)

### 1. LLM Fallback Strategy
- **Decision:** Centralized Gateway (`llm_gateway.py`).
- **Rationale:** All LangGraph agent nodes must pass their LLM invocations through a single gateway class. The gateway catches `429` and `503` errors from the primary SDKs (DeepSeek/Gemini), automatically overrides the `base_url` to `https://integrate.api.nvidia.com/v1`, and routes to a mapped fallback model (e.g., Llama 3.1).
- **Constraints:** Must preserve the original JSON output schema required by LangGraph.

### 2. cuOpt Routing Data & Fleet
- **Decision:** Live Dynamic Matrix (Option B).
- **Rationale:** We will use `pgRouting` (or OSRM) to calculate the live travel time/distance matrix between the crisis nodes in real-time. This matrix is then packaged into cuOpt's VRP JSON payload format.
- **Constraints:** Because this is a live dynamic matrix, it carries a latency risk for live demos. We are proceeding with this because the `DEMO_OFFLINE=true` fallback developed in Phase 7 already mitigates this risk for the hackathon pitch.

### 3. FourCastNet / Earth-2 Polling
- **Decision:** Continuous Proactive Polling (Option A).
- **Rationale:** Agent 3 (Prediction Agent) will not wait for BMKG triggers. It will run on a CRON schedule (every 6 hours) to poll the FourCastNet API for the North Sumatra bounding box, detecting severe weather anomalies 48 hours in advance.
- **Constraints:** Must handle the 0.25-degree grid resolution appropriately when mapping to local infrastructure.
