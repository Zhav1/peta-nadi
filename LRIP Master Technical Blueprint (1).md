# **LOGISTICS RESILIENCE INTELLIGENCE PLATFORM (LRIP / PetaNadi)**

**Master Technical & Operational Blueprint (v3.0)**

## **1\. System Philosophy & Value Proposition**

LRIP is not a standard logistics dashboard or a GPS tracker. It is an AI-powered decision support platform designed to reduce uncertainty in logistics and disaster response.

Logistics disruptions are rarely isolated events. A flooded bridge creates a domino effect: traffic congestion, delayed vessels, fuel waste, and eventual commodity inflation. Current systems force operators to monitor fragmented data streams (weather, traffic, social media, GPS) manually, ensuring decisions are reactive.

LRIP shifts operations from reactive response to proactive intervention by continuously ingesting, validating, predicting, and explaining disruptions before they escalate into operational crises.

## **2\. Dual-Mode Operational Framework & Personas**

The system operates on a hierarchical intelligence model. The strategic layer decides *what* should happen, while the operational layer decides *how* it happens.

### **Persona 1: Operations Coordinator (Execution Layer)**

* **Users:** Fleet Managers, NGO Coordinators, Port Operations Teams.  
* **Goal:** Route optimization, delay reduction, and safe asset deployment.  
* **Interaction:** Focuses on real-time alerts, alternative routing, and immediate tactical execution.

### **Persona 2: Strategic Decision Maker (Planning Layer)**

* **Users:** BPBD/BNPB Leadership, Ministry Executives, Supply Chain Directors.  
* **Goal:** Infrastructure resilience, resource allocation, and inflation mitigation.  
* **Interaction:** Focuses on macro-level stability, supply chain vulnerability, and interactive crisis modeling.

### **The Dual-Mode Engine**

* **Mode 1: Passive Monitoring (Default):** The system continuously acts as a 24/7 digital monitoring team. It pulls weather, traffic, OSINT, and market data, evaluating conditions and flagging anomalies.  
* **Mode 2: Crisis Simulation (User-Triggered):** Decision-makers inject synthetic triggers (e.g., "What if Port Belawan closes for 48 hours?"). The engine simulates logistics capacity constraints, supply shortages, and economic impacts to formulate proactive interventions.

## **3\. Core System Architecture**

To handle high-throughput telemetry without dropping data during crises, the platform utilizes a decoupled, event-driven microservices architecture.

### **3.1 Data Ingestion & Event Bus**

* **API Gateway:** FastAPI serves as the high-throughput endpoint for webhooks and polling.  
* **Message Broker:** Redis Streams (upgradable to Apache Kafka for enterprise scale) queues incoming telemetry, ensuring zero data loss during high-volume events like earthquakes or severe storms.

### **3.2 Database & Memory Layer**

* **Relational & Spatial (Supabase / PostgreSQL):** Uses PostGIS for critical spatial calculations. LLMs cannot reliably calculate geographic intersections. PostGIS determines exactly which road network segments intersect with a BMKG severe weather polygon.  
* **Time-Series (TimescaleDB):** Tracks high-frequency data such as commodity pricing fluctuations and traffic velocity over time.  
* **Offline Edge Resilience (Local-First):** In disaster zones, cellular networks fail. The platform utilizes a local-first architecture (e.g., WatermelonDB on driver mobile devices) that syncs via Conflict-free Replicated Data Types (CRDTs) once connectivity is restored.

## **4\. The 6-Agent Cognitive Swarm (LangGraph Orchestration)**

The intelligence layer uses LangGraph to orchestrate a multi-agent system. This maintains state between agents, allowing them to collaborate, debate, and pass data sequentially. The system uses a dual-model approach: Gemini 3.1 Flash as a cost-effective vision processor (analyzing CCTV feeds) and DeepSeek V3.2 as the primary reasoning engine.

### **Agent 1: Data Collection Agent**

