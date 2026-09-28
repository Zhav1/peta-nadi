# 44-CONTEXT: Phase 44 Context & Design Decisions

**Phase:** Phase 44: Intermodal Terminal Dashboard, Spoilage Hedging & Compliance Inspector  
**Milestone:** M3 - PreHub MVP Pilot Operations & Multi-Persona Dispatcher Platform  
**Status:** READY FOR PLANNING 📋  
**Author:** Pair Programming Agent & Solo Developer  
**Date:** 2026-09-28  

---

## 1. Executive Summary & Goals

Phase 44 equips PreHub with end-to-end multi-modal logistics resilience mechanisms:
1. **Intermodal Sea-Land Terminal Synchronization (`intermodal_router.py` & `intermodal_sync_service.py`)**: Real-time port gate choke-point tracking for Belawan Port and Bakauheni Ferry Gateway, fusing AIS vessel roadstead queues with incoming Trans-Sumatra highway truck arrivals to calculate terminal dwelling times and dynamic intermodal delay multipliers ($M_{\text{intermodal}} = 1.0 + 0.15 \times N_{\text{anchored vessels}}$).
2. **Operational Spoilage Hedging & Economic Cost-Benefit Calculator (`spoilage_hedging_service.py`)**: Mathematical comparison of monetary exposure across three tactical mitigation policies ($\text{Continue}$ vs $\text{Reroute}$ vs $\text{Hold}$) factoring commodity perishability half-life ($T_{\text{spoil}}$), Trans-Sumatra toll tariffs, fuel rates, and cold-chain genset diesel costs.
3. **Digital Manifest & Agricultural Quarantine Compliance Inspector (`compliance_service.py`)**: Automated verification of *Surat Jalan*, *Sertifikat Karantina Pertanian (BKHIT)*, and axle-load limits (*Muatan Sumbu Terberat / MST*) for detour routes.
4. **Operator-First Minimalist UI Ergonomics**: Seamlessly embedded into `CrisisSidebar` (Mitigation Tab) and Top Telemetry Popovers using monochrome Lucide SVG icons, zero emojis, and dark glassmorphic styling.

---

## 2. Locked Architectural & Design Decisions

### A. UI Placement & UX Architecture
- **Decision:** Embed the Spoilage Hedging Cost Matrix and Compliance Badges directly inside `CrisisSidebar.tsx` (`MitigationTab.tsx`) and provide quick terminal metrics in `TopNavTelemetry.tsx`.
- **Rationale:** Keeps high-density tactical metrics at the dispatcher's fingertips during incident triage without requiring context-switching away from the operational map.
- **Design System Rules:**
  - Zero emojis (100% monochrome Lucide SVG icons: `Ship`, `ShieldAlert`, `DollarSign`, `Clock`, `ThermometerSnowflake`, `FileText`, `Scale`).
  - High-contrast Glassmorphic containers (`backdrop-blur-md bg-[#13161c]/90 border border-white/10`).
  - Strict operator typography and monospaced numeric formatting.

### B. Commodity Perishability Classification Model
- **Decision:** Implement a 4-Tier Perishability Decay Model:
  1. **Ultra-Perishable ($T_{\text{spoil}} = 36\text{h} - 48\text{h}$):** Cabai Merah, Tomat, Sayuran Daun Segar (Perishability decay rate $\delta = 0.025/\text{hour}$).
  2. **Cold-Chain Controlled ($T_{\text{spoil}} = 72\text{h}$):** Daging Sapi, Ayam, Ikan Segar, Produk Olahan Susu ($\delta = 0.015/\text{hour}$ if reefer fails, genset cost IDR 45.000/jam).
  3. **Semi-Perishable ($T_{\text{spoil}} = 120\text{h}$):** Bawang Merah, Bawang Putih, Kentang, Umbi-umbian ($\delta = 0.008/\text{hour}$).
  4. **Non-Perishable Dry Bulk ($T_{\text{spoil}} = 720\text{h}+$):** Beras SPHP, Minyak Goreng Kemasan, Gula Pasir, Tepung ($\delta = 0.0005/\text{hour}$).
