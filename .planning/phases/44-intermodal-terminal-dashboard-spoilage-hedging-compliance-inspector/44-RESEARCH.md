# Phase 44: Intermodal Terminal Dashboard, Spoilage Hedging & Compliance Inspector - Research

**Researched:** 2026-10-02  
**Domain:** Multi-Modal Logistics Resilience, Choke-Point Synchronization, Spoilage Decay Hedging, Agricultural Quarantine & Axle-Load (MST) Compliance  
**Confidence:** HIGH  

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Full Dynamic Model):** Economic rates and costs must be dynamic and grounded in real-time market data rather than synthetic constants.
  - BPJT Real Toll Tariffs by vehicle classification (Golongan II/III: medium trucks/fuso; Golongan IV/V: tronton/heavy trailers) across all major Sumatra toll sections (Bakauheni–Terbanggi Besar, Terbanggi Besar–Kayu Agung, Kayu Agung–Palembang, Pekanbaru–Dumai, Medan–Tebing Tinggi, Belmera, Sigli–Banda Aceh).
  - Pertamina benchmark fuel rates (Biosolar IDR 6,800/L, Dexlite IDR 14,550/L, Pertamina Dex IDR 15,100/L), dynamically modulated by the active Market Regime / inflation shock factor from `news_aggregator.py`.
  - Base cargo values derived dynamically from PIHPS / Bank Indonesia spot commodity prices ($\text{CargoValue} = \text{Tonnage} \times \text{SpotPrice}$) via `commodity_router.py`.
- **D-02 (4-Tier Perishability Decay Model):**
  - Ultra-Perishable ($T_{\text{spoil}} = 36\text{h}-48\text{h}$): Cabai Merah, Tomat, Sayuran Daun Segar ($\delta = 0.025/\text{hour}$).
  - Cold-Chain Controlled ($T_{\text{spoil}} = 72\text{h}$): Daging Sapi, Ayam, Ikan Segar, Susu ($\delta = 0.015/\text{hour}$, genset diesel cost IDR 45,000/jam).
  - Semi-Perishable ($T_{\text{spoil}} = 120\text{h}$): Bawang Merah, Bawang Putih, Kentang, Umbi-umbian ($\delta = 0.008/\text{hour}$).
  - Non-Perishable Dry Bulk ($T_{\text{spoil}} = 720\text{h}+$): Beras SPHP, Minyak Goreng Kemasan, Gula Pasir, Tepung ($\delta = 0.0005/\text{hour}$).
  - Formula: $\text{ValueLoss}(t) = \text{CargoValue} \times (1 - e^{-\delta \cdot \text{DelayHours}})$.
- **D-03 (Financial Cost Matrix Solver):**
  - Policy 1: CONTINUE $\to \text{Cost} = P(\text{Disruption}) \times \text{ValueLoss}(\text{DelayHours}) + \text{DowntimeFee}$
  - Policy 2: REROUTE $\to \text{Cost} = \Delta\text{Distance} \times \text{DynamicFuelRate} + \text{BPJTTollTariff} + \Delta\text{Time} \times \text{DriverOvertime}$
  - Policy 3: HOLD $\to \text{Cost} = \text{WaitHours} \times (\text{ReeferDieselCost} + \text{DepotParkingFee})$
  - Optimal recommendation highlights $\min(\text{Cost}_{\text{continue}}, \text{Cost}_{\text{reroute}}, \text{Cost}_{\text{hold}})$ with net loss prevention.
