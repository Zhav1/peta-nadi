# PreHub Pilot Operations & Onboarding Manual

**Document Version:** 1.0.0 (Milestone M3 Pilot Release)  
**Classification:** Operational / Production  
**Target Audience:** Commercial Logistics Dispatchers, Port & Intermodal Terminal Coordinators, Government Task Forces (Satgas Pangan, Dinas Perhubungan, Bappenas), and DevOps/Infrastructure Engineers.

---

## Master Architecture & System Topology

PreHub is a decentralized, deterministic logistics resilience platform designed for Pan-Sumatra multimodal transport corridors. It synthesizes real-time hydro-meteorological data, highway congestion telemetry, maritime Automatic Identification System (AIS) streams, and official news dispatches to detect logistics bottlenecks and execute automated economic mitigation workflows.

### 1. Data Flow Architecture

```
+--------------------------------------------------------------------------------------------------+
|                                    DATA INGESTION LAYER                                          |
|                                                                                                  |
|   +--------------------+   +--------------------+   +--------------------+   +---------------+   |
|   |  BMKG Open-Meteo   |   |   TomTom Traffic   |   | AISstream & Pelindo|   |  LKBN ANTARA  |   |
|   | Weather & Seismic  |   | Segment Congestion |   | Port Roadstead Que |   | 8 News Bureau |   |
|   +---------+----------+   +---------+----------+   +---------+----------+   +-------+-------+   |
+-------------|------------------------|------------------------|----------------------|-----------+
              |                        |                        |                      |
              v                        v                        v                      v
+--------------------------------------------------------------------------------------------------+
|                                 CORE SERVICES & REASONING ENGINES                                |
|                                                                                                  |
|   +-----------------------+     +------------------------+     +-----------------------------+   |
|   | Consensus Gate        |     | Spoilage Hedging       |     | Deterministic CPU Router    |   |
|   | Mathematical Swarm    |     | 4-Tier Perishability   |     | NetworkX Dijkstra (54 nodes)|   |
|   | P(Disruption)         |     | BPJT Toll + Fuel Model |     | Sub-15ms Latency            |   |
|   +-----------+-----------+     +-----------+------------+     +--------------+--------------+   |
|               |                             |                                 |                  |
|               +----------------------+      |      +--------------------------+                  |
|                                      v      v      v                                             |
|                         +-----------------------------------+                                    |
|                         | Compliance & Quarantine Inspector |                                    |
|                         | BKHIT Phytosanitary Hard Block    |                                    |
|                         | Class III MST Axle-Load Warning   |                                    |
|                         +-----------------+-----------------+                                    |
+-------------------------------------------|------------------------------------------------------+
                                            |
                                            v
+--------------------------------------------------------------------------------------------------+
|                               STORAGE & PERSISTENCE LAYER                                        |
|                                                                                                  |
|        +-----------------------------------+    +---------------------------------------+        |
|        | Redis 7 Alpine                    |    | SQLite 3 (WAL Mode)                   |        |
|        | Spatial Caching & Telemetry Queue |    | Thread-Safe ACID Trace & Decision Log |        |
|        +-----------------------------------+    +---------------------------------------+        |
+-------------------------------------------|------------------------------------------------------+
                                            |
                                            v
+--------------------------------------------------------------------------------------------------+
|                               PRESENTATION & OPERATOR HUD LAYER                                  |
|                                                                                                  |
|         +-----------------------------------------------------------------------------+          |
|         | Next.js 14 WebGL God's-Eye Dashboard                                        |          |
|         | - Top Navigation Telemetry & Choke-Point HUD                                |          |
|         | - 60 FPS Route-Bound Mapbox/Deck.gl Interpolation                           |          |
|         | - Spoilage Hedging Matrix Card & Compliance Strip                           |          |
|         | - Operator Decision Terminal (ACCEPT / REJECT / OVERRIDE)                   |          |
|         +-----------------------------------------------------------------------------+          |
+--------------------------------------------------------------------------------------------------+
```

