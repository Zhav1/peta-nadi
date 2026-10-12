Product Requirements Document (PRD) & Architecture BlueprintProject: PetaNadi (Pulse Map)1. System Philosophy & Core MechanicsPetaNadi operates in two distinct modes.Live Event Mode: An event-driven decision-support tool that tracks localized physical disruptions and builds an Evidentiary Consensus of current crises.Enterprise Sandbox Mode: A predictive Simulation Agent that allows B2B and B2G clients to inject hypothetical massive shocks into a digital twin of the supply chain to stress-test their logistics networks and forecast economic fallout.2. System Architecture (Event-Driven Pipeline)The system uses a Publish/Subscribe (Pub/Sub) event bus (Redis Streams).flowchart TD
    %% Styling
    classDef external fill:#f3f4f6,stroke:#9ca3af,stroke-width:1px,color:#374151
    classDef storage fill:#dbeafe,stroke:#3b82f6,stroke-width:2px,color:#1e3a8a
    classDef compute fill:#fef3c7,stroke:#f59e0b,stroke-width:2px,color:#92400e
    classDef frontend fill:#dcfce3,stroke:#22c55e,stroke-width:2px,color:#166534
    classDef sim fill:#fbcfe8,stroke:#be185d,stroke-width:2px,color:#831843

    subgraph Data Ingestion
        A1[Traffic Scraper]:::external
        A2[Weather Scraper]:::external
        A3[Hackathon Demo Script]:::external
    end

    subgraph Event Broker
        Bus[(Redis Pub/Sub Stream)]:::storage
    end

    subgraph Intelligence Layer
        Graph{LangGraph Orchestrator}:::compute
        Mitigation[Mitigation & Solution Agent]:::compute
        SimAgent[Simulation Sandbox Agent<br>w/ RAG]:::sim
        Cache[(Redis Cache: CAG Payload)]:::storage
    end

    subgraph Client
        UI[CesiumJS 3D Map]:::frontend
        User[(Enterprise User)]:::sim
    end

    %% Live Flow
    A1 & A2 & A3 -->|Live Trigger| Bus
    Bus -->|Wakes up| Graph
    Graph -->|Consensus Reached| Mitigation
    Mitigation -->|Store Route| Cache
    
    %% Sandbox Flow
    User -->|Injects Hypothetical Disaster| SimAgent
    SimAgent -->|Calculates Alternate Reality| Cache
    
    UI -->|Fetch Data| Cache
3. The Hackathon Survival MechanismYou cannot wait for a live disaster during a demo. We keep a dedicated Python script (run_demo.py) that bypasses live APIs and injects a heavily engineered JSON payload into the Redis Stream, forcing the Live Event Mode to react to a controlled scenario for the judges.4. Data Sources & Ingestion StrategyA. The "Dumb" Structured Data (No AI Needed)Cleaned and stored directly in PostGIS/TimescaleDB.Maritime (AIS): aisstream.io (WebSockets).Aviation: OpenSky Network (REST API).Weather/Hazards: NASA FIRMS (live fire) and BMKG (flood polygons).Economic Baseline: PIHPS (Government pricing). Scraped daily at 06:00 WIB.B. The "Smart" Unstructured Data (AI Required)Traffic Telemetry: Google Distance Matrix and Waze CCP.Social OSINT: TikTok and X. NLP Agent scans for hyper-local keywords.Visual Ground Truth: Dishub ATCS CCTVs.Historical Policy (For RAG): Vectorized PDFs of BNPB disaster logs and past news articles (GDELT) stored in Milvus or pgvector.5. The LangGraph Swarm (Live Mode)LangGraph acts as a state machine for live events.flowchart TD
    %% Styling
    classDef trigger fill:#ef4444,stroke:#7f1d1d,stroke-width:2px,color:#fff
    classDef agent fill:#6366f1,stroke:#312e81,stroke-width:2px,color:#fff
    classDef logic fill:#10b981,stroke:#064e3b,stroke-width:2px,color:#fff
    classDef endpoint fill:#6b7280,stroke:#374151,stroke-width:2px,color:#fff

    Start([Event Trigger Received]):::trigger
    
    subgraph Phase 1: Evidentiary Consensus
        Ag1[Geospatial Agent]:::agent
        Ag2[Visual Agent]:::agent
        Ag3[Social Agent]:::agent
    end

    NodeConsensus{Score >= 70%?}:::logic
    EndReject([Discard as Noise]):::endpoint
    
    subgraph Phase 2: Mitigation & Solution
        Ag4[Constraint Agent<br>Checks Road Class]:::agent
        Ag5[Routing Agent<br>Runs NetworkX Math]:::agent
        Ag6[Economic Agent<br>Calculates Price Hike]:::agent
    end

    EndPublish([Generate JSON Payload & Cache]):::endpoint

    Start --> Ag1 & Ag2 & Ag3
    Ag1 & Ag2 & Ag3 --> NodeConsensus
    
    NodeConsensus -->|No| EndReject
    NodeConsensus -->|Yes| Ag4
    
    Ag4 -->|Passes Valid Roads| Ag5
    Ag5 -->|Passes New Route Time| Ag6
    Ag6 --> EndPublish
