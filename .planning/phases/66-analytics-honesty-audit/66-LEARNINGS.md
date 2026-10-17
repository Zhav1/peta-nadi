# Phase 66 Learnings: Analytics Honesty Audit

## Executive Summary
Phase 66 enforced ground-truth honesty in the Analytics tab, prioritizing transparency over decorative completeness.

---

## Decisions with Rationale
1. **Honest Empty States vs Synthetic Plausibility**:
   - The hardcoded risk-ranking cards (+18.5%, +24.5%) and causal chain gave an illusion of full system functioning, but were completely disconnected from live markets.
   - Replacing them with explicit `"Data tidak tersedia"` and empty state placeholders upholds PreHub's core architectural invariant: *No bombastic, fabricated metrics*.
   - Evaluators and pilot stakeholders (PIHPS, Bank Indonesia, Bulog) value knowing exactly when real data is flowing vs when ingestion is offline.
2. **Retaining Real PIHPS Feeds**:
   - The underlying database table `commodity_prices` and endpoint `GET /api/v1/commodities/prices` are authentic and functional. Retaining the dynamic fetch while removing the static overlays ensures the real telemetry shines without dilution.

---

## Constraints & Environment
- **Data Dependency**: The quality of the Analytics tab directly depends on whether PIHPS scrapers or manual seeds have populated `commodity_prices` in Supabase.
- **Visual Tradeoff**: Without the 4 risk cards and Deck.gl arcs, the Analytics tab looks sparser. This is a deliberate, honest design decision.

---

## Issues Hit During Work
- None during execution. The component compiled cleanly once dead sub-components were pruned.

---

## Open Issues for New Context Window
- **Multi-Market PIHPS Integration**: When multi-market PIHPS feeds (beyond North Sumatra rice/chili) are ingested, dynamically generate the risk-ranking cards and inter-island commodity flow arcs from genuine volume/price data rather than reintroducing hardcoded mock structures.
