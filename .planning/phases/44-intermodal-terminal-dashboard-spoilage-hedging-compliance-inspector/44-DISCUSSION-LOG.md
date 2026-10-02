# Phase 44: Intermodal Terminal Dashboard, Spoilage Hedging & Compliance Inspector - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-01
**Phase:** 44-intermodal-terminal-dashboard-spoilage-hedging-compliance-inspector
**Areas discussed:** Economic Hedging Rates & Dynamic Data, Pan-Sumatra Choke-Points Scope, Digital Compliance Enforcement (MST & BKHIT), UI Placement & Ergonomics

---

## 1. Economic Hedging Rates & Spoilage Valuation Model

| Option | Description | Selected |
|--------|-------------|----------|
| Full Dynamic Model | BPJT Real Toll Tariffs by Golongan (II–V), Pertamina real fuel rates modulated by Market Regime inflation shock, and PIHPS spot cargo valuation. | ✓ |
| Static Constants | Hardcoded toll per km (IDR 1,500/km) and flat fuel cost (IDR 12,000/L) with static cargo values. | |
| Hybrid Model | Real BPJT toll tables and Pertamina base rates with fixed cargo valuations. | |

**User's choice:** Full Dynamic Model with real-time dynamic rates based on live market conditions.
**Notes:** User emphasized making the rates realistic and grounded in live data, avoiding synthetic constants. Toll rates mapped by vehicle classification (Golongan II–V) and dynamic commodity spot pricing pulled from PIHPS.

---

## 2. Pan-Sumatra Transport Hubs & Choke-Points Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-Hub Matrix (20+ Choke-Points) | 7 Sea/Ferry Terminals (Belawan, Bakauheni, Dumai, Teluk Bayur, Panjang, Sibolga, Kuala Tanjung) + 11 High-Risk Mountain/Toll Conjunctions (Sitinjau Lauik, Kelok 9, Malalak, Tebing Tinggi, Betung, etc.) fused with live TomTom and BMKG. | ✓ |
| Ports Only | Track only 2 ports: Pelabuhan Belawan and Bakauheni Ferry Gateway. | |
| Maritime Only | Track all 7 sea and river ports across Sumatra without inland road conjunctions. | |

**User's choice:** Multi-Hub Matrix (>20 strategic conjunctions and choke-points across Sumatra).
**Notes:** User specifically instructed not to stop at Belawan and Bakauheni, pointing out that Phase 33–34 expanded the platform's scope to Pan-Sumatra island-wide corridors with over 20 key transit conjunctions.

---

## 3. Digital Compliance Enforcement (MST & BKHIT)

| Option | Description | Selected |
|--------|-------------|----------|
| Differentiated Enforcement | Hard Block on missing BKHIT quarantine certificates for inter-island routes; Warning + Reroute recommendation on MST Axle-Load (allowing operator override with liability acknowledgment). | ✓ |
| Strict Block | Hard block on both MST axle-load violations and missing quarantine certificates. | |
| Advisory Only | Soft warnings on both quarantine and weight violations without dispatch restrictions. | |

**User's choice:** Differentiated Enforcement.
**Notes:** Missing BKHIT quarantine certificates cannot cross inter-island water gateways (legal barrier), while axle-load warnings advise against alternative rural roads (Class III) with detour routing options.

---

## 4. UI Ergonomics & Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Embedded Mitigation Tab & TopNav HUD | Spoilage Hedging comparison matrix and Compliance Inspector badges in CrisisSidebar (`MitigationTab.tsx`), with terminal status quick popover in `TopNavTelemetry.tsx`. | ✓ |
| Separate Modal View | Dedicated standalone modal dialog opened from bottom floating action button. | |

**User's choice:** Embedded Mitigation Tab & TopNav HUD.
**Notes:** Keeps high-density tactical metrics accessible during incident triage without losing map context. Adheres to zero-emoji design system and dark glassmorphic styling.

---

## the agent's Discretion

- In-memory/SQLite caching for BPJT toll lookup tables and PIHPS spot commodity cache TTL (5-minute refresh).
- Color-coded policy indicator badge highlights (Green for optimal policy, Amber for suboptimal, Red for highest exposure).

## Deferred Ideas

- **Automated Electronic Toll Payment (E-Toll/MLFF) Simulation**: Automated transaction webhook for Jasa Marga/Hutama Karya toll gates deferred to future enterprise iteration.
- **Physical Weigh-in-Motion (WIM) IoT Sensor Streaming**: Direct sensor hardware ingestion for Jembatan Timbang deferred to future hardware integration phase.
