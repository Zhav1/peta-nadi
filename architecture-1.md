# 🏗️ UMKM Assistant Architecture

This document contains the System, Agent, and User Flow Architectures for the UMKM Assistant, designed with a "System-First" mindset to minimize technical debt and ensure scalability.

## 1. System Architectures (C4 Model)

### A. Context Level Diagram
This illustrates the high-level landscape and interactions.

```mermaid
C4Context
    title System Context diagram for UMKM Assistant

    Person(umkmBuyer, "UMKM Buyer", "A small business owner looking for raw materials or ready to export.")
    Person(supplier, "Supplier", "Provides wholesale products and registers their catalog on the platform.")
        
    System(umkmSystem, "UMKM Assistant System", "WhatsApp-first sourcing assistant and export advisor.")
    
    System_Ext(waAPI, "WhatsApp Cloud API", "Handles messaging interactions with buyers.")
    System_Ext(llmAPI, "LLM Service (OpenAI)", "Provides natural language understanding and generation.")
    
    Rel(umkmBuyer, waAPI, "Sends sourcing requests", "WhatsApp")
    Rel(umkmBuyer, umkmSystem, "Views sourcing history & export advice", "Web UI")
    Rel(supplier, umkmSystem, "Registers business and catalog", "Web UI")
    Rel(umkmSystem, waAPI, "Sends responses & recommendations", "API")
    Rel(waAPI, umkmSystem, "Forwards buyer messages", "Webhook")
    Rel(umkmSystem, llmAPI, "Processes intents, generates RFQs", "API")
```

### B. Container Level Diagram
This breaks down the `UMKM Assistant System` into deployable containers.

```mermaid
C4Container
    title Container diagram for UMKM Assistant

    Person(umkmBuyer, "UMKM Buyer", "WhatsApp user / Dashboard user")
    Person(supplier, "Supplier", "Dashboard user")
    
    System_Boundary(c1, "UMKM Assistant System") {
        Container(waWebhook, "WhatsApp Webhook Service", "Node.js/Express", "Receives and validates WhatsApp messages.")
        Container(agentCore, "Agent Core Engine", "LangChain / AI SDK", "Orchestrates LLM calls, intent routing, and state management.")
        Container(webDashboard, "Web Dashboard", "Next.js 14", "Provides UI for Buyers (history, export advisor) and Suppliers (catalog).")
        ContainerDb(db, "Primary Database", "PostgreSQL", "Stores user profiles, sourcing history, and supplier catalogs.")
        ContainerDb(vectorDb, "Vector Database", "pgvector", "Stores product embeddings for semantic similarity search.")
    }

    System_Ext(waAPI, "WhatsApp Cloud API", "Message Gateway")
    System_Ext(llmAPI, "LLM Service (GPT-4o)", "Inference")

    Rel(umkmBuyer, waAPI, "Chats via")
    Rel(umkmBuyer, webDashboard, "Visits", "HTTPS")
    Rel(supplier, webDashboard, "Manages Catalog", "HTTPS")
    
    Rel(waAPI, waWebhook, "Payloads", "HTTPS/JSON")
    Rel(waWebhook, agentCore, "Routes messages", "Internal API")
    Rel(webDashboard, db, "Reads/Writes", "SQL")
    
    Rel(agentCore, llmAPI, "Prompts / Responses", "gRPC / HTTPS")
    Rel(agentCore, vectorDb, "Semantic Search", "SQL/pgvector")
    Rel(agentCore, db, "Saves User State & History", "SQL")
```

---

## 2. Agent Architecture (LangGraph + Gemini)

**CTO Architectural Decision**: We will *not* use nested autonomous sub-agents with broad tool access. In a WhatsApp environment, autonomous sub-agent loops introduce unpredictable latency, excessive token usage, and infinite loop risks. 
Instead, we use a **Deterministic StateGraph (LangGraph)**. A supervisor routes the intent to highly specialized, linear sub-graphs. This guarantees speed, reliability, and easy debugging during the hackathon.