* **Role:** API ingestion, data normalization, and quality validation.  
* **Sources:** BMKG (weather), AISstream (vessels), Google Maps/TomTom (traffic), NASA FIRMS (wildfires).

### **Agent 2: OSINT & Hazard Agent**

* **Role:** Extracts hazard signals from unstructured data.  
* **Sources:** Social media, news portals, headless scraping via Lightpanda.  
* **Technology:** Uses Named Entity Recognition (NER) to extract precise locations from public text, which are then geocoded and passed to PostGIS for mapping.

### **Agent 3: Prediction Agent**

* **Role:** Forecasts congestion, weather impacts, and port delays across 6, 12, 24, and 48-hour windows.  
* **Technology:** Implements Temporal Fusion Transformers (TFTs) for multi-horizon forecasting, allowing the model to weigh static data (road type) against dynamic data (current rain volume) to predict bottlenecks.

### **Agent 4: Route Optimization Agent**

* **Role:** Generates alternative routes, cost estimates, and risk scores.  
* **Technology:** Relies on deterministic routing engines like pgRouting (within PostGIS) or Valhalla for offline-capable routing. It uses dynamic cost algorithms where edge weights are modified by the severity of the hazard, not just distance.

### **Agent 5: Economic Intelligence Agent**

* **Role:** Monitors inflation anomalies and forecasts supply shocks.  
* **Sources:** Marketplace scraping and government commodity databases (PIHPS).

### **Agent 6: Decision Support Agent (Copilot)**

* **Role:** Generates recommended actions, explains reasoning, and interfaces directly with the user.  
* **Execution:** Synthesizes the outputs of Agents 1-5 to produce executive summaries and actionable tactical advice.

## **5\. Advanced Knowledge Engine: GraphRAG**

Standard Retrieval-Augmented Generation (RAG) breaks down in logistics because supply chains are not flat documents; they are complex networks. A port closure affects specific suppliers, which affects specific warehouses, which affects specific retail prices.

* **GraphRAG Implementation:** LRIP maps entities (Ports, Routes, Suppliers, Commodities) and relationships (Depends On, Ships Via, Located In) into a Knowledge Graph.  
* **Execution:** When a user asks "What is the impact of Route A closing?", the system traverses the graph to find all connected downstream dependencies, combining this structured traversal with traditional vector search (SOPs, historical disaster playbooks) to generate a deeply contextual answer.

## **6\. End-to-End Workflows (Storyboards)**

### **Storyboard A: Tactical Execution (The Field Coordinator)**

*Scenario: A primary logistics corridor in North Sumatra experiences sudden flooding.*

1. **Detection:** The OSINT Agent detects a surge in community reports of a flooded bridge. The Data Collection Agent flags heavy rainfall from BMKG.  
2. **Validation (Multi-Sensor Consensus):** An alert is not immediately pushed to users to avoid panic over hoaxes. The Prediction Agent queries TomTom data and confirms vehicle velocity at the bridge has dropped to 0 km/h. The disruption is marked "Validated."  
3. **Analysis:** The Route Optimization Agent checks the spatial database and identifies 12 active delivery trucks scheduled to cross that bridge in the next 90 minutes.  
4. **Recommendation:** The Decision Support Agent triggers a "Critical" dashboard alert. The Field Coordinator asks the AI Copilot: *"What is the safest alternative route for the 12 trucks?"*  
5. **Copilot Output:** The AI queries the routing engine and responds: *"Rerouting via the Southern Toll avoids the flood zone. ETA increases by 45 minutes, fuel consumption increases by 12%. Do you want to distribute this route to the drivers?"*  
6. **Decision:** The Coordinator approves. The new route is synced to the drivers' offline-capable mobile apps.

### **Storyboard B: Strategic Planning (The Executive)**

*Scenario: A government executive needs to prepare for a major port congestion event.*