- **D-04 (Multi-Hub Matrix 20+ Choke-Points):** Pan-Sumatra scope covering 7 maritime/ferry terminals (Belawan, Bakauheni, Dumai, Teluk Bayur, Panjang, Sibolga, Kuala Tanjung) and 11 critical mountain/toll bottlenecks (Sitinjau Lauik, Kelok 9, Malalak, Tarutung–Sibolga, Tebing Tinggi, Simpang Duri–Kandis, Betung–Palembang, Terbanggi Besar, Muara Tembesi, Curup–Kepahiang, Seulawah Pass).
- **D-05 (Real Data Fusion & Queuing):** Fuses live TomTom traffic congestion, BMKG spatial weather alerts, and vehicle telemetry. Delay multiplier: $M_{\text{intermodal}} = 1.0 + 0.15 \times N_{\text{queue}} \times \text{SeverityFactor}$ (clamped between 1.0 and 3.5).
- **D-06 (Differentiated Compliance):** Hard Block on missing BKHIT agricultural quarantine certificates for inter-island movements. Tactical Warning & Reroute advisory on MST Axle-Load limits (Class III roads $\le 8$ Ton) allowing operator override with logged liability acknowledgment. Surat Jalan validation matches plate, driver, commodity, and manifest hash.
- **D-07 (UI Ergonomics):** High-density tactical metrics embedded directly inside `MitigationTab.tsx` (`CrisisSidebar.tsx`) and quick terminal popover in `TopNavTelemetry.tsx`. 100% monochrome Lucide SVG icons, zero emojis, dark glassmorphic styling (`backdrop-blur-md bg-[#0c0e12]/80 border border-white/10`).

### the agent's Discretion
- In-memory/SQLite caching for BPJT toll lookup tables and PIHPS spot commodity cache TTL (5-minute refresh).
- Exact color indicators for policy highlights (Emerald for optimal, Amber for suboptimal, Rose for highest risk).

### Deferred Ideas (OUT OF SCOPE)
- Automated Electronic Toll Payment (E-Toll/MLFF) Simulation webhook.
- Physical Weigh-in-Motion (WIM) IoT sensor hardware streaming.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Choke-Point Synchronization & Queuing | Backend Service (`intermodal_sync_service.py`) | Database (`local_storage.py`) | Synthesizes 20+ choke-points with live TomTom, BMKG, and vessel/truck telemetry. |
| Spoilage Hedging Matrix Solver | Backend Service (`spoilage_hedging_service.py`) | Backend Router (`commodity_router.py`) | Computes closed-form economic exposure across 3 policies using dynamic BPJT tariffs and PIHPS spot prices. |
| Compliance Inspector Engine | Backend Service (`compliance_service.py`) | Database (`local_storage.py`) | Enforces BKHIT quarantine hard blocks and MST axle-load warnings with audit logging. |
| REST Endpoints & Schemas | Backend Router (`intermodal_router.py`) | API Client (`lib/api.ts`) | Exposes `/api/v1/intermodal/chokepoints`, `/hedging/solve`, `/compliance/verify`. |
| Spoilage Hedging Card UI | Frontend Component (`SpoilageHedgingCard.tsx`) | Sidebar (`MitigationTab.tsx`) | Displays policy comparison matrix, net savings in IDR, and perishability decay curves. |
| Compliance Inspector Badges UI | Frontend Component (`ComplianceInspectorCard.tsx`) | Sidebar (`MitigationTab.tsx`) | Interactive compliance verification checklist with override modals. |
| Intermodal Choke-Point Popover | Frontend Component (`IntermodalTerminalPopover.tsx`) | Top Navigation (`TopNavTelemetry.tsx`) | High-density real-time terminal and mountain pass status popover. |
</architectural_responsibility_map>

<research_summary>
## Summary

Phase 44 establishes the multi-modal logistics resilience infrastructure for PreHub across Pan-Sumatra. While earlier phases focused on road routing, fleet telemetry, and news ingestion, Phase 44 bridges physical infrastructure realities (sea-land port gates, mountain pass choke-points, weigh stations, and quarantine checkpoints) with mathematical business economics (cargo spoilage decay, toll costs, and fuel shocks).

The implementation is structured around three core backend engines and two frontend glassmorphic surfaces:
1. **`IntermodalSyncService`**: Tracks 20+ Sumatra logistics gateways (7 maritime ports and 11 high-risk road conjunctions), dynamically computing dwelling times, queue lengths, and delay multipliers ($M_{\text{intermodal}}$) from live TomTom congestion and BMKG alerts.
2. **`SpoilageHedgingService`**: A mathematical cost matrix solver comparing $\text{Continue}$ vs $\text{Reroute}$ vs $\text{Hold}$ policies. It integrates real BPJT toll matrices for vehicle Golongan II–V, Pertamina fuel rates modulated by Market Regime inflation shocks, and PIHPS spot commodity valuations across 4 perishability tiers.
3. **`ComplianceService`**: Validates legal and infrastructural constraints: BKHIT agricultural quarantine certificates (hard block for inter-island trade) and MST axle-load limits (Class III road restrictions with warning and detour recommendations).
4. **Ergonomic Operator UI**: Seamlessly integrated into `CrisisSidebar` (`MitigationTab.tsx`) and `TopNavTelemetry.tsx`, adhering strictly to the zero-emoji, Lucide SVG design system.

