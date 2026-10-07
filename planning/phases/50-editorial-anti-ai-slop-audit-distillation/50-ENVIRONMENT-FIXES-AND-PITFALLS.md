# Phase 50: Environment Details, Pitfalls & Fixes Attempted

This document records the exact environmental conditions, execution constraints, pitfalls encountered, and fixes attempted during Phase 50 to ensure that future context windows do not repeat the same errors.

---

## 1. Environment & Execution Context

### Operating System & Shell
- **OS**: Windows (PowerShell runtime).
- **CLI Proxy**: `rtk` (Rust Token Killer) is required for shell commands to filter token output.
- **PATH Resolution Rule**: In Windows subshells where `rtk` is not resolved by default, the PATH must be refreshed from system and user registries before invocation:
  ```powershell
  $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk <command>
  ```
- **Directory Execution Context**:
  - `cd` commands are strictly forbidden by agent tool constraints. Working directory switches must always be performed via the tool's `Cwd` parameter (e.g., `Cwd: d:\College\Pidi.id\frontend`).
  - Running `npx tsc --noEmit` from the repository root fails because the project root does not have TypeScript in its `node_modules`. Invoking `npx tsc` at the root executes the npm registry placeholder package (`"This is not the tsc command you are looking for"`). `tsc` must always be executed with `Cwd: d:\College\Pidi.id\frontend`.

### Background Process & Messaging Rules
- Asynchronous commands (e.g., `npm run build`) are handled as background tasks.
- Agent instructions prohibit polling or looping on `manage_task(action: 'status')`. Execution must stop and wait for the system reactive message wakeup when the task finishes.

### Editorial & Style Rules
- **Zero Em Dashes**: Em dashes are strictly prohibited across code, comments, documentation, and user responses. Use colons, parentheses, hyphens, or commas instead.
- **Icon Usage**: Emoji as icons are forbidden. Only use SVGs from Lucide/Heroicons.
- **Typography Floor**: 12px minimum font floor (`text-xs`). Arbitrary sub-12px microtext classes (`text-[8px]`, `text-[9px]`, `text-[10px]`, `text-[11px]`) are prohibited.
- **Interactive Cursor**: All interactive elements must explicitly include `cursor-pointer`.

---

## 2. Pitfalls Encountered & Fixes Applied

### Pitfall 1: Orphaned JSX and Unclosed Tag in `EvidenceTab.tsx`
- **Symptom**:
  TypeScript compilation failed with:
  ```
  components/sidebar/EvidenceTab.tsx(59,6): error TS17008: JSX element 'div' has no corresponding closing tag.
  components/sidebar/EvidenceTab.tsx(239,1): error TS1381: Unexpected token. Did you mean `{'}'}` or `&rbrace;`?
  components/sidebar/EvidenceTab.tsx(240,1): error TS1005: '</' expected.
  ```
- **Root Cause**:
  During the initial removal of the 8-step decision trace pipeline header and provenance explanation, a duplicate block containing an unreferenced variable `showProvenanceInfo` and an unmatched closing `</div>` remained in the middle of Card 1. Removing the block left Card 1 unclosed, causing the root `div` to prematurely close at line 237.
- **Fix Attempted & Validated**:
  1. Inspected lines 55 to 100 to map every opening `<div>` to its corresponding closing tag.
  2. Identified that Card 1's grid closed, but Card 1's outer container was missing `</div>`.
  3. Restructured lines 70 to 83 so the inner 2-column grid and the outer card container both cleanly terminate before Card 4 begins.
  4. Verified with `rtk npx tsc --noEmit`: TS17008 and TS1381 errors were completely resolved.

---

### Pitfall 2: Missing Lucide Icon Imports in `CrisisSidebar.tsx`
- **Symptom**:
  TypeScript compilation failed with:
  ```
  components/sidebar/CrisisSidebar.tsx(139,16): error TS2304: Cannot find name 'Link2'.
  components/sidebar/CrisisSidebar.tsx(142,39): error TS2304: Cannot find name 'ChevronUp'.
  components/sidebar/CrisisSidebar.tsx(142,79): error TS2304: Cannot find name 'ChevronDown'.
  ```
- **Root Cause**:
  When cleaning up unused imports (`AlertCircle`, `ShieldCheck`, `HelpCircle`) from the removed governance banner, the import line was shortened to only import `{ X }`. However, lines 139 and 142 utilized `Link2`, `ChevronUp`, and `ChevronDown` for the Causal Chain toggle drawer.
- **Fix Attempted & Validated**:
  Updated the import on line 3 to:
  ```tsx
  import { X, Link2, ChevronUp, ChevronDown } from 'lucide-react';
  ```
  Re-ran `tsc`: 0 errors in `CrisisSidebar.tsx`.

---

### Pitfall 3: Lingering Sub-12px Microtext Classes Across 7 Files
- **Symptom**:
  The user requested complete removal of microtext clutter and enforcement of the 12px readability floor. Searching via `rtk git grep -n -E "text-\[(8|9|10|11)px\]"` revealed 17 lingering instances across 7 files:
  - `PriceChart.tsx` (line 34: `text-[10px]`)
  - `AnalyticsSection.tsx` (line 388: `text-[10px]`)
  - `DashboardClient.tsx` (lines 1234, 1366, 1380, 1385: `text-[10px]`, `text-[9px]`, `text-[8px]`)
  - `TestMatrixTable.tsx` (lines 191, 197, 212, 218, 231, 235, 243, 247, 265: `text-[10px]`, `text-[11px]`)
  - `FleetOnboardingModal.tsx` (line 535: `text-[10px]`)
  - `CausalChainPanel.tsx` (line 25: `text-[11px]`)
  - `MitigationTab.tsx` (line 623: `text-[10px]`)
- **Fix Attempted & Validated**:
  Replaced every instance with `text-xs` (or `text-xs font-mono`). Verified using `rtk git grep -n -E "text-\[(8|9|10|11)px\]"`: returned exit code 1 (zero matches across the entire codebase).

---

### Pitfall 4: Tool Resolution for Search Commands in Windows Shell
- **Symptom**:
  Invoking `rtk rg` failed because `rg` (ripgrep) was not installed on the system PATH.
- **Fix Attempted & Validated**:
  Switched immediately to `rtk git grep -n -E "..."`, which is guaranteed to be available in any git repository on Windows.

---

## 3. Checklist for Subsequent Context Windows
- [ ] Always set `Cwd: d:\College\Pidi.id\frontend` when running frontend-specific npm/npx commands.
- [ ] Run `rtk git grep` rather than `rg` when checking for text patterns across the repository.
- [ ] Verify JSX closing tags immediately after stripping large wrapper blocks to avoid unbalanced tags.
- [ ] Never introduce `text-[10px]`, `text-[9px]`, or `text-[8px]`. The design floor is strictly `text-xs` (12px).
- [ ] Keep telemetry indicators direct and numeric; avoid conversational or speculative explanatory tooltips.