6. Deep Dive: The Enterprise Simulation SandboxThis is the premium B2B monetization engine. It operates completely parallel to the live data stream. It allows users to run "What-If" scenarios (e.g., "What if the Pantura Toll Bridge collapses during Eid Al-Fitr?").It combines deterministic spatial math with RAG-powered historical memory.1. The RAG Policy Agent (Historical Memory)When the user defines the synthetic disaster, this agent kicks in first.Action: It queries a vector database (pgvector) loaded with 10 years of BNPB disaster reports, government SOPs, and news articles regarding the Pantura route.Output: It retrieves context. Example: "In a similar 2021 closure, diverting heavy trucks to Provincial Route 3 caused a secondary bottleneck at the local traditional market, taking 48 hours to clear. Police escort is legally mandated for 40-ton vehicles on this detour."2. The Sandbox Routing Agent (The Math Engine)Action: It takes the synthetic roadblock and queries the PostGIS database. Using NetworkX, it runs a Dijkstra pathfinding algorithm to find the absolute shortest path around the hypothetical block, specifically avoiding the bottlenecks flagged by the RAG agent.Output: A GeoJSON LineString of the projected detour and the calculated travel time.3. The Predictive Economic AgentAction: It takes the projected delay and queries the PIHPS baseline data. Using elasticity formulas, it projects the financial damage if the enterprise client does not pre-position their inventory before the hypothetical crisis hits.7. Frontend Performance & CAG (Cache-Augmented Generation)The CAG Implementation: When either the Live Mode or the Sandbox Mode finishes calculating, the graph compiles the evidence, the detour GeoJSON, and the price forecast into a single JSON payload (<50KB). This is cached in Redis.UI Delivery: We do not send raw video or massive datasets to the frontend. We send iframe URLs and compressed AI-segmented JPEGs to ensure the map renders smoothly on low-end hardware.8. User Interface (UI) BlueprintThe Map Canvas (CesiumJS)We use CesiumJS for the 3D globe. Includes a "2D Low-Bandwidth Mode" toggle that reverts to a flat Leaflet map.UI Layout & OverlaysLeft Sidebar (The Global Filter): Toggle layers (Weather, Traffic, AIS) and the Timeline Scrubber.Top Navigation: A toggle to switch between "Live Pulse" and "Simulation Sandbox".Right Sidebar (The Drill-Down): Slides out when a crisis pin or synthetic scenario is clicked.Tab 1: The Evidence: (Live mode only) CCTV JPEGs and OSINT proving the crisis.Tab 2: Mitigation Map: Displays the blocked route in red and the AI-calculated detour in green.Tab 3: Economic Impact & Policy: Displays the financial forecast and the historical warnings retrieved by the RAG Policy Agent.