**Primary recommendation:** Build pure, deterministic service modules with comprehensive unit test coverage first, then wire the FastAPI REST router (`intermodal_router.py`), and finally mount the React components inside `MitigationTab.tsx` and `TopNavTelemetry.tsx` to maintain 100% build cleanliness and test reliability.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| `FastAPI` | `^0.111.0` | REST API Routing | Asynchronous endpoints, automatic OpenAPI documentation, dependency injection. |
| `Pydantic v2` | `^2.7.0` | Schemas & Validation | Strict request/response parsing, type safety, JSON Schema serialization. |
| `math` & `numpy` | Native / `^1.26.0` | Mathematical Modeling | Exponential decay calculations, matrix operations, statistical clamping. |
| `Lucide React` | `^0.395.0` | Operator UI Icons | 100% monochrome SVG icons (`Ship`, `ShieldAlert`, `Scale`, `FileText`, `DollarSign`, `Clock`). |
| `Tailwind CSS` | `^3.4.0` | Glassmorphic Styling | Consistent `backdrop-blur-md bg-[#0c0e12]/80 border border-white/10` design tokens. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `httpx` | `^0.27.0` | Async HTTP Client | External API integration and live data fetching. |
| `pytest` & `pytest-asyncio` | `^8.2.2` | Automated Testing | Comprehensive test suite for all mathematical formulas and API endpoints. |
| `@turf/distance` | `^6.5.0` | Spatial Math | Distance and coordinate checks between fleet assets and choke-points. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Deterministic Closed-Form Solver | Monte Carlo Simulation | Monte Carlo adds 200–500ms latency without increasing accuracy for 3-policy decisions. Closed-form exponential decay runs in <1ms. |
| Real BPJT Toll Matrix | Flat Distance Multiplier | Flat IDR 1,500/km grossly miscalculates toll economics across Sumatra where toll segments range from IDR 13,000 to IDR 341,000. Real BPJT matrix ensures trustworthy decision support. |
| Modal Dialog Triage | Embedded Sidebar Tab | A separate modal breaks dispatcher spatial awareness. Embedding into `MitigationTab` preserves simultaneous map and telemetry visibility. |
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                    PREHUB OPERATIONAL ENGINE                                       |
+----------------------------------------------------------------------------------------------------+
                                                  │
                 ┌────────────────────────────────┴────────────────────────────────┐
                 ▼                                                                 ▼
   [Live Sensor Feeds & Databases]                                [Operational Dispatch Ingestion]
   - TomTom Traffic API (Flow/Incidents)                         - Active Vehicle Route Waypoints
   - BMKG Weather API (Spatial Alerts)                           - Vehicle Class (Gol II/III/IV/V)
   - PIHPS / Bank Indonesia Spot Prices                          - Cargo Manifest & Commodity Tier
   - News Aggregator Market Regime / Shock                       - BKHIT Certificate & Delivery Order
                 │                                                                 │
                 └────────────────────────────────┬────────────────────────────────┘
                                                  │
                                                  ▼
                         ┌─────────────────────────────────────────────────┐
                         │           FastAPI Backend Services              │
                         │                                                 │
                         │  1. IntermodalSyncService                       │
                         │     - 20+ Sumatra Transport Choke-Points        │
                         │     - Dwell Time & M_intermodal Queue Multiplier│
                         │                                                 │
                         │  2. SpoilageHedgingService                      │
                         │     - 4-Tier Perishability Exponential Decay    │
                         │     - BPJT Real Toll + Pertamina BBM Calculator │
                         │     - Continue vs Reroute vs Hold Cost Solver   │
                         │                                                 │
                         │  3. ComplianceService                           │
                         │     - BKHIT Quarantine Inter-Island Hard Block  │
                         │     - MST Axle-Load Class III Road Warning      │
                         │     - Surat Jalan Delivery Order Validation     │
                         └────────────────────────┬────────────────────────┘
                                                  │
                                                  ▼
                         ┌─────────────────────────────────────────────────┐
                         │           REST Router: /api/v1/intermodal       │
                         │                                                 │
                         │  GET  /api/v1/intermodal/chokepoints            │
                         │  POST /api/v1/intermodal/hedging/solve          │
                         │  POST /api/v1/intermodal/compliance/verify      │
                         │  GET  /api/v1/intermodal/toll-tariffs           │
                         └────────────────────────┬────────────────────────┘
                                                  │
                                                  ▼
                         ┌─────────────────────────────────────────────────┐
                         │         Next.js Operator UI Components          │
                         │                                                 │
                         │  - TopNavTelemetry: IntermodalTerminalPopover   │
                         │  - MitigationTab: SpoilageHedgingCard           │
                         │  - MitigationTab: ComplianceInspectorCard       │
                         │  - CrisisMap: Strategic Choke-Point Markers     │
                         └─────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