---

### 2. Pan-Sumatra Physical Scope & Strategic Gateways

The system tracks and monitors 18 authoritative transport gateways across the Trans-Sumatra highway network, ferry crossings, and key maritime terminals:

| Gateway ID | Gateway Name | Type | Province | Lat, Lon | Operational Significance |
|:---|:---|:---|:---|:---|:---|
| `GW-01` | Pelabuhan Belawan | Maritime Port | North Sumatra | 3.7850, 98.6880 | Primary export-import container terminal and inter-island agro gateway. |
| `GW-02` | Pelabuhan Penyeberangan Bakauheni | Ferry Terminal | Lampung | -5.8710, 105.7530 | Sunda Strait ferry gateway connecting Sumatra and Java (Ro-Ro transit). |
| `GW-03` | Pelabuhan Dumai | Maritime Port | Riau | 1.6880, 101.4480 | Petroleum, CPO, and Malacca Strait international maritime gateway. |
| `GW-04` | Pelabuhan Teluk Bayur | Maritime Port | West Sumatra | -0.9990, 100.3750 | Indian Ocean maritime terminal for western Sumatra commodity exports. |
| `GW-05` | Pelabuhan Panjang | Maritime Port | Lampung | -5.4670, 105.3170 | Southern Sumatra bulk commodity and container terminal. |
| `GW-06` | Pelabuhan Sibolga | Maritime / Ferry | North Sumatra | 1.7410, 98.7810 | Western coastal ferry gateway to Nias Island and western regencies. |
| `GW-07` | Pelabuhan Kuala Tanjung | Industrial Seaport | North Sumatra | 3.3640, 99.4520 | Deep-sea container and industrial estate terminal. |
| `GW-08` | Tanjakan Sitinjau Lauik | Mountain Pass | West Sumatra | -0.9540, 100.5420 | Extreme incline connecting Padang and Solok; high landslide/breakdown hazard. |
| `GW-09` | Kelok 9 Payakumbuh | Mountain Pass | West Sumatra | -0.0710, 100.6980 | Strategic flyover pass connecting West Sumatra and Riau logistics routes. |
| `GW-10` | Jalur Lingkar Malalak | Bypass Corridor | West Sumatra | -0.3250, 100.2850 | Class III collector bypass; heavy vehicle weight limits (MST 8 Ton). |
| `GW-11` | Batu Lubang Tarutung | Mountain Pass | North Sumatra | 1.8890, 98.8820 | Single-lane narrow cliff pass on Sibolga-Tarutung arterial. |
| `GW-12` | Interchange Tebing Tinggi | Conjunction | North Sumatra | 3.3280, 99.1620 | Critical fork for Medan, Siantar, and Asahan Trans-Sumatra freight. |
| `GW-13` | Simpang Duri - Kandis | Highway Conjunction | Riau | 1.2850, 101.2420 | Heavy industrial freight bottleneck on Jalan Lintas Timur. |
| `GW-14` | Bottleneck Betung - Palembang | Arterial Conjunction| South Sumatra | -2.7120, 104.5210 | High-density freight congestion point on Jalan Lintas Timur. |
| `GW-15` | Interchange Terbanggi Besar | Toll Conjunction | Lampung | -4.8450, 105.2150 | Fork between Bakauheni-Palembang tollway and central Sumatra arterials. |
| `GW-16` | Simpang Muara Tembesi | Arterial Fork | Jambi | -1.7120, 103.1250 | Coal freight and agricultural junction connecting Jambi and Padang. |
| `GW-17` | Lintas Curup - Kepahiang | Mountain Pass | Bengkulu | -3.5850, 102.5850 | Mountain corridor connecting Bengkulu port hinterland to South Sumatra. |
| `GW-18` | Lintas Gunung Seulawah | Mountain Pass | Aceh | 5.4120, 95.6850 | Mountain pass connecting Banda Aceh and East Coast logistics arterial. |

