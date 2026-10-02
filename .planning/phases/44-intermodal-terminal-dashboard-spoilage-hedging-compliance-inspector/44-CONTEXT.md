# Phase 44: Intermodal Terminal Dashboard, Spoilage Hedging & Compliance Inspector - Context

**Gathered:** 2026-10-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 44 equips PreHub with end-to-end multi-modal logistics resilience mechanisms across Pan-Sumatra:
1. **Pan-Sumatra Intermodal Sea-Land Terminal & Choke-Point Synchronization (`intermodal_router.py` & `intermodal_sync_service.py`)**: Real-time monitoring across 20+ strategic Sumatra transport hubs (7 major maritime/ferry terminals and 11 high-risk mountain/toll conjunction bottlenecks), fusing AIS vessel roadstead queues, incoming highway truck arrivals, live TomTom traffic flow, and BMKG weather alerts to calculate terminal dwelling times and dynamic intermodal delay multipliers ($M_{\text{intermodal}} = 1.0 + 0.15 \times N_{\text{queue}} \times \text{SeverityFactor}$).
2. **Operational Spoilage Hedging & Dynamic Economic Cost-Benefit Calculator (`spoilage_hedging_service.py`)**: Closed-form mathematical comparison of monetary exposure across three tactical mitigation policies ($\text{Continue}$ vs $\text{Reroute}$ vs $\text{Hold}$), featuring dynamic BPJT toll tariffs by vehicle class (Golongan II–V), real Pertamina benchmark fuel rates modulated by Market Regime inflation shock, and PIHPS spot commodity valuations across a 4-Tier Perishability Decay Model.
3. **Digital Cargo Manifest & Quarantine Compliance Inspector (`compliance_service.py`)**: Automated verification of *Surat Jalan*, *Sertifikat Karantina Pertanian (BKHIT)*, and axle-load limits (*Muatan Sumbu Terberat / MST*) with differentiated enforcement (hard block on missing inter-island quarantine certificates, tactical warning and reroute advisory on MST axle-load violations).
4. **Operator-First Minimalist UI Ergonomics**: Seamlessly embedded into `CrisisSidebar.tsx` (`MitigationTab.tsx`) and `TopNavTelemetry.tsx` popovers using monochrome Lucide SVG icons, zero emojis, and dark glassmorphic styling.

</domain>

<decisions>
## Implementation Decisions

### 1. Dynamic Economic Rates & Spoilage Valuation
- **D-01 (Full Dynamic Model):** Spoilage hedging calculations must NOT rely on static constants. The cost matrix solver dynamically computes:
  - **BPJT Toll Tariffs:** Real per-segment tariffs based on vehicle golongan (Golongan II/III: medium trucks/fuso; Golongan IV/V: tronton/heavy multi-axle trailers) across Sumatra toll roads (Bakauheni–Terbanggi Besar, Terbanggi Besar–Kayu Agung, Kayu Agung–Palembang, Pekanbaru–Dumai, Medan–Kualanamu–Tebing Tinggi, Belmera, Sigli–Banda Aceh).
  - **Fuel Rates (BBM):** Pertamina base benchmark rates (Biosolar subsidi IDR 6,800/L, Dexlite IDR 14,550/L, Pertamina Dex IDR 15,100/L), dynamically modulated by the active Market Regime / inflation shock factor from `news_aggregator.py`.
  - **Dynamic Cargo Valuation:** Base cargo values derived dynamically from PIHPS / Bank Indonesia spot commodity prices ($\text{CargoValue} = \text{Tonnage} \times \text{SpotPrice}$) via `commodity_router.py`.
- **D-02 (4-Tier Perishability Decay Model):**
  - **Ultra-Perishable ($T_{\text{spoil}} = 36\text{h}-48\text{h}$):** Cabai Merah, Tomat, Sayuran Daun Segar ($\delta = 0.025/\text{hour}$).
  - **Cold-Chain Controlled ($T_{\text{spoil}} = 72\text{h}$):** Daging Sapi, Ayam, Ikan Segar, Produk Olahan Susu ($\delta = 0.015/\text{hour}$ if reefer fails, genset diesel cost IDR 45,000/jam).
  - **Semi-Perishable ($T_{\text{spoil}} = 120\text{h}$):** Bawang Merah, Bawang Putih, Kentang, Umbi-umbian ($\delta = 0.008/\text{hour}$).
  - **Non-Perishable Dry Bulk ($T_{\text{spoil}} = 720\text{h}+$):** Beras SPHP, Minyak Goreng Kemasan, Gula Pasir, Tepung ($\delta = 0.0005/\text{hour}$).
  - Formula: $\text{ValueLoss}(t) = \text{CargoValue} \times (1 - e^{-\delta \cdot \text{DelayHours}})$.
