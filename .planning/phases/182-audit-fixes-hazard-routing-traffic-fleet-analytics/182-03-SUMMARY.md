# Summary Slice 182-03: Alternative Route De-emphasis & Settlement Deep-Link Hydration

## Deliverables
- `frontend/components/map/CrisisMap.tsx`:
  - Updated `'route-paths-alternative'` to muted slate (`#64748b`, width 3.5, opacity 0.55), eliminating the duplicate green line visual conflict.
- `frontend/components/dashboard/DashboardClient.tsx` & `frontend/lib/formatNode.ts`:
  - Added regex matching for `settlement-<lon>-<lat>` and `pin-<lon>-<lat>` in `resolveNodeInfo` and `prettyNodeSlug`, ensuring deep-linked URLs load reliably on reload.

## Verification
- `cd frontend && npx tsc --noEmit` -> PASS (0 errors).
- Commit: `65525e5`.