backend/
├── app/
│   ├── schemas/
│   │   └── intermodal.py            # Pydantic models for chokepoints, hedging, compliance
│   ├── services/
│   │   ├── intermodal_sync_service.py  # 20+ Choke-points & dynamic queuing
│   │   ├── spoilage_hedging_service.py # Dynamic toll, fuel, perishability solver
│   │   └── compliance_service.py       # BKHIT, MST, and Surat Jalan validation
│   └── routers/
│       └── intermodal_router.py        # FastAPI router mounted at /api/v1/intermodal
└── tests/
    └── test_intermodal_hedging_compliance.py  # 15+ automated pytest cases

frontend/
├── components/
│   ├── dashboard/
│   │   └── IntermodalTerminalPopover.tsx  # Popover mounted in TopNavTelemetry
│   └── sidebar/
│       ├── SpoilageHedgingCard.tsx        # Financial policy comparison card in MitigationTab
│       └── ComplianceInspectorCard.tsx    # Digital verification checklist in MitigationTab
├── hooks/
│   └── useIntermodalData.ts               # SWR/React hook for chokepoints & hedging queries
└── lib/
    ├── api.ts                             # Extended with api.intermodal methods
    └── types.ts                           # TypeScript definitions for intermodal data
```

### Pattern 1: Multi-Hub Choke-Point Real-Time Queuing & Delay Multiplier
```python
# M_intermodal formula clamped to [1.0, 3.5]
severity_weight = {"NORMAL": 0.0, "CONGESTED": 0.8, "RESTRICTED": 1.5, "BLOCKED": 3.0}
delay_multiplier = 1.0 + (0.15 * queue_count * severity_weight.get(status, 1.0))
delay_multiplier = max(1.0, min(3.5, round(delay_multiplier, 2)))
```

### Pattern 2: Dynamic Spoilage Hedging Cost Matrix Solver
```python
# ValueLoss exponential decay calculation
# delta: perishability decay rate per hour
value_loss = cargo_value * (1.0 - math.exp(-delta * delay_hours))

# Dynamic Fuel Cost with Market Regime Inflation Modulation
effective_fuel_rate = base_fuel_rate * (1.0 + inflation_shock_factor)
fuel_cost = (delta_distance_km / fuel_efficiency_km_per_l) * effective_fuel_rate

# Cost Solver
cost_continue = (p_disruption * value_loss) + downtime_fixed_fee
cost_reroute = fuel_cost + bpjt_toll_tariff + (delta_time_hours * driver_hourly_wage)
cost_hold = wait_hours * (reefer_hourly_cost + depot_parking_hourly_rate)

optimal_policy = min(["CONTINUE", "REROUTE", "HOLD"], key=lambda p: {"CONTINUE": cost_continue, "REROUTE": cost_reroute, "HOLD": cost_hold}[p])
```

### Pattern 3: Differentiated Compliance Inspector
```python
# BKHIT Inter-Island Rule
is_inter_island = (origin_island != destination_island) or route_traverses_strait
if is_inter_island and not bkhit_certificate_valid:
    compliance_status = "HARD_BLOCK"
    actionable_reason = "Sertifikat Karantina Pertanian (BKHIT) Wajib untuk Penyeberangan Antar-Pulau."