- **D-03 (Mitigation Cost Formulas):**
  - $\text{Cost}(\text{Continue}) = P(\text{Disruption}) \times \text{ValueLoss}(\text{DelayHours}) + \text{DowntimeFee}$
  - $\text{Cost}(\text{Reroute}) = \Delta\text{Distance} \times \text{DynamicFuelRate} + \text{BPJTTollTariff} + \Delta\text{Time} \times \text{DriverOvertime}$
  - $\text{Cost}(\text{Hold}) = \text{WaitHours} \times (\text{ReeferDieselCost} + \text{DepotParkingFee})$
  - Optimal recommendation automatically highlights $\min(\text{Cost}_{\text{continue}}, \text{Cost}_{\text{reroute}}, \text{Cost}_{\text{hold}})$ with net savings vs Continue policy.

### 2. Pan-Sumatra Multi-Hub Matrix (20+ Choke-Points)
- **D-04 (Scope Expansion):** Expand intermodal tracking from 2 ports to the full Pan-Sumatra transit network (>20 hubs):
  - **7 Maritime / Ferry Gateways:** Pelabuhan Belawan (Medan), Pelabuhan Bakauheni (Lampung), Pelabuhan Dumai (Riau), Pelabuhan Teluk Bayur (Padang), Pelabuhan Panjang (Bandar Lampung), Pelabuhan Sibolga (Sumut Barat), Pelabuhan Kuala Tanjung (Batubara).
  - **11 High-Risk Mountain & Highway Bottlenecks:** Sitinjau Lauik (Padang–Solok pass), Kelok 9 (Payakumbuh–Riau pass), Malalak Pass (Bukittinggi bypass), Tarutung–Sibolga Pass, Tebing Tinggi Interchange, Simpang Duri–Kandis, Betung–Palembang bottleneck, Terbanggi Besar Interchange, Muara Tembesi Junction, Curup–Kepahiang Pass, Seulawah Pass.
- **D-05 (Real Data Fusion & Queuing Formula):**
  - Choke-points fuse live TomTom traffic flow, BMKG spatial weather alerts, and active vehicle telemetry from `telemetry_service.py`.
  - Dynamic delay multiplier: $M_{\text{intermodal}} = 1.0 + 0.15 \times N_{\text{queue}} \times \text{SeverityFactor}$ (clamped between 1.0 and 3.5).
  - Hub operational statuses: `NORMAL`, `CONGESTED`, `RESTRICTED`, `BLOCKED`.

### 3. Compliance & Axle-Load (MST) Enforcement
- **D-06 (Differentiated Enforcement):**
  - **BKHIT Agricultural Quarantine:** Mandatory phytosanitary certificate check for inter-island commodities (e.g. Belawan $\leftrightarrow$ Batam / Dumai or Bakauheni $\leftrightarrow$ Merak). Missing certificate triggers a **Hard Block** (dispatch prohibited until certified).
  - **Axle-Load / MST Validation:**
    - *Jalinsum Utama (Arteri Primer / Tol Trans-Sumatera):* MST Kelas I / II $\le 10$ Ton $\to$ Allowed for Tronton / Fuso.
    - *Jalur Alternatif / Kolektor (e.g. Jalur Lingkar Alternatif Malalak / Dairi):* MST Kelas III $\le 8$ Ton $\to$ Generates a **Tactical Warning & Reroute Advisory** (highlighting road weight limits while allowing operator override with logged liability acknowledgment).
  - **Surat Jalan Verification:** Validates Delivery Order metadata (Vehicle Plate, Driver Phone, Manifest Hash, Cargo Commodity).

### 4. UI Ergonomics & Component Architecture
- **D-07 (Glassmorphic Embeds):**
  - Spoilage Hedging comparison matrix embedded in `CrisisSidebar.tsx` (`MitigationTab.tsx`) alongside routing recommendations.
  - Digital Compliance Inspector rendered as an expandable verification badge strip in `MitigationTab.tsx`.
  - Terminal & Choke-point quick status popover added to `TopNavTelemetry.tsx` and interactive map tooltips on hover over strategic hubs.
  - 100% monochrome Lucide SVG icons (`Ship`, `ShieldAlert`, `Scale`, `FileText`, `DollarSign`, `Clock`, `ThermometerSnowflake`), zero emojis, and `cursor-pointer` on all interactive triggers.