1. **Crisis Simulation:** The Executive inputs a synthetic trigger into the Copilot: *"Run a simulation: What happens if Belawan Port operations are halted for 48 hours due to a severe storm?"*  
2. **Swarm Analysis:** \* The Prediction Agent models the spatial footprint of the storm.  
   * GraphRAG traverses the supply chain network to identify that 60% of the region's cooking oil imports are delayed.  
   * The Economic Intelligence Agent calculates the impact of a 48-hour supply shock on local retail markets.  
3. **Executive Forecast:** The system outputs a comprehensive report indicating a high probability of a 5-8% localized inflation spike in cooking oil within four days.  
4. **Intervention:** Armed with evidence, the Executive authorizes an early release of local warehouse reserves and initiates market operations *before* the public experiences a shortage.

## **7\. Business Model & Success Metrics**

### **B2B/B2G Tiered SaaS**

* **Freemium/Starter (Rp2M-Rp5M/month):** Basic disruption maps, weather alerts, and standard monitoring for small logistics operators.  
* **Professional (Rp15M-Rp30M/month):** Unlocks the AI Copilot, advanced Route Optimization, and Economic Intelligence for corporate fleet managers.  
* **Enterprise/Government (Custom/Rp100M+):** Full API access, private GraphRAG deployment, and full Crisis Simulation modules for Ministries (BNPB/BPBD) and SOEs (Pelindo).

### **Cost Constraints**

By utilizing open APIs, headless scraping, efficient routing algorithms, and tiered LLM routing (Gemini Flash for vision, DeepSeek for reasoning), the monthly cloud and compute overhead is maintained between Rp10M \- Rp40M, ensuring sustainability.

### **Success Metrics**

1. **Operational Speed:** \<15 minute detection time from physical disruption to validated dashboard alert.  
2. **Alert Precision:** \>85% precision rate (strict limitation of false alarms via consensus logic).  
3. **Efficiency:** 70% acceptance rate for AI-optimized routes, reducing delay costs by 10-15%.  
4. **Macro-Economic Impact:** Maintain localized commodity price volatility under 5% during a monitored crisis phase.

## **8\. MVP Implementation Gaps & Scope Decisions**

This section documents gaps identified during the design review phase. Items are classified by their impact on MVP functionality and demo readiness.

### **8.1 Alert Notification Delivery (Must-Have for MVP)**

The current architecture surfaces validated alerts on the dashboard, but does not specify how alerts reach operators who are not actively monitoring the screen — which is most of the time.

* **MVP Solution:** Integrate a push notification channel (WhatsApp Business API, email, or SMS via Twilio/local provider) that triggers automatically when an alert reaches "Validated" status. The dashboard remains the primary interface; notifications serve as the wake-up signal.
* **Trigger Logic:** Only "Validated" alerts (multi-source consensus confirmed) generate notifications to prevent alert fatigue. "Unconfirmed" anomalies stay dashboard-only.
* **Why This Matters:** Without this, the early-warning value proposition only works if operators happen to be looking at the screen. Notification delivery is what turns a monitoring tool into an early-warning system.

### **8.2 GraphRAG Cold Start & Knowledge Graph Seeding (Must-Have for MVP)**

The knowledge graph (mapping Ports → Routes → Warehouses → Suppliers → Commodities) requires pre-populated data before it can traverse any relationships. On Day 1, the graph is empty.

* **MVP Strategy:** Manually curate a seed graph for the Sumatera pilot corridor. This includes key ports (Belawan, Dumai), major road corridors (Trans-Sumatera Highway), primary warehouses, and core commodity flows (cooking oil, rice, fuel).
* **Data Sources for Seeding:** Combine publicly available BMKG zone maps, BPS logistics data, and operator-provided route information gathered during the onboarding phase.
* **Ongoing Enrichment:** The OSINT Agent and Data Collection Agent progressively add new entities and relationships as operations run. The seed graph provides the starting traversal structure; it does not need to be complete.
* **Note:** For demo purposes, the seed graph can be pre-populated with a synthetic-but-realistic Sumatera dataset. Real-world enrichment is a post-pilot activity.