---

### 3. Role-Based Access Control (RBAC) Permission Matrix

PreHub enforces strict multi-tenant Role-Based Access Control via cryptographic JWT signatures and offline role-switching fallbacks:

| Feature / Operation | Fleet Dispatcher (`DISPATCHER`) | Terminal Coordinator (`PORT_COORDINATOR`) | Government Regulator (`REGULATOR`) | Infrastructure Admin (`DEVOPS_ADMIN`) |
|:---|:---:|:---:|:---:|:---:|
| Fleet Onboarding (Single / CSV / TMS) | Full Access | View Only | View Only | Full Access |
| Spoilage Hedging Solver & Mitigation | Full Access | View Only | Audit Access | Full Access |
| Dispatch Decision Execution (`ACCEPT` / `REJECT`) | Full Access | Denied | Denied | Full Access |
| Regulatory Override Execution (`OVERRIDE`) | Full Access (Logged) | Denied | Audit Access | Full Access |
| BKHIT Quarantine Document Validation | View Status | Full Access | Audit Access | Full Access |
| Terminal Queue & Multiplier Calibration | View Only | Full Access | Audit Access | Full Access |
| Macro Vulnerability & Inflation Dashboard | Summary Access | Summary Access | Full Access | Full Access |
| MST Axle-Load Compliance Audit Trace | View Advisories | View Advisories | Full Access | Full Access |
| System Observability & API Diagnostics | Denied | Denied | Denied | Full Access |
| SQLite WAL Maintenance & DB Exports | Denied | Denied | Denied | Full Access |

---

## Chapter 1: Fleet Dispatcher Operational Runbook

**Persona Role:** Commercial Logistics Operator / Fleet Dispatcher  
**Primary Goal:** Minimize cargo spoilage exposure, reduce unnecessary transit fuel and toll costs, and communicate timely route deviations to drivers.

### 1.1 Fleet Onboarding Procedures

Dispatchers can onboard vehicles into the PreHub active tracking matrix through three ingestion mechanisms:

#### A. Single Vehicle Registration
1. In the top navigation bar, click the **Onboard Fleet** button (`PlusCircle` icon).
2. Ensure the **Single Vehicle** tab is selected.
3. Enter the vehicle metadata:
   - **Vehicle ID / Plate:** Enter official plate number (e.g., `BK 8812 XL`).
   - **Modality:** Select `TRUCK` (Road Freight), `SHIP` (Inter-island Vessel), or `AIRCRAFT` (Air Cargo).
   - **Driver Phone:** Enter mobile number formatted for WhatsApp dispatch (e.g., `081234567891` or `+6281234567891`).
   - **Cargo Commodity:** Select primary cargo type (e.g., `Cabai Merah Keriting`, `Daging Sapi`, `Bawang Merah`, `Beras SPHP`).
   - **Tonnage (Tons):** Enter payload net weight (e.g., `4.5`).
   - **Vehicle Gross Weight (Tons):** Enter total laden vehicle weight (e.g., `8.2`).
   - **Origin & Destination:** Select source and target hub nodes (e.g., Origin: `Pelabuhan Belawan`, Destination: `Pekanbaru Hub`).
4. Click **Register Vehicle**. The vehicle immediately appears in the fleet telemetry list and starts GPS interpolation on the map canvas.

