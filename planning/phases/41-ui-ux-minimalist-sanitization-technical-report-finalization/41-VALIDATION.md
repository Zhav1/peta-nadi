# Phase 41 Validation Plan

## 1. Automated Test Plan

### Test Suite Execution
- `pytest backend/tests -v --cov=app --cov=agents`: All 84+ tests must pass with 100% pass rate.
- `npm --prefix frontend run build`: Next.js must build cleanly with 0 TypeScript and ESLint errors across 7/7 static routes.

### Static Code Analysis
1. **Emoji Scan Script**:
   - Python regex scan targeting `[\U0001F300-\U0001F9FF\U00002600-\U000026FF\U00002700-\U000027BF\U0001FA00-\U0001FAFF]` across all files in `frontend/components/` and `frontend/app/`.
   - Threshold: **0 emoji occurrences**.
2. **Buzzword & GPU Claim Scan Script**:
   - Python regex scan targeting `['NVIDIA', 'cuOpt', 'FourCastNet', 'GPU Accelerated', 'H100', 'COMMAND CENTER 4D']` across `frontend/components/`.
   - Threshold: **0 unverified occurrences**.
3. **DOCX Artifact Generation**:
   - Run `python scripts/generate_docx_technical_doc.py`.
   - Verify `docs/Dokumen_Pendukung_PreHub_Technical_Document.docx` is generated with valid size (>100 KB).

---

## 2. Manual Inspection Criteria

- Visual check of top navbar tabs in dashboard: `PETA OPERASI`, `ANALYTICS`, `SIMULATION`, `REPORTS`, `EVALUATION`.
- Visual check of Onboarding Landing page: "Buka Command Center" button, accurate tech stack badges.
- Verify that clicking close buttons and interactive toggles shows clean Lucide SVG icons.