### **8.3 API Fallback & Data Freshness Indicators (Important, Not MVP-Blocking)**

The platform depends on external APIs (BMKG, TomTom, AISstream, NASA FIRMS). Any of these can go down, rate-limit, or return stale data without warning.

* **Fallback Logic:** Each data source adapter should implement a last-known-good cache with a configurable TTL (e.g., 15 minutes for traffic, 1 hour for weather). If a source fails, the system continues using cached data and flags the source as degraded.
* **UI Indicator:** Every data layer on the dashboard displays a "Last Updated: X minutes ago" badge and a source health indicator (green/yellow/red). This is critical for operator trust — stale data presented without a warning permanently damages credibility during a pilot.
* **Priority:** Implement for BMKG and TomTom at minimum before the BPBD pilot. AISstream and NASA FIRMS can have basic fallback in a later sprint.

### **8.4 Human-in-the-Loop Confirmation Tracking (Nice-to-Have, Needed for KPI Measurement)**

Storyboard A describes the coordinator approving a reroute. Currently, there is no mechanism to record whether the approved recommendation was actually executed or whether it succeeded.

* **Minimum Implementation:** When an operator clicks "Approve" on a route recommendation, log the decision with a timestamp, the recommended route, and the operator ID. Follow up with a lightweight outcome check (e.g., "Did this resolve the disruption? Yes / Partially / No") surfaced 2 hours after the approval.
* **Why It Matters:** The 70% route acceptance rate success metric is unmeasurable without this. It is also required for the AI Copilot to improve recommendations over time.
* **MVP Scope:** Approval logging is in-scope. Outcome follow-up can be deferred to v1.1.

### **8.5 Fleet GPS Onboarding Flow (Operational Gap, Pre-Pilot Priority)**

The blueprint assumes fleet GPS data flows in from logistics operator partners, but does not describe how a new operator connects their fleet to the platform.

* **Required Before Pilot:** A simple onboarding flow — either a webhook configuration guide or a lightweight SDK — that operators use to push GPS pings to the LRIP API Gateway. FastAPI already handles ingestion; what is missing is the documented setup process and a test endpoint operators can validate against.
* **For MVP:** This does not need to be self-serve. A manual setup call with the operator's tech team is sufficient for the Sumatera pilot. Self-serve onboarding is a v2 feature.

### **8.6 Explainability UI for GraphRAG Output (Nice-to-Have for Demo Impact)**

The GraphRAG system produces causal chain explanations (e.g., "Port Belawan closure → 60% cooking oil supply delayed → 4 affected warehouses → estimated 5-8% price impact in 4 days"). The submission does not specify how this is rendered in the UI.

* **Recommended Implementation:** A collapsible "Why this alert?" panel in the dashboard that renders the causal chain as a step-by-step visual path — node → relationship → node — alongside the supporting evidence (which sources confirmed each step). This directly demonstrates the GraphRAG differentiator to evaluators and pilot users.
* **Fallback:** If a full graph visualization is out of scope, a structured bullet list of the causal chain (auto-generated by the Decision Support Agent) is acceptable for MVP.

### **8.7 Driver Mobile App — Explicitly Deferred to v2**

The blueprint references offline-capable mobile apps on driver devices (WatermelonDB + CRDT sync). This is the correct long-term architecture but is **explicitly out of scope for MVP**.

* **MVP Replacement:** Route recommendations approved by the Operations Coordinator are delivered to drivers via WhatsApp Business API message containing the new route link (Google Maps deep link or Waze). This achieves the same workflow outcome without requiring a custom native app.
* **Rationale:** A custom driver app with offline sync is a significant engineering investment that does not directly improve the demo or pilot validation. The core value being validated is the detection-to-recommendation pipeline, not the last-mile delivery mechanism.
* **v2 Trigger:** Build the native driver app when pilot data confirms that operators are approving recommendations at scale and the WhatsApp delivery method becomes a bottleneck.