#### B. Bulk CSV Manifest Upload
1. Open the **Onboard Fleet** modal and click the **CSV Manifest** tab.
2. If uploading for the first time, click **Download CSV Template** to obtain the standardized manifest format.
3. Ensure the CSV contains the required columns:
   ```csv
   vehicle_id,modality,driver_phone,cargo_commodity,tonnage,gross_weight_ton,origin_node,destination_node,has_bkhit_cert
   BK 8812 XL,TRUCK,081234567891,Cabai Merah Keriting,4.5,8.2,Pelabuhan Belawan,Pekanbaru Hub,false
   BE 9123 QP,TRUCK,081398765432,Daging Sapi,18.0,24.5,Pelabuhan Penyeberangan Bakauheni,Merak Port Hub,true
   BA 8452 NM,TRUCK,082145678901,Beras SPHP,12.0,14.2,Teluk Bayur Padang Hub,Solok Logistics Hub,false
   ```
4. Drag and drop the CSV file into the upload zone or browse local storage.
5. The system validates row schemas. Click **Confirm Ingestion**. A summary banner displays total records ingested and any syntax rejections.

#### C. Live TMS Telematics Webhook Integration
1. Open the **Onboard Fleet** modal and select the **TMS Webhook** tab.
2. Copy the production ingestion URL: `https://<prehub-domain>/api/v1/fleet/telemetry/ingest`.
3. Configure your third-party Telematics / GPS provider (e.g., Traccar, McEasy, EasyGo) to emit webhook POST payloads formatted as:
   ```json
   {
     "vehicle_id": "BK 8812 XL",
     "latitude": 3.4215,
     "longitude": 98.9812,
     "speed_kmh": 62.5,
     "heading": 135.0,
     "timestamp": "2026-10-03T14:30:00Z"
   }
   ```
4. Click **Test Endpoint Connection** to verify end-to-end receipt of incoming telematics packets.

---

### 1.2 Tactical WebGL Map Navigation & HUD Telemetry

The central viewport displays the God's-Eye pan-Sumatra canvas. 

- **Vehicle Icons:** High-contrast SVG markers representing active units (`Truck`, `Anchor`, `Plane`). Rotating markers reflect instantaneous direction of travel ($0^\circ - 360^\circ$).
- **Target Lock:** Click on any vehicle marker to lock the follow-camera reticle. The HUD card in the upper right displays vehicle telemetry: Plate, Commodity, Current Speed, Bearing, Active Route Polyline, and ETA to Destination.
- **Congestion Flow Lines:** TomTom highway segments render in standard traffic colors: Green (Free-flow), Amber (Moderate Congestion), Red (Severe Delay), Dark Red (Closure).
- **Hazard Overlays:** Spatial polygons generated by BMKG and early warning services depict active flash floods, landslides, and high sea-state warnings.

---

### 1.3 Interpreting the Operational Spoilage Hedging Solver

When an active vehicle approaches an emerging hazard corridor, navigate to the **Mitigation** tab in the right sidebar. The **Operational Spoilage Hedging Matrix** evaluates three competing policies:

$$\min \Big( \text{Cost}(\text{Continue}), \; \text{Cost}(\text{Reroute}), \; \text{Cost}(\text{Hold}) \Big)$$

```
+---------------------------------------------------------------------------------------------------+
| OPERATIONAL SPOILAGE HEDGING MATRIX                                                               |
| Target Vehicle: BK 8812 XL | Commodity: Cabai Merah Keriting (Ultra-Perishable, delta = 0.025/hr) |
+---------------------------------------------------------------------------------------------------+
| Policy: CONTINUE (High Risk)                                                                      |
| - Value Decay Exposure: IDR 74,250,000 (Based on projected 14.5 hr flood standstill)              |
| - Direct Transit Cost:  IDR 1,428,000 (Fuel consumption)                                          |
| - Total Monetary Loss:  IDR 75,678,000                                                            |
+---------------------------------------------------------------------------------------------------+
| Policy: REROUTE via Tol Trans-Sumatra (RECOMMENDED OPTIMAL)                                       |
| - Additional Distance:  +28.4 km                                                                  |
| - BPJT Toll Tariffs:    IDR 85,000 (Golongan II: Tebing Tinggi Interchange)                       |
| - Additional Fuel:      IDR 71,400 (Biosolar IDR 7,140/L benchmark)                               |
| - Cargo Spoilage Loss:  IDR 8,250,000 (Avoids flood entrapment)                                   |
| - Total Policy Cost:    IDR 8,406,400                                                             |
| - Net Hedged Savings:   IDR 67,271,600 (vs Continue Policy)                                       |
+---------------------------------------------------------------------------------------------------+
| Policy: HOLD at Nearest Depot                                                                     |
| - Reefer Genset Diesel: IDR 45,000 / hr                                                           |
| - Depot Parking Fee:    IDR 150,000 / day                                                         |
| - Total Policy Cost:    IDR 18,950,000                                                            |
+---------------------------------------------------------------------------------------------------+
```

