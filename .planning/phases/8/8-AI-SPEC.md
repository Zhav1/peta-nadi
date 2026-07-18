# Phase 8: AI Integration Specification

## 1. System Overview
Integration of NVIDIA foundational APIs (NIM, Earth-2, cuOpt) into the existing LangGraph cognitive swarm.

## 2. NIM LLM Fallback (Gateway)
- **Primary Model**: DeepSeek V3 / Gemini Flash.
- **Fallback Model**: NVIDIA NIM (Llama 3.1 70B Instruct).
- **Trigger**: `429 Rate Limit` or `503 Service Unavailable`.
- **Implementation**: Centralized `llm_gateway.py` handling HTTP retries using `tenacity`.
- **Evaluation**: Unit tests simulating `HTTP 429` to ensure failover latency is < 2s.

## 3. FourCastNet (Earth-2)
- **Role**: Predictive macro-weather forecasting for North Sumatra.
- **Input**: Bounding box coordinates for the North Sumatra corridor.
- **Output**: 48-hour severity map.
- **Evaluation**: Compare synthetic baseline data with Earth-2 output structure.

## 4. cuOpt (Route Optimization)
- **Role**: Multi-agent fleet VRP solving.
- **Input**: VRP JSON payload (Cost matrix from pgRouting, fleet size).
- **Output**: Optimized vehicle routes.