### the agent's Discretion
- Database caching schema for BPJT toll lookup tables and PIHPS spot cache intervals (5-minute TTL).
- Specific color indicators for the 3 mitigation policies (Green for optimal policy, Amber for suboptimal, Red for highest financial risk).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Strategic Scope & Requirements
- `.planning/PROJECT.md` — Core platform architecture and Pan-Sumatra operational boundary
- `.planning/REQUIREMENTS.md` §FR-17 to FR-19 — Functional requirements for Intermodal Sync, Spoilage Hedging, and Digital Compliance
- `.planning/ROADMAP.md` §Phase 44 — Milestone deliverables and success criteria

### Baseline Services & Telemetry
- `backend/app/services/telemetry_service.py` — `SUMATRA_STRATEGIC_HUBS` coordinate dictionary and unified fleet telemetry
- `backend/app/routers/commodity_router.py` — PIHPS commodity price structures and volatility tracking
- `backend/app/services/news_aggregator.py` — Market Regime classification and inflation shock index
- `backend/app/services/weather_fusion_service.py` — BMKG weather fusion and spatial alerts
- `backend/app/services/cuopt_tomtom_service.py` — TomTom traffic flow lines and congestion levels

### Frontend Ergonomics & Design System
- `.agents/skills/ui-ux-pro-max/` — Glassmorphism, typography, and zero-emoji non-AI anti-pattern standards
- `frontend/components/sidebar/MitigationTab.tsx` — Current mitigation view and action plan dispatchers
- `frontend/components/dashboard/TopNavTelemetry.tsx` — Top navigation telemetry popover triggers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SUMATRA_STRATEGIC_HUBS` (`backend/app/services/telemetry_service.py`): 40+ strategic hub coordinates across all 8 Sumatra mainland provinces.
- `local_storage.py` (`backend/app/db/local_storage.py`): SQLite persistence helper functions for local ACID state and audit logging.
- `GlassPanel.tsx` & `Toast.tsx` (`frontend/components/ui/`): High-contrast glassmorphic primitives for HUD cards.
- `useFleetVehicles` hook (`frontend/hooks/useFleetVehicles.ts`): Live vehicle telemetry and asset status feed.

### Established Patterns
- Pydantic v2 schemas in `backend/app/schemas/` with strict type annotations and OpenAPI docstrings.
- FastAPI APIRouter modular registration in `backend/app/main.py`.
- Tailwind CSS styling with `backdrop-blur-md bg-[#0c0e12]/80 border border-white/10`.
- Zero-emoji rule enforced with Lucide React SVG icons.

### Integration Points
- `backend/app/main.py`: Register `intermodal_router.py` with prefix `/api/v1/intermodal`.
- `backend/app/services/telemetry_service.py`: Expose choke-point and port status queries.
- `frontend/components/sidebar/MitigationTab.tsx`: Embed `SpoilageHedgingCard.tsx` and `ComplianceBadge.tsx`.
- `frontend/components/dashboard/TopNavTelemetry.tsx`: Integrate `IntermodalTerminalPopover.tsx`.

</code_context>

<specifics>
## Specific Ideas

- Dynamic economic rates must feel grounded in real Indonesian logistics realities (BPJT Golongan II-V tariffs and Pertamina Solar/Dexlite fuel indices).
- Choke-point monitoring must cover real geographical hazard points well-known to Sumatra truck drivers (Sitinjau Lauik, Kelok 9, Malalak, Betung).
- Financial comparison card should clearly display "Net Loss Prevention" in Indonesian Rupiah (IDR) when recommending Reroute or Hold over Continue.

</specifics>

<deferred>
## Deferred Ideas

- **Automated Electronic Toll Payment (E-Toll/MLFF) Simulation**: Automated transaction webhook for Jasa Marga/Hutama Karya toll gates deferred to future enterprise iteration.
- **Physical Weigh-in-Motion (WIM) IoT Sensor Streaming**: Direct sensor hardware ingestion for Jembatan Timbang deferred to future hardware integration phase.

</deferred>

---

*Phase: 44-intermodal-terminal-dashboard-spoilage-hedging-compliance-inspector*
*Context gathered: 2026-10-01*