#### Decision Execution Protocol
1. **To Authorize Recommended Detour (`ACCEPT`):**
   - Click the green **Accept Route & Dispatch** button.
   - The system locks the detour polyline, logs the decision to the immutable SQLite audit trace, and generates a pre-formatted WhatsApp dispatch link.
2. **To Retain Original Route (`REJECT`):**
   - Click **Reject Recommendation**.
   - A modal requires selecting an operational reason (e.g., *"Customer instructed urgent direct transit regardless of flood"*, *"Alternative fuel depot unavailable"*).
   - Rejections are flagged in the variance recalibration engine.
3. **To Override Weight or Route Restrictions (`OVERRIDE`):**
   - See Section 1.5 for the mandatory regulatory override workflow.

---

### 1.4 Generating Driver WhatsApp Dispatch Links

To immediately notify the driver without requiring a mobile application install:
1. Upon accepting a reroute recommendation, the **Dispatch Summary** popover displays the formatted link.
2. Click **Open WhatsApp Dispatch**.
3. PreHub launches `https://wa.me/<driver_phone>?text=<encoded_payload>` containing:
   - Vehicle Plate and Driver Name.
   - Prescribed Route: Origin $\to$ Mandatory Waypoint Detour $\to$ Destination.
   - Estimated Toll Segment: e.g., *"Gunakan Tol Medan-Tebing Tinggi Gerbang Tebing Tinggi (Gol II)"*.
   - Hazard Warning: *"Hindari Jalinsum Arteri Lama Km 42 (Banjir 80cm)"*.
   - Verification Hash: Cryptographic 8-character token verifying dispatch authenticity.

---

### 1.5 Regulatory Override Workflow (MST Violations)

When a heavy vehicle ($>8.0$ Ton gross weight) routes through a Class III collector road (such as Sitinjau Lauik or Malalak Pass):
1. The **Compliance Inspector** card flashes an Amber **Tactical Warning** badge: `REQUIRES_OVERRIDE`.
2. Dispatch is restricted until the operator logs an explicit liability justification.
3. Click **Operator Override**.
4. In the dialog, enter the official dispensation record:
   - Minimum note length: 15 characters.
   - Required syntax: Must document escort authority or emergency mandate (e.g., *"Satgas Pangan emergency grain relief convoy with Dishub escort permit #DSP-2026-08"*).
5. Click **Confirm Override**. The decision trace records the operator user ID, timestamp, and notes for state auditing.

---

## Chapter 2: Port & Intermodal Terminal Coordinator Runbook

**Persona Role:** Port Authority Officer / Intermodal Gate Coordinator  
**Primary Goal:** Prevent port roadstead gridlock, balance ferry dwelling times, and enforce agricultural quarantine biosecurity.

### 2.1 Strategic Terminal Monitoring

Port Coordinators monitor incoming freight corridors and sea-land interface nodes:
1. In the top navigation bar, click the **Intermodal HUD** popover (`Ship` icon).
2. The grid displays real-time metrics across all 7 maritime gateways:
   - **Pelabuhan Belawan:** Container dwelling time, roadstead vessel count.
   - **Pelabuhan Penyeberangan Bakauheni:** Ro-Ro ferry queue, truck staging yard capacity.
   - **Pelabuhan Dumai:** CPO terminal loading status, tanker waiting times.
   - **Pelabuhan Teluk Bayur:** Bulk mineral and agro berth availability.