- **Formula:**
  $$\text{ValueLoss}(t) = \text{CargoValue} \times \left(1 - e^{-\delta \cdot \text{DelayHours}}\right)$$

### C. Financial Cost Matrix Solver Formulation
- **Policy 1: CONTINUE (Risk Exposure)**
  $$\text{Cost}(\text{Continue}) = P(\text{Disruption}) \times \text{ValueLoss}(\text{DelayHours}) + \text{DowntimeFee}$$
- **Policy 2: REROUTE (Active Detour Mitigation)**
  $$\text{Cost}(\text{Reroute}) = \Delta\text{Distance} \times \text{FuelRate} + \text{TollTariff} + \Delta\text{Time} \times \text{DriverOvertime}$$
- **Policy 3: HOLD (Safe Staging at Hub/Depot)**
  $$\text{Cost}(\text{Hold}) = \text{WaitHours} \times (\text{ReeferDieselCost} + \text{DepotParkingFee})$$
- **Policy Recommendation:** Automatically highlight the policy with the minimum monetary loss ($\min(\text{Cost}_{\text{continue}}, \text{Cost}_{\text{reroute}}, \text{Cost}_{\text{hold}})$) with clear Indonesian reasoning and ROI comparison.

### D. Digital Compliance Inspector & Road Class Constraints
- **Surat Jalan Verification:** Validate Delivery Order metadata (Vehicle Plate, Driver Phone, Manifest Hash).
- **BKHIT Agricultural Quarantine:** Mandatory phytosanitary certificate check for inter-island commodities (e.g. Belawan $\leftrightarrow$ Batam / Dumai or Bakauheni $\leftrightarrow$ Merak).
- **Axle-Load / MST Validation:**
  - *Jalinsum Utama (Arteri Primer / Tol Trans-Sumatera):* MST Kelas I / II $\le 10$ Ton $\to$ Allowed for Tronton / Fuso.
  - *Jalur Alternatif / Kolektor (e.g. Jalur Lingkar Alternatif Malalak / Dairi):* MST Kelas III $\le 8$ Ton $\to$ Warning if vehicle weight exceeds 8 Ton.

---

## 3. Scope Boundaries

### In Scope for Phase 44:
- Backend services: `intermodal_sync_service.py`, `spoilage_hedging_service.py`, `compliance_service.py`.
- Backend routers: `intermodal_router.py` registered in `app/main.py` (`/api/v1/intermodal/*`).
- Frontend components: `IntermodalTerminalPopover.tsx`, `SpoilageHedgingCard.tsx`, `ComplianceBadge.tsx` in `CrisisSidebar.tsx` / `MitigationTab.tsx`.
- Pytest automated test suite for all intermodal equations, hedging cost solvers, and compliance rules.
- 0 TypeScript / Lint build errors on `next build`.

### Deferred to Phase 45 (Pilot Verification & Packaging):
- End-to-end full pilot operational cycle drill (`test_pilot_e2e.py`).
- Docker Compose multi-container staging hardening.
- Pilot Onboarding & User Manual compilation (`docs/PreHub_Pilot_Onboarding_Manual.md`).

---

## 4. Verification Checklist

- [ ] `GET /api/v1/intermodal/terminal-status` returns live queue metrics and intermodal delay multiplier for Belawan & Bakauheni.
- [ ] Spoilage hedging calculator dynamically calculates monetary costs for Continue vs Reroute vs Hold across all 4 commodity perishability tiers.
- [ ] Compliance inspector correctly flags overweight trucks on Class III roads and missing BKHIT certificates.
- [ ] `MitigationTab.tsx` in `CrisisSidebar` renders the Spoilage Hedging Card and Compliance Inspector with 100% minimalist SVG icons and zero emojis.
- [ ] Full backend test suite passes with 120+ tests.
- [ ] `npm run build` compiles with zero errors (7/7 static routes).
