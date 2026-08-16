# CONTEXT — Phase 31: PreHub Rebranding, Proposal MVP Alignment & Technical Documentation

## Overview
- **System Name**: **PreHub** (Sistem Peringatan Dini dan Rekomendasi Mitigasi Gangguan Distribusi Pangan Berbasis Data Multisumber)
- **Primary Domain**: Food supply chain distribution resilience & early warning mitigation system (Sumatra food logistics corridor)
- **User Personas**: Operations Coordinator / Logistics Dispatcher, B2G food logistics authorities (BULOG, DISHUB, BNPB)

## Key Alignment Decisions from Proposal
1. **Rebranding**: Replace "PetaNadi" and "LRIP" with "PreHub" across UI, metadata, API configurations, agent prompts, reports, and documentation.
2. **Core Loop & Architecture**:
   - Data Ingestion (BMKG, TomTom, FourCastNet signals, OSINT/News) -> Evidence Object
   - Consensus Engine: Multi-source corroboration, evidence confidence vs disruption probability
   - Operational Risk: $f(\text{Disruption Probability}, \text{Operational Impact})$
   - Mitigation Engine: Continue / Reroute / Hold/Delay
   - Evidence Chain: Transparent trace for human-in-the-loop decision makers
3. **Dokumen Pendukung (Technical Document)**:
   - Max 30-page comprehensive installation and user guide in Indonesian
   - Architectural and structural features (C4 / modular topology)
   - Functional descriptions across all multi-agent modules and data pipelines
   - High-resolution Playwright automated screenshots embedded