---

### 2.2 Dynamic Intermodal Delay Multiplier Calculation

PreHub calculates dynamic corridor delay factors at intermodal choke-points:

$$M_{\text{intermodal}} = 1.0 + 0.15 \times \frac{N_{\text{queue}}}{10.0} \times \text{SeverityWeight}$$

*Constraint:* Strictly clamped to the interval $[1.0, 3.5]$.

- When $N_{\text{queue}} \le 5$: Gateway status is `NORMAL` ($M_{\text{intermodal}} \approx 1.0 - 1.1$).
- When $5 < N_{\text{queue}} \le 15$: Gateway status is `CONGESTED` ($M_{\text{intermodal}} \approx 1.2 - 1.8$).
- When $N_{\text{queue}} > 20$ or severe weather occurs: Gateway status escalates to `RESTRICTED` or `BLOCKED` ($M_{\text{intermodal}} \ge 2.0$).
- The routing engine automatically applies $M_{\text{intermodal}}$ as a penalty multiplier on road-to-sea transit corridors, triggering proactive hold or inland staging recommendations.

---

### 2.3 BKHIT Agricultural Quarantine Enforcement

Indonesian biosecurity regulations require phytosanitary certificates for agricultural commodities crossing inter-island maritime straits (e.g., Bakauheni $\leftrightarrow$ Merak, Belawan $\leftrightarrow$ Batam):

```
+---------------------------------------------------------------------------------------------------+
| DIGITAL COMPLIANCE INSPECTOR: BKHIT BIOSECURITY VERIFICATION                                      |
+---------------------------------------------------------------------------------------------------+
| Route: Bakauheni Ferry Terminal -> Merak Port Hub (Sunda Strait Maritime Crossing)                |
| Cargo: Daging Sapi Beku (18.0 Ton) | Vehicle: BE 9123 QP                                         |
+---------------------------------------------------------------------------------------------------+
| [HARD_BLOCK] STATUS: DISPATCH PROHIBITED                                                          |
| Missing Mandatory BKHIT Quarantine Certificate (Undang-Undang No. 21 Tahun 2019)                   |
| Action Required: Cargo cannot be boarded onto Ro-Ro ferry without valid Certificate ID.          |
+---------------------------------------------------------------------------------------------------+
```

#### Certificate Clearance Protocol
1. Port inspectors examine the physical or digital quarantine document (Formulir KT-12 / KH-11).
2. In PreHub, search the Vehicle Plate `BE 9123 QP` in the **Compliance** tab.
3. Click **Attach Quarantine Certificate**.
4. Input the official BKHIT certificate serial: e.g., `BKHIT-SUM-2026-9921`.
5. Click **Verify & Clear Block**.
6. The compliance status transitions to `PASSED` (`can_dispatch: True`), and gate access is authorized.

---

## Chapter 3: Government Regulator Runbook (Satgas Pangan & Dishub)

**Persona Role:** Satgas Pangan Task Force Officer, Dinas Perhubungan Auditor, Regional Inflation Task Force (TPID)  
**Primary Goal:** Monitor food price stability, detect supply chain disruptions before price spikes occur, audit logistics efficiency, and enforce road preservation standards.

### 3.1 Macro Vulnerability & Supply Chain Disruption Tracking

1. Log in under the `REGULATOR` persona or toggle using the header workspace switcher.
2. Navigate to the **Simulation / Analytics** view.
3. **Provincial Inflation Anomaly Grid:**
   - PreHub aggregates daily PIHPS spot food prices across 8 Sumatra provinces.
   - Green tiles indicate price stability ($\Delta P \le \pm 2\%$).
   - Yellow/Amber tiles indicate moderate volatility ($\Delta P \in [3\%, 7\%]$).
   - Red tiles trigger Supply Shock alerts ($\Delta P > 8\%$), prompting immediate inspection of incoming freight corridors.