```mermaid
flowchart TD
    %% Graph State
    State[(Graph State Object)]
    
    %% Nodes
    Input[Incoming WhatsApp Message]
    Supervisor(Supervisor / Router Node)
    
    subgraph SourcingGraph [B2B Matchmaking Sub-Graph]
        Extractor(Intent & Needs Extractor)
        MatchTool[[Internal DB Match Tool]]
        EvalMatch{Results Sufficient?}
        WebMatch[[Web Search Tool: Shopee/Tokopedia]]
        Formatter(RFQ Formatter & Link Generator)
    end
    
    subgraph AdvisoryGraph [Export Advisor Sub-Graph]
        QueryGen(Requirement Generator Node)
        RAGTool[[Internal RAG / Checklist]]
        EvalRAG{Data Sufficient?}
        WebRAG[[Web Search Tool: Global Trade Data]]
        Advisor(Advisory Response Node)
    end
    
    %% Flow
    Input --> Supervisor
    Supervisor -- Updates --> State
    
    %% Routing Logic
    Supervisor -- "intent == 'sourcing'" --> Extractor
    Supervisor -- "intent == 'export_advice'" --> QueryGen
    Supervisor -- "needs_clarification" --> Response[Direct Reply]
    
    %% Sourcing Logic with Fallback
    Extractor --> MatchTool
    MatchTool --> EvalMatch
    EvalMatch -- Yes --> Formatter
    EvalMatch -- No Internal Match --> WebMatch
    WebMatch --> Formatter
    Formatter --> Response
    
    %% Advisory Logic with Fallback
    QueryGen --> RAGTool
    RAGTool --> EvalRAG
    EvalRAG -- Yes --> Advisor
    EvalRAG -- No Internal Data --> WebRAG
    WebRAG --> Advisor
    Advisor --> Response
    
    %% State Mapping
    Extractor -. Reads/Writes .-> State
    Advisor -. Reads/Writes .-> State
```

---

## 3. User Flow Architecture

### A. Progressive Onboarding & Dashboard Access (Auth Flow)

```mermaid
sequenceDiagram
    actor Buyer
    participant WA as WhatsApp
    participant Bot as Core Engine (LangGraph)
    participant DB as Postgres DB
    participant Web as Next.js Dashboard
    
    Buyer->>WA: Send first message
    WA->>Bot: Webhook with "From: +6281234..."
    
    Note over Bot, DB: System uses WA Number as Primary Key
    Bot->>DB: Check if user exists. If not, create empty profile.
    
    Note over Buyer, Bot: Progressive Profiling during chat
    Bot->>Buyer: "Untuk simpan hasil pencarian, aku akan buatkan profil. Usahamu di bidang apa?"
    Buyer->>Bot: "F&B"
    Bot->>DB: Update profile: industry=F&B
    
    Note over Buyer, Web: Accessing Web Dashboard later
    Buyer->>Bot: "Lihat dashboard"
    Bot->>WA: "Ini link masuk otomatis (berlaku 10 menit): tautangardaswadaya.id/auth-magic-link-xxx"
    
    Buyer->>Web: Clicks link
    Web->>DB: Validates token
    Web-->>Buyer: Logs in user securely using Cookie-based session
```

### B. Sourcing & Matchmaking Flow (Buyer via WhatsApp)

```mermaid
sequenceDiagram
    actor Buyer
    participant WA as WhatsApp
    participant Bot as Core Engine
    participant DB as Vector DB
    
    Buyer->>WA: "Butuh supplier plastik standing pouch 150pcs ke Batam"
    WA->>Bot: Webhook payload
    
    Note over Bot: Extractor Agent parses intent
    Bot->>WA: "Oke, dicatat. Produk: Plastik, jml: 150, ke Batam."
    
    Note over Bot: Matchmaker Agent
    Bot->>DB: Search(standing pouch, MOQ <= 150, delivery=Batam)
    DB-->>Bot: Returns Supplier A, B, C
    
    Bot->>WA: "Aku nemu 3 supplier cocok: [A, B, C]. Mau hubungi salah satu?"
    
    Buyer->>WA: "Pilih A"
    
    Note over Bot: RFQ Generator Agent
    Bot->>WA: "Ini kontaknya: +62xxxx. Mau dibantu buat draf pesan?"
    
    Buyer->>WA: "Boleh"
    
    Bot->>WA: "Halo, saya dapat referensi platform. Cari plastik 150pcs ke Batam..."
```

### B. Export Advisory Flow (Integrated Follow-up)

```mermaid
sequenceDiagram
    actor Buyer
    participant Bot as Core Engine
    participant Web as Web Dashboard
    
    Note over Buyer, Bot: After successful sourcing...
    Bot->>Buyer: "Produk ini punya peluang ekspor. Mau cek kesiapan?"
    Buyer->>Bot: "Mau"
    
    Note over Bot: Evaluates existing profile constraints
    Bot->>Buyer: "Saat ini kamu: Ada supplier, belum sertifikasi halal, dll. Estimasi: 60% siap."
    Bot->>Buyer: "Cek detail langkahnya di Dashboard ya: [Link]"
    
    Buyer->>Web: Clicks Link
    Web->>Buyer: Displays Export Checklist, Target Markets, Action Items
```