# MST Axle-Load Rule
if road_class == "CLASS_III" and vehicle_gross_weight_ton > 8.0:
    compliance_status = "TACTICAL_WARNING"
    actionable_reason = f"Beban armada ({vehicle_gross_weight_ton} Ton) melebihi MST Jalur Kelas III (8 Ton). Disarankan pengalihan ke Jalinsum Arteri Primer."
```

### Anti-Patterns to Avoid
- **Static Hardcoded Values**: Never hardcode fuel as IDR 10,000 or toll as IDR 50,000. All calculations must use the structured BPJT matrix and Pertamina base rates.
- **Emoji Badges in Operator UI**: Forbidden by project guidelines (`.agents/skills/ui-ux-pro-max/`). Use Lucide SVG icons (`ShieldAlert`, `Scale`, `FileText`, `CheckCircle2`, `AlertTriangle`).
- **Blocking the UI Event Loop**: Keep all mathematical solver logic async-compatible and sub-millisecond in execution time.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Geometric distance between vehicles & choke-points | Custom Euclidean math `sqrt(dx^2 + dy^2)` | `@turf/distance` / Haversine formula in `telemetry_service.py` | Latitude/longitude degrees on Sumatra (~2°–5° off equator) distort Euclidean distances by over 20%. |
| Exponential perishability curves | Ad-hoc linear decay `value * (1 - 0.05 * hours)` | First-order kinetic decay `1 - exp(-delta * t)` | Real food spoilage accelerates non-linearly past bacterial latency lag phases. |
| Toll segment aggregation | Client-side hardcoded addition | Centralized `BPJT_SUMATRA_TOLL_MATRIX` dictionary | Toll tariffs change with government decrees; a single server-side authority prevents discrepancy between UI and solver. |
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Commodity Spot Price Cold-Start / Supabase Offline
- **What goes wrong:** If Supabase TimescaleDB is unreachable, the hedging solver could crash or return zero cargo value.
- **Why it happens:** Network timeouts on external database connections.
- **How to avoid:** Utilize the robust fallback dictionary already established in `commodity_router.py` (e.g. Cabai Merah IDR 55,000/kg, Beras IDR 14,000/kg).
- **Warning signs:** Logs showing `Supabase unavailable for commodity prices query`.

### Pitfall 2: Overly Restrictive MST Road Blocks
- **What goes wrong:** Hard-blocking trucks on Class III roads prevents dispatchers from taking emergency detours when main highways are impassable.
- **Why it happens:** Treating axle-load road class limits as physical gates rather than legal/risk advisories.
- **How to avoid:** Enforce differentiated compliance: Hard Block on BKHIT quarantine, but Tactical Warning + Reroute recommendation on MST limits with operator override capability.
- **Warning signs:** Dispatchers unable to select any alternative route during landslide scenarios.

### Pitfall 3: Inconsistent Number Formatting in Frontend
- **What goes wrong:** Floating point artifacts (e.g., `IDR 12450000.000000002` or `M_delay: 1.4500000000000002`).
- **Why it happens:** Direct JavaScript number rendering without locale formatting.
- **How to avoid:** Format monetary figures with `new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val)` and clamp multiplier floats to 2 decimal places.
</common_pitfalls>

<code_examples>
## Code Examples

### 1. BPJT Sumatra Toll Matrix Definition (`spoilage_hedging_service.py`)
```python
BPJT_SUMATRA_TOLL_SEGMENTS = {
    "BAKAUHENI_TERBANGGI": {
        "name": "Tol Bakauheni - Terbanggi Besar",
        "distance_km": 140.9,
        "tariffs": {
            "GOL_I": 118500,
            "GOL_II": 177500,
            "GOL_III": 177500,
            "GOL_IV": 237000,
            "GOL_V": 237000,
        }
    },
    "TERBANGGI_KAYUAGUNG": {
        "name": "Tol Terbanggi Besar - Pematang Panggang - Kayu Agung",
        "distance_km": 189.2,
        "tariffs": {
            "GOL_I": 170500,
            "GOL_II": 255500,
            "GOL_III": 255500,
            "GOL_IV": 341000,
            "GOL_V": 341000,
        }
    },
    "KAYUAGUNG_PALEMBANG": {
        "name": "Tol Kayu Agung - Palembang - Kramasan",
        "distance_km": 42.5,
        "tariffs": {
            "GOL_I": 50000,
            "GOL_II": 75000,
            "GOL_III": 75000,
            "GOL_IV": 100000,
            "GOL_V": 100000,
        }
    },
    "PEKANBARU_DUMAI": {
        "name": "Tol Pekanbaru - Dumai",
        "distance_km": 131.5,
        "tariffs": {
            "GOL_I": 118500,
            "GOL_II": 178500,
            "GOL_III": 178500,
            "GOL_IV": 238000,
            "GOL_V": 238000,
        }
    },
    "MEDAN_TEBINGTINGGI": {
        "name": "Tol Medan - Kualanamu - Tebing Tinggi",
        "distance_km": 61.7,
        "tariffs": {
            "GOL_I": 55500,
            "GOL_II": 85000,
            "GOL_III": 85000,
            "GOL_IV": 113500,
            "GOL_V": 113500,
        }
    },
    "BELMERA": {
        "name": "Tol Belawan - Medan - Tanjung Morawa",
        "distance_km": 34.0,
        "tariffs": {
            "GOL_I": 8500,
            "GOL_II": 13000,
            "GOL_III": 13000,
            "GOL_IV": 17500,
            "GOL_V": 17500,
        }
    },
    "SIGLI_BANDAACEH": {
        "name": "Tol Sigli - Banda Aceh",
        "distance_km": 74.2,
        "tariffs": {
            "GOL_I": 52500,
            "GOL_II": 80000,
            "GOL_III": 80000,
            "GOL_IV": 106000,
            "GOL_V": 106000,
        }
    }
}
```

### 2. 20+ Sumatra Transport Choke-Points Definition (`intermodal_sync_service.py`)
```python
SUMATRA_CHOKE_POINTS = [
    # 7 Maritime & Ferry Terminals
    {"id": "PORT_BELAWAN", "name": "Pelabuhan Belawan", "type": "SEAPORT", "coords": [98.6776, 3.7922], "province": "Sumatera Utara", "capacity_vessels": 40},
    {"id": "PORT_BAKAUHENI", "name": "Pelabuhan Penyeberangan Bakauheni", "type": "FERRY_TERMINAL", "coords": [105.7533, -5.8711], "province": "Lampung", "capacity_vessels": 60},
    {"id": "PORT_DUMAI", "name": "Pelabuhan Dumai", "type": "SEAPORT", "coords": [101.4533, 1.6811], "province": "Riau", "capacity_vessels": 35},
    {"id": "PORT_TELUK_BAYUR", "name": "Pelabuhan Teluk Bayur", "type": "SEAPORT", "coords": [100.3700, -0.9980], "province": "Sumatera Barat", "capacity_vessels": 30},
    {"id": "PORT_PANJANG", "name": "Pelabuhan Panjang", "type": "SEAPORT", "coords": [105.3167, -5.4667], "province": "Lampung", "capacity_vessels": 30},
    {"id": "PORT_SIBOLGA", "name": "Pelabuhan Sibolga", "type": "SEAPORT", "coords": [98.7800, 1.7400], "province": "Sumatera Utara", "capacity_vessels": 20},
    {"id": "PORT_KUALA_TANJUNG", "name": "Pelabuhan Kuala Tanjung", "type": "SEAPORT", "coords": [99.4450, 3.3650], "province": "Sumatera Utara", "capacity_vessels": 25},
    
    # 11 Critical Mountain Passes & Road Conjunctions
    {"id": "PASS_SITINJAU_LAUIK", "name": "Tanjakan Sitinjau Lauik", "type": "MOUNTAIN_PASS", "coords": [100.5186, -0.9458], "province": "Sumatera Barat", "hazard_type": "LANDSLIDE_STEEP_GRADE"},
    {"id": "PASS_KELOK_9", "name": "Kelok 9 Payakumbuh", "type": "MOUNTAIN_PASS", "coords": [100.6978, -0.1419], "province": "Sumatera Barat", "hazard_type": "VALLEY_BOTTLENECK"},
    {"id": "PASS_MALALAK", "name": "Jalur Lingkar Malalak", "type": "MOUNTAIN_PASS", "coords": [100.2789, -0.3242], "province": "Sumatera Barat", "hazard_type": "FLASH_FLOOD_LANDSLIDE"},
    {"id": "PASS_TARUTUNG_SIBOLGA", "name": "Batu Lubang Tarutung-Sibolga", "type": "MOUNTAIN_PASS", "coords": [98.8800, 1.8800], "province": "Sumatera Utara", "hazard_type": "ROCKFALL_HAIRPIN"},
    {"id": "JUNCTION_TEBING_TINGGI", "name": "Interchange Tebing Tinggi", "type": "TOLL_HIGHWAY_JUNCTION", "coords": [99.1625, 3.3285], "province": "Sumatera Utara", "hazard_type": "CONVERGENCE_CONGESTION"},
    {"id": "JUNCTION_DURI_KANDIS", "name": "Simpang Duri - Kandis", "type": "FREIGHT_CORRIDOR", "coords": [101.2500, 1.0500], "province": "Riau", "hazard_type": "HEAVY_TANKER_CONGESTION"},
    {"id": "JUNCTION_BETUNG_PALEMBANG", "name": "Bottleneck Betung - Palembang", "type": "HIGHWAY_BOTTLENECK", "coords": [104.5100, -2.8500], "province": "Sumatera Selatan", "hazard_type": "SINGLE_LANE_CHOKE"},
    {"id": "JUNCTION_TERBANGGI_BESAR", "name": "Interchange Terbanggi Besar", "type": "TOLL_HIGHWAY_JUNCTION", "coords": [105.1800, -4.8500], "province": "Lampung", "hazard_type": "CORRIDOR_FORK"},
    {"id": "JUNCTION_MUARA_TEMBESI", "name": "Simpang Muara Tembesi", "type": "FREIGHT_CORRIDOR", "coords": [103.1200, -1.7800], "province": "Jambi", "hazard_type": "COAL_FREIGHT_GRIDLOCK"},
    {"id": "PASS_CURUP_KEPAHIANG", "name": "Lintas Curup - Kepahiang", "type": "MOUNTAIN_PASS", "coords": [102.5500, -3.5500], "province": "Bengkulu", "hazard_type": "FOG_LANDSLIDE"},
    {"id": "PASS_SEULAWAH", "name": "Lintas Gunung Seulawah", "type": "MOUNTAIN_PASS", "coords": [95.6600, 5.4200], "province": "Aceh", "hazard_type": "MOUNTAIN_HAIRPIN"}
]
```
</code_examples>

## Validation Architecture

Nyquist automated validation guarantees that all deliverables in Phase 44 are thoroughly verified across unit tests, service integration tests, API assertions, and frontend build cleanliness:

### Automated Test Matrix (`backend/tests/test_intermodal_hedging_compliance.py`)
1. `test_chokepoints_initialization_and_count`: Verify all 18+ Pan-Sumatra choke-points are initialized with valid coordinates and classifications.
2. `test_intermodal_delay_multiplier_bounds`: Assert $M_{\text{intermodal}}$ is strictly bounded between $1.0$ and $3.5$.
3. `test_bpjt_toll_lookup_accuracy`: Verify exact toll tariffs across Golongan II–V for all Sumatra toll segments.
4. `test_dynamic_fuel_modulation_with_inflation`: Test fuel cost adjustments based on Market Regime shock factors.
5. `test_4_tier_perishability_decay_rates`: Assert exponential decay rankings: $\text{ValueLoss}_{\text{ultra}} > \text{ValueLoss}_{\text{cold}} > \text{ValueLoss}_{\text{semi}} > \text{ValueLoss}_{\text{dry}}$.
6. `test_hedging_cost_solver_optimal_policy_selection`: Test scenarios where Continue, Reroute, and Hold each become the optimal policy.
7. `test_bkhit_quarantine_hard_block_inter_island`: Verify hard block triggered on missing certificates for inter-island routes.
8. `test_mst_axle_load_tactical_warning_class_iii`: Verify tactical warning and reroute advice for >8 Ton trucks on Class III roads.
9. `test_surat_jalan_manifest_hash_verification`: Validate delivery order verification matching driver, vehicle, and manifest hash.
10. `test_api_endpoints_status_and_contracts`: Verify `GET /api/v1/intermodal/chokepoints`, `POST /api/v1/intermodal/hedging/solve`, `POST /api/v1/intermodal/compliance/verify`.

### Frontend Build Gate
- `npm run build` cleanly compiling with 0 TypeScript and lint errors (7/7 static routes).