---

### 3.2 News Grounding & Market Regime Analysis

In the **Evidence** tab of the right sidebar:
- Inspect real-time LKBN ANTARA regional dispatches (8 Sumatra bureaus).
- Market Regime classification evaluates macroeconomic supply sentiment:
  - `CALM`: Normal logistics operations.
  - `SUPPLY_SHOCK`: Arterial blockages, port strikes, or harvest failures.
  - `INFLATION_SURGE`: Severe fuel or commodity price volatility.
- Verify that agent risk weighting dynamically adjusts based on grounded news citations.

---

### 3.3 Verification of Probabilistic Calibration (Reliability Diagram)

Government task forces require verified mathematical rigor without speculative AI claims:
1. Navigate to the **Evaluation** tab on the top menu bar.
2. Inspect the **SVG Reliability Diagram**:
   - Compares predicted disruption probability $P(\text{Disruption})$ against actual historical field outcomes ($N=60$ benchmark).
   - Review the Platt Sigmoid Brier Score: Benchmark score is $0.0782$ (target: $\le 0.100$).
   - Expected Calibration Error (ECE) is verified at $<3.5\%$.
3. Review the **Corridor Savings Matrix**:
   - Average net savings per rerouted produce truck: IDR 12,450,000.
   - Average transit time saved: 4.8 hours.

---

### 3.4 Auditing Operator MST Dispensations

To review commercial carrier compliance with road weight classes:
1. In the **Evaluation** dashboard, scroll to the **Closed-Loop Decision Audit Trace**.
2. Filter decisions by Action: `OVERRIDE`.
3. Verify each row contains:
   - Vehicle ID and gross tonnage.
   - Collector road segment name (e.g., `Jalur Malalak`, `Sitinjau Lauik`).
   - Operator User ID and mandatory justification note.
   - Flag any overrides lacking valid police/transport agency dispensation numbers for administrative review.

---

## Chapter 4: DevOps & Infrastructure Administrator Runbook

**Persona Role:** System Administrator / DevOps Engineer  
**Primary Goal:** Ensure high availability, zero data loss, verified container health, and seamless local-to-cloud synchronization.

### 4.1 Production Container Deployment

PreHub utilizes a multi-container architecture orchestrated via Docker Compose:

```bash
# 1. Clone production repository
git clone https://github.com/Zhav1/peta-nadi.git
cd peta-nadi

# 2. Configure environment credentials
cp .env.example .env
# Edit .env with your Mapbox, Supabase, and Redis configuration keys

# 3. Build and launch all production services in detached mode
docker compose up --build -d

# 4. Verify running containers and health checks
docker compose ps
```

Expected container states:
- `prehub-redis`: Up (healthy) on port `6379`.
- `prehub-backend`: Up (healthy) on port `8000`.
- `prehub-frontend`: Up (healthy) on port `3000`.

---

### 4.2 Health Check Probes & Diagnostics

Native container health checks run continuously:
- **Redis Health Probe:** `redis-cli ping` (10s interval, 5s timeout, 3 retries).
- **Backend Health Probe:** `curl -f http://localhost:8000/api/v1/health` (15s interval, 5s timeout, 3 retries). Returns `{"status": "healthy", "service": "prehub-backend"}`.
- **Frontend Health Probe:** `wget -qO- http://localhost:3000/` (15s interval, 5s timeout, 3 retries).

---

### 4.3 SQLite WAL Persistence & Backup Procedures

PreHub stores offline session state, vehicle fleet manifests, and immutable operator decision traces in local SQLite database `prehub_local.db` using Write-Ahead Logging (WAL):

