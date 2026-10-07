# Phase 40 Learnings: Dedicated Evaluation & Benchmark Dashboard

## Key Insights & Discoveries

1. **Native SVG vs. Charting Packages**:
   - Building `ReliabilityDiagram.tsx` with native React SVG elements allowed us to keep the frontend bundle completely free of external charting packages (`recharts`, `chartjs`), avoiding version mismatches and hydration issues.
   - The native SVG approach gave us full CSS token control over Tailwind colors (`#0c0e12`, `#10b981`, `#00f0ff`) and crisp high-DPI scaling.

2. **Test Inventory Discrepancy & Ground Truth**:
   - During evaluation router development, inspecting the test inventory revealed 83 test items rather than the initial 81 estimate, due to expanded tests under FR-4 (OSINT news extraction).
   - Syncing the backend test parser directly with the actual test suite eliminated inconsistencies before the final academic defense.

3. **Multi-Section State Preservation in Next.js**:
   - By rendering sections conditionally using `${activeSection === '...' ? 'block' : 'hidden'}` rather than full page unmounting, the Mapbox WebGL canvas, active vehicle tracking loop, and WebSocket subscriptions remain alive in memory across tab switches with zero latency.
