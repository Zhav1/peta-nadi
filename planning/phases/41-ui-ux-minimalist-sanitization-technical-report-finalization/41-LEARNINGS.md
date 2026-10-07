# Phase 41 Learnings & Engineering Retrospective

## Key Technical Takeaways

1. **Deterministic vs. Speculative Tech Stack Positioning**:
   - Aligning product claims with actual working code (NetworkX CPU Dijkstra and Google OR-Tools VRP vs. NVIDIA cuOpt) creates a rock-solid defense foundation. The sub-2ms latency on standard CPU environments demonstrates exceptional efficiency without requiring specialized GPU hardware.

2. **Strict UI/UX Non-AI Design Standards**:
   - Eliminating Unicode emojis in favor of crisp SVG Lucide icons instantly elevates the visual professionalism of industrial command center interfaces.
   - Enforcing explicit `cursor-pointer` classes across all interactive items avoids ambiguous clickability in Tailwind CSS environments.

3. **Automated Technical Documentation Generators**:
   - Coupling a single-source Markdown specification (`Dokumen_Pendukung_PreHub.md`) with a Python `python-docx` compiler allows complex mathematical matrices, test results, and empirical tables to stay in exact synchronization across both web view and official Word document deliverables.