```bash
# Verify WAL mode configuration
sqlite3 prehub_local.db "PRAGMA journal_mode;"
# Output: wal

# Force a manual checkpoint to merge WAL files into main database
sqlite3 prehub_local.db "PRAGMA wal_checkpoint(TRUNCATE);"

# Perform a hot backup without stopping services
sqlite3 prehub_local.db ".backup backup/prehub_local_$(date +%Y%m%d_%H%M%S).db"
```

---

### 4.4 In-App System Observability & API Diagnostics

To verify all 28 API and WebSocket endpoints without leaving the browser:
1. Log in under the `DEVOPS_ADMIN` persona.
2. In the top right header, click the **Diagnostics Console** icon.
3. Click **Run Full System Probe**.
4. The console executes parallel live network probes against all route clusters:
   - Early Warning & BMKG: `GET /api/v1/weather/spatial-polygons`
   - Traffic Telemetry: `GET /api/v1/traffic/flow-segments`
   - News Aggregator: `GET /api/v1/news/live`, `GET /api/v1/news/market-regime`
   - Fleet Ingestion: `GET /api/v1/fleet/vehicles`, `POST /api/v1/fleet/telemetry/ingest`
   - Intermodal & Hedging: `GET /api/v1/intermodal/chokepoints`, `POST /api/v1/spoilage/hedging/solve`
   - Compliance: `POST /api/v1/compliance/verify`
   - System Health: `GET /api/v1/health`
5. Green indicators confirm sub-50ms latency across all routes.

---

## Chapter 5: Operational Contingency & Emergency Response SOPs

### 5.1 SOP-1: Total Internet / Cloud Disconnection

**Trigger:** Loss of WAN internet access or cloud provider outage.  
**System Behavior:**
1. The frontend automatically detects disconnection and activates the **Offline Guest Session** generator.
2. The UI falls back to the embedded 54-node Sumatra NetworkX topology and pre-cached strategic hub locations.
3. Fleet telemetry continues operating using dead-reckoning vector projections.
4. All operator decisions (ACCEPT / REJECT / OVERRIDE) are persisted to local SQLite database with `sync_status = 'pending'`.
5. Upon internet restoration, the background queue synchronizes pending traces to Supabase cloud storage.

---

### 5.2 SOP-2: Redis Cache Service Failure

**Trigger:** Redis container crashes or memory exhaustion occurs.  
**System Behavior:**
1. The backend FastAPI adapter intercepts connection exceptions and activates in-memory LRU cache fallback.
2. Spatial polygons and TomTom traffic congestion lines fallback to local disk cache (`data/road_network_sumatra.json`).
3. Core routing calculations (NetworkX CPU Dijkstra) run unimpeded with sub-15ms response times.
4. *Action:* Administrator executes `docker compose restart redis` to restore high-throughput caching.

---

### 5.3 SOP-3: Catastrophic Corridor Blockage Escalation Contacts

In the event of a catastrophic regional incident (e.g., M7.0+ earthquake, major bridge collapse on Jalinsum):

| Authority / Agency | Operational Responsibility | Contact Channel |
|:---|:---|:---|
| **BPBD Sumut / Sumbar / Lampung** | Regional Disaster Search & Rescue | Emergency Call 112 / Regional Radio |
| **Balai Pengelola Transportasi Darat (BPTD)** | National Highway Closures & Weight Enforcement | Dishub Emergency Dispatch Line |
| **Satgas Pangan Mabes Polri** | National Food Supply Escort & Convoy Clearance | Satgas Pangan Command Desk |
| **PT ASDP Indonesia Ferry (Bakauheni)** | Sunda Strait Emergency Ferry Allocation | ASDP Operation Room: (0727) 331032 |
| **BKHIT Karantina Pertanian Pusat** | Emergency Biosecurity Dispensation Protocol | BKHIT Crisis Desk: 1500-083 |

---

*PreHub Pilot Onboarding Manual — End of Document*
