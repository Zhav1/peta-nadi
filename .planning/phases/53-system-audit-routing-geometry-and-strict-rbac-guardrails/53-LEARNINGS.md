# Phase 53: Learnings, Trade-offs & Post-Audit Discoveries

## 1. Architectural Learnings & Takeaways

### A. Coordinate Accuracy is a Non-Negotiable Routing Constraint
- **Observation**: A single misplaced coordinate for Tebing Tinggi (`[98.9560, 3.5680]`, which was actually Perbaungan) ruined the entire mathematical detour engine for Deli Serdang flood simulations.
- **Learning**: When testing geometric routing algorithms, origin and destination coordinates must be rigorously verified against real-world geography before diagnosing algorithmic failure. If a destination is mathematically inside the disaster radius, no avoidance algorithm can ever find a clean path.

### B. Fallback Behavior Must Never Revert to Compromised States
- **Observation**: The previous routing engine attempted 5 candidate junction nodes, and when all 5 intersected the flood polygon, it fell back to copying the original flooded route's waypoints into an amber `HOLD_DELAY` card.
- **Learning**: An AI copilot or routing engine must never recommend a flooded path as the active primary line on the map. The introduction of tangential orthogonal offset vectors $(r + 6\text{ km})$ ensures the engine calculates a novel geometric bypass even when pre-indexed junction nodes are compromised.

### C. The Danger of "Demo-Friendly" Security Fallbacks
- **Observation**: To ensure zero-friction demonstrations for evaluators and competition judges, authentication had devolved into auto-minting guest sessions and decoding JWTs with `verify_signature=False`.
- **Learning**: While competition judges appreciate 1-click persona switching, blurring the boundary between production security and demo mode leaves massive plotholes (unauthenticated role escalation, fake logins with arbitrary credentials). The correct pattern is an **explicit preview/evaluation banner** (`/dashboard?guest=1`) paired with strict cryptographic token enforcement on mutation APIs.

---

## 2. Identified Post-Audit Backlog (Documented for Next Context Window)

As documented in `NEXT_CONTEXT_TASKS.md`, the following trade-offs and edge cases remain queued for resolution in the next context window:

1. **`delayMinutes` Delta Semantics**:
   - `applyOperationalImpact` currently receives total `eta_minutes` rather than the incremental delay delta. Must be refined to `Math.max(0, eta_minutes - baselineEta)`.
2. **State Overwrite by 30-Second Poller**:
   - `useCorridorContext` polls `/api/v1/corridor/context` every 30 seconds, which wipes out the local `applyOperationalImpact` recalculation. The hook must maintain an `activeImpact` state that persists on top of background polling.
3. **Sensor Status Fallback Branch**:
   - `corridorContext.weather` is always truthy because of the default fallback object, making the sidebar's `'FALLBACK'` badge state unreachable. A dedicated `is_fallback: boolean` flag is required.
4. **Predictive Incident 404 Pre-Check**:
   - Clicking predictive risk items triggers a guaranteed 404 against the standard incidents table before falling back. A prefix check (`id.startsWith('pred-')`) will eliminate this unnecessary network error.
