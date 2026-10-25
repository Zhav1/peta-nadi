# LEARNINGS — Phase 113: Watermelon Tables P2

## Issues found

1. **Two bars, one mental model:** `priceRegion` vs `corridorFilter` looked identical to operators but drove different queries; labeling the ops bar `Koridor` + scoping comments (L399–401) ended the confusion.
2. **Skeleton/row height mismatch risk:** any future row-height change must update `LoadingSkeleton` default (`h-11`, L227) in lockstep or loading swaps will shift layout.
3. **Missing primitives surface:** tables exposed the need for Select/Empty/Skeleton/Tooltip/Chart primitives (none exist in base-ui) — logged as Phase 115 gaps, not improvised here.

## What not to repeat

- Do not zero-fill empty tables — route empties to `AnalyticsEmpty` (`< 3` records rule from Phase 111).
- Do not let two filters share an unlabeled scope — name the scope in state, comment, and label.
- Do not `npx shadcn add` to close primitive gaps (banned) — use Watermelon MCP / hand-rolled base-ui-consistent blocks (see Phase 115).

## Environment pitfalls

- `getByText` strict-mode collisions spike whenever two bars share option labels — scope E2E queries by bar container.
